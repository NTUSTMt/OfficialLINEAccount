// ==============================================================================
// 🤖 台科登山社社團系統 GAS 模組 2：LINE Bot Webhook 接收與指令路由 (02_LineBot_Webhook.js)
// ==============================================================================

/**
 * GAS 主要 POST 入口點
 * 智慧分流：LINE Messaging Webhook vs LIFF 前端 Helper API
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return _errorResponse("缺少請求酬載 (Empty post data)");
  }

  try {
    var rawText = e.postData.contents;
    var json = JSON.parse(rawText);

    // 1. 若含有 events 陣列，代表來自 LINE 官方 Messaging API Webhook
    if (json.events && Array.isArray(json.events)) {
      return _handleLineWebhookEvents(json.events);
    }

    // 2. 若含有 action 欄位，代表來自 LIFF 前端之輕量 Helper API 呼叫
    if (json.action) {
      return handleLiffHelperApi(json);
    }

    return _errorResponse("無法辨識之請求格式");
  } catch (err) {
    console.error("doPost 處理異常:", err);
    return _errorResponse("伺服器處理例外: " + err.toString());
  }
}

/**
 * 處理 LINE Webhook 事件陣列
 */
function _handleLineWebhookEvents(events) {
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var replyToken = ev.replyToken;
    var userId = ev.source ? ev.source.userId : "";
    var groupId = ev.source ? ev.source.groupId : "";

    // 處理文字訊息
    if (ev.type === "message" && ev.message && ev.message.type === "text") {
      var text = ev.message.text ? ev.message.text.trim() : "";
      _handleTextMessage(replyToken, userId, text, groupId, ev);
    }
    // 處理按鈕回傳 (Postback)
    else if (ev.type === "postback" && ev.postback && ev.postback.data) {
      _handlePostback(replyToken, userId, ev.postback.data);
    }
  }
  return ContentService.createTextOutput("OK");
}

/**
 * 文字指令路由器
 */
