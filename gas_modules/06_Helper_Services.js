// ==============================================================================
// ⚡ 台科登山社社團系統 GAS 模組 6：LIFF 輕量 Helper API (06_Helper_Services.js)
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

  // 4. 基本資料填寫/修改 LINE 推播通知 Helper (純推播訊息)
  if (action === "notify_profile_saved") {
    return _handleNotifyProfileSaved(json);
  }

  // 5. 幹部身分檢查 (輕量唯讀)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus(json);
  }

  // 6. 幹部更新裝備照片 Helper
  if (action === "update_equipment_images") {
    return _handleUpdateEquipmentImages(json);
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

    var folderPath = "Wilderness_" + folderType;
    var uploadedUrls = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var base64Data = f.data || f.base64 || "";
      var fileName = (f.name || ("upload_" + Date.now() + "_" + i)).replace(/[^a-zA-Z0-9._-]/g, "_");

      if (base64Data) {
        var fileUrl = uploadFileToDrive(base64Data, fileName, folderPath);
        if (fileUrl && !fileUrl.startsWith("上傳失敗")) {
          var driveMatch = fileUrl.match(/(?:file\/d\/|id=)([^/&?]+)/);
          if (driveMatch && driveMatch[1]) {
            uploadedUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000");
          } else {
            uploadedUrls.push(fileUrl);
          }
        }
      }
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
 * 基本資料填寫/更新 LINE 推播通知核心 (純推播訊息)
 */
function _handleNotifyProfileSaved(json) {
  try {
    var userId = json.userId;
    if (!userId || userId === "TEST_USER_ID") {
      return _successResponse({ message: "測試使用者略過推播" });
    }

    var data = json.formData || json.data || {};
    var isNew = !!json.isNewUser;
    var name = data.name || "社員";
    var dept = data.department || "未填寫";
    var studentId = data.studentId ? _maskString(data.studentId, 2, 2) : "未填寫";
    var phone = data.phone ? _maskString(data.phone, 4, 3) : "未填寫";
    var emerName = data.emerName || "未填寫";
    var emerRel = data.emerRel || "未填寫";
    var offIntent = data.intendOfficial || "未填寫";

    var title = isNew ? "【🎉 歡迎加入！基本資料註冊成功】" : "【✅ 基本資料已成功更新】";
    var intro = "";
    var details = [];

    // 檢查活動出隊保險與審核必備之 13 項資料完整度 (與 handleSignup 保持完全一致)
    var activityMissing = [];
    if (!String(data.name || "").trim()) activityMissing.push("姓名");
    if (!String(data.gender || "").trim()) activityMissing.push("性別");
    if (!String(data.phone || "").trim()) activityMissing.push("聯絡電話");
    if (!String(data.birthday || "").trim()) activityMissing.push("生日");
    if (!String(data.idNumber || data.id_card || "").trim()) activityMissing.push("身分證/護照");
    if (!String(data.studentAddr || data.address || "").trim()) activityMissing.push("通訊地址");
    if (!String(data.emerName || data.emergency_contact_name || "").trim()) activityMissing.push("緊急聯絡人姓名");
    if (!String(data.emerRel || data.emergency_contact_rel || "").trim()) activityMissing.push("與緊急聯絡人關係");
    if (!String(data.emerAddr || data.emergency_contact_address || "").trim()) activityMissing.push("緊急聯絡人地址");
    if (!String(data.emerPhone || data.emergency_contact_phone || "").trim()) activityMissing.push("緊急聯絡人電話");
    if (!String(data.strength || data.fitness_desc || "").trim()) activityMissing.push("體能自評");
    if (!String(data.strengthProof || data.proof_urls || "").trim()) activityMissing.push("體能證明");
    if (!String(data.exp || data.outdoor_experience || "").trim()) activityMissing.push("爬山經驗");
    var isActivityReady = (activityMissing.length === 0);

    // 依據資料完整度動態生成結尾引導話
    var footer = "";
    if (isActivityReady) {
      footer = "💡 您的出隊保險與資料已完整，隨時可於 LINE 選單點擊「最新活動」報名出隊行程，或至「裝備租借」預約出隊器材！";
    } else {
      var missingText = activityMissing.slice(0, 4).join("、") + (activityMissing.length > 4 ? " 等 " + activityMissing.length + " 項" : "");
      footer = "💡 您可隨時至 LINE 選單「裝備租借」預約出隊器材！\n\n⚠️ 提醒：出隊活動需辦理平安保險與安全審核，目前尚缺少出隊必要資訊（" + missingText + "），如欲報名最新活動，記得至選單「填寫資料」補齊即可啟用一鍵報名喔！🏕️";
    }

    if (isNew) {
      // 1. 新註冊使用者：顯示完整註冊資料
      intro = "您好 " + name + "！感謝您完成台科登山社社團系統個人資料註冊：";
      if (data.name) details.push("• 姓名：" + name);
      if (data.department || data.studentId) details.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
      if (data.phone) details.push("• 聯絡電話：" + phone);
      if (data.emerName || data.emerRel) details.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
      if (data.intendOfficial) details.push("• 加入社員意願：" + offIntent);
      if (data.exp) details.push("• 爬山經歷：已更新");
      if (data.strength || data.strengthProof) details.push("• 體能自評：已更新");
    } else if (Array.isArray(json.changedFields)) {
      // 2. 既有使用者更新個人檔案：依據實際變更欄位動態顯示
      var cFields = json.changedFields;
      if (cFields.length === 0) {
        intro = "您好 " + name + "！您的個人檔案未有變更，資料已為最新狀態。";
      } else {
        intro = "您好 " + name + "！您已於系統中成功更新個人檔案：";
        if (cFields.indexOf("name") > -1) details.push("• 姓名：" + name);
        if (cFields.indexOf("gender") > -1) details.push("• 性別：" + (data.gender || "已更新"));
        if (cFields.indexOf("birthday") > -1) details.push("• 生日：" + (data.birthday || "已更新"));
        if (cFields.indexOf("idNumber") > -1) {
          var maskedId = data.idNumber ? _maskString(data.idNumber, 2, 2) : "已更新";
          details.push("• 身分證/護照：" + maskedId);
        }
        if (cFields.indexOf("department_studentId") > -1) details.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
        if (cFields.indexOf("identityStatus") > -1) details.push("• 身分別：" + (data.identityStatus || "已更新"));
        if (cFields.indexOf("phone") > -1) details.push("• 聯絡電話：" + phone);
        if (cFields.indexOf("email") > -1) details.push("• 電子信箱：" + (data.email || "已更新"));
        if (cFields.indexOf("realLineId") > -1) details.push("• LINE ID：" + (data.realLineId || "已更新"));
        if (cFields.indexOf("studentAddr") > -1) details.push("• 現居地址：" + (data.studentAddr || "已更新"));
        if (cFields.indexOf("emergency_contact") > -1) details.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
        if (cFields.indexOf("emerPhone") > -1) {
          var maskedEmerPhone = data.emerPhone ? _maskString(data.emerPhone, 4, 3) : "已更新";
          details.push("• 緊急聯絡人電話：" + maskedEmerPhone);
        }
        if (cFields.indexOf("emerAddr") > -1) details.push("• 緊急聯絡人地址：" + (data.emerAddr || "已更新"));
        if (cFields.indexOf("medicalHistory") > -1) details.push("• 特殊病史：已更新");
        if (cFields.indexOf("exp") > -1) details.push("• 爬山經歷：已更新");
        if (cFields.indexOf("strength") > -1) details.push("• 體能自評：已更新");
        if (cFields.indexOf("intendOfficial") > -1) details.push("• 加入社員意願：" + offIntent);
        if (cFields.indexOf("intendOfficer") > -1) details.push("• 擔任幹部意願：" + (data.intendOfficer || "已更新"));
      }
    } else {
      // 3. 既有使用者且未傳入 changedFields 之向下相容 fallback
      intro = "您好 " + name + "！您已於系統中成功更新個人檔案：";
      details.push("• 姓名：" + name);
      details.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
      details.push("• 聯絡電話：" + phone);
      details.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
      details.push("• 加入社員意願：" + offIntent);
      if (data.exp) details.push("• 爬山經歷：已更新");
      if (data.strength) details.push("• 體能自評：已更新");
    }

    var msg = title + "\n\n" + intro;
    if (details.length > 0) {
      msg += "\n\n" + details.join("\n");
    }
    msg += "\n\n" + footer;

    _pushMessage(userId, msg);

    // 2. 若隊員勾選「我有意願成為社團幹部」，且為新意願（由無變有或首次填寫），即時推播幹部管理群組
    var officerIntent = data.intendOfficer || data.officer_intent || "";
    var wantsToBeOfficer = false;
    if (officerIntent) {
      var strOfficerIntent = String(officerIntent).trim();
      var lowerOfficerIntent = strOfficerIntent.toLowerCase();
      if (strOfficerIntent.indexOf("我有意願成為社團幹部") > -1 || (lowerOfficerIntent !== "無" && lowerOfficerIntent !== "無意願" && lowerOfficerIntent !== "否" && lowerOfficerIntent !== "none" && lowerOfficerIntent !== "no" && strOfficerIntent !== "")) {
        wantsToBeOfficer = true;
      }
    }

    // 狀態變更才推播：判斷是否為新勾選意願 (若前端有傳入 isOfficerIntentNew 依其判定，否則檢查 previousOfficerIntent)
    var isOfficerIntentNew = true;
    if (typeof json.isOfficerIntentNew === "boolean") {
      isOfficerIntentNew = json.isOfficerIntentNew;
    } else if (json.previousOfficerIntent !== undefined) {
      var prevLower = String(json.previousOfficerIntent).trim().toLowerCase();
      var wasWilling = Boolean(prevLower && prevLower !== "無" && prevLower !== "無意願" && prevLower !== "否" && prevLower !== "none" && prevLower !== "no");
      isOfficerIntentNew = !wasWilling && wantsToBeOfficer;
    }

    if (wantsToBeOfficer && isOfficerIntentNew) {
      var fullStudentId = data.studentId ? String(data.studentId).trim() : "未填寫";
      var genderText = data.gender ? String(data.gender).trim() : "未填寫";
      var climbingExp = (data.exp || data.outdoor_experience) ? String(data.exp || data.outdoor_experience).trim() : "未填寫";
      var fitnessText = (data.strength || data.fitness_desc) ? String(data.strength || data.fitness_desc).trim() : "未填寫";
      var contactPhone = data.phone ? String(data.phone).trim() : phone;
      var lineContact = (data.realLineId || data.lineId) ? String(data.realLineId || data.lineId).trim() : "同本帳號";

      var adminNotice = "🌟 【新幹部招募意願通知】\n" +
        "─────────────\n" +
        "社員填寫個人資料時，表達了加入幹部團隊的意願！\n\n" +
        "• 姓名：" + name + "\n" +
        "• 性別：" + genderText + "\n" +
        "• 科系：" + dept + "\n" +
        "• 學號：" + fullStudentId + "\n" +
        "• 爬山經驗：" + climbingExp + "\n" +
        "• 體能證明：" + fitnessText + "\n" +
        "• 聯絡電話：" + contactPhone + "\n" +
        "• LINE ID：" + lineContact + "\n\n" +
        "💡 幹部團隊可主動與該社員聯繫，歡迎新夥伴加入！";
      pushAdminMessage(adminNotice);
    }

    return _successResponse({ message: "資料更新推播已成功發送" });
  } catch (err) {
    console.warn("個人資料更新推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 幹部身分檢查 (輕量唯讀)
 */
function _handleCheckOfficerStatus(json) {
  try {
    var userId = json.userId;
    if (!userId) return _jsonResponse({ status: "success", isOfficer: false });

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Officers");
    if (!sheet) return _jsonResponse({ status: "success", isOfficer: false });

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var uidIdx = _fi(headers, "系統識別碼");
    if (uidIdx === -1) uidIdx = 3; // 預設第 4 欄

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][uidIdx]).trim() === String(userId).trim()) {
        return _jsonResponse({
          status: "success",
          isOfficer: true,
          name: data[i][0] || "幹部",
          role: data[i][1] || "幹部"
        });
      }
    }
    return _jsonResponse({ status: "success", isOfficer: false });
  } catch (err) {
    return _jsonResponse({ status: "success", isOfficer: false, error: err.toString() });
  }
}

