// ==============================================================================
// 🔄 台科登山社社團系統 GAS 模組 5：Supabase sync_queue 背景單向同步排程 (05_Sync_Worker.js)
// 目的：定時排程執行，消費 Supabase 的 sync_queue 並單向批次寫回 Google Sheets
// ==============================================================================

/**
 * 主要排程執行入口：可設定在 GAS 觸發條件（每 1 分鐘或每 5 分鐘執行一次）
 */
function syncPendingQueueFromSupabase() {
  var props = PropertiesService.getScriptProperties();
  var supabaseUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var serviceKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;
  var spreadsheetId = props.getProperty('SPREADSHEET_ID') || SPREADSHEET_ID;

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
    return; // 無待同步事件
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
  if (!p || !p.line_user_id) return;
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
    _setCellVal(sheet, targetRow, headers, "姓名", p.name);
    _setCellVal(sheet, targetRow, headers, "電話", p.phone);
    _setCellVal(sheet, targetRow, headers, "信箱", p.email);
    _setCellVal(sheet, targetRow, headers, "是否為正式社員", offVal);
    if (p.membership_expires_at) {
      _setCellVal(sheet, targetRow, headers, "社籍到期日", p.membership_expires_at);
    }
  } else {
    sheet.appendRow([
      p.line_user_id, p.name, p.student_id || "", p.department || "", p.gender || "",
      p.phone || "", p.email || "", p.birthday || "", p.id_card || "",
      p.emergency_contact_name || "", p.emergency_contact_rel || "", p.emergency_contact_phone || "", p.emergency_contact_address || "",
      p.outdoor_experience || "", p.fitness_desc || "", proofStr, offVal, p.membership_expires_at || ""
    ]);
  }
}

function _syncEventToSheet(ss, p) {
  var sheet = ss.getSheetByName("Events");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = _fi(headers, "活動編號");
  if (idIdx === -1) return;

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > -1) {
    if (p.title) _setCellVal(sheet, targetRow, headers, "活動名稱", p.title);
    if (p.status) _setCellVal(sheet, targetRow, headers, "報名狀態", p.status);
    if (p.fee !== undefined) _setCellVal(sheet, targetRow, headers, "費用", p.fee);
    if (p.deadline) _setCellVal(sheet, targetRow, headers, "報名截止", p.deadline);
  }
}

function _syncSignupToSheet(ss, p) {
  var sheet = ss.getSheetByName("Signups");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var sIdx = _fi(headers, "專屬碼");
  var stCol = _fi(headers, "審核結果");
  var nCol = _fi(headers, "備註");
  var rCol = _fi(headers, "取消原因");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][sIdx]).trim() === String(p.id).trim()) {
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      if (nCol > -1 && p.notes !== undefined) sheet.getRange(i + 1, nCol + 1).setValue(p.notes);
      if (rCol > -1 && p.cancel_reason !== undefined) sheet.getRange(i + 1, rCol + 1).setValue(p.cancel_reason);
      break;
    }
  }
}