function _handleTextMessage(replyToken, userId, text, groupId, ev) {
  var lowerText = text.toLowerCase();
  var targetGroupId = groupId || (ev && ev.source && ev.source.groupId) || "";
  var isGroup = !!targetGroupId || (ev && ev.source && (ev.source.type === "group" || ev.source.type === "room"));

  // 檢查是否提及機器人 (@小岳助理 / @小岳 或 LINE 官方 mention.mentionees.isSelf 或 包含「小岳」/「助理」)
  var isMentioned = false;
  if (ev && ev.message && ev.message.mention && Array.isArray(ev.message.mention.mentionees)) {
    isMentioned = ev.message.mention.mentionees.some(function (m) {
      return m.isSelf === true;
    });
  }
  if (!isMentioned) {
    if (
      text.indexOf("@小岳助理") > -1 ||
      text.indexOf("小岳助理") > -1 ||
      text.indexOf("@小岳") > -1 ||
      text.indexOf("小岳") > -1 ||
      lowerText.indexOf("小岳") > -1
    ) {
      isMentioned = true;
    }
  }

  // 群組防洗版過濾：在群組中若未被召喚（@小岳助理），嚴格靜默不回覆
  if (isGroup && !isMentioned) {
    return;
  }

  // 若在群組被召喚，清理叫名文字 (完整相容 LINE 內建 @標註、小岳助理、小岳、助理)
  var cleanText = text;
  if (isGroup && isMentioned) {
    cleanText = text
      .replace(/@\S+/g, "")
      .replace(/小岳助理/g, "")
      .replace(/小岳/g, "")
      .replace(/助理/g, "")
      .trim();
  }

  var queryText = (isGroup && isMentioned && cleanText) ? cleanText : text;
  var lowerQueryText = queryText.toLowerCase();

  // ⭐️ 幹部群組綁定指令（群組內必須 @小岳助理 召喚方可啟動綁定，避免誤觸）
  var isBindCommand = (queryText === "綁定幹部群組" || queryText === "#bind_admin" || text.indexOf("綁定幹部群組") > -1);
  if (isBindCommand) {
    if (targetGroupId) {
      PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', targetGroupId);
      var replySuccessText = "✅ 已成功將此群組設定為【幹部管理推播群組】！\n(群組 ID: " + targetGroupId + ")\n未來所有裝備租借、繳費申報與新幹部意願將自動推播至此！";
      _replyMessageSmart(replyToken, replySuccessText, true);
    } else {
      _replyMessageSmart(replyToken, "⚠️ 此指令僅能在幹部 LINE 群組內執行。", false);
    }
    return;
  }

  // 1. 幹部專屬助理卡片（幹部在群組單純 @小岳助理、或輸入「@小岳助理 幹部系統」/「幹部系統」/ 招呼語）
  if (
    (isGroup && isMentioned && (cleanText === "" || cleanText === "幹部系統" || cleanText === "嗨" || cleanText === "哈囉" || cleanText.toLowerCase() === "hi" || cleanText.toLowerCase() === "hello")) ||
    text.indexOf("幹部系統") > -1
  ) {
    var adminCard = "🌲 幹部專屬助理「小岳助理」在此！\n" +
      "─────────────\n" +
      "目前在幹部群組中支援以下功能與指令：\n\n" +
      "🛠️ 【幹部系統】\n" +
      "• 輸入「@小岳助理 幹部系統」或點擊下方連結進入後台：\n" +
      "👉 https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents\n\n" +
      "💡 幹部小提醒：\n" +
      "若需要綁定此群組接收通知，請輸入「@小岳助理 綁定幹部群組」！\n" +
      "若有其他問題，也可以隨時在群組 @小岳助理 詢問登山社相關庶務！";
    _replyMessageSmart(replyToken, adminCard, true);
    return;
  }

  // 2. 幹部核銷指令（支援「核銷 PAY_xxx」或「@小岳助理 核銷 PAY_xxx」）
  if (queryText.indexOf("核銷") === 0 || queryText.indexOf("確認核銷") === 0) {
    var paymentId = queryText.replace(/^(確認核銷|核銷)\s*/, "").trim();
    if (paymentId) {
      _processPaymentVerification(paymentId, "幹部指令核銷", true, replyToken);
      return;
    } else {
      _replyMessageSmart(replyToken, "請輸入欲核銷的繳費單號，例如：\n@小岳助理 核銷 PAY_20260914_001", true);
      return;
    }
  }

  // 3. 最新活動查詢 (支援「最新活動」、「最新活動 Activities」、「Activities」、「Events」)
  if (queryText.indexOf("最新活動") > -1 || lowerQueryText.indexOf("activities") > -1 || queryText.indexOf("報名活動") > -1 || lowerQueryText === "events") {
    sendEventList(replyToken);
    return;
  }

  // 4. 幹部名單 (支援「幹部是誰」、「幹部名單」、「Officers」)
  if (queryText.indexOf("幹部是誰") > -1 || queryText.indexOf("幹部名單") > -1 || lowerQueryText.indexOf("officers") > -1) {
    sendOfficerMenu(replyToken, _getSpreadsheet());
    return;
  }

  // 5. 更多服務 (支援「更多服務」、「更多服務 More Services」、「其他」、「More」)
  if (queryText.indexOf("更多服務") > -1 || lowerQueryText.indexOf("more services") > -1 || queryText.indexOf("其他服務") > -1 || queryText === "其他" || lowerQueryText === "more") {
    sendMoreOptionsMenu(replyToken);
    return;
  }

  // 5.1 意見與回饋 (支援「意見與回饋」、「Feedback」)
  if (queryText.indexOf("意見與回饋") > -1 || lowerQueryText.indexOf("feedback") > -1) {
    sendFeedbackLink(replyToken);
    return;
  }

  // 6. 預設交由 Gemini AI 客服進行智慧應答 (結合 Google Docs 知識庫與活動公開資訊)
  if (GEMINI_API_KEY) {
    var aiReply = _handleGeminiChat(userId, queryText);
    if (aiReply) {
      _replyMessage(replyToken, aiReply);
      return;
    }
  }

  // 若無特定處理，回傳友善提示（群組中若有召喚但未辨識且 AI 未回時才提示）
  _replyMessage(replyToken, "您好！請使用下方選單探索「最新活動」、「裝備租借」或「個人主頁」！若有特殊問題，歡迎直接留言詢問幹部！\n─────────────\nHello! Please use the rich menu below to explore Events, Equipment Loan, or Dashboard. If you have any questions, feel free to leave a message for the officers!");
}

