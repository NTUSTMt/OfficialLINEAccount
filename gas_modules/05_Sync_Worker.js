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
 * 試算表開啟時自動建立管理工具選單
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu("🏔️ 社團系統")
      .addItem("🔄 全量從 Supabase 覆蓋更新主試算表", "overwriteMainSpreadsheetFromSupabase")
      .addSeparator()
      .addItem("🔄 立即同步待處理佇列 (sync_queue)", "syncPendingQueueFromSupabase")
      .addItem("🧹 執行 Signups 歷史幽靈列自癒修剪", "reconcileSignupsWithSupabase")
      .addToUi();
  } catch (e) {
    console.warn("無法取得 UI (可能在無 UI 環境中執行):", e);
  }
}

/**
 * 🏔️ 全量從 Supabase 覆蓋更新主試算表
 * 說明：依據 Supabase 資料表原名（members, events, event_signups, equipments, loans, payments, reflections）
 *       覆蓋寫入純英文表頭與完整資料，並自動設置凍結頂列與樣式。
 */
function overwriteMainSpreadsheetFromSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || _getSpreadsheet();
  if (!ss) {
    var errMsg = "❌ 找不到主試算表，請在試算表編輯器中執行或確認 SPREADSHEET_ID。";
    Logger.log(errMsg);
    try { SpreadsheetApp.getUi().alert("錯誤", errMsg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
    return { status: "error", message: errMsg };
  }

  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    var noKeyMsg = "❌ 缺少必要之 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY！";
    Logger.log(noKeyMsg);
    try { SpreadsheetApp.getUi().alert("錯誤", noKeyMsg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
    return { status: "error", message: noKeyMsg };
  }

  var defaultTables = [
    { name: "members", pk: "line_user_id" },
    { name: "officers", pk: "id" },
    { name: "events", pk: "id" },
    { name: "event_signups", pk: "id" },
    { name: "equipments", pk: "id" },
    { name: "loans", pk: "id" },
    { name: "loan_items", pk: "id" },
    { name: "payments", pk: "id" },
    { name: "reflections", pk: "id" }
  ];

  // 動態向 Supabase OpenAPI 探索所有公開資料表，確保 100% 涵蓋全部業務頁面 (排除內部佇列表)
  var tables = defaultTables.slice();
  try {
    var specRes = UrlFetchApp.fetch(sbUrl + "/rest/v1/", {
      method: "get",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey
      },
      muteHttpExceptions: true
    });
    if (specRes.getResponseCode() === 200) {
      var spec = JSON.parse(specRes.getContentText());
      if (spec && spec.definitions) {
        var existingMap = {};
        for (var i = 0; i < tables.length; i++) {
          existingMap[tables[i].name] = true;
        }
        for (var defName in spec.definitions) {
          if (defName && !defName.startsWith("rpc/") && defName !== "sync_queue" && !existingMap[defName]) {
            existingMap[defName] = true;
            tables.push({ name: defName, pk: "id" });
          }
        }
      }
    }
  } catch (specErr) {
    Logger.log("⚠️ 動態查詢 OpenAPI 規格失敗，將使用預設全部資料表清單: " + specErr.toString());
  }

  var summary = [];

  for (var t = 0; t < tables.length; t++) {
    var tInfo = tables[t];
    var tName = tInfo.name;
    try {
      var fetchUrl = sbUrl + "/rest/v1/" + tName + "?select=*&limit=10000";
      var res = UrlFetchApp.fetch(fetchUrl, {
        method: "get",
        headers: {
          "apikey": sbKey,
          "Authorization": "Bearer " + sbKey
        },
        muteHttpExceptions: true
      });

      if (res.getResponseCode() !== 200) {
        summary.push("❌ " + tName + ": 讀取失敗 (" + res.getResponseCode() + "): " + res.getContentText());
        continue;
      }

      var records = JSON.parse(res.getContentText()) || [];

      // 取得或建立以 Supabase 原名命名之工作表
      var sheet = ss.getSheetByName(tName);
      if (!sheet) {
        sheet = ss.insertSheet(tName);
      } else {
        sheet.clear();
      }

      // 提取所有出現過的欄位名稱，並確保主鍵置首
      var colSet = {};
      var cols = [];
      if (tInfo.pk) {
        colSet[tInfo.pk] = true;
        cols.push(tInfo.pk);
      }

      // 優先依照預設 Schema 順序排列表頭
      var defaultCols = _getDefaultSchemaColumns(tName);
      for (var d = 0; d < defaultCols.length; d++) {
        var dc = defaultCols[d];
        if (!colSet[dc]) {
          colSet[dc] = true;
          cols.push(dc);
        }
      }

      // 若遠端記錄有額外欄位，亦追加納入
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        for (var k in rec) {
          if (!colSet[k]) {
            colSet[k] = true;
            cols.push(k);
          }
        }
      }

      // 1. 寫入英文表頭
      if (cols.length > 0) {
        sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
        sheet.getRange(1, 1, 1, cols.length)
          .setFontWeight("bold")
          .setBackground("#F3F4F6")
          .setFontColor("#1F2937");
        sheet.setFrozenRows(1);

        // 2. 寫入資料列
        if (records.length > 0) {
          var rowData = [];
          for (var i = 0; i < records.length; i++) {
            var item = records[i];
            var row = [];
            for (var c = 0; c < cols.length; c++) {
              var val = item[cols[c]];
              if (val === null || val === undefined) {
                row.push("");
              } else if (typeof val === "object") {
                row.push(JSON.stringify(val));
              } else {
                row.push(val);
              }
            }
            rowData.push(row);
          }
          sheet.getRange(2, 1, rowData.length, cols.length).setValues(rowData);
        }
      }

      summary.push("✅ " + tName + ": 成功覆蓋 " + records.length + " 筆資料 (" + cols.length + " 欄位)");
    } catch (tblErr) {
      summary.push("⚠️ " + tName + ": 例外錯誤 - " + tblErr.toString());
    }
  }

  SpreadsheetApp.flush();
  var summaryText = "【Supabase 全量覆蓋主試算表完成】\n\n" + summary.join("\n");
  Logger.log(summaryText);
  try {
    SpreadsheetApp.getUi().alert("全量同步完成", summaryText, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}

  return { status: "success", summary: summary };
}

/**
 * 取得或建立資料表對應之試算表分頁 (支援 Supabase 原名與舊名容錯)
 */
function _getSheetByTableName(ss, tableName) {
  if (!ss) return null;
  var sheet = ss.getSheetByName(tableName);
  if (sheet) return sheet;
  var legacyAliases = {
    "members": ["Members", "社員清單", "社員資料"],
    "officers": ["Officers", "幹部名冊", "幹部名單"],
    "events": ["Events", "活動列表", "活動"],
    "event_signups": ["Signups", "報名名冊", "報名名單"],
    "equipments": ["Equipments", "裝備清單", "裝備"],
    "loans": ["Loan_Records", "Loans", "租借紀錄", "租借清單"],
    "loan_items": ["Loan_Items", "租借細項", "租借品項明細"],
    "payments": ["Payments", "繳費紀錄", "繳費申報"],
    "reflections": ["Reflections", "活動心得", "心得相片"],
    "sync_queue": ["Sync_Queue", "同步佇列"]
  };
  var aliases = legacyAliases[tableName] || [];
  for (var i = 0; i < aliases.length; i++) {
    var s = ss.getSheetByName(aliases[i]);
    if (s) return s;
  }
  return null;
}

/**
 * 確保表頭具備 payload 中出現的英文欄位，若缺失則自動於最右側追加新行
 */
function _ensureColumnsExist(sheet, headers, payload) {
  if (!sheet || !headers || !payload || typeof payload !== "object") return headers;
  var keys = Object.keys(payload);
  var added = false;
  for (var k = 0; k < keys.length; k++) {
    var colKey = keys[k];
    var idx = _findColByEnglishName(headers, colKey);
    if (idx === -1) {
      headers.push(colKey);
      sheet.getRange(1, headers.length).setValue(colKey);
      added = true;
    }
  }
  if (added) {
    SpreadsheetApp.flush();
  }
  return headers;
}

/**
 * 取得預設 Schema 欄位列表 (當 Supabase 表為空時作為初始表頭)
 */
function _getDefaultSchemaColumns(tableName) {
  var schemaMap = {
    "members": [
      "line_user_id", "name", "gender", "line_id", "email", "phone", "department", "student_id",
      "payment_status", "membership_expires_at", "birthday", "id_card", "address",
      "outdoor_experience", "fitness_desc", "proof_urls", "emergency_contact_name",
      "emergency_contact_rel", "emergency_contact_phone", "emergency_contact_address",
      "medical_history", "identity_status", "join_membership_intent", "officer_intent",
      "is_official_member", "is_officer", "officer_role", "created_at", "updated_at"
    ],
    "officers": [
      "id", "line_user_id", "name", "role", "title", "contact", "created_at", "updated_at"
    ],
    "events": [
      "id", "title", "fee", "start_date", "end_date", "deadline", "status",
      "summary", "itinerary", "cover_image_url", "drive_folder_url", "spreadsheet_url",
      "spreadsheet_id", "created_at", "updated_at"
    ],
    "event_signups": [
      "id", "event_id", "line_user_id", "name", "status", "payment_status",
      "is_official_member_snapshot", "cancel_reason", "notes", "created_at", "updated_at"
    ],
    "equipments": [
      "id", "name", "category", "total_qty", "available_qty", "is_borrowable",
      "member_price_per_day", "non_member_price_per_day", "price_2day", "price_extra_day",
      "images", "specs", "notes", "sort_order", "created_at", "updated_at"
    ],
    "loans": [
      "id", "line_user_id", "name", "start_date", "end_date", "days", "purpose",
      "purpose_other", "status", "payment_status", "total_deposit", "total_rent",
      "notes", "refund_needed", "cancelled_at", "created_at", "updated_at"
    ],
    "loan_items": [
      "id", "loan_id", "equipment_id", "quantity", "unit_price_snapshot", "subtotal"
    ],
    "payments": [
      "id", "line_user_id", "name", "type", "target_type", "target_id", "amount",
      "bank_last5", "proof_image_url", "status", "officer_notes", "confirmed_by",
      "confirmed_at", "created_at", "updated_at"
    ],
    "reflections": [
      "id", "event_id", "line_user_id", "name", "difficulty_rating", "beauty_rating",
      "content", "photo_urls", "created_at", "updated_at"
    ],
    "sync_queue": [
      "id", "table_name", "action", "record_id", "payload", "status", "retry_count",
      "error_message", "processed_at", "created_at"
    ]
  };
  return schemaMap[tableName] || ["id", "created_at", "updated_at"];
}

/**
 * 通用資料表同步處理器 (支援任何資料表動態寫入/更新/刪除)
 */
function _syncGenericTableToSheet(ss, tableName, p, action, pkField) {
  if (!p) return;
  pkField = pkField || "id";
  var sheet = _getSheetByTableName(ss, tableName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var idIdx = _findHeaderCol(headers, pkField);
  var targetRow = -1;
  if (idIdx > -1 && p[pkField] !== undefined) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]).trim() === String(p[pkField]).trim()) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 " + tableName + " 表刪除紀錄: " + p[pkField]);
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

