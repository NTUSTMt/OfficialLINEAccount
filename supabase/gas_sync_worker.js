// ==============================================================================
// 🔄 野境戶外系統：Google Sheets 背景單向同步排程核心 (GAS Sync Worker)
// 目的：定時或被動觸發，將 Supabase 的 sync_queue 批次消費並映射寫回 Google Sheets
// ==============================================================================

/**
 * 主要排程執行入口：可設定在 GAS 觸發條件（每 1 分鐘或每 5 分鐘執行一次）
 */
function syncPendingQueueFromSupabase() {
  var props = PropertiesService.getScriptProperties();
  var supabaseUrl = props.getProperty('SUPABASE_URL');
  var serviceKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');

  if (!supabaseUrl || !serviceKey || !spreadsheetId) {
    Logger.log("❌ 缺少必要之指令碼屬性 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SPREADSHEET_ID)");
    return;
  }

  // 1. 自 Supabase 撈取 status = 'pending' 的佇列 (每次最多 50 筆批次處理，避免超時)
  var queueUrl = supabaseUrl + "/rest/v1/sync_queue?status=eq.pending&order=created_at.asc&limit=50";
  var res = UrlFetchApp.fetch(queueUrl, {
    method: "get",
    headers: {
      "apikey": serviceKey,
      "Authorization": "Bearer " + serviceKey
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    Logger.log("❌ 讀取 sync_queue 失敗 (HTTP " + res.getResponseCode() + "): " + res.getContentText());
    return;
  }

  var queue = JSON.parse(res.getContentText());
  if (!queue || queue.length === 0) {
    // 無待同步事件
    return;
  }

  Logger.log("🔄 開始處理 " + queue.length + " 筆待同步事件...");
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var completedIds = [];
  var failedItems = [];

  // 2. 逐筆處理異動
  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    try {
      _processSingleSyncItem(ss, item);
      completedIds.push(item.id);
    } catch (err) {
      Logger.log("⚠️ 處理事件失敗 (Queue ID " + item.id + "): " + err.toString());
      failedItems.push({ id: item.id, error: err.toString(), retry: (item.retry_count || 0) + 1 });
    }
  }

  // 3. 批次將成功的項目標記為 completed
  if (completedIds.length > 0) {
    var patchUrl = supabaseUrl + "/rest/v1/sync_queue?id=in.(" + completedIds.join(",") + ")";
    UrlFetchApp.fetch(patchUrl, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": serviceKey,
        "Authorization": "Bearer " + serviceKey
      },
      payload: JSON.stringify({
        status: "completed",
        processed_at: new Date().toISOString()
      }),
      muteHttpExceptions: true
    });
    Logger.log("✅ 成功同步並回寫 completed: " + completedIds.length + " 筆");
  }

  // 4. 若有失敗項目，更新 retry_count 與 error_message
  for (var f = 0; f < failedItems.length; f++) {
    var fail = failedItems[f];
    var failUrl = supabaseUrl + "/rest/v1/sync_queue?id=eq." + fail.id;
    UrlFetchApp.fetch(failUrl, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": serviceKey,
        "Authorization": "Bearer " + serviceKey
      },
      payload: JSON.stringify({
        status: fail.retry >= 3 ? "failed" : "pending",
        retry_count: fail.retry,
        error_message: fail.error
      }),
      muteHttpExceptions: true
    });
  }
}

/**
 * 單筆事件分流處理器
 */
function _processSingleSyncItem(ss, item) {
  var table = item.table_name;
  var action = item.action;
  var payload = item.payload;

  if (table === "members") {
    _syncMemberToSheet(ss, payload);
  } else if (table === "events") {
    _syncEventToSheet(ss, payload);
  } else if (table === "event_signups") {
    _syncSignupToSheet(ss, payload);
  } else if (table === "equipments") {
    _syncEquipmentToSheet(ss, payload);
  } else if (table === "loans") {
    _syncLoanToSheet(ss, payload);
  } else if (table === "payments") {
    _syncPaymentToSheet(ss, payload);
  } else if (table === "reflections") {
    _syncReflectionToSheet(ss, payload);
  }
}

function _syncMemberToSheet(ss, p) {
  var sheet = ss.getSheetByName("Members");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var uIdx = _fi(headers, "系統識別碼");
  if (uIdx === -1) return;

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][uIdx]).trim() === String(p.line_user_id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  var offVal = p.is_official_member ? "是" : "否";
  var proofStr = Array.isArray(p.proof_urls) ? p.proof_urls.join("\n") : (p.proof_urls || "");

  if (targetRow > -1) {
    // 更新既有列
    _setCellVal(sheet, targetRow, headers, "姓名", p.name);
    _setCellVal(sheet, targetRow, headers, "電話", p.phone);
    _setCellVal(sheet, targetRow, headers, "信箱", p.email);
    _setCellVal(sheet, targetRow, headers, "是否為正式社員", offVal);
    if (p.membership_expires_at) {
      _setCellVal(sheet, targetRow, headers, "社籍到期日", p.membership_expires_at);
    }
  } else {
    // 新增列
    sheet.appendRow([
      p.line_user_id, p.name, p.student_id || "", p.department || "", p.gender || "",
      p.phone || "", p.email || "", p.birthday || "", p.id_card || "",
      p.emergency_contact_name || "", p.emergency_contact_rel || "", p.emergency_contact_phone || "", p.emergency_contact_address || "",
      p.outdoor_experience || "", p.fitness_desc || "", proofStr, offVal, p.membership_expires_at || ""
    ]);
  }
}