/**
 * 按鈕隱藏回傳值處理 (Postback Router)
 */
function _handlePostback(replyToken, userId, postbackData) {
  var ss = _getSpreadsheet();
  var params = {};
  var parts = postbackData.split("&");
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split("=");
    if (pair.length === 2) {
      params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
  }

  var action = params.action;
  var eventId = params.eventId || (parts.length > 1 && parts[1].indexOf("=") > -1 ? parts[1].split("=")[1] : "");

  if (action === "view" || action === "view_event_detail") {
    sendEventDetail(replyToken, eventId);
    return;
  }
  if (action === "signup") {
    handleSignup(replyToken, userId, eventId, ss);
    return;
  }
  if (action === "confirm_waitlist") {
    handleConfirmWaitlist(replyToken, userId, params, ss);
    return;
  }
  if (action === "confirm_bind_admin_group") {
    var newGroupId = params.targetId || eventId;
    if (newGroupId) {
      PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', newGroupId);
      _replyMessage(replyToken, "✅ 已成功將此群組設定為【幹部管理推播群組】！");
    }
    return;
  }
  if (action === "admin_confirm" || action === "confirm_payment") {
    var payId = params.paymentId || params.id || eventId;
    if (payId) {
      _processPaymentVerification(payId, "幹部點擊確認", true, replyToken);
      return;
    }
  }
}

/**
 * 核心繳費核銷處理函式 (供 LINE 文字指令、LINE Postback、Gmail 網頁核銷共用)
 * @param {string} paymentId 繳費單號
 * @param {string} officerName 核銷幹部姓名/識別
 * @param {boolean} sendOfficerReply 是否回覆幹部
 * @param {string} [replyToken] 若有 LINE replyToken
 */
