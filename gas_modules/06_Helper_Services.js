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

  // 7. 儲存/新增活動 (AdminEvents: 建立/更新活動、資料夾、名冊試算表、封面圖、幹部推播、Supabase 同步)
  if (action === "save_event") {
    return _handleSaveEvent(json);
  }

  // 8. 發送審核結果推播通知 (AdminEvents: 發送正取/備取 Flex 訊息)
  if (action === "send_event_notifications") {
    return _handleSendEventNotifications(json);
  }

  // 9. 裝備租借取消推播 Helper (雙軌幹部通知 + 個人取消憑證)
  if (action === "notify_loan_cancelled") {
    return _handleNotifyLoanCancelled(json);
  }

  // 10. 活動報名取消推播 Helper (正取緊急遞補通知 + 個人取消憑證)
  if (action === "notify_event_cancelled") {
    return _handleNotifyEventCancelled(json);
  }

  // 11. 社員心得評價提交推播 Helper (幹部評價通知)
  if (action === "notify_reflection_submitted") {
    return _handleNotifyReflectionSubmitted(json);
  }

  // 12. 繳費單核銷完成推播 Helper (純發訊息通知社員與幹部群組)
  if (action === "notify_payment_confirmed") {
    return _handleNotifyPaymentConfirmed(json);
  }

  // 13. 幹部手動建立活動專屬獨立試算表與雲端資料夾，並全量匯入既有名冊資料
  if (action === "create_event_sheet") {
    return _handleCreateEventSheet(json);
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
 * 取得社員聯絡資訊輔助函式 (優先查詢 Supabase members 表，備援查詢 Google Sheets Members 表)
 */
function _getMemberContactInfo(userId) {
  if (!userId || userId === "TEST_USER_ID") return null;
  try {
    if (typeof _supabaseGet === "function") {
      var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
      if (sbMembers && sbMembers.length > 0) {
        var m = sbMembers[0];
        return {
          name: m.name || "",
          realLineId: m.line_id || "",
          phone: m.phone || "",
          isOfficial: !!(m.is_official_member)
        };
      }
    }
  } catch (e) {
    console.error("[_getMemberContactInfo] Supabase 例外:", e);
  }
  return null;
}

/**
 * 裝備租借幹部推播 Helper (純推播訊息)
 * 包含：訂單編號、申請人真實姓名、LINE ID、聯絡電話、出隊天數、租借用途、預估租金與中文品項明細
 */
function _handleNotifyOfficersLoan(json) {
  try {
    var userId = json.userId;
    var details = json.details || {};
    var loanId = json.loanId || "新訂單";
    var totalRent = json.totalRent !== undefined ? json.totalRent : 0;
    var isOfficial = json.isOfficial;
    var borrowerName = json.borrowerName || "";
    var borrowerLineId = json.borrowerLineId || "";
    var borrowerPhone = json.borrowerPhone || "";
    var days = json.days;

    // 若未傳入天數，由日期動態推算
    if (!days && details.pickupDate && details.returnDate) {
      var pTime = new Date(String(details.pickupDate).replace(/-/g, "/")).getTime();
      var rTime = new Date(String(details.returnDate).replace(/-/g, "/")).getTime();
      days = Math.max(1, Math.round((rTime - pTime) / (1000 * 60 * 60 * 24)) + 1);
    }
    if (!days) days = 1;

    // 若前端未附帶姓名或 LINE ID，自動查詢 Supabase / 試算表補齊
    if (!borrowerName || !borrowerLineId) {
      var memberInfo = _getMemberContactInfo(userId);
      if (memberInfo) {
        if (!borrowerName) borrowerName = memberInfo.name;
        if (!borrowerLineId) borrowerLineId = memberInfo.realLineId;
        if (!borrowerPhone) borrowerPhone = memberInfo.phone;
        if (isOfficial === undefined) isOfficial = memberInfo.isOfficial;
      }
    }
    if (!borrowerName) borrowerName = "未知社員";
    if (!borrowerLineId) borrowerLineId = "未填寫";
    if (!borrowerPhone) borrowerPhone = "未填寫";

    var purpose = details.purpose || "社團出隊";
    if (purpose === "其他用途" && details.otherPurpose) {
      purpose = "其他用途 (" + details.otherPurpose + ")";
    }

    var identityDesc = (purpose === "社團出隊") ? "社團出隊 (免租金)" : (isOfficial ? "社員 (享5折)" : "非社員 (原價)");

    var itemsSummary = [];
    if (Array.isArray(json.cartDetails) && json.cartDetails.length > 0) {
      for (var i = 0; i < json.cartDetails.length; i++) {
        var itm = json.cartDetails[i];
        var itmName = itm.name || itm.id || "裝備";
        var itmQty = itm.quantity || itm.qty || 1;
        itemsSummary.push("• " + itmName + (itm.id && itm.name !== itm.id ? " (" + itm.id + ")" : "") + " x " + itmQty);
      }
    } else {
      var cart = details.cart || {};
      for (var eqId in cart) {
        if (cart[eqId] > 0) {
          itemsSummary.push("• " + eqId + " x " + cart[eqId]);
        }
      }
    }

    var msg = "【🎒 幹部通知：新裝備租借申請】\n" +
      "─────────────\n" +
      "• 訂單編號：" + loanId + "\n" +
      "• 申請人：" + borrowerName + " (" + identityDesc + ")\n" +
      "• LINE ID：" + borrowerLineId + "\n" +
      "• 聯絡電話：" + borrowerPhone + "\n" +
      "• 出隊天數：" + days + " 天 (" + (details.pickupDate || "") + " ~ " + (details.returnDate || "") + ")\n" +
      "• 租借用途：" + purpose + "\n" +
      "• 預估總租金：$" + totalRent + " 元\n\n" +
      "📦 借用裝備明細：\n" +
      (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") + "\n\n" +
      "⚡ 本資料已安全寫入 Supabase，請至幹部後台確認備用！";

    var loanSubject = "【台科登山社】新裝備租借申請 - " + loanId + " (" + borrowerName + ")";
    pushAdminMessage(msg, loanSubject);

    // ⭐️ 2. 同步保底推播給使用者個人 LINE 聊天室 (預約成功憑證)
    if (userId && userId !== "TEST_USER_ID") {
      var userLoanMsg = "【🎒 我的裝備租借預訂單】\n" +
        "\n" +
        "• 訂單編號：" + loanId + "\n" +
        "• 借用人：" + borrowerName + " (" + identityDesc + ")\n" +
        "• 預計領取：" + (details.pickupDate || "") + "\n" +
        "• 預計歸還：" + (details.returnDate || "") + " (共 " + days + " 天)\n" +
        "• 租借用途：" + purpose + "\n\n" +
        "📦 預約裝備清單：\n" +
        (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") + "\n\n" +
        "💰 預估總租金：$" + totalRent + " 元\n" +
        "\n" +
        "📌 提醒事項：\n" +
        "1. 幹部已收到您的預約申請，將為您備齊裝備。\n" +
        "2. 若有租金費用，請於領取前至「繳費申報」完成匯款並上傳憑證。\n" +
        "3. 將有幹部主動聯繫你，確認領取時間以及地點。\n" +
        "─────────────\n" +
        "【🎒 Equipment Loan Reservation Confirmed】\n" +
        "\n" +
        "• Order ID: " + loanId + "\n" +
        "• Borrower: " + borrowerName + " (" + identityDesc + ")\n" +
        "• Pickup Date: " + (details.pickupDate || "") + "\n" +
        "• Return Date: " + (details.returnDate || "") + " (" + days + " days)\n" +
        "• Purpose: " + purpose + "\n\n" +
        "📦 Items:\n" +
        (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• None") + "\n\n" +
        "💰 Estimated Total: $" + totalRent + " TWD\n" +
        "\n" +
        "📌 Notes:\n" +
        "1. Officers have received your request and will prepare the gear.\n" +
        "2. If fees apply, please complete payment in 'Payment Center' before pickup.\n" +
        "3. An officer will contact you to confirm pickup time and location. Thank you!";

      _pushMessage(userId, userLoanMsg);
    }

    return _successResponse({ message: "幹部推播與個人推播已成功送出" });
  } catch (err) {
    console.warn("裝備租借推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 裝備租借取消推播通知 (幹部 Gmail/LINE 雙軌 + 使用者個人憑證)
 */
function _handleNotifyLoanCancelled(json) {
  try {
    var loanId = json.loanId || "";
    var userId = json.userId || "";
    var borrowerName = json.borrowerName || "社員";
    var borrowerLineId = json.borrowerLineId || "";
    var isPaid = !!json.isPaid;
    var itemsSummary = json.itemsSummary || [];
    var itemsText = Array.isArray(itemsSummary) ? (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") : String(itemsSummary || "• 無品項");

    // 1. 幹部雙軌通知 (Gmail + LINE Push)
    var adminSubject = "";
    var adminBody = "";
    if (isPaid) {
      adminSubject = "【台科登山社】裝備預約取消（⚠️需安排退款）- " + loanId + " (" + borrowerName + ")";
      adminBody = "🔔 【幹部通知：裝備預約取消（需安排退款）】\n" +
        "─────────────\n" +
        "• 訂單編號：" + loanId + "\n" +
        "• 申請人：" + borrowerName + "\n" +
        (borrowerLineId ? "• LINE ID：" + borrowerLineId + "\n" : "") +
        "• 取消裝備品項：\n" + itemsText + "\n\n" +
        "⚠️ 該租借預約已繳費／待確認，請幹部依社團退費規範安排退款事宜！（庫存已由 Supabase 自動釋放回補）";
    } else {
      adminSubject = "【台科登山社】裝備預約取消通知 - " + loanId + " (" + borrowerName + ")";
      adminBody = "【🎒 幹部通知：裝備預約取消】\n" +
        "─────────────\n" +
        "• 訂單編號：" + loanId + "\n" +
        "• 申請人：" + borrowerName + "\n" +
        (borrowerLineId ? "• LINE ID：" + borrowerLineId + "\n" : "") +
        "• 取消裝備品項：\n" + itemsText + "\n\n" +
        "⚡ 裝備庫存已由 Supabase 自動釋放回補！";
    }

    pushAdminMessage(adminBody, adminSubject);

    // 2. 使用者個人 LINE 推播 (取消成功憑證)
    if (userId && userId !== "TEST_USER_ID") {
      var userMsg = "【🎒 裝備租借取消成功憑證】\n\n" +
        "• 訂單編號：" + loanId + "\n" +
        "• 借用人：" + borrowerName + "\n" +
        "• 取消裝備明細：\n" + itemsText + "\n\n" +
        (isPaid ? "⚠️ 您已完成此訂單之繳費，社團幹部將主動與您聯繫辦理退款事宜！\n\n" : "您的裝備租借預約已成功取消，庫存已歸還系統。\n\n") +
        "─────────────\n" +
        "【🎒 Equipment Loan Cancellation Confirmed】\n\n" +
        "• Order ID: " + loanId + "\n" +
        "• Borrower: " + borrowerName + "\n" +
        "• Items:\n" + itemsText + "\n\n" +
        (isPaid ? "⚠️ You have paid for this reservation. Officers will contact you regarding the refund process.\n" : "Your equipment loan reservation has been successfully cancelled.");

      _pushMessage(userId, userMsg);
    }

    return _successResponse({ message: "裝備取消幹部與個人推播已成功送出" });
  } catch (err) {
    console.warn("_handleNotifyLoanCancelled 失敗:", err);
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
    var noteZh = details.note ? "\n• 備註：" + details.note : "";
    var noteEn = details.note ? "\n• Note: " + details.note : "";
    var userName = details.userName || "";
    var selectedNames = details.selectedNames || [];
    var paymentId = details.paymentId || details.id || json.paymentId || "";

    // 若未傳入 selectedNames，根據 selectedIds 自動轉換品項名稱
    if ((!selectedNames || selectedNames.length === 0) && details.selectedIds && Array.isArray(details.selectedIds)) {
      selectedNames = details.selectedIds.map(function (id) {
        if (id === 'fee_membership') return '社籍與社費 (Membership Fee)';
        if (id.indexOf('act_') === 0) return '活動費用 (' + id + ')';
        if (id.indexOf('eq_') === 0) return '裝備租借 (' + id + ')';
        return id;
      });
    }

    var selectedNamesEn = details.selectedNamesEn || json.selectedNamesEn;
    if ((!selectedNamesEn || selectedNamesEn.length === 0) && details.selectedIds && Array.isArray(details.selectedIds)) {
      selectedNamesEn = details.selectedIds.map(function (id) {
        if (id === 'fee_membership') return 'Membership Fee';
        if (id.indexOf('act_') === 0) return 'Event Fee (' + id + ')';
        if (id.indexOf('eq_') === 0) return 'Equipment Loan (' + id + ')';
        return id;
      });
    }

    var itemsZh = selectedNames.length > 0 ? selectedNames.map(function (n) { return "  - " + n; }).join("\n") : "  - 無項目";
    var itemsEn = (selectedNamesEn && selectedNamesEn.length > 0)
      ? selectedNamesEn.map(function (n) { return "  - " + n; }).join("\n")
      : (selectedNames.length > 0
          ? selectedNames.map(function (n) {
              return "  - " + n.replace(/含社員5折優惠/g, "Member 50% discount applied");
            }).join("\n")
          : "  - None");

    var verifyToken = details.verifyToken || json.verifyToken || "";

    // ⭐️ 免 Google/LINE 帳號登入衝突：優先採用社團專屬 Web 單鍵核銷連結 (電腦、手機瀏覽器秒開秒核銷，完全不需要登入任何帳號)
    var frontendWebUrl = "";
    try {
      var props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) ? PropertiesService.getScriptProperties() : null;
      frontendWebUrl = (props ? props.getProperty('FRONTEND_WEB_URL') : null) || (typeof FRONTEND_WEB_URL !== 'undefined' ? FRONTEND_WEB_URL : "") || (typeof DEFAULT_FRONTEND_WEB_URL !== 'undefined' ? DEFAULT_FRONTEND_WEB_URL : "");
    } catch (eFw) {}
    if (!frontendWebUrl) {
      frontendWebUrl = "https://equipments-seven.vercel.app";
    }

    var webVerifyLink = paymentId
      ? (frontendWebUrl + "/confirm-payment?paymentId=" + encodeURIComponent(paymentId) + (verifyToken ? "&token=" + encodeURIComponent(verifyToken) : ""))
      : "";

    var liffChannelId = (typeof LIFF_CHANNEL_ID !== 'undefined' ? LIFF_CHANNEL_ID : '2009217429');
    var liffVerifyLink = paymentId
      ? ("https://liff.line.me/" + liffChannelId + "-jvj3ydDT?liff.state=" + encodeURIComponent("/confirm-payment?paymentId=" + paymentId + (verifyToken ? "&token=" + verifyToken : "")))
      : "";

    var webServiceUrl = "";
    try {
      if (typeof ScriptApp !== 'undefined' && ScriptApp.getServiceUrl) {
        webServiceUrl = ScriptApp.getServiceUrl();
      }
    } catch (e) {}

    if (!webServiceUrl) {
      try {
        var props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) ? PropertiesService.getScriptProperties() : null;
        webServiceUrl = (props ? props.getProperty('WEB_APP_URL') : null) || (typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : "") || (typeof DEFAULT_WEB_APP_URL !== 'undefined' ? DEFAULT_WEB_APP_URL : "");
      } catch (e2) {}
    }

    // 備用 GAS 網址 (僅在 Web / LIFF 網址不可用時作為備援)
    var gasVerifyLink = (webServiceUrl && paymentId)
      ? (webServiceUrl + "?action=confirm_payment_web&paymentId=" + encodeURIComponent(paymentId) + (verifyToken ? "&token=" + encodeURIComponent(verifyToken) : ""))
      : "";

    var verifyLink = webVerifyLink || liffVerifyLink || gasVerifyLink;

    // 1. 推播給幹部管理群組
    var adminMsg = "【💳 幹部通知：新繳費申報】\n\n" +
      (userName ? "申報人：" + userName + "\n" : "") +
      "申報人 ID：" + userId + "\n" +
      (paymentId ? "繳費單號：" + paymentId + "\n" : "") +
      "申報金額：$" + totalAmount + " 元\n" +
      "帳號末五碼：" + last5Digits + "\n" +
      "申報項目：\n" + itemsZh +
      noteZh + "\n\n" +
      "👉 幹部核銷方式（任選一種）：\n" +
      (paymentId ? "1. LINE 群組輸入：@小岳助理 核銷 " + paymentId + "\n" : "") +
      (verifyLink ? "2. 點擊單鍵核銷連結：" + verifyLink + "\n" : "2. 至管理後台更新對帳狀態\n") +
      "\n⚡ 資料已安全記錄於 Supabase，請幹部核對網銀後核銷！";

    // ⭐️ 精緻 HTML Email 樣板 (內建 100% 保證可見的翡翠綠單鍵核銷大按鈕，免 Google 登入)
    var paymentHtml = "";
    if (verifyLink) {
      var escapedItems = itemsZh.replace(/\n/g, '<br>');
      var escapedNote = noteZh ? ('<p style="margin: 8px 0; color: #475569;">' + noteZh.replace(/\n/g, '<br>') + '</p>') : '';
      paymentHtml = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">' +
        '<div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px;">' +
        '<h2 style="color: #065f46; margin: 0; font-size: 20px;">💳 台科登山社 • 新繳費申報通知</h2>' +
        '<p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">請幹部核對網銀款項後，點擊下方綠色按鈕即可一鍵完成核銷 (免切換 Google 帳號)</p>' +
        '</div>' +
        '<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 15px;">' +
        '<table style="width: 100%; border-collapse: collapse;">' +
        (userName ? '<tr><td style="padding: 6px 0; color: #64748b; width: 100px;">申報人：</td><td style="padding: 6px 0; font-weight: bold; color: #0f172a;">' + userName + '</td></tr>' : '') +
        (paymentId ? '<tr><td style="padding: 6px 0; color: #64748b;">繳費單號：</td><td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #2563eb;">' + paymentId + '</td></tr>' : '') +
        '<tr><td style="padding: 6px 0; color: #64748b;">申報金額：</td><td style="padding: 6px 0; font-size: 18px; font-weight: bold; color: #059669;">$' + totalAmount + ' 元</td></tr>' +
        '<tr><td style="padding: 6px 0; color: #64748b;">帳號末五碼：</td><td style="padding: 6px 0; font-weight: bold; color: #0f172a;">' + last5Digits + '</td></tr>' +
        '<tr><td style="padding: 6px 0; color: #64748b; vertical-align: top;">申報項目：</td><td style="padding: 6px 0; color: #334155;">' + escapedItems + '</td></tr>' +
        '</table>' +
        escapedNote +
        '</div>' +
        '<div style="text-align: center; margin: 28px 0;">' +
        '<a href="' + verifyLink + '" target="_blank" style="background-color: #059669; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block; box-shadow: 0 4px 10px rgba(5,150,105,0.3); letter-spacing: 0.5px;">' +
        '✅ 確認無誤（點擊完成核銷）' +
        '</a>' +
        '<p style="color: #64748b; font-size: 12px; margin-top: 10px;">點擊後系統將自動更新 Supabase 狀態為【已核銷 Confirmed】，並推播通知該社員與幹部群組！</p>' +
        '</div>' +
        '<div style="border-top: 1px dashed #cbd5e1; padding-top: 16px; font-size: 13px; color: #64748b;">' +
        '<strong>備用核銷方式：</strong><br>' +
        '1. LINE 幹部群組輸入：<code>@小岳助理 核銷 ' + paymentId + '</code><br>' +
        '2. 直接複製核銷網址：<a href="' + verifyLink + '" style="color: #2563eb; word-break: break-all;">' + verifyLink + '</a>' +
        '</div>' +
        '</div>';
    }

    var paymentSubject = "【台科登山社】新繳費申報 - $" + totalAmount + " (" + (userName || "未知社員") + "，末5碼 " + last5Digits + ")";
    pushAdminMessage(adminMsg, paymentSubject, { htmlBody: paymentHtml });

    // 2. ⭐️ 同步保底推播給使用者個人 LINE 聊天室 (個人繳費收據)
    if (userId && userId !== "TEST_USER_ID") {
      var userMsg = "【💳 繳費申報已成功送出】\n\n" +
        "您好" + (userName ? " " + userName : "") + "！系統已成功收到您的繳費申報資訊：\n\n" +
        (paymentId ? "• 繳費單號：" + paymentId + "\n" : "") +
        "• 申報金額：$" + totalAmount + " 元\n" +
        "• 帳號末五碼：" + last5Digits + "\n" +
        "• 申報項目：\n" + itemsZh +
        noteZh + "\n\n" +
        "幹部會於核對款項後自動更新您的繳費狀態。謝謝！\n" +
        "─────────────\n" +
        "【💳 Payment Report Submitted】\n\n" +
        "Hello" + (userName ? " " + userName : "") + "! Your payment report has been submitted:\n\n" +
        (paymentId ? "• Payment ID: " + paymentId + "\n" : "") +
        "• Amount: $" + totalAmount + " TWD\n" +
        "• Last 5 Digits: " + last5Digits + "\n" +
        "• Items:\n" + itemsEn +
        noteEn + "\n\n" +
        "Officers will verify your payment and update your status soon. Thank you!";

      _pushMessage(userId, userMsg);
    }

    return _successResponse({ message: "繳費申報幹部與個人推播已成功送出" });
  } catch (err) {
    console.warn("繳費申報幹部推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 繳費單核銷完成推播 Helper (由 Web 端核銷成功後發送通知給社員個人與幹部群組)
 */
function _handleNotifyPaymentConfirmed(json) {
  try {
    var paymentId = json.paymentId || "";
    var userName = json.userName || "社員";
    var amount = json.amount || 0;
    var items = json.items || json.type || "社團活動/裝備費用";
    var lineUserId = json.lineUserId || "";
    var confirmedBy = json.confirmedBy || "Email 單鍵核銷";

    // 1. 推播給社員個人 LINE
    if (lineUserId && lineUserId.indexOf("U") === 0) {
      var successMsg = "🎉 繳費成功通知 / Payment Confirmed\n\n" +
        "親愛的 " + userName + " 您好：\n" +
        "幹部已確認收到您的款項囉！\nOfficer has confirmed your payment!\n\n" +
        "• 繳費單號：" + paymentId + "\n" +
        "• 核銷金額：$" + amount + " 元\n" +
        "• 核銷項目：" + items + "\n\n" +
        "感謝您的配合，您的帳務狀態已經更新為【已核銷 Confirmed】！期待在山林活動中與您相見！🏔️✨\n" +
        "─────────────\n" +
        "Dear " + userName + ",\n" +
        "Your payment has been successfully confirmed by the officers!\n\n" +
        "• Payment ID: " + paymentId + "\n" +
        "• Amount: $" + amount + " TWD\n" +
        "• Items: " + items + "\n\n" +
        "Thank you for your prompt payment. Your account status is now updated to [Confirmed]!";
      _pushMessage(lineUserId, successMsg);
    }

    // 2. 推播給幹部管理群組
    var adminMsg = "【💳 幹部通知：繳費單已完成核銷】\n" +
      "─────────────\n" +
      "• 繳費單號：" + paymentId + "\n" +
      "• 申報人：" + userName + "\n" +
      "• 核銷金額：$" + amount + " 元\n" +
      "• 核銷項目：" + items + "\n" +
      "• 核銷途徑：" + confirmedBy + "\n" +
      "• 系統狀態：已成功更新 Supabase 資料庫";
    var adminSubject = "【台科登山社】繳費單已完成核銷 - " + paymentId + " (" + userName + ")";
    pushAdminMessage(adminMsg, adminSubject);

    return _successResponse({ message: "核銷通知推播已成功送出" });
  } catch (err) {
    console.warn("_handleNotifyPaymentConfirmed 異常:", err);
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

    function _translateValueToEn(val) {
      if (val === null || val === undefined) return "Updated";
      var s = String(val).trim();
      if (!s || s === "未填寫") return "Not provided";
      if (s === "已更新") return "Updated";
      if (s.indexOf("我有意願成為社團幹部") > -1) return "Willing to be an officer";
      if (s === "一般社員") return "General Member";
      if (s === "正式社員") return "Official Member";
      if (s === "暫不加入") return "Not joining yet";
      if (s === "男") return "Male";
      if (s === "女") return "Female";
      if (s === "其他") return "Other";
      if (s === "校內學生") return "NTUST Student";
      if (s === "校友") return "NTUST Alumnus";
      if (s === "外校學生") return "Non-NTUST Student";
      if (s === "校外人士") return "Community Member";
      if (s === "教職員") return "Faculty / Staff";
      if (s === "父子" || s === "父女") return "Father";
      if (s === "母子" || s === "母女") return "Mother";
      if (s === "父母") return "Parents";
      if (s === "朋友") return "Friend";
      if (s === "配偶") return "Spouse";
      if (s === "兄弟" || s === "姊妹") return "Sibling";
      return s;
    }

    var titleZh = isNew ? "【🎉 歡迎加入！基本資料註冊成功】" : "【✅ 基本資料已成功更新】";
    var titleEn = isNew ? "【🎉 Welcome! Registration Success】" : "【✅ Profile Updated Successfully】";

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
    var footerZh = "";
    var footerEn = "";
    if (isActivityReady) {
      footerZh = "💡 您的出隊保險與資料已完整，隨時可於 LINE 選單點擊「最新活動」報名出隊行程，或至「裝備租借」預約出隊器材！";
      footerEn = "💡 Your trip insurance and safety verification details are fully completed. You are eligible to sign up for upcoming club events via \"Activities\", or reserve gear via \"Equipment Loan\" anytime!";
    } else {
      var fieldEnMap = {
        "姓名": "Name", "性別": "Gender", "聯絡電話": "Phone", "生日": "Birthday",
        "身分證/護照": "ID/ARC/Passport", "通訊地址": "Current Address", "緊急聯絡人姓名": "Emergency Contact Name",
        "與緊急聯絡人關係": "Relationship", "緊急聯絡人地址": "Emergency Contact Address", "緊急聯絡人電話": "Emergency Contact Phone",
        "體能自評": "Fitness Self-Assessment", "體能證明": "Fitness Proof", "爬山經驗": "Hiking Experience"
      };
      var missingText = activityMissing.slice(0, 4).join("、") + (activityMissing.length > 4 ? " 等 " + activityMissing.length + " 項" : "");
      var missingEnText = activityMissing.slice(0, 4).map(function (f) { return fieldEnMap[f] || f; }).join(", ") + (activityMissing.length > 4 ? " and " + (activityMissing.length - 4) + " more" : "");

      footerZh = "💡 您可隨時至 LINE 選單「裝備租借」預約出隊器材！\n\n⚠️ 提醒：出隊活動需辦理平安保險與安全審核，目前尚缺少出隊必要資訊（" + missingText + "），如欲報名最新活動，記得至選單「填寫資料」補齊即可啟用一鍵報名喔！🏕️";
      footerEn = "💡 You can reserve outdoor gear anytime via \"Equipment Loan\" without full trip details!\n\n⚠️ Trip Notice: Participating in hiking events requires safety insurance and qualification review. You currently have missing trip information (" + missingEnText + "). If you plan to join upcoming events, please update your profile via \"Register\" in the menu to enable one-click signup! 🏕️";
    }

    var introZh = "";
    var introEn = "";
    var detailsZh = [];
    var detailsEn = [];

    var deptEn = (dept === "未填寫" ? "Not provided" : dept);
    var studentIdEn = (studentId === "未填寫" ? "Not provided" : studentId);
    var phoneEn = (phone === "未填寫" ? "Not provided" : phone);

    if (isNew) {
      // 1. 新註冊使用者：顯示完整註冊資料
      introZh = "您好 " + name + "！感謝您完成台科登山社社團系統個人資料註冊：";
      introEn = "Hello " + name + "! Thank you for registering your profile with the NTUST Mountaineering Club:";
      if (data.name) {
        detailsZh.push("• 姓名：" + name);
        detailsEn.push("• Name: " + name);
      }
      if (data.department || data.studentId) {
        detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
        detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
      }
      if (data.phone) {
        detailsZh.push("• 聯絡電話：" + phone);
        detailsEn.push("• Phone Number: " + phoneEn);
      }
      if (data.emerName || data.emerRel) {
        detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
        detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
      }
      if (data.intendOfficial) {
        detailsZh.push("• 加入社員意願：" + offIntent);
        detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
      }
      if (data.exp) {
        detailsZh.push("• 爬山經歷：已更新");
        detailsEn.push("• Hiking Experience: Updated");
      }
      if (data.strength || data.strengthProof) {
        detailsZh.push("• 體能自評：已更新");
        detailsEn.push("• Fitness Self-Assessment: Updated");
      }
    } else if (Array.isArray(json.changedFields)) {
      // 2. 既有使用者更新個人檔案：依據實際變更欄位動態顯示
      var cFields = json.changedFields;
      if (cFields.length === 0) {
        introZh = "您好 " + name + "！您的個人檔案未有變更，資料已為最新狀態。";
        introEn = "Hello " + name + "! No changes were made to your profile; your information is up to date.";
      } else {
        introZh = "您好 " + name + "！您已於系統中成功更新個人檔案：";
        introEn = "Hello " + name + "! You have successfully updated your profile:";
        if (cFields.indexOf("name") > -1) {
          detailsZh.push("• 姓名：" + name);
          detailsEn.push("• Name: " + name);
        }
        if (cFields.indexOf("gender") > -1) {
          detailsZh.push("• 性別：" + (data.gender || "已更新"));
          detailsEn.push("• Gender: " + _translateValueToEn(data.gender || "已更新"));
        }
        if (cFields.indexOf("birthday") > -1) {
          detailsZh.push("• 生日：" + (data.birthday || "已更新"));
          detailsEn.push("• Birthday: " + (data.birthday || "Updated"));
        }
        if (cFields.indexOf("idNumber") > -1) {
          var maskedId = data.idNumber ? _maskString(data.idNumber, 2, 2) : "已更新";
          detailsZh.push("• 身分證/護照：" + maskedId);
          detailsEn.push("• ID / Passport: " + (maskedId === "已更新" ? "Updated" : maskedId));
        }
        if (cFields.indexOf("department_studentId") > -1) {
          detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
          detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
        }
        if (cFields.indexOf("identityStatus") > -1) {
          detailsZh.push("• 身分別：" + (data.identityStatus || "已更新"));
          detailsEn.push("• Identity Status: " + _translateValueToEn(data.identityStatus || "已更新"));
        }
        if (cFields.indexOf("phone") > -1) {
          detailsZh.push("• 聯絡電話：" + phone);
          detailsEn.push("• Phone Number: " + phoneEn);
        }
        if (cFields.indexOf("email") > -1) {
          detailsZh.push("• 電子信箱：" + (data.email || "已更新"));
          detailsEn.push("• Email: " + (data.email || "Updated"));
        }
        if (cFields.indexOf("realLineId") > -1) {
          detailsZh.push("• LINE ID：" + (data.realLineId || "已更新"));
          detailsEn.push("• LINE ID: " + (data.realLineId || "Updated"));
        }
        if (cFields.indexOf("studentAddr") > -1) {
          detailsZh.push("• 現居地址：" + (data.studentAddr || "已更新"));
          detailsEn.push("• Current Address: " + (data.studentAddr || "Updated"));
        }
        if (cFields.indexOf("emergency_contact") > -1) {
          detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
          detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
        }
        if (cFields.indexOf("emerPhone") > -1) {
          var maskedEmerPhone = data.emerPhone ? _maskString(data.emerPhone, 4, 3) : "已更新";
          detailsZh.push("• 緊急聯絡人電話：" + maskedEmerPhone);
          detailsEn.push("• Emergency Contact Phone: " + (maskedEmerPhone === "已更新" ? "Updated" : maskedEmerPhone));
        }
        if (cFields.indexOf("emerAddr") > -1) {
          detailsZh.push("• 緊急聯絡人地址：" + (data.emerAddr || "已更新"));
          detailsEn.push("• Emergency Contact Address: " + (data.emerAddr || "Updated"));
        }
        if (cFields.indexOf("medicalHistory") > -1) {
          detailsZh.push("• 特殊病史：已更新");
          detailsEn.push("• Medical History: Updated");
        }
        if (cFields.indexOf("exp") > -1) {
          detailsZh.push("• 爬山經歷：已更新");
          detailsEn.push("• Hiking Experience: Updated");
        }
        if (cFields.indexOf("strength") > -1) {
          detailsZh.push("• 體能自評：已更新");
          detailsEn.push("• Fitness Assessment: Updated");
        }
        if (cFields.indexOf("intendOfficial") > -1) {
          detailsZh.push("• 加入社員意願：" + offIntent);
          detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
        }
        if (cFields.indexOf("intendOfficer") > -1) {
          detailsZh.push("• 擔任幹部意願：" + (data.intendOfficer || "已更新"));
          detailsEn.push("• Officer Intent: " + _translateValueToEn(data.intendOfficer || "已更新"));
        }
        if (cFields.indexOf("wantToSay") > -1) {
          detailsZh.push("• 想說的話：已更新");
          detailsEn.push("• I want to say...: Updated");
        }
      }
    } else {
      // 3. 既有使用者且未傳入 changedFields 之向下相容 fallback
      introZh = "您好 " + name + "！您已於系統中成功更新個人檔案：";
      introEn = "Hello " + name + "! You have successfully updated your profile:";
      detailsZh.push("• 姓名：" + name);
      detailsEn.push("• Name: " + name);
      detailsZh.push("• 系所 / 學號：" + dept + " (" + studentId + ")");
      detailsEn.push("• Dept / Student ID: " + deptEn + " (" + studentIdEn + ")");
      detailsZh.push("• 聯絡電話：" + phone);
      detailsEn.push("• Phone Number: " + phoneEn);
      detailsZh.push("• 緊急聯絡人：" + emerName + " (" + emerRel + ")");
      detailsEn.push("• Emergency Contact: " + (emerName === "未填寫" ? "Not provided" : emerName) + " (" + _translateValueToEn(emerRel) + ")");
      detailsZh.push("• 加入社員意願：" + offIntent);
      detailsEn.push("• Club Membership Intent: " + _translateValueToEn(offIntent));
      if (data.exp) {
        detailsZh.push("• 爬山經歷：已更新");
        detailsEn.push("• Hiking Experience: Updated");
      }
      if (data.strength) {
        detailsZh.push("• 體能自評：已更新");
        detailsEn.push("• Fitness Assessment: Updated");
      }
    }

    var zhBlock = introZh;
    if (detailsZh.length > 0) {
      zhBlock += "\n\n" + detailsZh.join("\n");
    }
    zhBlock += "\n\n" + footerZh;

    var enBlock = introEn;
    if (detailsEn.length > 0) {
      enBlock += "\n\n" + detailsEn.join("\n");
    }
    enBlock += "\n\n" + footerEn;

    var msg = titleZh + "\n\n" + zhBlock + "\n─────────────\n" + titleEn + "\n\n" + enBlock;

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
      var cadreSubject = "【台科登山社】幹部意願登記 - " + name + " (" + (dept || "登山夥伴") + ")";
      pushAdminMessage(adminNotice, cadreSubject);
    }

    return _successResponse({ message: "資料更新推播已成功發送" });
  } catch (err) {
    console.warn("個人資料更新推播失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 活動報名取消推播通知 (正取緊急遞補 + 使用者個人憑證)
 */
function _handleNotifyEventCancelled(json) {
  try {
    var eventId = json.eventId || "";
    var eventName = json.eventName || "社團活動";
    var userId = json.userId || "";
    var userName = json.userName || "社員";
    var reviewStatus = String(json.reviewStatus || "");
    var cancelReason = json.cancelReason || "自願取消";
    var isPaid = !!json.isPaid;

    var isConfirmedUser = reviewStatus.indexOf("正取") > -1;

    // 1. 僅當「正取」人員取消時發送幹部緊急通知 (避免備取取消群組洗版)
    if (isConfirmedUser) {
      var adminSubject = "【台科登山社】正取棄權緊急通知 - " + eventName + " (" + userName + ")";
      var adminBody = "🔔 【幹部通知：正取取消（" + (isPaid ? "需安排替補與退費" : "需安排備取遞補") + "）】\n" +
        "─────────────\n" +
        "• 活動名稱：" + eventName + " (" + eventId + ")\n" +
        "• 棄權社員：" + userName + "\n" +
        "• 審核狀態：正取 (棄權)\n" +
        "• 取消原因：" + cancelReason + "\n\n" +
        (isPaid
          ? "⚠️ 該正取者已完成繳費／待對帳，請幹部安排備取遞補與退費事宜！"
          : "⚡ 正取名額已釋出，請幹部儘速檢視備取名單，聯繫有遞補意願之社員！");

      pushAdminMessage(adminBody, adminSubject);
    }

    // 2. 使用者個人 LINE 推播 (取消報名確認)
    if (userId && userId !== "TEST_USER_ID") {
      var userMsg = "【🏕️ 活動報名取消確認】\n\n" +
        "親愛的 " + userName + " 您好：\n" +
        "您所報名的活動【" + eventName + "】已成功取消！\n\n" +
        "• 原審核狀態：" + (reviewStatus || "已報名") + "\n" +
        (cancelReason ? "• 取消原因：" + cancelReason + "\n" : "") +
        (isPaid ? "\n⚠️ 若您已繳交活動費用，社團幹部將依退費規範主動聯絡您安排退費！\n" : "\n期待未來在其他山林活動中與您同行！🏔️\n") +
        "─────────────\n" +
        "【🏕️ Event Registration Cancellation Confirmed】\n\n" +
        "Dear " + userName + ",\n" +
        "Your registration for [" + eventName + "] has been successfully cancelled." +
        (isPaid ? "\n⚠️ If you have already paid the activity fee, officers will contact you for refund arrangements." : "\nHope to see you on the trails in future events! 🏔️");

      _pushMessage(userId, userMsg);
    }

    // 3. ⚡ 同步標記該活動專屬獨立試算表 (報名名冊) 為已取消
    try {
      _syncCancelToEventSpreadsheet(eventId, userId, json.signupCode || "", cancelReason);
    } catch (sheetSyncErr) {
      console.warn("活動獨立試算表取消同步例外:", sheetSyncErr);
    }

    return _successResponse({ message: "活動取消推播已成功送出" });
  } catch (err) {
    console.warn("_handleNotifyEventCancelled 失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 社員心得評分提交推播通知 (幹部通知)
 */
function _handleNotifyReflectionSubmitted(json) {
  try {
    var userId = json.userId || "";
    var userName = json.userName || "社員";
    var eventName = json.eventName || "社團活動";
    var difficulty = parseInt(json.difficulty, 10) || 3;
    var beauty = parseInt(json.beauty, 10) || 5;
    var content = json.content || "";
    var photoUrls = json.photoUrls || [];
    var photosText = Array.isArray(photoUrls) ? photoUrls.join("\n• ") : String(photoUrls || "");

    var diffStars = "★".repeat(Math.min(5, Math.max(1, difficulty)));
    var beautyStars = "★".repeat(Math.min(5, Math.max(1, beauty)));

    var adminSubject = "【台科登山社】新活動心得分享 - " + eventName + " (" + userName + ")";
    var adminBody = "【📝 幹部通知：社員活動心得回饋】\n" +
      "─────────────\n" +
      "• 發表社員：" + userName + "\n" +
      "• 活動名稱：" + eventName + "\n" +
      "• 路線難度：" + diffStars + " (" + difficulty + "/5)\n" +
      "• 風景推薦：" + beautyStars + " (" + beauty + "/5)\n\n" +
      "💬 心得內容：\n" + (content || "(無文字心得)") +
      (photosText ? "\n\n📷 登頂相片：\n• " + photosText : "");

    pushAdminMessage(adminBody, adminSubject);
    return _successResponse({ message: "心得提交推播已成功送出" });
  } catch (err) {
    console.warn("_handleNotifyReflectionSubmitted 失敗:", err);
    return _errorResponse(err.toString());
  }
}

/**
 * 網頁單鍵核銷繳費 (供 Gmail 郵件直接點擊核銷)
 */
function _handleWebConfirmPayment(paymentId) {
  if (!paymentId) {
    return HtmlService.createHtmlOutput("<h2 style='color:#e11d48;font-family:sans-serif;'>❌ 缺少繳費單號參數</h2>");
  }

  var res = (typeof _processPaymentVerification === 'function')
    ? _processPaymentVerification(paymentId, "Gmail 網頁核銷", false)
    : { success: false, message: "核銷引擎未載入" };

  if (res.success) {
    var html = "<div style='font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:40px auto;padding:24px;border:1px solid #10b981;border-radius:12px;background:#f0fdf4;'>" +
      "<h2 style='color:#059669;margin-top:0;'>✅ 繳費單核銷成功！</h2>" +
      "<p style='color:#374151;line-height:1.6;'>單號：<strong>" + paymentId + "</strong><br>" +
      "狀態已成功更新為：<span style='color:#059669;font-weight:bold;'>已核銷 Confirmed</span><br>" +
      "系統已自動發送【🎉 繳費成功通知】給該社員之個人 LINE 聊天室！</p>" +
      "<p style='color:#6b7280;font-size:13px;'>您可以關閉此分頁。</p></div>";
    return HtmlService.createHtmlOutput(html);
  } else {
    var errHtml = "<div style='font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:40px auto;padding:24px;border:1px solid #ef4444;border-radius:12px;background:#fef2f2;'>" +
      "<h2 style='color:#dc2626;margin-top:0;'>❌ 核銷失敗</h2>" +
      "<p style='color:#374151;'>單號：<strong>" + paymentId + "</strong><br>原因：" + res.message + "</p></div>";
    return HtmlService.createHtmlOutput(errHtml);
  }
}

/**
 * 幹部身分檢查 (輕量唯讀)
 */
function _handleCheckOfficerStatus(json) {
  try {
    var userId = json.userId;
    if (!userId) return _jsonResponse({ status: "success", isOfficer: false });

    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var res = checkOfficerInternal(ss, userId);
    return _jsonResponse({
      status: "success",
      isOfficer: res.isOfficer,
      name: res.name || "幹部",
      role: res.role || "幹部"
    });
  } catch (err) {
    return _jsonResponse({ status: "success", isOfficer: false, error: err.toString() });
  }
}

/**
 * GAS GET 請求入口 (支援 check_officer_status, send_event_notifications, get_admin_events, get_event_signups, get_unpaid 與健康檢查)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";
  var userId = (e && e.parameter && e.parameter.userId) ? e.parameter.userId : "";

  // 0. 網頁單鍵核銷繳費 (GET action=confirm_payment_web&paymentId=...)
  if (action === "confirm_payment_web") {
    var webPayId = (e && e.parameter && e.parameter.paymentId) ? e.parameter.paymentId : "";
    return _handleWebConfirmPayment(webPayId);
  }

  // 1. 幹部身分初檢 (GET 備援)
  if (action === "check_officer_status") {
    return _handleCheckOfficerStatus({ userId: userId });
  }

  // 2. 審核結果推播通知 (GET 端點支援)
  if (action === "send_event_notifications") {
    var eventId = (e && e.parameter && e.parameter.eventId) ? e.parameter.eventId : "";
    return _handleSendEventNotifications({ userId: userId, eventId: eventId });
  }

  // 3. 活動清單唯讀備援
  if (action === "get_admin_events") {
    return _handleGetAdminEvents(userId);
  }

  // 4. 報名名冊唯讀備援
  if (action === "get_event_signups") {
    var signupEventId = (e && e.parameter && e.parameter.eventId) ? e.parameter.eventId : "";
    return _handleGetEventSignups(signupEventId, userId);
  }

  // 5. 待繳費用清單唯讀備援 (保證絕不噴 500/404 錯誤，回傳安全空結構)
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

  // 6. 預設健康檢查
  return _jsonResponse({
    status: "ok",
    service: "Wilderness GAS Microservices",
    version: "2.0.2",
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
        try { currentFolder.setName("系統圖庫"); } catch (e) { }
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

/**
 * 內部輔助：檢驗使用者是否為登山社幹部 (100% 直連 Supabase members 與 officers 表 SSOT)
 */
function checkOfficerInternal(ss, userId, userName) {
  // 支援單參數呼叫：若第一個參數為字串且未傳第二個參數，則代表第一個參數即為 userId
  if (typeof ss === "string" && !userId) {
    userId = ss;
    ss = null;
  }
  if (!userId && !userName) return { isOfficer: false, role: "", name: "" };
  // 🛡️ 杜絕測試帳號或外部未授權存取在正式環境取得幹部特權
  if (userId === "TEST_USER_ID") return { isOfficer: false, role: "", name: "" };

  try {
    // 1. 優先以 userId 查詢 members 表 (檢查 is_officer 或 officer_role)
    if (userId) {
      var members = _supabaseGet("members", {
        line_user_id: "eq." + userId,
        select: "name,officer_role,is_officer"
      });
      if (members && members.length > 0) {
        var m = members[0];
        var roleStr = m.officer_role || "";
        var isOffRole = ["幹部", "社長", "副社長", "管理員", "嚮導", "嚮導長", "裝備長", "活動長", "總務"].indexOf(roleStr) > -1;
        if (m.is_officer === true || isOffRole) {
          return { isOfficer: true, role: roleStr || "幹部", name: m.name || "" };
        }
      }

      // 2. 查驗 officers 表 (支援以 line_user_id 查詢)
      var officers = _supabaseGet("officers", {
        line_user_id: "eq." + userId,
        select: "name,role,title"
      });
      if (officers && officers.length > 0) {
        var off = officers[0];
        return { isOfficer: true, role: off.title || off.role || "幹部", name: off.name || "" };
      }
    }

    // 3. 備援支援以 userName 查詢 members 或 officers 表
    if (userName) {
      var cleanName = userName.trim();
      var mByName = _supabaseGet("members", {
        name: "eq." + cleanName,
        select: "name,officer_role,is_officer"
      });
      if (mByName && mByName.length > 0) {
        var mb = mByName[0];
        var roleStrB = mb.officer_role || "";
        var isOffRoleB = ["幹部", "社長", "副社長", "管理員", "嚮導", "嚮導長", "裝備長", "活動長", "總務"].indexOf(roleStrB) > -1;
        if (mb.is_officer === true || isOffRoleB) {
          return { isOfficer: true, role: roleStrB || "幹部", name: mb.name || "" };
        }
      }

      var offByName = _supabaseGet("officers", {
        name: "eq." + cleanName,
        select: "name,role,title"
      });
      if (offByName && offByName.length > 0) {
        var oByName = offByName[0];
        return { isOfficer: true, role: oByName.title || oByName.role || "幹部", name: oByName.name || "" };
      }
    }
  } catch (err) {
    console.error("[checkOfficerInternal] Supabase 幹部身分檢查例外:", err);
  }

  return { isOfficer: false, role: "", name: "" };
}

/**
 * 主動推播 Flex 訊息
 */
function pushFlexMessage(to, altText, contents) {
  if (!to || !contents) return;
  var token = MEMBER_BOT_TOKEN || PropertiesService.getScriptProperties().getProperty("MEMBER_BOT_TOKEN");
  return _lineAPI("push", token, {
    to: to,
    messages: [{
      type: "flex",
      altText: altText || "通知訊息",
      contents: contents
    }]
  });
}

/**
 * 安全設置或更新 _CONFIG 工作表中的鍵值對
 */
function _setOrUpdateConfigRow(configSheet, key, value) {
  if (!configSheet || !key) return;
  var cData = configSheet.getDataRange().getValues();
  for (var i = 0; i < cData.length; i++) {
    if (String(cData[i][0]).trim().toUpperCase() === String(key).trim().toUpperCase()) {
      configSheet.getRange(i + 1, 2).setValue(value !== undefined && value !== null ? value : "");
      return;
    }
  }
  configSheet.appendRow([key, value !== undefined && value !== null ? value : ""]);
}

/**
 * 建立活動專屬雲端硬碟資料夾 (YYYY/MM/DD_活動名稱) 與報名名冊試算表
 */
function _createEventDriveFolderAndSheet(payload, eventId) {
  try {
    var rawDate = payload.startDate || "";
    var datePart = "";
    if (rawDate) {
      datePart = String(rawDate).trim().replace(/-/g, "/").split(" ")[0].split("T")[0];
    }
    if (!datePart) {
      datePart = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy/MM/dd");
    }

    var eventName = (payload.name || "未命名活動").trim();
    var folderName = datePart + "_" + eventName;

    // 1. 於 Google Drive 根目錄建立專屬活動資料夾
    var folder = DriveApp.getRootFolder().createFolder(folderName);
    var folderUrl = folder.getUrl();
    var folderId = folder.getId();

    // 2. 建立活動專屬報名試算表 (優先從 EVENT_SHEET_TEMPLATE_ID 範本自動複製)
    var sheetName = folderName + "_報名名冊";
    var templateId = PropertiesService.getScriptProperties().getProperty("EVENT_SHEET_TEMPLATE_ID");
    var newSS = null;
    var ssId = "";
    var ssUrl = "";

    if (templateId) {
      try {
        var templateFile = DriveApp.getFileById(templateId.trim());
        var copiedFile = templateFile.makeCopy(sheetName, folder);
        ssId = copiedFile.getId();
        ssUrl = copiedFile.getUrl();
        newSS = SpreadsheetApp.open(copiedFile);
        console.log("⚡ [Template] 成功複製範本試算表: " + ssId);
      } catch (tmplErr) {
        console.warn("複製範本試算表失敗，切換為程式化動態生成:", tmplErr);
      }
    }

    if (!newSS) {
      newSS = SpreadsheetApp.create(sheetName);
      ssId = newSS.getId();
      ssUrl = newSS.getUrl();

      var file = DriveApp.getFileById(ssId);
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);

      var signupSheet = newSS.getSheets()[0];
      signupSheet.setName("報名名冊");

      var headers = [
        "系統識別碼", "專屬碼", "姓名", "性別", "LINE ID", "聯絡信箱", "聯絡電話", "聯絡地址",
        "生日", "證件號碼", "緊急聯絡人姓名", "緊急聯絡人電話", "緊急聯絡人聯絡地址", "緊急聯絡人關係",
        "爬山經驗", "體能測驗", "體能證明", "想說的話", "是否為社員", "審核結果", "通知狀態", "繳費狀態", "備註"
      ];
      signupSheet.appendRow(headers);

      var headerRange = signupSheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#2563eb");
      headerRange.setFontColor("#ffffff");
      signupSheet.setFrozenRows(1);
    }

    // 3. 建立或動態更新隱藏之 _CONFIG 工作表
    var configSheet = newSS.getSheetByName("_CONFIG");
    if (!configSheet) {
      configSheet = newSS.insertSheet("_CONFIG");
      configSheet.appendRow(["KEY", "VALUE"]);
    }

    var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL") || "";
    var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY") || "";
    var botToken = PropertiesService.getScriptProperties().getProperty("MEMBER_BOT_TOKEN") || PropertiesService.getScriptProperties().getProperty("LINE_BOT_TOKEN") || "";

    _setOrUpdateConfigRow(configSheet, "EVENT_ID", eventId);
    _setOrUpdateConfigRow(configSheet, "EVENT_NAME", eventName);
    _setOrUpdateConfigRow(configSheet, "FOLDER_ID", folderId);
    _setOrUpdateConfigRow(configSheet, "CREATED_AT", new Date().toISOString());
    if (sbUrl) _setOrUpdateConfigRow(configSheet, "SUPABASE_URL", sbUrl);
    if (sbKey) _setOrUpdateConfigRow(configSheet, "SUPABASE_SERVICE_ROLE_KEY", sbKey);
    if (botToken) _setOrUpdateConfigRow(configSheet, "MEMBER_BOT_TOKEN", botToken);
    configSheet.hideSheet();

    return {
      folderUrl: folderUrl,
      folderId: folderId,
      spreadsheetUrl: ssUrl,
      spreadsheetId: ssId
    };
  } catch (err) {
    console.error("建立活動專屬雲端資料夾與試算表失敗:", err);
    return null;
  }
}

/**
 * 將活動雲端資料夾與試算表連結同步至 Supabase events 表
 */
function _syncEventDriveUrlsToSupabase(eventId, driveFolderUrl, spreadsheetUrl, spreadsheetId) {
  var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey || !eventId) return;

  try {
    var updatePayload = {
      updated_at: new Date().toISOString()
    };
    if (driveFolderUrl) updatePayload.drive_folder_url = driveFolderUrl;
    if (spreadsheetUrl) updatePayload.spreadsheet_url = spreadsheetUrl;
    if (spreadsheetId) updatePayload.spreadsheet_id = spreadsheetId;

    var url = sbUrl + "/rest/v1/events?id=eq." + encodeURIComponent(eventId);
    var res = UrlFetchApp.fetch(url, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "return=representation"
      },
      payload: JSON.stringify(updatePayload),
      muteHttpExceptions: true
    });

    var updated = [];
    try {
      if (res.getResponseCode() === 200) {
        updated = JSON.parse(res.getContentText());
      }
    } catch (parseErr) { }

    if (!updated || updated.length === 0) {
      var upsertUrl = sbUrl + "/rest/v1/events?on_conflict=id";
      updatePayload.id = eventId;
      if (!updatePayload.title) updatePayload.title = eventId;
      var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd");
      updatePayload.fee = 0;
      updatePayload.start_date = todayStr;
      updatePayload.end_date = todayStr;
      updatePayload.status = "開放";
      UrlFetchApp.fetch(upsertUrl, {
        method: "post",
        contentType: "application/json",
        headers: {
          "apikey": sbKey,
          "Authorization": "Bearer " + sbKey,
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
    }
  } catch (err) {
    console.warn("同步活動雲端連結至 Supabase 失敗:", err);
  }
}

/**
 * 輔助解析 Google 試算表 ID (支援完整網址或純 ID)
 */
function _extractSpreadsheetId(str) {
  if (!str) return "";
  var s = String(str).trim();
  var m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  var m2 = s.match(/id=([a-zA-Z0-9-_]+)/);
  if (m2 && m2[1]) return m2[1];
  return s;
}

/**
 * ⚡ 非同步將報名資料追加至活動專屬獨立試算表 (報名名冊)
 */
function _asyncAppendToEventSpreadsheet(eventId, signupData, eventName) {
  if (!eventId || !signupData) return;
  try {
    var ssId = "";
    var evtName = eventName || (signupData && signupData.eventName) || "";

    // 1. 優先從 Supabase 取得專屬試算表 ID
    var evts = _supabaseGet("events", { id: "eq." + eventId, select: "title,spreadsheet_id,spreadsheet_url" });
    if (evts && evts.length > 0) {
      if (evts[0].spreadsheet_id) ssId = _extractSpreadsheetId(evts[0].spreadsheet_id);
      if (!ssId && evts[0].spreadsheet_url) ssId = _extractSpreadsheetId(evts[0].spreadsheet_url);
      if (!evtName && evts[0].title) evtName = evts[0].title;
    }

    if (!ssId) {
      console.warn("⚠️ [EventSheet] 此活動尚未關聯專屬試算表 ID (eventId=" + eventId + ")");
      return;
    }

    var eventSS = SpreadsheetApp.openById(ssId);
    var sheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];
    if (!sheet) return;

    var sData = sheet.getDataRange().getValues();
    var sHeaders = (sData.length > 0) ? sData[0] : [];
    if (sHeaders.length === 0) return;

    // 檢查是否已存在同專屬碼或同人，若存在則更新，否則追加
    var targetRow = -1;
    var codeIdx = _findHeaderCol(sHeaders, "id", ["專屬碼", "報名編號"]);
    var uidIdx = _findHeaderCol(sHeaders, "line_user_id", ["系統識別碼", "userId"]);

    if (codeIdx > -1 || uidIdx > -1) {
      for (var r = 1; r < sData.length; r++) {
        var rCode = codeIdx > -1 ? String(sData[r][codeIdx]).trim() : "";
        var rUid = uidIdx > -1 ? String(sData[r][uidIdx]).trim() : "";
        if ((signupData.signupCode && rCode === String(signupData.signupCode).trim()) ||
            (signupData.userId && rUid === String(signupData.userId).trim())) {
          targetRow = r + 1;
          break;
        }
      }
    }

    var row = (targetRow > -1) ? sData[targetRow - 1].slice() : new Array(sHeaders.length).fill("");

    function setCol(keywords, val) {
      var idx = _findHeaderCol(sHeaders, keywords[0], keywords);
      if (idx > -1) row[idx] = val;
    }

    setCol(["系統識別碼", "line_user_id", "userId"], signupData.userId || "");
    setCol(["專屬碼", "signup_code", "id"], signupData.signupCode || "");
    setCol(["姓名", "name"], signupData.name || "");
    setCol(["性別", "gender"], signupData.gender || "");
    setCol(["LINE ID", "line_id", "realLineId"], signupData.realLineId || signupData.lineId || "");
    setCol(["聯絡信箱", "email", "Email"], signupData.email || "");
    setCol(["聯絡電話", "phone"], signupData.phone ? "'" + String(signupData.phone) : "");
    setCol(["聯絡地址", "address"], signupData.studentAddr || signupData.address || "");
    setCol(["生日", "birthday"], signupData.birthday || "");
    setCol(["證件號碼", "id_card", "idNumber"], signupData.idNumber || signupData.idCard || "");
    setCol(["緊急聯絡人姓名", "emer_contact_name"], signupData.emerName || "");
    setCol(["緊急聯絡人電話", "emer_contact_phone"], signupData.emerPhone ? "'" + String(signupData.emerPhone) : "");
    setCol(["緊急聯絡人聯絡地址", "emer_contact_address"], signupData.emerAddr || "");
    setCol(["緊急聯絡人關係", "emer_contact_relationship"], signupData.emerRel || "");
    setCol(["爬山經驗", "experience"], signupData.exp || "");
    setCol(["體能測驗", "fitness_test"], signupData.strength || "");
    setCol(["體能證明", "fitness_proof"], signupData.strengthProof || "");
    setCol(["是否為社員", "is_member"], signupData.isMember ? "是" : "否");
    setCol(["審核結果", "review_status"], signupData.reviewStatus || "審核中");
    setCol(["通知狀態", "notify_status"], signupData.notifyStatus || "未通知");
    setCol(["繳費狀態", "payment_status"], signupData.paymentStatus || "未繳費");
    if (signupData.notes) setCol(["備註", "notes"], signupData.notes);

    if (targetRow > -1) {
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
      console.log("⚡ [EventSheet] 成功覆蓋更新活動專屬試算表: " + ssId + " 第 " + targetRow + " 列");
    } else {
      sheet.appendRow(row);
      console.log("⚡ [EventSheet] 成功追加寫入活動專屬試算表: " + ssId);
    }
  } catch (err) {
    console.warn("寫入活動專屬試算表異常:", err);
  }
}

/**
 * ⚡ 同步取消報名至活動專屬獨立試算表
 */
function _syncCancelToEventSpreadsheet(eventId, userId, signupCode, reason) {
  if (!eventId) return;
  try {
    var ssId = "";
    var evts = _supabaseGet("events", { id: "eq." + eventId, select: "spreadsheet_id,spreadsheet_url" });
    if (evts && evts.length > 0) {
      if (evts[0].spreadsheet_id) ssId = _extractSpreadsheetId(evts[0].spreadsheet_id);
      if (!ssId && evts[0].spreadsheet_url) ssId = _extractSpreadsheetId(evts[0].spreadsheet_url);
    }
    if (!ssId) return;

    var eventSS = SpreadsheetApp.openById(ssId);
    var sheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];
    if (!sheet) return;

    var sData = sheet.getDataRange().getValues();
    var sHeaders = sData[0];
    var codeIdx = _findHeaderCol(sHeaders, "id", ["專屬碼", "報名編號"]);
    var uidIdx = _findHeaderCol(sHeaders, "line_user_id", ["系統識別碼", "userId"]);
    var statusIdx = _findHeaderCol(sHeaders, "review_status", ["審核結果", "錄取狀態"]);
    var noteIdx = _findHeaderCol(sHeaders, "notes", ["備註"]);

    for (var r = 1; r < sData.length; r++) {
      var rCode = codeIdx > -1 ? String(sData[r][codeIdx]).trim() : "";
      var rUid = uidIdx > -1 ? String(sData[r][uidIdx]).trim() : "";

      var matches = (signupCode && rCode === String(signupCode).trim()) ||
                    (userId && rUid === String(userId).trim());

      if (matches) {
        if (statusIdx > -1) {
          sheet.getRange(r + 1, statusIdx + 1).setValue("已取消 Cancelled");
        }
        if (noteIdx > -1) {
          var oldNote = sData[r][noteIdx] ? String(sData[r][noteIdx]) + " | " : "";
          sheet.getRange(r + 1, noteIdx + 1).setValue(oldNote + "取消原因: " + (reason || "社員主動取消"));
        }
        console.log("⚡ [EventSheet] 成功將活動專屬試算表第 " + (r + 1) + " 列標記為已取消");
        break;
      }
    }
  } catch (err) {
    console.warn("同步取消報名至專屬試算表例外:", err);
  }
}

/**
 * ⚡ 同步幹部審核結果 (正取/備取) 至活動專屬獨立試算表
 */
function _syncReviewToEventSpreadsheet(eventId, signupCode, reviewStatus) {
  if (!eventId || !signupCode || !reviewStatus) return;
  try {
    var ssId = "";
    var evts = _supabaseGet("events", { id: "eq." + eventId, select: "spreadsheet_id,spreadsheet_url" });
    if (evts && evts.length > 0) {
      if (evts[0].spreadsheet_id) ssId = _extractSpreadsheetId(evts[0].spreadsheet_id);
      if (!ssId && evts[0].spreadsheet_url) ssId = _extractSpreadsheetId(evts[0].spreadsheet_url);
    }
    if (!ssId) return;

    var eventSS = SpreadsheetApp.openById(ssId);
    var sheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];
    if (!sheet) return;

    var sData = sheet.getDataRange().getValues();
    var sHeaders = sData[0];
    var codeIdx = _findHeaderCol(sHeaders, "id", ["專屬碼", "報名編號"]);
    var statusIdx = _findHeaderCol(sHeaders, "review_status", ["審核結果", "錄取狀態"]);

    if (codeIdx > -1 && statusIdx > -1) {
      for (var r = 1; r < sData.length; r++) {
        if (String(sData[r][codeIdx]).trim() === String(signupCode).trim()) {
          sheet.getRange(r + 1, statusIdx + 1).setValue(reviewStatus);
          console.log("⚡ [EventSheet] 已將專屬試算表 " + signupCode + " 審核結果更新為: " + reviewStatus);
          break;
        }
      }
    }
  } catch (err) {
    console.warn("同步審核結果至專屬試算表例外:", err);
  }
}


/**
 * 將活動完整資料同步/Upsert 至 Supabase events 表
 */
function _syncEventToSupabase(eventData) {
  var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey || !eventData || !eventData.id) return;

  try {
    var url = sbUrl + "/rest/v1/events?on_conflict=id";
    var costNum = 0;
    if (eventData.cost !== undefined && eventData.cost !== null) {
      costNum = parseInt(String(eventData.cost).replace(/[^\d]/g, ""), 10) || 0;
    }

    var startStr = null;
    if (eventData.startDate) {
      startStr = String(eventData.startDate).replace(/\//g, "-").split(" ")[0].split("T")[0];
    }
    var endStr = null;
    if (eventData.endDate) {
      endStr = String(eventData.endDate).replace(/\//g, "-").split(" ")[0].split("T")[0];
    } else {
      endStr = startStr;
    }
    var deadlineIso = null;
    if (eventData.deadline) {
      var dStr = String(eventData.deadline).replace(/\//g, "-").trim();
      if (dStr.includes("T")) {
        deadlineIso = (dStr.endsWith("Z") || dStr.includes("+") || dStr.indexOf("-", 10) > -1) ? dStr : (dStr + "+08:00");
      } else {
        deadlineIso = dStr + "T23:59:59+08:00";
      }
    }

    var payload = {
      id: eventData.id,
      title: eventData.name || eventData.title || eventData.id,
      fee: costNum,
      start_date: startStr,
      end_date: endStr,
      deadline: deadlineIso,
      status: eventData.status || "開放",
      summary: eventData.shortDesc || "",
      itinerary: eventData.fullDesc || "",
      cover_image_url: eventData.imageUrl || "",
      drive_folder_url: eventData.driveFolderUrl || null,
      spreadsheet_url: eventData.spreadsheetUrl || null,
      spreadsheet_id: eventData.spreadsheetId || null,
      updated_at: new Date().toISOString()
    };

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log("⚡ [Supabase] 已成功 Upsert 活動至 events 表: " + eventData.id);
    } else {
      console.warn("⚠️ [Supabase] Upsert 活動失敗 (" + code + "): " + res.getContentText());
    }
  } catch (err) {
    console.warn("同步活動至 Supabase 例外:", err);
  }
}

/**
 * API: 儲存或新增活動 (POST action=save_event)
 */
function _handleSaveEvent(json) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.warn("無法開啟主試算表: " + e.toString());
    }

    var officerCheck = checkOfficerInternal(ss, json.userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足，無法儲存活動！");
    }

    var eventId = json.eventId ? String(json.eventId).trim() : "";
    var isUpdate = false;
    var targetRow = -1;
    var eventSheet = null;
    var headers = [];
    var hIdx = {};

    if (ss) {
      // 依據表名別名容錯查找，嚴禁隨意 insertSheet("Events")
      eventSheet = _getSheetByTableName(ss, "events");

      if (eventSheet) {
        var eData = eventSheet.getDataRange().getDisplayValues();
        headers = eData[0];
        hIdx = {
          id: getOrCreateColIdx(eventSheet, headers, "活動編號"),
          name: getOrCreateColIdx(eventSheet, headers, "活動名稱"),
          startDate: getOrCreateColIdx(eventSheet, headers, "活動開始日期"),
          endDate: getOrCreateColIdx(eventSheet, headers, "活動結束日期"),
          deadline: getOrCreateColIdx(eventSheet, headers, "報名截止日期"),
          cost: getOrCreateColIdx(eventSheet, headers, "預計費用"),
          status: getOrCreateColIdx(eventSheet, headers, "報名狀態"),
          shortDesc: getOrCreateColIdx(eventSheet, headers, "簡介"),
          fullDesc: getOrCreateColIdx(eventSheet, headers, "詳細行程"),
          img: getOrCreateColIdx(eventSheet, headers, "封面圖網址"),
          driveFolder: getOrCreateColIdx(eventSheet, headers, "雲端資料夾網址"),
          sheetUrl: getOrCreateColIdx(eventSheet, headers, "報名名冊網址"),
          sheetId: getOrCreateColIdx(eventSheet, headers, "試算表ID")
        };

        if (eventId) {
          for (var i = 1; i < eData.length; i++) {
            if (String(eData[i][hIdx.id]).trim() === eventId) {
              isUpdate = true;
              targetRow = i + 1;
              break;
            }
          }
        }
      }
    }

    if (eventId) {
      isUpdate = true;
    }

    // ⚡ 若為新活動且未提供編號，自動產生編號：完全以 Supabase events 表為 SSOT 取號
    if (!isUpdate && !eventId) {
      var datePrefix = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyMM");
      var maxSeq = 0;

      // 1. 優先以 Supabase events 表作為唯一真實來源 (SSOT) 查出當月現存最大序號
      try {
        var sbEvents = _supabaseGet("events", { select: "id" });
        if (sbEvents && Array.isArray(sbEvents)) {
          for (var s = 0; s < sbEvents.length; s++) {
            var sId = String(sbEvents[s].id || "").trim();
            if (sId.indexOf("E" + datePrefix) === 0) {
              var sNum = parseInt(sId.replace("E" + datePrefix, "").replace("-", ""), 10);
              if (!isNaN(sNum) && sNum > maxSeq) maxSeq = sNum;
            }
          }
        }
      } catch (sbGetErr) {
        console.warn("從 Supabase 取得活動最大序號例外:", sbGetErr);
      }

      // 2. 備援：若試算表有額外活動，亦一併比對納入最大序號
      if (eventSheet && hIdx.id > -1) {
        var curData = eventSheet.getDataRange().getDisplayValues();
        for (var j = 1; j < curData.length; j++) {
          var existingId = String(curData[j][hIdx.id] || "").trim();
          if (existingId.indexOf("E" + datePrefix) === 0) {
            var numPart = parseInt(existingId.replace("E" + datePrefix, "").replace("-", ""), 10);
            if (!isNaN(numPart) && numPart > maxSeq) maxSeq = numPart;
          }
        }
      }

      var nextSeqStr = (maxSeq + 1 < 10) ? ("0" + (maxSeq + 1)) : String(maxSeq + 1);
      eventId = "E" + datePrefix + "-" + nextSeqStr;
      console.log("⚡ [SaveEvent] 成功為新活動指派唯一編號: " + eventId + " (當前最大序號: " + maxSeq + ")");
    }

    // 雲端資料夾與獨立試算表由幹部於活動管理卡片手動點擊「建立獨立試算表」時生成，新增活動時不再自動生成
    var driveFolderUrl = json.driveFolderUrl || "";
    var spreadsheetUrl = json.spreadsheetUrl || "";
    var spreadsheetId = json.spreadsheetId || "";

    // 處理圖片上傳
    var imageUrl = json.imageUrl || "";
    if (json.coverImageFile && json.coverImageFile.base64) {
      var eventFirstDate = json.startDate ? String(json.startDate).replace(/\D/g, "").substring(0, 8) : Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "yyyyMMdd");
      var eventCleanName = (json.name || "活動").trim();
      var fileName = eventFirstDate + "_" + eventCleanName + "_封面.jpg";
      var uploadResult = uploadFileToDrive(json.coverImageFile.base64, fileName, "活動封面");
      if (uploadResult && !uploadResult.startsWith("上傳失敗")) {
        var driveMatch = uploadResult.match(/(?:file\/d\/|id=)([^/&?]+)/);
        if (driveMatch && driveMatch[1]) {
          imageUrl = "https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000";
        } else {
          imageUrl = uploadResult;
        }
      }
    }

    // 寫入 Google Sheets
    if (eventSheet && headers.length > 0) {
      var rowValues = new Array(headers.length).fill("");
      if (isUpdate && targetRow > -1) {
        rowValues = eventSheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
      }

      rowValues[hIdx.id] = eventId;
      rowValues[hIdx.name] = json.name || "";
      rowValues[hIdx.startDate] = json.startDate || "";
      rowValues[hIdx.endDate] = json.endDate || "";
      rowValues[hIdx.deadline] = json.deadline || "";
      rowValues[hIdx.cost] = json.cost || "";
      rowValues[hIdx.status] = json.status || "開放";
      rowValues[hIdx.shortDesc] = json.shortDesc || "";
      rowValues[hIdx.fullDesc] = json.fullDesc || "";
      if (imageUrl) rowValues[hIdx.img] = imageUrl;
      if (driveFolderUrl) rowValues[hIdx.driveFolder] = driveFolderUrl;
      if (spreadsheetUrl) rowValues[hIdx.sheetUrl] = spreadsheetUrl;
      if (spreadsheetId) rowValues[hIdx.sheetId] = spreadsheetId;

      if (isUpdate && targetRow > -1) {
        eventSheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        eventSheet.appendRow(rowValues);
      }
    }

    // 即時完整同步至 Supabase events 表
    try {
      _syncEventToSupabase({
        id: eventId,
        name: json.name,
        startDate: json.startDate,
        endDate: json.endDate,
        deadline: json.deadline,
        cost: json.cost,
        status: json.status,
        shortDesc: json.shortDesc,
        fullDesc: json.fullDesc,
        imageUrl: imageUrl,
        driveFolderUrl: driveFolderUrl,
        spreadsheetUrl: spreadsheetUrl,
        spreadsheetId: spreadsheetId
      });
    } catch (sbSyncErr) {
      console.warn("同步活動資料至 Supabase 警告:", sbSyncErr);
    }

    // 若有勾選推播至幹部群組
    if (json.notifyOfficerGroup) {
      try {
        var groupMsg = "【幹部通知：新活動發布】\n\n" +
          "活動名稱：" + (json.name || "") + "\n" +
          "活動編號：" + eventId + "\n" +
          "出隊日期：" + (json.startDate || "") + " ~ " + (json.endDate || "") + "\n" +
          "報名截止：" + (json.deadline || "") + "\n" +
          "預計費用：" + (json.cost || "") + "\n" +
          "狀態：" + (json.status || "開放") + "\n\n" +
          "已上架完成，社員可在「最新活動」瀏覽與報名！";
        pushAdminMessage(groupMsg);
      } catch (err) {
        console.error("推播至幹部群組失敗: " + err.toString());
      }
    }

    return _jsonResponse({
      status: "success",
      eventId: eventId,
      imageUrl: imageUrl,
      driveFolderUrl: driveFolderUrl,
      spreadsheetUrl: spreadsheetUrl,
      spreadsheetId: spreadsheetId,
      message: isUpdate ? "活動資訊更新成功！" : "新活動發布成功！"
    });

  } catch (err) {
    console.error("儲存活動失敗:", err);
    return _errorResponse("儲存活動失敗: " + (err.message || err.toString()));
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * API: 發送審核結果推播通知 (POST/GET action=send_event_notifications)
 */
function _handleSendEventNotifications(json) {
  try {
    var userId = json.userId;
    var targetEventId = json.eventId ? String(json.eventId).trim() : "";

    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var officerCheck = checkOfficerInternal(ss, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足，僅限幹部發送推播通知");
    }

    var notifiedCount = 0;
    var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
    var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");

    // ⚡ 1. 優先直接由 Supabase event_signups (SSOT) 撈取活動報名者與推播
    var sbSuccessNotified = false;
    if (sbUrl && sbKey && targetEventId) {
      try {
        // 取得活動名稱與專屬群組連結
        var evRes = _supabaseGet("events", { id: "eq." + targetEventId, select: "id,title,line_group_url" });
        var targetEventTitle = (evRes && evRes[0] && evRes[0].title) ? evRes[0].title : targetEventId;
        var targetGroupUrl = (evRes && evRes[0] && evRes[0].line_group_url) ? String(evRes[0].line_group_url).trim() : "";

        // 查詢該活動之所有報名者
        var signupsUrl = sbUrl + "/rest/v1/event_signups?event_id=eq." + encodeURIComponent(targetEventId) + "&select=id,event_id,line_user_id,name,status,notification_status";
        var res = UrlFetchApp.fetch(signupsUrl, {
          method: "get",
          headers: {
            "apikey": sbKey,
            "Authorization": "Bearer " + sbKey
          },
          muteHttpExceptions: true
        });

        if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
          var sbSignups = JSON.parse(res.getContentText());
          if (Array.isArray(sbSignups) && sbSignups.length > 0) {
            // 防呆檢驗：若有正取人員待推播通知，但活動未設定群組連結，立即阻擋
            var hasPendingAccepted = sbSignups.some(function (item) {
              var st = String(item.status || "");
              var noti = String(item.notification_status || "");
              var uid = String(item.line_user_id || "").trim();
              return st.indexOf("正取") > -1 && st.indexOf("取消") === -1 && noti !== "已通知" && uid.startsWith("U");
            });

            if (hasPendingAccepted && !targetGroupUrl) {
              return _errorResponse("此活動尚未設定專屬群組連結 (line_group_url)，請先至活動編輯填寫群組連結後再發送推播！");
            }

            sbSuccessNotified = true;
            for (var k = 0; k < sbSignups.length; k++) {
              var sItem = sbSignups[k];
              var statusStr = String(sItem.status || "").trim();
              var notifyStr = String(sItem.notification_status || "").trim();
              var targetUid = String(sItem.line_user_id || "").trim();
              var applicantName = String(sItem.name || "社員").trim();

              var isAcceptedOrWaitlisted = (statusStr.indexOf("正取") > -1 || statusStr.indexOf("備取") > -1);
              if (isAcceptedOrWaitlisted && notifyStr !== "已通知" && statusStr.indexOf("取消") === -1 && targetUid.startsWith("U")) {
                if (statusStr.indexOf("正取") > -1) {
                  var acceptedFlex = {
                    type: "bubble",
                    body: {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        { type: "text", text: "審核結果出爐 Result", weight: "bold", color: "#1DB446", size: "sm" },
                        { type: "text", text: "活動正取通知", weight: "bold", size: "xl", margin: "md" },
                        { type: "text", text: "哈囉 " + applicantName + "！您報名的活動：\nHello " + applicantName + "! For the event:", margin: "md", size: "sm", wrap: true },
                        { type: "text", text: targetEventTitle, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
                        { type: "text", text: "審核結果為 Result：", margin: "md", size: "sm" },
                        { type: "text", text: "【 " + statusStr + " 】", weight: "bold", color: "#1DB446", size: "lg", align: "center", margin: "md" },
                        { type: "separator", margin: "md" },
                        { type: "text", text: "恭喜您錄取！請點擊下方按鈕加入出隊專屬群組，並請於期限內完成繳費！\nCongratulations! Please click the button below to join the activity LINE group and complete payment before the deadline!", wrap: true, margin: "md", size: "xs", color: "#666666" }
                      ]
                    },
                    footer: {
                      type: "box",
                      layout: "vertical",
                      spacing: "sm",
                      contents: [
                        {
                          type: "button",
                          style: "primary",
                          color: "#1DB446",
                          action: {
                            type: "uri",
                            label: "加入活動群組 Join Group",
                            uri: targetGroupUrl
                          }
                        },
                        {
                          type: "button",
                          style: "secondary",
                          color: "#475569",
                          action: {
                            type: "uri",
                            label: "前往繳費系統 Pay",
                            uri: "https://liff.line.me/" + (LIFF_CHANNEL_ID || "2009217429") + "-u7OCkmQO"
                          }
                        }
                      ]
                    }
                  };
                  pushFlexMessage(targetUid, "【活動正取通知 Confirmed】", acceptedFlex);
                } else {
                  var waitlistFlex = {
                    type: "bubble",
                    body: {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        { type: "text", text: "審核結果出爐 Result", weight: "bold", color: "#FF9800", size: "sm" },
                        { type: "text", text: "活動備取通知", weight: "bold", size: "xl", margin: "md" },
                        { type: "text", text: "哈囉 " + applicantName + "！您報名的活動：\nHello " + applicantName + "! For the event:", margin: "md", size: "sm", wrap: true },
                        { type: "text", text: targetEventTitle, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
                        { type: "text", text: "審核結果為 Result：", margin: "md", size: "sm" },
                        { type: "text", text: "【 " + statusStr + " 】", weight: "bold", color: "#FF9800", size: "lg", align: "center", margin: "md" },
                        { type: "separator", margin: "md" },
                        { type: "text", text: "目前為備取狀態，若有正取人員釋出名額，幹部將主動聯絡您遞補！\nYou are currently on the waitlist. We will contact you if a spot opens up!", wrap: true, margin: "md", size: "xs", color: "#666666" }
                      ]
                    },
                    footer: {
                      type: "box",
                      layout: "vertical",
                      contents: [{
                        type: "button",
                        style: "primary",
                        color: "#FF9800",
                        action: {
                          type: "postback",
                          label: "確認備取意願 Confirm Waitlist",
                          data: "action=confirm_waitlist&eventId=" + encodeURIComponent(targetEventId) + "&userId=" + encodeURIComponent(targetUid)
                        }
                      }]
                    }
                  };
                  pushFlexMessage(targetUid, "【活動備取通知 Waitlist】", waitlistFlex);
                }

                // 立即以 PATCH 更新 Supabase event_signups 表的 notification_status 為已通知
                var patchItemUrl = sbUrl + "/rest/v1/event_signups?id=eq." + encodeURIComponent(sItem.id);
                UrlFetchApp.fetch(patchItemUrl, {
                  method: "patch",
                  contentType: "application/json",
                  headers: {
                    "apikey": sbKey,
                    "Authorization": "Bearer " + sbKey,
                    "Prefer": "return=minimal"
                  },
                  payload: JSON.stringify({ notification_status: "已通知", updated_at: new Date().toISOString() }),
                  muteHttpExceptions: true
                });

                notifiedCount++;
              }
            }
          }
        }
      } catch (sbPushErr) {
        console.warn("由 Supabase 發送活動審核推播例外:", sbPushErr);
      }
    }

    // 2. 備援或同步更新 Google Sheets
    if (ss) {
      try {
        var sSheet = _getSheetByTableName(ss, "event_signups");
        var eventSheet = _getSheetByTableName(ss, "events");
        if (sSheet && eventSheet) {
          var sData = sSheet.getDataRange().getValues();
          var eData = eventSheet.getDataRange().getDisplayValues();
          var eIdIdx = _findHeaderCol(eData[0], "id", ["活動編號"]);
          var eNameIdx = _findHeaderCol(eData[0], "title", ["活動名稱"]);

          var sysIdx = sData[0].findIndex(function (h) {
            var s = String(h).toLowerCase();
            return s.includes("系統識別碼") || s.includes("userid") || s.includes("識別碼");
          });
          var nameIdx = _fi(sData[0], "姓名");
          var evtIdx = _fi(sData[0], "活動編號");
          var resultIdx = sData[0].findIndex(function (h) {
            return String(h).includes("審核") || String(h).includes("結果");
          });
          var notifyIdx = sData[0].findIndex(function (h) {
            return String(h).includes("通知");
          });

          for (var i = 1; i < sData.length; i++) {
            var rowEventId = (evtIdx > -1) ? String(sData[i][evtIdx] || "").trim() : "";
            if (targetEventId && rowEventId !== targetEventId) continue;

            var result = (resultIdx > -1) ? String(sData[i][resultIdx] || "") : "";
            var notifyStatus = (notifyIdx > -1) ? String(sData[i][notifyIdx] || "") : "";
            var targetUid = (sysIdx > -1) ? String(sData[i][sysIdx] || "").trim() : "";
            var name = (nameIdx > -1 && sData[i][nameIdx]) ? String(sData[i][nameIdx]) : "社員";

            var isAcceptedOrWaitlisted = (result.indexOf("正取") > -1 || result.indexOf("備取") > -1);
            if (isAcceptedOrWaitlisted && notifyStatus !== "已通知" && result.indexOf("取消") === -1 && targetUid.startsWith("U")) {
              if (!sbSuccessNotified) {
                var eventName = rowEventId;
                for (var e = 1; e < eData.length; e++) {
                  if (eData[e][eIdIdx > -1 ? eIdIdx : 0] === rowEventId) {
                    eventName = eData[e][eNameIdx > -1 ? eNameIdx : 1];
                    break;
                  }
                }
                if (result.indexOf("正取") > -1) {
                  pushFlexMessage(targetUid, "【活動正取通知 Confirmed】", acceptedFlex);
                } else {
                  pushFlexMessage(targetUid, "【活動備取通知 Waitlist】", waitlistFlex);
                }
                notifiedCount++;
              }
              if (notifyIdx > -1) {
                sSheet.getRange(i + 1, notifyIdx + 1).setValue("已通知");
              }
            }
          }
        }
      } catch (sheetErr) {
        console.warn("更新試算表審核通知標記失敗:", sheetErr);
      }
    }

    return _jsonResponse({
      status: "success",
      notifiedCount: notifiedCount,
      message: "已成功發送 " + notifiedCount + " 則審核推播通知！"
    });
  } catch (err) {
    console.error("發送審核通知失敗:", err);
    return _errorResponse("發送審核通知失敗: " + (err.message || err.toString()));
  }
}

/**
 * API: 幹部活動列表 (GET action=get_admin_events) - 100% 直連 Supabase (SSOT)
 */
function _handleGetAdminEvents(userId) {
  try {
    var officerCheck = checkOfficerInternal(null, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足，非登山社幹部無法存取");
    }

    if (SUPABASE_URL && SUPABASE_KEY) {
      var url = SUPABASE_URL + "/rest/v1/events?select=id,title,start_date,end_date,deadline,fee,status,summary,itinerary,image_url,drive_folder_url,spreadsheet_url,spreadsheet_id&order=start_date.desc";
      var res = UrlFetchApp.fetch(url, {
        method: "get",
        headers: _getSupabaseHeaders(),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        var sbEvents = JSON.parse(res.getContentText());
        var events = (sbEvents || []).map(function(e) {
          return {
            id: e.id || "",
            name: e.title || "",
            startDate: e.start_date || "",
            endDate: e.end_date || "",
            deadline: e.deadline || "",
            cost: e.fee !== undefined ? String(e.fee) : "0",
            status: e.status || "開放",
            shortDesc: e.summary || "",
            fullDesc: e.itinerary || "",
            imageUrl: e.image_url || "",
            driveFolderUrl: e.drive_folder_url || "",
            spreadsheetUrl: e.spreadsheet_url || "",
            spreadsheetId: e.spreadsheet_id || ""
          };
        });
        return _jsonResponse({ status: "success", events: events });
      } else {
        return _errorResponse("Supabase 讀取活動失敗: " + res.getContentText());
      }
    }
    return _errorResponse("缺少 Supabase 連線設定");
  } catch (err) {
    console.error("[_handleGetAdminEvents] 例外:", err);
    return _errorResponse("系統讀取活動失敗: " + (err.message || err));
  }
}

/**
 * API: 報名名冊唯讀備援 (GET action=get_event_signups)
 */
function _handleGetEventSignups(eventId, userId) {
  try {
    var ss = null;
    try {
      if (SPREADSHEET_ID) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) { }

    var officerCheck = checkOfficerInternal(ss, userId);
    if (!officerCheck.isOfficer) {
      return _errorResponse("權限不足");
    }

    // 1. 優先直接由 Supabase event_signups 查詢 (SSOT)
    try {
      var query = {
        order: "created_at.asc",
        select: "id,event_id,line_user_id,name,status,notification_status,payment_status,members(name,gender,line_id,email,phone,address,birthday,id_card,emergency_contact_name,emergency_contact_phone,emergency_contact_address,emergency_contact_rel,outdoor_experience,fitness_desc,proof_urls,department,student_id,medical_history,is_official_member)"
      };
      if (eventId) query.event_id = "eq." + eventId;
      var sbSignups = _supabaseGet("event_signups", query);
      if (sbSignups && Array.isArray(sbSignups) && sbSignups.length > 0) {
        var sList = sbSignups.map(function(s, idx) {
          var m = s.members || {};
          var proofUrlStr = "";
          if (Array.isArray(m.proof_urls)) {
            proofUrlStr = m.proof_urls.join("\n");
          } else if (typeof m.proof_urls === "string") {
            proofUrlStr = m.proof_urls;
          }

          return {
            rowNumber: idx + 2,
            signupCode: s.id || "",
            id: s.id || "",
            userId: s.line_user_id || "",
            lineUserId: s.line_user_id || "",
            name: s.name || m.name || "社員",
            gender: m.gender || "",
            phone: m.phone || "",
            lineId: m.line_id || "",
            realLineId: m.line_id || "",
            email: m.email || "",
            address: m.address || "",
            birthday: m.birthday || "",
            idNumber: m.id_card || "",
            emerName: m.emergency_contact_name || "",
            emerPhone: m.emergency_contact_phone || "",
            emerRel: m.emergency_contact_rel || "",
            emerAddr: m.emergency_contact_address || "",
            experience: m.outdoor_experience || "",
            climbingExp: m.outdoor_experience || "",
            fitnessTest: m.fitness_desc || "",
            fitnessDesc: m.fitness_desc || "",
            strengthProof: proofUrlStr,
            fitnessProof: proofUrlStr,
            department: m.department || "",
            studentId: m.student_id || "",
            medicalHistory: m.medical_history || "",
            isOfficial: m.is_official_member ? "是" : "否",
            reviewResult: s.status || "審核中 Checking",
            notifyStatus: s.notification_status || "",
            payStatus: s.payment_status || "未繳費",
            remark: s.notes || ""
          };
        });
        return _jsonResponse({ status: "success", signups: sList });
      }
    } catch (sbErr) {
      console.warn("由 Supabase 讀取報名名冊例外，切換至試算表備援:", sbErr);
    }

    // 2. 備援：由主試算表 event_signups 讀取
    if (ss) {
      var sSheet = _getSheetByTableName(ss, "event_signups");
      if (sSheet) {
        var sData = sSheet.getDataRange().getDisplayValues();
        var headers = sData[0];
        var evtIdx = _findHeaderCol(headers, "event_id", ["活動編號"]);
        var codeIdx = _findHeaderCol(headers, "id", ["專屬碼", "報名編號"]);
        var uidIdx = _findHeaderCol(headers, "line_user_id", ["系統識別碼", "userid"]);
        var nameIdx = _findHeaderCol(headers, "name", ["姓名"]);
        var genderIdx = _findHeaderCol(headers, "gender", ["性別"]);
        var lineIdx = _findHeaderCol(headers, "line_id", ["LINE ID", "Line ID", "真實 LINE ID"]);
        var emailIdx = _findHeaderCol(headers, "email", ["聯絡信箱", "Email"]);
        var phoneIdx = _findHeaderCol(headers, "phone", ["聯絡電話", "電話"]);
        var bdayIdx = _findHeaderCol(headers, "birthday", ["生日"]);
        var idCardIdx = _findHeaderCol(headers, "id_card", ["證件號碼", "身分證號"]);
        var addrIdx = _findHeaderCol(headers, "address", ["聯絡地址", "地址"]);
        var expIdx = _findHeaderCol(headers, "experience", ["爬山經驗", "爬山經歷"]);
        var fitnessIdx = _findHeaderCol(headers, "fitness_test", ["體能測驗", "體能紀錄"]);
        var proofIdx = _findHeaderCol(headers, "fitness_proof", ["體能證明", "體能證明照片"]);
        var emerNameIdx = _findHeaderCol(headers, "emer_name", ["緊急聯絡人姓名", "緊急聯絡人"]);
        var emerPhoneIdx = _findHeaderCol(headers, "emer_phone", ["緊急聯絡人電話"]);
        var emerRelIdx = _findHeaderCol(headers, "emer_rel", ["與緊急聯絡人關係", "關係"]);
        var emerAddrIdx = _findHeaderCol(headers, "emer_addr", ["緊急聯絡人聯絡地址", "緊急聯絡人地址"]);
        var offIdx = _findHeaderCol(headers, "is_official", ["是否為社員", "身分資格"]);
        var resultIdx = _findHeaderCol(headers, "review_status", ["審核結果", "結果"]);
        var notifyIdx = _findHeaderCol(headers, "notify_status", ["通知狀態", "通知"]);
        var payIdx = _findHeaderCol(headers, "payment_status", ["繳費狀態", "繳費"]);

        var signups = [];
        for (var i = 1; i < sData.length; i++) {
          var rowEvtId = (evtIdx > -1) ? sData[i][evtIdx] : "";
          if (eventId && rowEvtId !== eventId) continue;

          signups.push({
            rowNumber: i + 1,
            signupCode: (codeIdx > -1) ? sData[i][codeIdx] : "",
            id: (codeIdx > -1) ? sData[i][codeIdx] : "",
            userId: (uidIdx > -1) ? sData[i][uidIdx] : "",
            name: (nameIdx > -1) ? sData[i][nameIdx] : "",
            gender: (genderIdx > -1) ? sData[i][genderIdx] : "",
            lineId: (lineIdx > -1) ? sData[i][lineIdx] : "",
            email: (emailIdx > -1) ? sData[i][emailIdx] : "",
            phone: (phoneIdx > -1) ? sData[i][phoneIdx] : "",
            birthday: (bdayIdx > -1) ? sData[i][bdayIdx] : "",
            idNumber: (idCardIdx > -1) ? sData[i][idCardIdx] : "",
            address: (addrIdx > -1) ? sData[i][addrIdx] : "",
            emerName: (emerNameIdx > -1) ? sData[i][emerNameIdx] : "",
            emerPhone: (emerPhoneIdx > -1) ? sData[i][emerPhoneIdx] : "",
            emerRel: (emerRelIdx > -1) ? sData[i][emerRelIdx] : "",
            emerAddr: (emerAddrIdx > -1) ? sData[i][emerAddrIdx] : "",
            experience: (expIdx > -1) ? sData[i][expIdx] : "",
            fitnessTest: (fitnessIdx > -1) ? sData[i][fitnessIdx] : "",
            strengthProof: (proofIdx > -1) ? sData[i][proofIdx] : "",
            isOfficial: (offIdx > -1) ? sData[i][offIdx] : "否",
            reviewResult: (resultIdx > -1) ? sData[i][resultIdx] : "未審核",
            notifyStatus: (notifyIdx > -1) ? sData[i][notifyIdx] : "未通知",
            paymentStatus: (payIdx > -1) ? sData[i][payIdx] : "未繳費"
          });
        }
        return _jsonResponse({ status: "success", signups: signups });
      }
    }

    return _jsonResponse({ status: "success", signups: [] });
  } catch (err) {
    return _errorResponse("取得報名名冊例外: " + err.toString());
  }
}

/**
 * 幹部專用：一鍵建立活動專屬獨立試算表與 Google Drive 資料夾，並匯入既有活動與報名資料
 */
function _handleCreateEventSheet(json) {
  var userId = json.userId;
  var eventId = json.eventId;

  if (!eventId) {
    return _errorResponse("缺少必要之活動編號 eventId");
  }

  // 1. 幹部身分校驗
  var officer = checkOfficerInternal(null, userId);
  if (!officer || !officer.isOfficer) {
    return _errorResponse("權限不足：僅限社團幹部可建立活動專屬試算表 (userId=" + userId + ")");
  }

  try {
    // 2. 從 Supabase 取得該活動最新詳細資訊
    var events = _supabaseGet("events", { id: "eq." + eventId, select: "*" });
    if (!events || events.length === 0) {
      return _errorResponse("於 Supabase 中查無此活動 (" + eventId + ")");
    }
    var evt = events[0];

    // 若已經有試算表，自動巡檢並回補缺漏之個資（如證件號碼、爬山經驗、體能等）
    if (evt.spreadsheet_id && evt.spreadsheet_url) {
      var ssId = evt.spreadsheet_id;
      var updatedCount = _backfillEventSpreadsheetMemberInfo(ssId, eventId);
      return _jsonResponse({
        status: "success",
        message: updatedCount > 0
          ? "已成功補齊試算表中 " + updatedCount + " 筆隊員個資！"
          : "獨立試算表已是最新狀態，名冊資料完整無缺漏",
        spreadsheetUrl: evt.spreadsheet_url,
        spreadsheetId: evt.spreadsheet_id,
        driveFolderUrl: evt.drive_folder_url || ""
      });
    }

    var payload = {
      name: evt.title || "",
      startDate: evt.start_date || ""
    };

    // 3. 建立專屬資料夾與試算表（自動寫入 _CONFIG 隱藏工作表）
    var driveInfo = _createEventDriveFolderAndSheet(payload, eventId);
    if (!driveInfo || !driveInfo.spreadsheetId) {
      return _errorResponse("建立 Google 試算表失敗，請檢查 Google Drive 權限或配額");
    }

    var ssId = driveInfo.spreadsheetId;
    var ssUrl = driveInfo.spreadsheetUrl;
    var folderUrl = driveInfo.folderUrl;

    // 4. 從 Supabase 拉取該活動所有報名資料與社員個資
    var signups = _supabaseGet("event_signups", { event_id: "eq." + eventId, select: "*", order: "created_at.asc" });
    if (Array.isArray(signups) && signups.length > 0) {
      var eventSS = SpreadsheetApp.openById(ssId);
      var signupSheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];

      if (signupSheet) {
        var userIds = signups.map(function(s) { return s.line_user_id; }).filter(Boolean);
        var memberMap = {};
        if (userIds.length > 0) {
          var members = _supabaseGet("members", {
            line_user_id: "in.(" + userIds.map(encodeURIComponent).join(",") + ")",
            select: "*"
          });
          if (Array.isArray(members)) {
            members.forEach(function(m) {
              if (m.line_user_id) memberMap[m.line_user_id] = m;
            });
          }
        }

        var rowsToAppend = [];
        for (var i = 0; i < signups.length; i++) {
          var s = signups[i];
          var m = memberMap[s.line_user_id] || {};

          var proofUrlsStr = "";
          if (Array.isArray(m.proof_urls)) {
            proofUrlsStr = m.proof_urls.join(", ");
          } else if (m.proof_urls) {
            proofUrlsStr = String(m.proof_urls);
          }

          var row = [
            s.line_user_id || "",
            s.id || "",
            m.name || s.name || "",
            m.gender || "",
            m.line_id || s.line_id || "",
            m.email || "",
            m.phone || "",
            m.address || "",
            m.birthday ? String(m.birthday).replace(/-/g, "/").slice(0, 10) : "",
            m.id_card || m.id_number || "",
            m.emergency_contact_name || "",
            m.emergency_contact_phone || "",
            m.emergency_contact_address || "",
            m.emergency_contact_rel || m.emergency_contact_relationship || "",
            m.outdoor_experience || m.hiking_experience || "",
            m.fitness_desc || m.fitness_test || "",
            proofUrlsStr || m.fitness_proof_url || "",
            m.want_to_say || "",
            s.is_official_member_snapshot ? "是" : (m.is_official_member ? "是" : "否"),
            s.status || "審核中 Checking",
            s.notification_status || "未通知",
            s.payment_status || "未繳費 Unpaid",
            s.notes || ""
          ];
          rowsToAppend.push(row);
        }

        if (rowsToAppend.length > 0) {
          var startRow = signupSheet.getLastRow() + 1;
          signupSheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
          console.log("[CreateEventSheet] 成功匯入 " + rowsToAppend.length + " 筆既有報名資料至新試算表: " + ssId);
        }
      }
    }

    // 5. 將試算表與資料夾連結回寫至 Supabase events 資料表
    _syncEventDriveUrlsToSupabase(eventId, folderUrl, ssUrl, ssId);

    return _jsonResponse({
      status: "success",
      message: "成功建立獨立試算表並匯入名冊",
      spreadsheetUrl: ssUrl,
      spreadsheetId: ssId,
      driveFolderUrl: folderUrl
    });
  } catch (err) {
    console.error("建立活動獨立試算表例外:", err);
    return _errorResponse("建立活動獨立試算表失敗: " + (err.message || err.toString()));
  }
}

/**
 * ⚡ 巡檢並補齊活動獨立試算表中缺漏的名冊個資 (如證件號碼、緊急聯絡人關係、爬山經驗、體能測驗、體能證明等)
 * 同時自動追加尚未寫入試算表的新報名者，達成每次點擊皆 100% 完整雙向對齊
 */
function _backfillEventSpreadsheetMemberInfo(ssId, eventId) {
  if (!ssId || !eventId) return 0;
  try {
    var eventSS = SpreadsheetApp.openById(ssId);
    var sheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];
    if (!sheet) return 0;

    var sData = sheet.getDataRange().getValues();
    if (sData.length === 0) return 0;

    var headers = sData[0];
    var uidCol = _findHeaderCol(headers, "line_user_id", ["系統識別碼", "userId"]);
    var codeCol = _findHeaderCol(headers, "id", ["專屬碼", "報名編號"]);
    var idCardCol = _findHeaderCol(headers, "id_card", ["證件號碼", "身分證字號", "身分證"]);
    var emerRelCol = _findHeaderCol(headers, "emergency_contact_rel", ["緊急聯絡人關係", "關係"]);
    var expCol = _findHeaderCol(headers, "outdoor_experience", ["爬山經驗", "登山經驗"]);
    var fitCol = _findHeaderCol(headers, "fitness_desc", ["體能測驗", "體能"]);
    var proofCol = _findHeaderCol(headers, "proof_urls", ["體能證明"]);
    var wantSayCol = _findHeaderCol(headers, "want_to_say", ["想說的話", "想說的話 I want to say...", "留言"]);

    var signups = _supabaseGet("event_signups", { event_id: "eq." + eventId, select: "*", order: "created_at.asc" });
    if (!Array.isArray(signups) || signups.length === 0) return 0;

    var userIds = signups.map(function(s) { return s.line_user_id; }).filter(Boolean);
    var memberMap = {};
    if (userIds.length > 0) {
      var members = _supabaseGet("members", {
        line_user_id: "in.(" + userIds.map(encodeURIComponent).join(",") + ")",
        select: "*"
      });
      if (Array.isArray(members)) {
        members.forEach(function(m) {
          if (m.line_user_id) memberMap[m.line_user_id] = m;
        });
      }
    }

    var existingCodes = {};
    var existingUids = {};
    var updatedCount = 0;

    for (var r = 1; r < sData.length; r++) {
      var rowUid = uidCol > -1 ? String(sData[r][uidCol] || "").trim() : "";
      var rowCode = codeCol > -1 ? String(sData[r][codeCol] || "").trim() : "";
      if (rowUid) existingUids[rowUid] = true;
      if (rowCode) existingCodes[rowCode] = true;

      var m = memberMap[rowUid];
      if (!m) continue;

      var proofUrlsStr = "";
      if (Array.isArray(m.proof_urls)) {
        proofUrlsStr = m.proof_urls.join(", ");
      } else if (m.proof_urls) {
        proofUrlsStr = String(m.proof_urls);
      }

      var changed = false;
      if (idCardCol > -1 && !String(sData[r][idCardCol] || "").trim()) {
        var cardVal = m.id_card || m.id_number || "";
        if (cardVal) { sheet.getRange(r + 1, idCardCol + 1).setValue("'" + cardVal); changed = true; }
      }
      if (emerRelCol > -1 && !String(sData[r][emerRelCol] || "").trim()) {
        var relVal = m.emergency_contact_rel || m.emergency_contact_relationship || "";
        if (relVal) { sheet.getRange(r + 1, emerRelCol + 1).setValue(relVal); changed = true; }
      }
      if (expCol > -1 && !String(sData[r][expCol] || "").trim()) {
        var expVal = m.outdoor_experience || m.hiking_experience || "";
        if (expVal) { sheet.getRange(r + 1, expCol + 1).setValue(expVal); changed = true; }
      }
      if (fitCol > -1 && !String(sData[r][fitCol] || "").trim()) {
        var fitVal = m.fitness_desc || m.fitness_test || "";
        if (fitVal) { sheet.getRange(r + 1, fitCol + 1).setValue(fitVal); changed = true; }
      }
      if (proofCol > -1 && !String(sData[r][proofCol] || "").trim()) {
        var pVal = proofUrlsStr || m.fitness_proof_url || "";
        if (pVal) { sheet.getRange(r + 1, proofCol + 1).setValue(pVal); changed = true; }
      }
      if (wantSayCol > -1 && !String(sData[r][wantSayCol] || "").trim()) {
        var sayVal = m.want_to_say || "";
        if (sayVal) { sheet.getRange(r + 1, wantSayCol + 1).setValue(sayVal); changed = true; }
      }

      if (changed) updatedCount++;
    }

    // 檢查是否有 Supabase 存在但試算表尚未有的新報名者，自動追加新列
    var rowsToAppend = [];
    for (var sIdx = 0; sIdx < signups.length; sIdx++) {
      var s = signups[sIdx];
      var isExisting = (s.id && existingCodes[s.id]) || (s.line_user_id && existingUids[s.line_user_id]);
      if (!isExisting) {
        var mem = memberMap[s.line_user_id] || {};
        var pUrls = "";
        if (Array.isArray(mem.proof_urls)) {
          pUrls = mem.proof_urls.join(", ");
        } else if (mem.proof_urls) {
          pUrls = String(mem.proof_urls);
        }

        var newRow = [
          s.line_user_id || "",
          s.id || "",
          mem.name || s.name || "",
          mem.gender || "",
          mem.line_id || s.line_id || "",
          mem.email || "",
          mem.phone || "",
          mem.address || "",
          mem.birthday ? String(mem.birthday).replace(/-/g, "/").slice(0, 10) : "",
          mem.id_card || mem.id_number || "",
          mem.emergency_contact_name || "",
          mem.emergency_contact_phone || "",
          mem.emergency_contact_address || "",
          mem.emergency_contact_rel || mem.emergency_contact_relationship || "",
          mem.outdoor_experience || mem.hiking_experience || "",
          mem.fitness_desc || mem.fitness_test || "",
          pUrls || mem.fitness_proof_url || "",
          mem.want_to_say || "",
          s.is_official_member_snapshot ? "是" : (mem.is_official_member ? "是" : "否"),
          s.status || "審核中 Checking",
          s.notification_status || "未通知",
          s.payment_status || "未繳費 Unpaid",
          s.notes || ""
        ];
        rowsToAppend.push(newRow);
        if (s.id) existingCodes[s.id] = true;
        if (s.line_user_id) existingUids[s.line_user_id] = true;
      }
    }

    if (rowsToAppend.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
      updatedCount += rowsToAppend.length;
      console.log("[backfillEventSpreadsheetMemberInfo] 成功追加 " + rowsToAppend.length + " 筆新隊員至試算表: " + ssId);
    }

    return updatedCount;
  } catch (err) {
    console.error("[backfillEventSpreadsheetMemberInfo] 異常:", err);
    return 0;
  }
}