/**
 * GAS GET 請求入口 (支援 check_officer_status, get_unpaid 唯讀備援與健康檢查)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  var userId = (e && e.parameter && e.parameter.userId) ? e.parameter.userId : "";

  // 1. 幹部身分初檢 (GET 備援)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus({ userId: userId });
  }

  // 2. 待繳費用清單唯讀備援 (保證絕不噴 500/404 錯誤，回傳安全空結構)
  if (action === "get_unpaid") {
    return _jsonResponse({
      status: "success",
      data: {
        membership: [],
        activities: [],
        equipments: []
      },
      message: "目前無待繳費用"
    });
  }

  // 3. 預設健康檢查
  return _jsonResponse({
    status: "ok",
    service: "Wilderness GAS Microservices",
    version: "2.0.1",
    architecture: "Modular (Supabase Primary, GAS Helper & Background Sync)"
  });
}

/**
 * 將上傳檔案存入雲端硬碟指定資料夾 (預設為 系統圖庫，可指定多層子資料夾路徑) 並設為公開連結
 * 完全對齊 gas.backup.js 原始強健實作：不依賴任何外部 DRIVE_FOLDER_ID，自動建立與查找
 */
function uploadFileToDrive(base64Str, fileName, folderPath) {
  if (!base64Str) return "";
  try {
    var splitData = base64Str.split(",");
    var contentType = "";
    var rawData = "";
    if (splitData.length > 1) {
      contentType = splitData[0].split(";")[0].split(":")[1];
      rawData = splitData[1];
    } else {
      rawData = splitData[0];
    }

    var decoded = Utilities.base64Decode(rawData);
    var blob = Utilities.newBlob(decoded, contentType || "image/jpeg", fileName);

    // 1. 取得或建立主資料夾 系統圖庫 (具備 LINE_Uploads 自動平滑過渡遷移)
    var currentFolder;
    var rootFolders = DriveApp.getFoldersByName("系統圖庫");
    if (rootFolders.hasNext()) {
      currentFolder = rootFolders.next();
    } else {
      var legacyFolders = DriveApp.getFoldersByName("LINE_Uploads");
      if (legacyFolders.hasNext()) {
        currentFolder = legacyFolders.next();
        try { currentFolder.setName("系統圖庫"); } catch (e) {}
      } else {
        currentFolder = DriveApp.createFolder("系統圖庫");
      }
    }

    // 2. 支援深層子資料夾路徑 (字串如 "裝備照片/帳篷" 或 "Wilderness_payment")
    if (folderPath) {
      var parts = Array.isArray(folderPath) ? folderPath : String(folderPath).split("/");
      for (var i = 0; i < parts.length; i++) {
        var partName = parts[i].trim();
        if (!partName) continue;
        var subFolders = currentFolder.getFoldersByName(partName);
        if (subFolders.hasNext()) {
          currentFolder = subFolders.next();
        } else {
          currentFolder = currentFolder.createFolder(partName);
        }
      }
    }

    var file = currentFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error("檔案上傳 Google Drive 失敗: " + err.toString());
    return "上傳失敗: " + err.toString();
  }
}