function _processPaymentVerification(paymentId, officerName, sendOfficerReply, replyToken) {
  if (!paymentId) {
    if (sendOfficerReply && replyToken) {
      _replyMessage(replyToken, "⚠️ 缺少欲核銷的繳費單號！");
    }
    return { success: false, message: "缺少繳費單號" };
  }

  var sbUrl = SUPABASE_URL || PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var sbKey = SUPABASE_SERVICE_ROLE_KEY || PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");

  if (!sbUrl || !sbKey) {
    if (sendOfficerReply && replyToken) {
      _replyMessage(replyToken, "⚠️ 系統尚未設定 SUPABASE_URL 或金鑰，無法完成核銷。");
    }
    return { success: false, message: "缺少 Supabase 設定" };
  }

  try {
    // 1. 查詢該筆繳費紀錄
    var queryUrl = sbUrl + "/rest/v1/payments?id=eq." + encodeURIComponent(paymentId) + "&select=*";
    var res = UrlFetchApp.fetch(queryUrl, {
      method: "get",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey
      },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      var fetchErr = "查詢繳費單失敗 (HTTP " + res.getResponseCode() + ")";
      if (sendOfficerReply && replyToken) _replyMessage(replyToken, "❌ " + fetchErr);
      return { success: false, message: fetchErr };
    }

    var records = JSON.parse(res.getContentText());
    if (!records || records.length === 0) {
      if (sendOfficerReply && replyToken) {
        _replyMessage(replyToken, "⚠️ 找不到繳費單號【" + paymentId + "】，請確認單號是否正確！");
      }
      return { success: false, message: "找不到繳費單號：" + paymentId };
    }

    var payment = records[0];
    var currentStatus = String(payment.status || "");
    if (currentStatus.indexOf("已核銷") > -1 || currentStatus.indexOf("Confirmed") > -1) {
      if (sendOfficerReply && replyToken) {
        _replyMessage(replyToken, "ℹ️ 繳費單【" + paymentId + "】先前已完成核銷，狀態為已核銷 Confirmed。");
      }
      return { success: true, message: "該單號先前已完成核銷", alreadyConfirmed: true };
    }

    // 2. 更新狀態為標準標籤「已核銷 Confirmed」
    var nowIso = new Date().toISOString();
    var patchUrl = sbUrl + "/rest/v1/payments?id=eq." + encodeURIComponent(paymentId);
    UrlFetchApp.fetch(patchUrl, {
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "return=minimal"
      },
      payload: JSON.stringify({
        status: "已核銷 Confirmed",
        confirmed_by: officerName || "幹部團隊",
        confirmed_at: nowIso,
        updated_at: nowIso
      }),
      muteHttpExceptions: true
    });

    // 2.5 連動更新 Supabase 對應子項目繳費狀態 (活動報名、社費、裝備租借)
    var selTypes = payment.selected_types || [];
    if (typeof selTypes === 'string') {
      try { selTypes = JSON.parse(selTypes); } catch (e) { selTypes = [selTypes]; }
    }
    var itemsStr = String(payment.items || "") + " " + String(payment.selected_names || "");

    // A. 活動報名連動 (若含有活動 ID 或申報項目包含活動)
    var targetEvtId = payment.target_event_id || payment.event_id;
    if (targetUserId) {
      var signupQuery = { line_user_id: "eq." + targetUserId };
      if (targetEvtId) {
        signupQuery.event_id = "eq." + targetEvtId;
      }
      var signups = (typeof _supabaseGet === "function") ? _supabaseGet("event_signups", signupQuery) : [];
      if (signups && signups.length > 0) {
        for (var s = 0; s < signups.length; s++) {
          var curStatus = signups[s].status || "";
          var newStatus = curStatus;
          // 若原本為正取，繳費核銷後同步升級為「正取（已繳費）Confirmed (Paid)」
          if (curStatus.indexOf("正取") > -1 && curStatus.indexOf("已繳費") === -1) {
            newStatus = "正取（已繳費）Confirmed (Paid)";
          }
          if (typeof _supabasePatch === "function") {
            _supabasePatch("event_signups", { id: "eq." + signups[s].id }, {
              payment_status: "已繳費 Paid",
              status: newStatus,
              updated_at: nowIso
            });
          }
        }
      }
    }

    // B. 社費連動 (若 selected_types 包含 membership，或申報包含社費)
    var isMembership = (Array.isArray(selTypes) && selTypes.indexOf("membership") > -1) ||
      itemsStr.indexOf("社費") > -1 || itemsStr.indexOf("Membership") > -1;
    if (isMembership && targetUserId && typeof _supabasePatch === "function") {
      _supabasePatch("members", { line_user_id: "eq." + targetUserId }, {
        payment_status: "已繳費 Paid",
        is_official_member: true,
        updated_at: nowIso
      });
    }

    // C. 裝備租借連動 (若含有 loan_id 或申報包含租借/裝備)
    var targetLoanId = payment.target_loan_id || payment.loan_id;
    var isLoan = (Array.isArray(selTypes) && (selTypes.indexOf("equipment") > -1 || selTypes.indexOf("loan") > -1)) ||
      itemsStr.indexOf("租借") > -1 || itemsStr.indexOf("裝備") > -1 || !!targetLoanId;
    if (isLoan && targetUserId && typeof _supabasePatch === "function") {
      if (targetLoanId) {
        _supabasePatch("loans", { id: "eq." + targetLoanId }, {
          payment_status: "已繳費 Paid",
          updated_at: nowIso
        });
      } else {
        _supabasePatch("loans", { line_user_id: "eq." + targetUserId, payment_status: "neq.已繳費 Paid" }, {
          payment_status: "已繳費 Paid",
          updated_at: nowIso
        });
      }
    }

    // 3. 自動主動推播【🎉 繳費成功通知】至該社員個人 LINE
    var targetUserId = payment.line_user_id;
    var targetUserName = payment.name || "社員";
    var totalAmount = payment.amount || payment.total_amount || 0;
    var selectedItems = payment.selected_names ? (Array.isArray(payment.selected_names) ? payment.selected_names.join(", ") : String(payment.selected_names)) : (payment.items || "社團相關費用");

    if (targetUserId && targetUserId.indexOf("U") === 0) {
      var successMsg = "🎉 繳費成功通知 / Payment Confirmed\n\n" +
        "親愛的 " + targetUserName + " 您好：\n" +
        "幹部已確認收到您的款項囉！\nOfficer has confirmed your payment!\n\n" +
        "• 繳費單號：" + paymentId + "\n" +
        "• 核銷金額：$" + totalAmount + " 元\n" +
        "• 核銷項目：" + selectedItems + "\n\n" +
        "感謝您的配合，您的帳務狀態已經更新為【已核銷 Confirmed】！期待在山林活動中與您相見！🏔️✨\n" +
        "─────────────\n" +
        "Dear " + targetUserName + ",\n" +
        "Your payment has been successfully confirmed by the officers!\n\n" +
        "• Payment ID: " + paymentId + "\n" +
        "• Amount: $" + totalAmount + " TWD\n" +
        "• Items: " + selectedItems + "\n\n" +
        "Thank you for your prompt payment. Your account status is now updated to [Confirmed]!";

      _pushMessage(targetUserId, successMsg);
    }

    // 4. 若有 LINE replyToken，回覆幹部成功
    if (sendOfficerReply && replyToken) {
      var replyText = "✅ 繳費單【" + paymentId + "】已成功核銷！\n" +
        "─────────────\n" +
        "• 繳費社員：" + targetUserName + "\n" +
        "• 金額：$" + totalAmount + " 元\n" +
        "• 核銷狀態：已核銷 Confirmed\n" +
        "• 系統已自動發送【繳費成功通知】至該社員個人 LINE！";
      _replyMessage(replyToken, replyText);
    }

    // 5. 發送推播訊息至幹部管理群組 (確保所有幹部即時掌握核銷動態)
    var adminGroupId = (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties)
      ? (PropertiesService.getScriptProperties().getProperty('ADMIN_GROUP_ID') || (typeof ADMIN_GROUP_ID !== 'undefined' ? ADMIN_GROUP_ID : ""))
      : (typeof ADMIN_GROUP_ID !== 'undefined' ? ADMIN_GROUP_ID : "");

    if (adminGroupId) {
      var groupNotifyMsg = "✅ 繳費單已完成核銷通知\n" +
        "─────────────\n" +
        "• 核銷人員：" + (officerName || "幹部團隊") + "\n" +
        "• 繳費單號：" + paymentId + "\n" +
        "• 繳費社員：" + targetUserName + "\n" +
        "• 核銷金額：$" + totalAmount + " 元\n" +
        "• 申報項目：" + selectedItems + "\n" +
        "• 核銷狀態：已核銷 Confirmed\n" +
        "• 系統已自動通知社員個人 LINE，並已同步更新資料庫各項狀態！";

      _pushMessage(adminGroupId, groupNotifyMsg);
    }

    return { success: true, message: "已成功核銷繳費單 " + paymentId, payment: payment };
  } catch (err) {
    console.error("_processPaymentVerification 異常:", err);
    if (sendOfficerReply && replyToken) {
      _replyMessage(replyToken, "❌ 核銷失敗: " + err.toString());
    }
    return { success: false, message: err.toString() };
  }
}

