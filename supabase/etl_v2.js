// ==============================================================================
// 🚀 野境戶外系統：Google Sheets ➔ Supabase 智慧型 ETL 歷史資料匯入器 (V2 增強版)
// 亮點：搭載多同義詞模糊匹配、排除干擾詞、多圖片欄位自動聚合、社籍繳費狀態智慧映射
// ==============================================================================

function exportAllSheetsToSupabaseV2() {
  var props = PropertiesService.getScriptProperties();
  var supabaseUrl = props.getProperty('SUPABASE_URL');
  var serviceKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');

  if (!supabaseUrl || !serviceKey || !spreadsheetId) {
    throw new Error("❌ 缺少 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 或 SPREADSHEET_ID 指令碼屬性！");
  }

  var ss = SpreadsheetApp.openById(spreadsheetId);
  Logger.log("=== 🚀 開始執行 Google Sheets ➔ Supabase 完整資料清洗與補全匯入 (V2) ===");

  _etlMembersV2(ss, supabaseUrl, serviceKey);
  _etlEventsV2(ss, supabaseUrl, serviceKey);
  _etlSignupsV2(ss, supabaseUrl, serviceKey);
  _etlEquipmentsV2(ss, supabaseUrl, serviceKey);
  _etlLoansV2(ss, supabaseUrl, serviceKey);
  _etlPaymentsV2(ss, supabaseUrl, serviceKey);
  _etlReflectionsV2(ss, supabaseUrl, serviceKey);

  Logger.log("=== 🎉 全數 7 大資料表資料比對、補全與匯入圓滿完成！ ===");
}