/**
 * 單筆事件分流處理器
 */
function _processSingleSyncItem(ss, item) {
  var table = item.table_name;
  var payload = item.payload;
  var action = item.action || "UPDATE";

  if (table === "members") {
    _syncMemberToSheet(ss, payload, action);
  } else if (table === "events") {
    _syncEventToSheet(ss, payload, action);
  } else if (table === "event_signups") {
    _syncSignupToSheet(ss, payload, action);
  } else if (table === "equipments") {
    _syncEquipmentToSheet(ss, payload, action);
  } else if (table === "loans") {
    _syncLoanToSheet(ss, payload, action);
  } else if (table === "payments") {
    _syncPaymentToSheet(ss, payload, action);
  } else if (table === "reflections") {
    _syncReflectionToSheet(ss, payload, action);
  } else if (table === "officers") {
    _syncGenericTableToSheet(ss, "officers", payload, action, "id");
  } else if (table === "loan_items") {
    _syncGenericTableToSheet(ss, "loan_items", payload, action, "id");
  } else {
    _syncGenericTableToSheet(ss, table, payload, action, "id");
  }
}

function _syncMemberToSheet(ss, p, action) {
  if (!p || !p.line_user_id) return;
  var sheet = _getSheetByTableName(ss, "members");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var uIdx = _findHeaderCol(headers, "line_user_id", ["系統識別碼", "UID"]);
  if (uIdx === -1) return;

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][uIdx]).trim() === String(p.line_user_id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 members 表刪除隊員: " + p.line_user_id);
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

function _syncEventToSheet(ss, p, action) {
  if (!p || !p.id) return;
  var sheet = _getSheetByTableName(ss, "events");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var idIdx = _findHeaderCol(headers, "id", ["活動編號"]);
  if (idIdx === -1) return;

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 events 表刪除活動: " + p.id);
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

function _syncSignupToSheet(ss, p, action) {
  if (!p) return;
  var sheet = _getSheetByTableName(ss, "event_signups");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var sIdx = _findHeaderCol(headers, "id", ["專屬碼"]);
  var uIdx = _findHeaderCol(headers, "line_user_id", ["系統識別碼"]);
  var eIdx = _findHeaderCol(headers, "event_id", ["活動編號"]);

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    var matchById = (sIdx > -1 && p.id && String(data[i][sIdx]).trim() === String(p.id).trim());
    var matchByUserAndEvent = (uIdx > -1 && eIdx > -1 && p.line_user_id && p.event_id &&
      String(data[i][uIdx]).trim() === String(p.line_user_id).trim() &&
      String(data[i][eIdx]).trim() === String(p.event_id).trim());

    if (matchById || matchByUserAndEvent) {
      targetRow = i + 1;
      break;
    }
  }

  // 1. 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 event_signups 表刪除報名紀錄: " + (p.id || (p.line_user_id + "_" + p.event_id)));
    }
    return;
  }

  // 2. 處理既有列 UPDATE
  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    // 3. 處理 INSERT 新增分支
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
    Logger.log("➕ 已新增報名紀錄至 event_signups 表: " + (p.id || p.line_user_id));
  }
}