/**
 * LINE 訊息發送工具函式 (支援雙機器人智慧 Token 分流與容錯)
 */
function _replyMessage(replyToken, text) {
  _replyMessageSmart(replyToken, text, false);
}

function _replyMessageSmart(replyToken, text, preferAdmin) {
  if (!replyToken || !text) return;
  var token = preferAdmin ? (ADMIN_BOT_TOKEN || MEMBER_BOT_TOKEN) : (MEMBER_BOT_TOKEN || ADMIN_BOT_TOKEN);
  if (!token) return;
  try {
    var res = _lineAPI('reply', token, {
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    });
    var code = res ? res.getResponseCode() : 0;
    // 若特定 Token 回覆失敗且有另一組 Token 可供備援
    if (code !== 200 && ADMIN_BOT_TOKEN && MEMBER_BOT_TOKEN) {
      var fbToken = (token === ADMIN_BOT_TOKEN) ? MEMBER_BOT_TOKEN : ADMIN_BOT_TOKEN;
      _lineAPI('reply', fbToken, {
        replyToken: replyToken,
        messages: [{ type: 'text', text: text }]
      });
    }
  } catch (e) {
    console.error("_replyMessageSmart 例外:", e);
  }
}

function _replyFlexMessage(replyToken, altText, flexContents) {
  if (!replyToken || !flexContents) return;
  var token = MEMBER_BOT_TOKEN || ADMIN_BOT_TOKEN;
  _lineAPI('reply', token, {
    replyToken: replyToken,
    messages: [{
      type: 'flex',
      altText: altText || '新訊息',
      contents: flexContents
    }]
  });
}

