// ==============================================================================
// ⚡ 野境戶外系統 GAS 模組 6：LIFF 輕量 Helper API (06_Helper_Services.js)
// 目的：僅處理 Google Drive 檔案上傳與 LINE 推播通知，徹底移除所有試算表寫入依賴
// ==============================================================================

/**
 * 處理來自 LIFF 前端之輕量非同步 Helper 請求
 */
function handleLiffHelperApi(json) {
  var action = json.action;

  // 1. Google Drive 照片上傳 Helper (純上傳，不碰試算表)
  if (action === "upload_drive_file") {
    return _handleDriveUploadHelper(json);
  }

  // 2. 裝備租借幹部推播 Helper (純發訊息，不碰試算表)
  if (action === "notify_officers_loan") {
    return _handleNotifyOfficersLoan(json);
  }

  // 3. 繳費申報幹部推播 Helper (純發訊息，不碰試算表)
  if (action === "notify_officers_payment") {
    return _handleNotifyOfficersPayment(json);
  }

  // 4. 幹部身分檢查 (輕量唯讀)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus(json);
  }

  return _errorResponse("未支援的 Helper Action: " + action);
}

/**
 * Google Drive 檔案上傳處理核心 (絕不觸碰試算表)
 */
function _handleDriveUploadHelper(json) {
  try {
    var userId = json.userId || "guest";
    var folderType = json.folderType || "general";
    var files = json.files || [];

    if (!Array.isArray(files) || files.length === 0) {
      return _errorResponse("缺少上傳檔案內容");
    }

    // 取得或建立對應的 Google Drive 資料夾
    var rootFolder;
    var folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
    if (folderId) {
      rootFolder = DriveApp.getFolderById(folderId);
    } else {
      rootFolder = DriveApp.getRootFolder();
    }

    var subFolderName = "Wilderness_" + folderType;
    var subFolders = rootFolder.getFoldersByName(subFolderName);
    var targetFolder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(subFolderName);

    var uploadedUrls = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var base64Data = f.data || f.base64 || "";
      var mimeType = f.mimeType || f.type || "image/jpeg";
      var fileName = (f.name || ("upload_" + Date.now() + "_" + i)).replace(/[^a-zA-Z0-9._-]/g, "_");

      if (base64Data.indexOf(",") > -1) {
        base64Data = base64Data.split(",")[1];
      }

      var decoded = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(decoded, mimeType, fileName);
      var driveFile = targetFolder.createFile(blob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var fileUrl = driveFile.getUrl();
      uploadedUrls.push(fileUrl);
    }

    return _successResponse({
      urls: uploadedUrls,
      message: "成功上傳 " + uploadedUrls.length + " 個檔案至 Google Drive！"
    });
  } catch (err) {
    console.error("Google Drive 上傳失敗:", err);
    return _errorResponse("Drive 上傳例外: " + err.toString());
  }
}

/**
 * 裝備租借幹部推播 Helper (純推播訊息)
 */
function _handleNotifyOfficersLoan(json) {
  try {
    var userId = json.userId;
    var details = json.details || {};
    var loanId = json.loanId || "新訂單";
    var totalRent = json.totalRent !== undefined ? json.totalRent : 0;

    var cart = details.cart || {};
    var itemsSummary = [];
    for (var eqId in cart) {
      if (cart[eqId] > 0) {
        itemsSummary.push("• " + eqId + " x" + cart[eqId]);
      }
    }

    var msg = "【🎒 幹部通知：新裝備租借申請】\n\n" +
      "單號：" + loanId + "\n" +
      "借用者 ID：" + userId + "\n" +
      "預計領取：" + (details.pickupDate || "") + "\n" +
      "預計歸還：" + (details.returnDate || "") + "\n" +
      "用途：" + (details.purpose || "") + (details.otherPurpose ? " (" + details.otherPurpose + ")" : "") + "\n" +
      "預估總租金：$" + totalRent + "\n\n" +
      "品項明細：\n" + itemsSummary.join("\n") + "\n\n" +
      "⚡ 本資料已安全寫入 Supabase，請至幹部後台確認備用！";

    pushAdminMessage(msg);
    return _successResponse({ message: "幹部推播已成功送出" });
  } catch (err) {
    console.warn("裝備租借幹部推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 繳費申報幹部推播 Helper (純推播訊息)
 */
function _handleNotifyOfficersPayment(json) {
  try {
    var userId = json.userId;
    var details = json.details || {};
    var totalAmount = details.totalAmount || 0;
    var last5Digits = details.last5Digits || "無";
    var note = details.note ? "\n備註：" + details.note : "";

    var msg = "【💳 幹部通知：新繳費申報】\n\n" +
      "申報人 ID：" + userId + "\n" +
      "申報金額：$" + totalAmount + "\n" +
      "帳號末五碼：" + last5Digits +
      note + "\n\n" +
      "⚡ 資料已安全記錄於 Supabase，請幹部核對網銀後至系統核銷！";

    pushAdminMessage(msg);
    return _successResponse({ message: "繳費申報推播已成功送出" });
  } catch (err) {
    console.warn("繳費申報幹部推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 幹部身分檢查 (輕量唯讀)
 */
function _handleCheckOfficerStatus(json) {
  try {
    var userId = json.userId;
    if (!userId) return _jsonResponse({ isOfficer: false });

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Officers");
    if (!sheet) return _jsonResponse({ isOfficer: false });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var uidIdx = _fi(headers, "系統識別碼");
    if (uidIdx === -1) uidIdx = 3; // 預設第 4 欄

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][uidIdx]).trim() === String(userId).trim()) {
        return _jsonResponse({
          isOfficer: true,
          name: data[i][0] || "幹部",
          role: data[i][1] || "幹部"
        });
      }
    }
    return _jsonResponse({ isOfficer: false });
  } catch (err) {
    return _jsonResponse({ isOfficer: false });
  }
}

/**
 * GAS GET 請求入口 (健康檢查)
 */
function doGet(e) {
  return _jsonResponse({
    status: "ok",
    service: "Wilderness GAS Microservices",
    version: "2.0.0",
    architecture: "Modular (Supabase Primary, GAS Helper & Background Sync)"
  });
}