function _syncSignupToSheet(ss, p) {
  var sheet = ss.getSheetByName("Signups");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var sIdx = _fi(headers, "專屬碼");
  var stCol = _fi(headers, "審核結果");
  var nCol = _fi(headers, "備註");
  var rCol = _fi(headers, "取消原因");

  // 狀態全形括號防呆校正
  var normalizedStatus = p.status || "";
  if (normalizedStatus.includes("正取") && (normalizedStatus.includes("已繳費") || normalizedStatus.includes("Paid"))) {
    normalizedStatus = "正取（已繳費）Confirmed(Paid)";
  } else if (normalizedStatus.includes("備取") && (normalizedStatus.includes("有意願") || normalizedStatus.includes("Interested"))) {
    normalizedStatus = "備取（有意願）Waitlisted (Interested)";
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][sIdx]).trim() === String(p.id).trim()) {
      if (stCol > -1) sheet.getRange(i + 1, stCol + 1).setValue(normalizedStatus);
      if (nCol > -1 && p.notes !== undefined) sheet.getRange(i + 1, nCol + 1).setValue(p.notes);
      if (rCol > -1 && p.cancel_reason !== undefined) sheet.getRange(i + 1, rCol + 1).setValue(p.cancel_reason);
      break;
    }
  }
}

function _syncEquipmentToSheet(ss, p) {
  var sheet = ss.getSheetByName("Equipments");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = _fi(headers, "裝備代號");
  var rQtyCol = _fi(headers, "剩餘數量");
  var tQtyCol = _fi(headers, "總數量");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(p.id).trim()) {
      if (rQtyCol > -1 && p.available_qty !== undefined) sheet.getRange(i + 1, rQtyCol + 1).setValue(p.available_qty);
      if (tQtyCol > -1 && p.total_qty !== undefined) sheet.getRange(i + 1, tQtyCol + 1).setValue(p.total_qty);
      break;
    }
  }
}

function _syncLoanToSheet(ss, p) {
  var sheet = ss.getSheetByName("Loan_Records");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var ordIdx = _fi(headers, "租借單號");
  var stCol = _fi(headers, "租借狀態");
  var payCol = _fi(headers, "繳費狀態");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ordIdx]).trim() === String(p.id).trim()) {
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      if (payCol > -1 && p.payment_status) sheet.getRange(i + 1, payCol + 1).setValue(p.payment_status);
    }
  }
}

function _syncPaymentToSheet(ss, p) {
  var sheet = ss.getSheetByName("Payments");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var pidIdx = _fi(headers, "繳費單號");
  var uidIdx = _fi(headers, "系統識別碼");
  var stCol = _fi(headers, "對帳狀態") > -1 ? _fi(headers, "對帳狀態") : _fi(headers, "審核狀態");

  for (var i = 1; i < data.length; i++) {
    var isMatch = false;
    if (pidIdx > -1 && String(data[i][pidIdx]).trim() === String(p.id).trim()) {
      isMatch = true;
    } else if (pidIdx === -1 && uidIdx > -1 && String(data[i][uidIdx]).trim() === String(p.line_user_id).trim()) {
      var curSt = stCol > -1 ? String(data[i][stCol]).trim() : "";
      if (curSt.indexOf("待確認") > -1 || curSt.indexOf("Checking") > -1) {
        isMatch = true;
      }
    }
    if (isMatch) {
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      break;
    }
  }
}

function _syncEventToSheet(ss, p) {
  var sheet = ss.getSheetByName("Events");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = _fi(headers, "活動編號");
  var stCol = _fi(headers, "狀態");
  var dfCol = _fi(headers, "雲端資料夾網址");
  var suCol = _fi(headers, "報名名冊網址");
  var siCol = _fi(headers, "試算表ID");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(p.id).trim()) {
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      if (dfCol > -1 && p.drive_folder_url) sheet.getRange(i + 1, dfCol + 1).setValue(p.drive_folder_url);
      if (suCol > -1 && p.spreadsheet_url) sheet.getRange(i + 1, suCol + 1).setValue(p.spreadsheet_url);
      if (siCol > -1 && p.spreadsheet_id) sheet.getRange(i + 1, siCol + 1).setValue(p.spreadsheet_id);
      break;
    }
  }
}

function _syncReflectionToSheet(ss, p) {
  var sheet = ss.getSheetByName("Reflections");
  if (!sheet) return;
  var photos = Array.isArray(p.photo_urls) ? p.photo_urls.join("\n") : (p.photo_urls || "");
  sheet.appendRow([
    new Date(), p.line_user_id, "社員", p.event_id, "活動",
    p.difficulty_rating || 3, p.beauty_rating || 3, p.content || "", photos
  ]);
}

function _setCellVal(sheet, row, headers, keyword, val) {
  if (val === undefined || val === null) return;
  var col = _fi(headers, keyword);
  if (col > -1) {
    sheet.getRange(row, col + 1).setValue(val);
  }
}