function _pushMessage(userId, text) {
  if (!userId || !text) return;
  _lineAPI('push', MEMBER_BOT_TOKEN, {
    to: userId,
    messages: [{ type: 'text', text: text }]
  });
}

/**
 * 幹部通知信件發送函式 (Gmail / MailApp，支援包含 HTML「確認無誤」核銷按鈕)
 * @param {string} subject 信件主旨
 * @param {string} body 信件純文字內文
 * @param {object|string} [optionsOrHtml] 選填參數或自訂 htmlBody
 */
function sendAdminEmail(subject, body, optionsOrHtml) {
  try {
    var recipient = (typeof getAdminEmail === 'function') ? getAdminEmail() : (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : 'ntustmountain@gmail.com');
    if (!recipient) {
      console.warn("sendAdminEmail 略過: 未設定管理員 Email (recipient 為空)");
      return false;
    }
    if (!subject || !body) {
      console.warn("sendAdminEmail 略過: 主旨或內文為空");
      return false;
    }

    var html = "";
    if (typeof optionsOrHtml === 'string') {
      html = optionsOrHtml;
    } else if (optionsOrHtml && typeof optionsOrHtml === 'object' && optionsOrHtml.htmlBody) {
      html = optionsOrHtml.htmlBody;
    }

    // 若未主動提供 htmlBody，但內文包含 confirm_payment_web 連結，自動生成精美的 HTML 綠色單鍵核銷按鈕
    if (!html && body) {
      var linkMatch = body.match(/(https?:\/\/[^\s]+action=confirm_payment_web[^\s]*)/);
      var escapedBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      if (linkMatch) {
        var vUrl = linkMatch[1];
        var buttonHtml = '<div style="margin: 24px 0; text-align: center;">' +
          '<a href="' + vUrl + '" target="_blank" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">' +
          '✅ 確認無誤（點擊完成核銷）' +
          '</a>' +
          '</div>';

        html = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">' +
          '<h2 style="color: #0f172a; margin-top: 0; font-size: 18px; border-bottom: 2px solid #059669; padding-bottom: 8px;">' + subject + '</h2>' +
          buttonHtml +
          '<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; font-size: 14px; border: 1px solid #e2e8f0;">' +
          escapedBody +
          '</div>' +
          '<p style="color: #64748b; font-size: 12px; margin-top: 16px; text-align: center;">台科登山社小岳助理 • 自動發送</p>' +
          '</div>';
      }
    }

    var mailOptions = {
      to: recipient,
      subject: subject,
      body: body,
      name: "台科登山社小岳助理"
    };
    if (html) {
      mailOptions.htmlBody = html;
    }

    if (typeof MailApp !== 'undefined' && MailApp.sendEmail) {
      MailApp.sendEmail(mailOptions);
      console.log("sendAdminEmail 成功寄出至: " + recipient + ", 主旨: " + subject + (html ? " (含 HTML 核銷按鈕)" : ""));
      return true;
    } else if (typeof GmailApp !== 'undefined' && GmailApp.sendEmail) {
      var gmailAdvOptions = { name: "台科登山社小岳助理" };
      if (html) gmailAdvOptions.htmlBody = html;
      GmailApp.sendEmail(recipient, subject, body, gmailAdvOptions);
      console.log("GmailApp sendAdminEmail 成功寄出至: " + recipient + ", 主旨: " + subject + (html ? " (含 HTML 核銷按鈕)" : ""));
      return true;
    } else {
      console.warn("MailApp 與 GmailApp 皆不可用 (可能是本機測試環境)");
      return false;
    }
  } catch (err) {
    console.error("sendAdminEmail 寄信失敗: " + err.toString());
    return false;
  }
}