// 智慧表頭模糊匹配工具
function _findCol(headers, keywords, excludeKeywords) {
  if (!headers || !headers.length) return -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim();
    var hLower = h.toLowerCase();

    // 檢查排除關鍵字
    if (excludeKeywords && excludeKeywords.length > 0) {
      var skip = false;
      for (var e = 0; e < excludeKeywords.length; e++) {
        if (h.includes(excludeKeywords[e]) || hLower.includes(excludeKeywords[e].toLowerCase())) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
    }

    // 檢查命中關鍵字
    for (var k = 0; k < keywords.length; k++) {
      if (h.includes(keywords[k]) || hLower.includes(keywords[k].toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

// 共通批次 Upsert 輔助函式
function _postToSupabaseV2(table, records, supabaseUrl, serviceKey, onConflict) {
  if (!records || records.length === 0) return;
  var endpoint = supabaseUrl + "/rest/v1/" + table;
  if (onConflict) {
    endpoint += "?on_conflict=" + encodeURIComponent(onConflict);
  }

  var batchSize = 100;
  for (var i = 0; i < records.length; i += batchSize) {
    var chunk = records.slice(i, i + batchSize);
    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": serviceKey,
        "Authorization": "Bearer " + serviceKey,
        "Prefer": "resolution=merge-duplicates"
      },
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(endpoint, options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log("  [OK] " + table + " 成功寫入 " + chunk.length + " 筆 (累計 " + (i + chunk.length) + "/" + records.length + ")");
    } else {
      Logger.log("  [ERROR] " + table + " 寫入失敗 (HTTP " + code + "): " + res.getContentText());
    }
  }
}

// 1. Members 表資料清洗
function _etlMembersV2(ss, url, key) {
  var sheet = ss.getSheetByName("Members") || ss.getSheetByName("社員資料");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var uIdx = _findCol(h, ["系統識別碼", "userid", "user_id"]);
  var nIdx = _findCol(h, ["姓名", "name"]);
  var sIdx = _findCol(h, ["學號", "student"]);
  var dIdx = _findCol(h, ["系級", "系所", "系", "單位", "department"]);
  var gIdx = _findCol(h, ["性別", "gender"]);
  var pIdx = _findCol(h, ["電話", "手機", "phone"], ["緊急", "emer"]);
  var eIdx = _findCol(h, ["信箱", "email", "mail"]);
  var bIdx = _findCol(h, ["生日", "出生", "birthday"]);
  var idIdx = _findCol(h, ["證件號碼", "身分證", "居留證", "證件", "id"]);
  var emNameIdx = _findCol(h, ["緊急聯絡人姓名", "緊急聯絡人", "emername"], ["關係", "電話", "地址", "rel"]);
  var emPhoneIdx = _findCol(h, ["緊急聯絡電話", "緊急聯絡人電話", "emerphone"]);
  var emRelIdx = typeof _findEmerRelColIdx === "function" ? _findEmerRelColIdx(h) : _findCol(h, ["緊急聯絡人關係", "關係", "relation"], ["經驗", "登山"]);
  var emAddrIdx = _findCol(h, ["緊急聯絡人聯絡地址", "緊急聯絡地址", "緊急地址"]);
  var expIdx = _findCol(h, ["登山經驗", "百岳", "爬山", "經驗", "exp"], ["關係"]);
  var fitIdx = _findCol(h, ["體能", "運動", "fitness"]);
  var proofIdx = _findCol(h, ["證明", "相片網址", "照片", "相片", "proof"], ["封面", "登頂", "收據", "匯款"]);
  var offIdx = _findCol(h, ["是否為正式社員", "正式社員", "社員身分"]);
  var payIdx = _findCol(h, ["繳費狀態", "社費繳納", "繳費"]);
  var expDateIdx = _findCol(h, ["社籍到期日", "到期日", "expire"]);

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var uid = uIdx > -1 ? data[i][uIdx].trim() : "";
    var name = nIdx > -1 ? data[i][nIdx].trim() : "";
    if (!uid || !name) continue;

    var proofs = [];
    if (proofIdx > -1 && data[i][proofIdx]) {
      proofs = String(data[i][proofIdx]).split(/[\n,，;\s]+/).map(function(s){ return s.trim(); }).filter(function(s){ return s.startsWith("http"); });
    }

    // 正式社員身分智慧判定：優先以「是否為正式社員」欄位判定，其次以「繳費狀態」包含已繳費/Paid 判定
    var isOfficial = false;
    if (offIdx > -1 && data[i][offIdx]) {
      isOfficial = (data[i][offIdx].indexOf("是") > -1 || data[i][offIdx].toLowerCase().indexOf("y") > -1);
    } else if (payIdx > -1 && data[i][payIdx]) {
      var payVal = String(data[i][payIdx]).trim();
      isOfficial = (payVal.indexOf("已繳") > -1 || payVal.toLowerCase().indexOf("paid") > -1 || payVal === "是");
    }

    // 生日格式標準化
    var bDay = bIdx > -1 ? data[i][bIdx].trim().replace(/\//g, "-") : "";

    records.push({
      line_user_id: uid,
      name: name,
      student_id: sIdx > -1 ? data[i][sIdx].trim() : "",
      department: dIdx > -1 ? data[i][dIdx].trim() : "",
      gender: gIdx > -1 ? data[i][gIdx].trim() : "",
      phone: pIdx > -1 ? data[i][pIdx].trim() : "",
      email: eIdx > -1 ? data[i][eIdx].trim() : "",
      birthday: bDay,
      id_card: idIdx > -1 ? data[i][idIdx].trim() : "",
      emergency_contact_name: emNameIdx > -1 ? data[i][emNameIdx].trim() : "",
      emergency_contact_rel: emRelIdx > -1 ? data[i][emRelIdx].trim() : "",
      emergency_contact_phone: emPhoneIdx > -1 ? data[i][emPhoneIdx].trim() : "",
      emergency_contact_address: emAddrIdx > -1 ? data[i][emAddrIdx].trim() : "",
      outdoor_experience: expIdx > -1 ? data[i][expIdx].trim() : "",
      fitness_desc: fitIdx > -1 ? data[i][fitIdx].trim() : "",
      proof_urls: proofs,
      is_official_member: isOfficial,
      membership_expires_at: (expDateIdx > -1 && data[i][expDateIdx]) ? data[i][expDateIdx].trim().replace(/\//g, "-") : null
    });
  }
  _postToSupabaseV2("members", records, url, key, "line_user_id");
}

// 2. Events 表資料清洗
function _etlEventsV2(ss, url, key) {
  var sheet = ss.getSheetByName("Events") || ss.getSheetByName("活動");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var idIdx = _findCol(h, ["活動編號", "eventid", "編號", "id"]);
  var tIdx = _findCol(h, ["活動名稱", "名稱", "title", "活動"]);
  var cIdx = _findCol(h, ["活動類別", "類別", "category"]);
  var sIdx = _findCol(h, ["活動開始日期", "開始日期", "出發日期", "start"]);
  var eIdx = _findCol(h, ["活動結束日期", "結束日期", "回程日期", "end"]);
  var locIdx = _findCol(h, ["活動地點", "地點", "location"]);
  var mIdx = _findCol(h, ["名額上限", "名額", "人數上限", "max"]);
  var dIdx = _findCol(h, ["報名截止日期", "報名截止時間", "截止", "deadline"]);
  var mfIdx = _findCol(h, ["社員費用", "社員價", "費用", "預計費用", "fee", "cost"]);
  var nmfIdx = _findCol(h, ["非社員費用", "非社員價", "一般費用"]);
  var stIdx = _findCol(h, ["報名狀態", "狀態", "status"]);
  var sumIdx = _findCol(h, ["活動簡介", "簡介", "說明", "summary"]);
  var itIdx = _findCol(h, ["詳細行程", "行程安排", "行程", "itinerary"]);
  var noIdx = _findCol(h, ["注意事項", "備註", "notes"]);
  var imgIdx = _findCol(h, ["封面圖網址", "照片", "圖片", "封面", "image", "cover"]);

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var id = idIdx > -1 ? data[i][idIdx].trim() : "";
    var title = tIdx > -1 ? data[i][tIdx].trim() : "";
    if (!id || !title) continue;

    var sDate = sIdx > -1 && data[i][sIdx] ? data[i][sIdx].trim().replace(/\//g, "-") : "2026-01-01";
    var eDate = eIdx > -1 && data[i][eIdx] ? data[i][eIdx].trim().replace(/\//g, "-") : sDate;

    records.push({
      id: id,
      title: title,
      category: cIdx > -1 ? data[i][cIdx].trim() : "",
      start_date: sDate,
      end_date: eDate,
      location: locIdx > -1 ? data[i][locIdx].trim() : "",
      max_participants: mIdx > -1 ? (parseInt(data[i][mIdx], 10) || 0) : 0,
      deadline: dIdx > -1 && data[i][dIdx] ? data[i][dIdx].trim() : new Date().toISOString(),
      member_fee: mfIdx > -1 ? (parseInt(data[i][mfIdx], 10) || 0) : 0,
      non_member_fee: nmfIdx > -1 ? (parseInt(data[i][nmfIdx], 10) || 0) : (mfIdx > -1 ? parseInt(data[i][mfIdx], 10) || 0 : 0),
      status: stIdx > -1 && data[i][stIdx] ? data[i][stIdx].trim() : "報名中 Open",
      summary: sumIdx > -1 ? data[i][sumIdx].trim() : "",
      itinerary: itIdx > -1 ? data[i][itIdx].trim() : "",
      notes: noIdx > -1 ? data[i][noIdx].trim() : "",
      cover_image_url: imgIdx > -1 ? data[i][imgIdx].trim() : ""
    });
  }
  _postToSupabaseV2("events", records, url, key, "id");
}

// 3. Signups 表資料清洗
function _etlSignupsV2(ss, url, key) {
  var sheet = ss.getSheetByName("Signups") || ss.getSheetByName("報名名冊");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var eidIdx = _findCol(h, ["活動編號", "eventid", "活動代號"]);
  var uidIdx = _findCol(h, ["系統識別碼", "userid", "帳號", "line_id"]);
  var sidIdx = _findCol(h, ["專屬碼", "報名代碼", "code", "id"]);
  var stIdx = _findCol(h, ["審核結果", "狀態", "status"]);
  var isMemIdx = _findCol(h, ["是否為社員", "社員"]);
  var reasonIdx = _findCol(h, ["取消原因", "原因", "reason"]);
  var noteIdx = _findCol(h, ["備註", "note", "備注"]);

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var sid = sidIdx > -1 ? data[i][sidIdx].trim() : ("S" + i);
    var eid = eidIdx > -1 ? data[i][eidIdx].trim() : "";
    var uid = uidIdx > -1 ? data[i][uidIdx].trim() : "";
    if (!eid || !uid) continue;

    records.push({
      id: sid,
      event_id: eid,
      line_user_id: uid,
      status: stIdx > -1 && data[i][stIdx] ? data[i][stIdx].trim() : "審核中 Checking",
      is_official_member_snapshot: isMemIdx > -1 ? (data[i][isMemIdx].indexOf("是") > -1) : false,
      cancel_reason: reasonIdx > -1 ? data[i][reasonIdx].trim() : "",
      notes: noteIdx > -1 ? data[i][noteIdx].trim() : ""
    });
  }
  _postToSupabaseV2("event_signups", records, url, key, "id");
}

// 4. Equipments 表資料清洗 (包含多欄照片聚合)
function _etlEquipmentsV2(ss, url, key) {
  var sheet = ss.getSheetByName("Equipments") || ss.getSheetByName("裝備表");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var idIdx = _findCol(h, ["裝備代號", "器材代號", "編號", "id"]);
  var nameIdx = _findCol(h, ["裝備名稱", "器材名稱", "品名", "name"]);
  var catIdx = _findCol(h, ["分類", "類別", "category"]);
  var tQtyIdx = _findCol(h, ["總數量", "總庫存", "總數", "total"]);
  var rQtyIdx = _findCol(h, ["剩餘數量", "剩餘", "可用數量", "remain", "available"]);
  var bIdx = _findCol(h, ["是否外借", "外借", "borrowable"]);
  var mfIdx = _findCol(h, ["2天", "社員每日單價", "社員", "每日單價", "price"]);
  var nmfIdx = _findCol(h, ["+1天", "非社員每日單價", "非社員", "加價", "extra"]);
  var specIdx = _findCol(h, ["規格", "說明", "詳細資訊", "specs"]);
  var noteIdx = _findCol(h, ["備註", "備注", "注意事項", "notes"]);

  // 收集所有包含「圖片」或「照片」或「網址」的欄位
  var imgColIndices = [];
  for (var c = 0; c < h.length; c++) {
    var colName = String(h[c] || "").trim();
    if (colName.includes("圖片") || colName.includes("照片") || colName.includes("相片")) {
      imgColIndices.push(c);
    }
  }

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var id = idIdx > -1 ? data[i][idIdx].trim() : "";
    var name = nameIdx > -1 ? data[i][nameIdx].trim() : "";
    if (!id || !name) continue;

    var imgs = [];
    imgColIndices.forEach(function(ci) {
      var val = String(data[i][ci] || "").trim();
      if (val) {
        var parts = val.split(/[\n,，;\s]+/).map(function(s){ return s.trim(); }).filter(function(s){ return s.startsWith("http"); });
        parts.forEach(function(u) {
          if (imgs.indexOf(u) === -1) imgs.push(u);
        });
      }
    });

    var isBorrowable = true;
    if (bIdx > -1 && data[i][bIdx]) {
      var bVal = String(data[i][bIdx]).trim();
      isBorrowable = (bVal.indexOf("是") > -1 || bVal.indexOf("可") > -1 || bVal.toLowerCase().indexOf("y") > -1);
    }

    records.push({
      id: id,
      name: name,
      category: catIdx > -1 && data[i][catIdx] ? data[i][catIdx].trim() : "其他",
      total_qty: tQtyIdx > -1 ? (parseInt(data[i][tQtyIdx], 10) || 0) : 0,
      available_qty: rQtyIdx > -1 ? (parseInt(data[i][rQtyIdx], 10) || 0) : 0,
      is_borrowable: isBorrowable,
      member_price_per_day: mfIdx > -1 ? (parseInt(data[i][mfIdx], 10) || 0) : 0,
      non_member_price_per_day: nmfIdx > -1 ? (parseInt(data[i][nmfIdx], 10) || 0) : 0,
      images: imgs,
      specs: specIdx > -1 ? data[i][specIdx].trim() : "",
      notes: noteIdx > -1 ? data[i][noteIdx].trim() : ""
    });
  }
  _postToSupabaseV2("equipments", records, url, key, "id");
}

// 5. Loan_Records 表資料清洗 (拆分主單 loans 與細項 loan_items)
function _etlLoansV2(ss, url, key) {
  var sheet = ss.getSheetByName("Loan_Records") || ss.getSheetByName("租借紀錄");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var ordIdx = _findCol(h, ["租借單號", "訂單編號", "單號", "orderid", "id"]);
  var uidIdx = _findCol(h, ["系統識別碼", "userid", "帳號", "line_id"]);
  var sIdx = _findCol(h, ["領取日期", "借用日期", "取件", "start"]);
  var eIdx = _findCol(h, ["歸還日期", "還件日期", "歸還", "end"]);
  var daysIdx = _findCol(h, ["天數", "借用天數", "days"]);
  var eqIdIdx = _findCol(h, ["裝備代號", "器材代號", "裝備編號", "equipid"]);
  var qtyIdx = _findCol(h, ["租借數量", "數量", "qty"]);
  var pIdx = _findCol(h, ["用途", "活動性質", "purpose"]);
  var stIdx = _findCol(h, ["租借狀態", "狀態", "status"]);
  var payIdx = _findCol(h, ["繳費狀態", "繳費", "paystatus"]);
  var depIdx = _findCol(h, ["押金總額", "押金", "deposit"]);
  var rentIdx = _findCol(h, ["租金總額", "租金", "費用", "總額", "rent"]);
  var nIdx = _findCol(h, ["備註", "備注", "notes"]);

  var loansMap = {};
  var loanItems = [];

  for (var i = 1; i < data.length; i++) {
    var ordId = ordIdx > -1 ? data[i][ordIdx].trim() : "";
    var uid = uidIdx > -1 ? data[i][uidIdx].trim() : "";
    var eqId = eqIdIdx > -1 ? data[i][eqIdIdx].trim() : "";
    if (!ordId || !uid) continue;

    var sDate = sIdx > -1 && data[i][sIdx] ? data[i][sIdx].trim().replace(/\//g, "-") : "2026-01-01";
    var eDate = eIdx > -1 && data[i][eIdx] ? data[i][eIdx].trim().replace(/\//g, "-") : sDate;

    if (!loansMap[ordId]) {
      loansMap[ordId] = {
        id: ordId,
        line_user_id: uid,
        start_date: sDate,
        end_date: eDate,
        days: daysIdx > -1 ? (parseInt(data[i][daysIdx], 10) || 1) : 1,
        purpose: pIdx > -1 && data[i][pIdx] ? data[i][pIdx].trim() : "社團出隊",
        status: stIdx > -1 && data[i][stIdx] ? data[i][stIdx].trim() : "待領取 To Be Collected",
        payment_status: payIdx > -1 && data[i][payIdx] ? data[i][payIdx].trim() : "未繳費",
        total_deposit: depIdx > -1 ? (parseInt(data[i][depIdx], 10) || 0) : 0,
        total_rent: rentIdx > -1 ? (parseInt(data[i][rentIdx], 10) || 0) : 0,
        notes: nIdx > -1 ? data[i][nIdx].trim() : ""
      };
    }

    if (eqId) {
      loanItems.push({
        loan_id: ordId,
        equipment_id: eqId,
        quantity: qtyIdx > -1 ? (parseInt(data[i][qtyIdx], 10) || 1) : 1
      });
    }
  }

  var loanList = Object.keys(loansMap).map(function(k){ return loansMap[k]; });
  _postToSupabaseV2("loans", loanList, url, key, "id");
  _postToSupabaseV2("loan_items", loanItems, url, key, "");
}

// 6. Payments 表資料清洗
function _etlPaymentsV2(ss, url, key) {
  var sheet = ss.getSheetByName("Payments") || ss.getSheetByName("繳費紀錄");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var pidIdx = _findCol(h, ["繳費單號", "單號", "編號", "id"]);
  var uidIdx = _findCol(h, ["系統識別碼", "userid", "帳號", "line_id"]);
  var tIdx = _findCol(h, ["繳費項目", "項目", "type"]);
  var aIdx = _findCol(h, ["金額", "費用", "總額", "應繳金額", "amount", "fee", "cost"]);
  var bIdx = _findCol(h, ["帳號後五碼", "後五碼", "末五碼", "帳號", "last5"]);
  var imgIdx = _findCol(h, ["匯款證明", "證明", "收據", "相片", "照片", "proof"]);
  var stIdx = _findCol(h, ["審核狀態", "狀態", "status"]);
  var noIdx = _findCol(h, ["幹部備註", "備註", "notes"]);

  // 取得活動費用對照表
  var evSheet = ss.getSheetByName("Events") || ss.getSheetByName("活動");
  var eventCosts = {};
  if (evSheet) {
    var eData = evSheet.getDataRange().getDisplayValues();
    if (eData.length > 1) {
      var eNameCol = _findCol(eData[0], ["活動名稱", "名稱", "title"]);
      var eFeeCol = _findCol(eData[0], ["預計費用", "費用", "fee", "金額"]);
      for (var e = 1; e < eData.length; e++) {
        var en = eNameCol > -1 ? eData[e][eNameCol].trim() : "";
        var ef = eFeeCol > -1 ? (parseInt(String(eData[e][eFeeCol]).replace(/\D/g, ''), 10) || 0) : 0;
        if (en && ef > 0) eventCosts[en] = ef;
      }
    }
  }

  // 取得裝備租金對照表
  var lnSheet = ss.getSheetByName("Loan_Records") || ss.getSheetByName("租借紀錄");
  var loanCosts = {};
  if (lnSheet) {
    var lData = lnSheet.getDataRange().getDisplayValues();
    if (lData.length > 1) {
      var lUserCol = _findCol(lData[0], ["系統識別碼", "userid", "帳號"]);
      var lEqCol = _findCol(lData[0], ["裝備名稱", "裝備", "器材"]);
      var lCostCol = _findCol(lData[0], ["應繳費用", "費用", "租金", "金額"]);
      for (var l = 1; l < lData.length; l++) {
        var lu = lUserCol > -1 ? lData[l][lUserCol].trim() : "";
        var leq = lEqCol > -1 ? lData[l][lEqCol].trim() : "";
        var lc = lCostCol > -1 ? (parseInt(String(lData[l][lCostCol]).replace(/\D/g, ''), 10) || 0) : 0;
        if (lu && leq && lc > 0) loanCosts[lu + "_" + leq] = lc;
      }
    }
  }

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var pid = pidIdx > -1 && data[i][pidIdx] ? data[i][pidIdx].trim() : ("PAY_" + i);
    var uid = uidIdx > -1 ? data[i][uidIdx].trim() : "";
    if (!uid) continue;

    var typeStr = tIdx > -1 && data[i][tIdx] ? data[i][tIdx].trim() : "繳交社費";
    var parsedAmount = aIdx > -1 ? (parseInt(String(data[i][aIdx]).replace(/\D/g, ''), 10) || 0) : 0;

    // 若金額為 0，進行智慧推算補齊
    if (parsedAmount <= 0) {
      if (typeStr.indexOf("社費") > -1 || typeStr.indexOf("社籍") > -1 || typeStr.indexOf("Membership") > -1) {
        parsedAmount += 200;
      }
      for (var evKey in eventCosts) {
        if (typeStr.indexOf(evKey) > -1) {
          parsedAmount += eventCosts[evKey];
        }
      }
      for (var lnKey in loanCosts) {
        var parts = lnKey.split("_");
        if (parts[0] === uid && typeStr.indexOf(parts[1]) > -1) {
          parsedAmount += loanCosts[lnKey];
        }
      }
    }

    records.push({
      id: pid,
      line_user_id: uid,
      type: typeStr,
      amount: parsedAmount,
      bank_last5: bIdx > -1 ? data[i][bIdx].trim() : "",
      proof_image_url: imgIdx > -1 ? data[i][imgIdx].trim() : "",
      status: stIdx > -1 && data[i][stIdx] ? data[i][stIdx].trim() : "待確認 Checking",
      officer_notes: noIdx > -1 ? data[i][noIdx].trim() : ""
    });
  }
  _postToSupabaseV2("payments", records, url, key, "id");
}

// 7. Reflections 表資料清洗
function _etlReflectionsV2(ss, url, key) {
  var sheet = ss.getSheetByName("Reflections") || ss.getSheetByName("心得");
  if (!sheet) return;
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return;
  var h = data[0];

  var uidIdx = _findCol(h, ["系統識別碼", "userid", "帳號", "line_id"]);
  var eidIdx = _findCol(h, ["活動編號", "eventid", "編號"]);
  var diffIdx = _findCol(h, ["難易度評分", "難度", "評分", "difficulty"]);
  var viewIdx = _findCol(h, ["風景評分", "景色", "風景", "beauty"]);
  var cIdx = _findCol(h, ["心得內容", "心得", "內容", "content"]);
  var imgIdx = _findCol(h, ["登頂照片網址", "照片", "登頂", "相片", "photo"]);

  var records = [];
  for (var i = 1; i < data.length; i++) {
    var uid = uidIdx > -1 ? data[i][uidIdx].trim() : "";
    var eid = eidIdx > -1 ? data[i][eidIdx].trim() : "";
    if (!uid || !eid) continue;

    var photos = [];
    if (imgIdx > -1 && data[i][imgIdx]) {
      photos = String(data[i][imgIdx]).split(/[\n,，;\s]+/).map(function(s){ return s.trim(); }).filter(function(s){ return s.startsWith("http"); });
    }

    records.push({
      event_id: eid,
      line_user_id: uid,
      difficulty_rating: diffIdx > -1 ? (parseInt(data[i][diffIdx], 10) || 3) : 3,
      beauty_rating: viewIdx > -1 ? (parseInt(data[i][viewIdx], 10) || 3) : 3,
      content: cIdx > -1 ? data[i][cIdx].trim() : "",
      photo_urls: photos
    });
  }
  _postToSupabaseV2("reflections", records, url, key, "event_id,line_user_id");
}