function _syncEquipmentToSheet(ss, p) {
  var sheet = ss.getSheetByName("Equipments");
  if (!sheet || !p || !p.id) return;
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
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var ordIdx = _fi(headers, "租借單號") > -1 ? _fi(headers, "租借單號") : _fi(headers, "租借編號");
  var stCol = _fi(headers, "租借狀態") > -1 ? _fi(headers, "租借狀態") : _fi(headers, "領取/歸還");
  var payCol = _fi(headers, "繳費狀態");

  if (ordIdx === -1) return;

  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ordIdx]).trim() === String(p.id).trim()) {
      found = true;
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      if (payCol > -1 && p.payment_status) sheet.getRange(i + 1, payCol + 1).setValue(p.payment_status);
    }
  }

  // 若試算表中尚無此訂單，自 Supabase 讀取關聯細項並寫入新列
  if (!found) {
    try {
      var props = PropertiesService.getScriptProperties();
      var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
      var sKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;
      if (sbUrl && sKey) {
        var itemsUrl = sbUrl + "/rest/v1/loan_items?loan_id=eq." + encodeURIComponent(p.id) + "&select=quantity,subtotal,equipment_id,equipments(id,name)";
        var res = UrlFetchApp.fetch(itemsUrl, {
          headers: { "apikey": sKey, "Authorization": "Bearer " + sKey },
          muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) {
          var items = JSON.parse(res.getContentText());
          var purposeStr = p.purpose || "社團出隊";
          if (p.purpose_other) purposeStr += " (" + p.purpose_other + ")";

          for (var j = 0; j < items.length; j++) {
            var itm = items[j];
            var eqName = (itm.equipments && itm.equipments.name) ? itm.equipments.name : itm.equipment_id;
            var newRow = new Array(headers.length).fill("");
            if (_fi(headers, "系統識別碼") > -1) newRow[_fi(headers, "系統識別碼")] = p.line_user_id || "";
            if (_fi(headers, "姓名") > -1) newRow[_fi(headers, "姓名")] = p.name || "";
            newRow[ordIdx] = p.id;
            if (_fi(headers, "裝備代號") > -1) newRow[_fi(headers, "裝備代號")] = itm.equipment_id;
            if (_fi(headers, "裝備名稱") > -1) newRow[_fi(headers, "裝備名稱")] = eqName;
            if (_fi(headers, "數量") > -1) newRow[_fi(headers, "數量")] = itm.quantity;
            if (_fi(headers, "預計領取") > -1) newRow[_fi(headers, "預計領取")] = p.start_date || "";
            if (_fi(headers, "預計歸還") > -1) newRow[_fi(headers, "預計歸還")] = p.end_date || "";
            if (_fi(headers, "用途") > -1) newRow[_fi(headers, "用途")] = purposeStr;
            if (_fi(headers, "應繳費用") > -1) newRow[_fi(headers, "應繳費用")] = itm.subtotal || 0;
            if (stCol > -1) newRow[stCol] = p.status || "待領取 To Be Collected";
            if (payCol > -1) newRow[payCol] = p.payment_status || "未繳費";
            sheet.appendRow(newRow);
          }
        }
      }
    } catch (err) {
      Logger.log("⚠️ 寫入 Loan_Records 細項失敗: " + err.toString());
    }
  }
}

function _syncPaymentToSheet(ss, p) {
  var sheet = ss.getSheetByName("Payments");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var pidIdx = _fi(headers, "繳費單號");
  var stCol = _fi(headers, "對帳狀態") > -1 ? _fi(headers, "對帳狀態") : _fi(headers, "審核狀態");

  for (var i = 1; i < data.length; i++) {
    if (pidIdx > -1 && String(data[i][pidIdx]).trim() === String(p.id).trim()) {
      if (stCol > -1 && p.status) sheet.getRange(i + 1, stCol + 1).setValue(p.status);
      break;
    }
  }
}

function _syncReflectionToSheet(ss, p) {
  var sheet = ss.getSheetByName("Reflections");
  if (!sheet || !p) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var eIdx = _fi(headers, "活動編號");
  var uIdx = _fi(headers, "系統識別碼");

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][eIdx]).trim() === String(p.event_id).trim() &&
      String(data[i][uIdx]).trim() === String(p.line_user_id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  var photoStr = Array.isArray(p.photo_urls) ? p.photo_urls.join("\n") : (p.photo_urls || "");

  if (targetRow > -1) {
    if (p.content) _setCellVal(sheet, targetRow, headers, "心得內容", p.content);
    if (photoStr) _setCellVal(sheet, targetRow, headers, "照片連結", photoStr);
  } else {
    sheet.appendRow([
      p.event_id, p.line_user_id, p.name || "", p.difficulty_rating || 3, p.beauty_rating || 3,
      p.content || "", photoStr, new Date()
    ]);
  }
}

function _setCellVal(sheet, row, headers, colName, value) {
  var idx = _fi(headers, colName);
  if (idx > -1 && value !== undefined && value !== null) {
    sheet.getRange(row, idx + 1).setValue(value);
  }
}