/**
 * 幹部雙軌通知 (LINE 群組 Push + Gmail 同步發送)
 * @param {string} text 通知內文
 * @param {string} [customSubject] 自訂郵件主旨 (若無則自動提取)
 */
function pushAdminMessage(text, customSubject) {
  if (!text) return;

  // ⭐️ 1. 自動推導 Email 主旨
  var subject = customSubject;
  if (!subject) {
    var lines = text.split("\n");
    var firstLine = lines[0] ? lines[0].trim() : "";
    if (firstLine.indexOf("【") !== -1 && firstLine.indexOf("】") !== -1) {
      subject = firstLine;
    } else if (text.indexOf("新裝備租借申請") !== -1) {
      subject = "【台科登山社】新裝備租借申請通知";
    } else if (text.indexOf("新繳費申報") !== -1) {
      subject = "【台科登山社】新繳費申報通知";
    } else if (text.indexOf("幹部意願登記") !== -1) {
      subject = "【台科登山社】新幹部意願登記通知";
    } else {
      subject = "【台科登山社】幹部系統通知";
    }
  }

  // ⭐️ 2. Gmail 雙軌發送 (保底 100% 送達，不受 LINE 免費額度耗盡影響)
  sendAdminEmail(subject, text);

  // ⭐️ 3. LINE 官方帳號 Push 嘗試發送 (若額度用完被拒絕不影響 Gmail)
  var adminGroupId = PropertiesService.getScriptProperties().getProperty('ADMIN_GROUP_ID') || ADMIN_GROUP_ID;
  if (!adminGroupId) {
    console.warn("pushAdminMessage LINE 略過: ADMIN_GROUP_ID 未設定 (adminGroupId 為空)");
    return;
  }
  var token = ADMIN_BOT_TOKEN || MEMBER_BOT_TOKEN;
  if (!token) {
    console.warn("pushAdminMessage LINE 略過: ADMIN_BOT_TOKEN 與 MEMBER_BOT_TOKEN 皆未設定");
    return;
  }
  try {
    var res = _lineAPI('push', token, {
      to: adminGroupId,
      messages: [{ type: 'text', text: text }]
    });
    var code = res ? res.getResponseCode() : 0;
    var content = res ? res.getContentText() : "";
    console.log("pushAdminMessage LINE 送出結果 (HTTP " + code + "): " + content);

    // 若使用 ADMIN_BOT_TOKEN 失敗 (如 400, 404 群組未邀請該機器人)，嘗試使用 MEMBER_BOT_TOKEN 備援
    if (code !== 200 && ADMIN_BOT_TOKEN && MEMBER_BOT_TOKEN && token !== MEMBER_BOT_TOKEN) {
      console.warn("主要 Token 推播失敗，切換 MEMBER_BOT_TOKEN 備援重試...");
      var fbRes = _lineAPI('push', MEMBER_BOT_TOKEN, {
        to: adminGroupId,
        messages: [{ type: 'text', text: text }]
      });
      console.log("MEMBER_BOT_TOKEN 備援推播結果: (HTTP " + (fbRes ? fbRes.getResponseCode() : 0) + "): " + (fbRes ? fbRes.getContentText() : ""));
    }
  } catch (err) {
    console.error("pushAdminMessage LINE 例外拋出: " + err.toString());
  }
}