function _syncEquipmentToSheet(ss, p, action) {
  if (!p || !p.id) return;
  var sheet = _getSheetByTableName(ss, "equipments");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var idIdx = _findHeaderCol(headers, "id", ["裝備代號"]);

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (idIdx > -1 && String(data[i][idIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 equipments 表刪除裝備: " + p.id);
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

function _syncLoanToSheet(ss, p, action) {
  if (!p || !p.id) return;
  var sheet = _getSheetByTableName(ss, "loans");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var ordIdx = _findHeaderCol(headers, "id", ["租借單號", "租借編號"]);
  if (ordIdx === -1) return;

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    var delCount = 0;
    for (var r = data.length - 1; r >= 1; r--) {
      if (String(data[r][ordIdx]).trim() === String(p.id).trim()) {
        sheet.deleteRow(r + 1);
        delCount++;
      }
    }
    Logger.log("🗑️ 已從 loans 表刪除訂單 " + p.id + " 共 " + delCount + " 列");
    return;
  }

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ordIdx]).trim() === String(p.id).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(foundRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    // 新增單
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

function _syncPaymentToSheet(ss, p, action) {
  if (!p || !p.id) return;
  var sheet = _getSheetByTableName(ss, "payments");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var pidIdx = _findHeaderCol(headers, "id", ["繳費單號"]);

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (pidIdx > -1 && String(data[i][pidIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 payments 表刪除繳費單: " + p.id);
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

function _syncReflectionToSheet(ss, p, action) {
  if (!p) return;
  var sheet = _getSheetByTableName(ss, "reflections");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  headers = _ensureColumnsExist(sheet, headers, p);

  var idIdx = _findHeaderCol(headers, "id", ["心得編號"]);
  var eIdx = _findHeaderCol(headers, "event_id", ["活動編號"]);
  var uIdx = _findHeaderCol(headers, "line_user_id", ["系統識別碼"]);

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    var matchById = (idIdx > -1 && p.id && String(data[i][idIdx]).trim() === String(p.id).trim());
    var matchByPair = (eIdx > -1 && uIdx > -1 && p.event_id && p.line_user_id &&
      String(data[i][eIdx]).trim() === String(p.event_id).trim() &&
      String(data[i][uIdx]).trim() === String(p.line_user_id).trim());
    if (matchById || matchByPair) {
      targetRow = i + 1;
      break;
    }
  }

  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 reflections 表刪除心得: " + (p.id || (p.event_id + "_" + p.line_user_id)));
    }
    return;
  }

  if (targetRow > -1) {
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && p[k] !== undefined) {
        var val = p[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    var newRow = new Array(headers.length).fill("");
    for (var k in p) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = p[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
  }
}

/**
 * 主試算表 Signups 自癒對齊函式 (Reconciliation Engine)
 * 目的：消滅歷史幽靈列，以 Supabase event_signups 為唯一準則，修剪已不存在的資料
 */
function reconcileSignupsWithSupabase(ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  var sheet = _getSheetByTableName(ss, "event_signups");
  if (!sheet) return;

  var sbSignups = _supabaseGet("event_signups", { select: "id,line_user_id,event_id,status" });
  if (!sbSignups || !Array.isArray(sbSignups)) return;

  var validSet = {};
  for (var s = 0; s < sbSignups.length; s++) {
    var item = sbSignups[s];
    if (item.id) validSet[String(item.id).trim()] = true;
    if (item.line_user_id && item.event_id) {
      validSet[String(item.line_user_id).trim() + "_" + String(item.event_id).trim()] = true;
    }
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headers = data[0];
  var sIdx = _findHeaderCol(headers, "id", ["專屬碼"]);
  var uIdx = _findHeaderCol(headers, "line_user_id", ["系統識別碼"]);
  var eIdx = _findHeaderCol(headers, "event_id", ["活動編號"]);

  var prunedCount = 0;
  // 倒序迴圈刪除孤兒列
  for (var r = data.length - 1; r >= 1; r--) {
    var code = sIdx > -1 ? String(data[r][sIdx]).trim() : "";
    var uid = uIdx > -1 ? String(data[r][uIdx]).trim() : "";
    var eid = eIdx > -1 ? String(data[r][eIdx]).trim() : "";
    var key = uid + "_" + eid;

    // 只要有身分與活動識別，但既找不到專屬碼也找不到組合鍵，即為歷史幽靈列
    if (uid && eid && !validSet[code] && !validSet[key]) {
      sheet.deleteRow(r + 1);
      prunedCount++;
    }
  }

  if (prunedCount > 0) {
    Logger.log("🧹 [自癒修剪] 已成功自 event_signups 表清除 " + prunedCount + " 筆歷史幽靈報名列！");
  }
}

function _setCellVal(sheet, row, headers, colName, value) {
  var idx = _fi(headers, colName);
  if (idx > -1 && value !== undefined && value !== null) {
    sheet.getRange(row, idx + 1).setValue(value);
  }
}

/**
 * 將活動報名紀錄同步寫入 Supabase (包含 upsert members 與 insert/upsert event_signups)
 */
function _syncSignupToSupabase(userId, eventId, signupCode, p, signupStatus, eventName) {
  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    console.warn("⚠️ [Supabase] 尚未配置 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，略過報名同步。");
    return false;
  }
  if (!userId || !eventId || !signupCode) {
    console.warn("⚠️ [Supabase] 缺少必要參數: userId=" + userId + ", eventId=" + eventId + ", signupCode=" + signupCode);
    return false;
  }
  try {
    p = p || {};
    var isOfficial = (p.isOfficial === "是" || p.isOfficial === true);

    // 1. 先 Upsert members 表，確保外鍵約束滿足且個資最新
    var memberPayload = {
      line_user_id: userId,
      name: p.name || "社員",
      gender: p.gender || null,
      line_id: p.lineId || p.realLineId || null,
      email: p.email || null,
      phone: p.phone || null,
      department: p.department || null,
      student_id: p.studentId || null,
      birthday: p.birthday || null,
      id_card: p.idNumber || p.idCard || null,
      address: p.studentAddr || p.address || null,
      outdoor_experience: p.exp || null,
      fitness_desc: p.strength || null,
      emergency_contact_name: p.emerName || null,
      emergency_contact_rel: p.emerRel || null,
      emergency_contact_phone: p.emerPhone || null,
      emergency_contact_address: p.emerAddr || null,
      medical_history: p.medicalHistory || null,
      is_official_member: isOfficial,
      updated_at: new Date().toISOString()
    };

    var memberUrl = sbUrl + "/rest/v1/members?on_conflict=line_user_id";
    UrlFetchApp.fetch(memberUrl, {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      payload: JSON.stringify(memberPayload),
      muteHttpExceptions: true
    });

    // 2. 寫入或更新 event_signups 表
    var signupPayload = {
      id: signupCode,
      event_id: eventId,
      line_user_id: userId,
      name: p.name || "",
      status: signupStatus || "審核中 Checking",
      is_official_member_snapshot: isOfficial,
      notes: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    var signupUrl = sbUrl + "/rest/v1/event_signups?on_conflict=id";
    var res = UrlFetchApp.fetch(signupUrl, {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      payload: JSON.stringify(signupPayload),
      muteHttpExceptions: true
    });

    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (err) {
    console.warn("同步報名至 Supabase 例外:", err);
    return false;
  }
}