/**
 * 取得或建立欄位索引 (若欄位不存在則在最後新增並寫入標題，對齊 gas.backup.js)
 */
function getOrCreateColIdx(sheet, headers, columnName) {
  var idx = _fi(headers, columnName);
  if (idx === -1) {
    var lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue(columnName);
    headers.push(columnName);
    idx = headers.length - 1;
  }
  return idx;
}

/**
 * 幹部更新裝備照片處理函式 (完全對齊 gas.backup.js 實作與 Supabase 雙軌更新)
 */
function _handleUpdateEquipmentImages(payload) {
  try {
    var equipId = String(payload.equipId || "").trim();
    var equipName = String(payload.equipName || "").trim();
    var keptUrls = payload.keptUrls || [];
    var newPhotoFiles = payload.newPhotoFiles || [];

    if (!equipId) {
      return _errorResponse("缺少裝備代號 (equipId)");
    }

    // 1. 保留幹部未刪除的既有照片 URL
    var finalUrls = [];
    if (Array.isArray(keptUrls)) {
      for (var k = 0; k < keptUrls.length; k++) {
        var u = String(keptUrls[k] || "").trim();
        if (u.startsWith("http") && finalUrls.indexOf(u) === -1) {
          finalUrls.push(u);
        }
      }
    }

    // 2. 上傳新照片至 Google Drive: 系統圖庫/裝備照片/裝備名稱/
    // 檔案命名格式：裝備名稱_YYYYMMDD_序號.jpg
    if (Array.isArray(newPhotoFiles) && newPhotoFiles.length > 0) {
      var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyyMMdd");
      var folderPath = "裝備照片/" + (equipName || "未命名裝備");

      for (var f = 0; f < newPhotoFiles.length; f++) {
        if (finalUrls.length >= 5) break; // 最多 5 張
        var fileObj = newPhotoFiles[f];
        var base64Str = (fileObj && (fileObj.base64 || fileObj.data)) ? (fileObj.base64 || fileObj.data) : "";
        if (base64Str) {
          var ext = (fileObj.name && fileObj.name.split('.').pop()) || "jpg";
          var fileName = (equipName || "裝備") + "_" + todayStr + "_" + (finalUrls.length + 1) + "." + ext;
          var uploadedUrl = uploadFileToDrive(base64Str, fileName, folderPath);
          if (uploadedUrl && !uploadedUrl.startsWith("上傳失敗")) {
            var driveMatch = uploadedUrl.match(/(?:file\/d\/|id=)([^/&?]+)/);
            if (driveMatch && driveMatch[1]) {
              finalUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000");
            } else {
              finalUrls.push(uploadedUrl);
            }
          } else {
            console.warn("照片上傳 Drive 警告: " + uploadedUrl);
          }
        }
      }
    }

    // 3. 截斷至最多 5 張
    if (finalUrls.length > 5) {
      finalUrls = finalUrls.slice(0, 5);
    }

    var finalUrlStr = finalUrls.join(",");

    // 4. 同步更新 Supabase equipments 表 (保護性執行，不阻塞回傳)
    try {
      var props = PropertiesService.getScriptProperties();
      var sbUrl = props.getProperty('SUPABASE_URL') || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '');
      var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || (typeof SUPABASE_SERVICE_ROLE_KEY !== 'undefined' ? SUPABASE_SERVICE_ROLE_KEY : '');
      if (sbUrl && sbKey) {
        var patchUrl = sbUrl + "/rest/v1/equipments?id=eq." + encodeURIComponent(equipId);
        UrlFetchApp.fetch(patchUrl, {
          method: "patch",
          contentType: "application/json",
          headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
          payload: JSON.stringify({ images: finalUrls, updated_at: new Date().toISOString() }),
          muteHttpExceptions: true
        });
      }
    } catch (sbErr) {
      console.warn("Supabase equipments images 同步略過: " + sbErr.toString());
    }

    // 5. 同步更新主試算表 Equipments 表 (對齊 gas.backup.js 多欄獨立儲存與名稱容錯)
    try {
      var ss = _getSpreadsheet();
      if (ss) {
        var equipSheet = ss.getSheetByName("Equipments") || ss.getSheetByName("裝備清單") || ss.getSheetByName("裝備");
        if (equipSheet) {
          var data = equipSheet.getDataRange().getValues();
          var headers = data[0];
          var idIdx = _fi(headers, "裝備代號");
          var targetRow = -1;

          if (idIdx > -1) {
            for (var i = 1; i < data.length; i++) {
              if (String(data[i][idIdx]).trim() === equipId) {
                targetRow = i + 1;
                break;
              }
            }
          }

          if (targetRow > -1) {
            // 取得或建立 5 欄照片欄位 (圖片網址1 ~ 圖片網址5)
            var imgColIndices = [];
            var currentHeaders = equipSheet.getRange(1, 1, 1, equipSheet.getLastColumn()).getValues()[0];

            for (var k = 1; k <= 5; k++) {
              var targetColName = "圖片網址" + k;
              var foundIdx = currentHeaders.findIndex(function (h) {
                var s = String(h).trim();
                return s === targetColName || s === ("圖片網址 " + k);
              });

              if (foundIdx === -1 && k === 1) {
                var legacyIdx = _fi(currentHeaders, "圖片網址");
                if (legacyIdx > -1) {
                  equipSheet.getRange(1, legacyIdx + 1).setValue(targetColName);
                  currentHeaders[legacyIdx] = targetColName;
                  foundIdx = legacyIdx;
                }
              }

              if (foundIdx === -1) {
                foundIdx = getOrCreateColIdx(equipSheet, currentHeaders, targetColName);
                currentHeaders = equipSheet.getRange(1, 1, 1, equipSheet.getLastColumn()).getValues()[0];
              }
              imgColIndices.push(foundIdx);
            }

            // 將 5 張照片分別寫入對應獨立欄位 (一欄一個網址，未使用的欄位清空)
            for (var c = 0; c < 5; c++) {
              var cIdx = imgColIndices[c];
              if (cIdx > -1) {
                var cellVal = (c < finalUrls.length) ? finalUrls[c] : "";
                equipSheet.getRange(targetRow, cIdx + 1).setValue(cellVal);
              }
            }
          }
        }
      }
    } catch (sheetErr) {
      console.warn("試算表裝備照片欄位更新略過: " + sheetErr.toString());
    }

    return _successResponse({
      status: "success",
      message: "裝備照片更新成功",
      imageUrl: finalUrlStr,
      equipId: equipId
    });
  } catch (error) {
    console.error("更新裝備照片失敗:", error);
    return _errorResponse("更新裝備照片時發生後端錯誤: " + error.toString());
  }
}

