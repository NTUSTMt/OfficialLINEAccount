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
      _handleTextMessage(replyToken, userId, text, groupId);
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
function _handleTextMessage(replyToken, userId, text, groupId) {
  var lowerText = text.toLowerCase();

  // 1. 幹部群組綁定指令
  if (text === "綁定幹部群組" || text === "#bind_admin") {
    if (groupId) {
      PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', groupId);
      _replyMessage(replyToken, "✅ 已成功將此群組設定為【幹部管理推播群組】！");
    } else {
      _replyMessage(replyToken, "⚠️ 此指令僅能在幹部群組內執行。");
    }
    return;
  }

  // 2. 最新活動查詢 (支援「最新活動」、「最新活動 Activities」、「Activities」、「Events」)
  if (text.indexOf("最新活動") > -1 || lowerText.indexOf("activities") > -1 || text.indexOf("報名活動") > -1 || lowerText === "events") {
    sendEventList(replyToken, _getSpreadsheet());
    return;
  }

  // 3. 幹部名單 (支援「幹部是誰」、「幹部名單」、「Officers」)
  if (text.indexOf("幹部是誰") > -1 || text.indexOf("幹部名單") > -1 || lowerText.indexOf("officers") > -1) {
    sendOfficerMenu(replyToken, _getSpreadsheet());
    return;
  }

  // 4. 更多服務 (支援「更多服務」、「更多服務 More Services」、「其他」、「More」)
  if (text.indexOf("更多服務") > -1 || lowerText.indexOf("more services") > -1 || text.indexOf("其他服務") > -1 || text === "其他" || lowerText === "more") {
    sendMoreOptionsMenu(replyToken);
    return;
  }

  // 4.1 意見與回饋 (支援「意見與回饋」、「Feedback」)
  if (text.indexOf("意見與回饋") > -1 || lowerText.indexOf("feedback") > -1) {
    sendFeedbackLink(replyToken);
    return;
  }

  // 5. 裝備租借 (支援「裝備租借」、「器材借用」、「Equipment Loan」)
  if (text.indexOf("裝備租借") > -1 || text.indexOf("器材借用") > -1 || lowerText.indexOf("equipment") > -1) {
    _replyMessage(replyToken, "🏕️ 歡迎使用裝備租借商城！\n請點擊下方連結進入多選借用表單：\n\nhttps://liff.line.me/2009217429-zXvGeSrI");
    return;
  }

  // 6. 繳費系統 (支援「繳費系統」、「繳費中心」、「Payment System」)
  if (text.indexOf("繳費系統") > -1 || text.indexOf("繳費中心") > -1 || lowerText.indexOf("payment") > -1) {
    _replyMessage(replyToken, "💰 歡迎使用繳費與對帳申報系統！\n請點擊下方連結進入結帳申報表單：\n\nhttps://liff.line.me/2009217429-u7OCkmQO");
    return;
  }

  // 7. 個人主頁 / 我的狀態 (支援「我的狀態」、「個人主頁」、「My Status」、「Dashboard」)
  if (text.indexOf("我的狀態") > -1 || text.indexOf("個人主頁") > -1 || lowerText.indexOf("dashboard") > -1 || lowerText.indexOf("status") > -1) {
    _replyMessage(replyToken, "👤 查看出隊成就、個人資料與預約進度：\n\nhttps://liff.line.me/2009217429-jvj3ydDT");
    return;
  }

  // 8. 填寫資料 (支援「填寫資料」、「Register」)
  if (text.indexOf("填寫資料") > -1 || lowerText.indexOf("register") > -1) {
    _replyMessage(replyToken, "📝 請填寫或更新您的社員基本資料：\n\nhttps://liff.line.me/2009217429-AhPRqAHg");
    return;
  }

  // 9. 預設交由 Gemini AI 客服進行智慧應答 (結合 Google Docs 知識庫與活動公開資訊)
  if (GEMINI_API_KEY) {
    var aiReply = _handleGeminiChat(userId, text);
    if (aiReply) {
      _replyMessage(replyToken, aiReply);
      return;
    }
  }

  // 若無特定處理，回傳友善提示
  _replyMessage(replyToken, "您好！請使用下方選單探索「最新活動」、「裝備租借」或「個人主頁」！若有特殊問題，歡迎直接留言詢問幹部！");
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
    sendEventDetail(replyToken, eventId, ss);
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
}

/**
 * LINE 訊息發送工具函式
 */
function _replyMessage(replyToken, text) {
  if (!replyToken || !text) return;
  _lineAPI('reply', MEMBER_BOT_TOKEN, {
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }]
  });
}

function _replyFlexMessage(replyToken, altText, flexContents) {
  if (!replyToken || !flexContents) return;
  _lineAPI('reply', MEMBER_BOT_TOKEN, {
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

function pushAdminMessage(text) {
  var adminGroupId = PropertiesService.getScriptProperties().getProperty('ADMIN_GROUP_ID') || ADMIN_GROUP_ID;
  if (!adminGroupId || !text) return;
  _lineAPI('push', ADMIN_BOT_TOKEN || MEMBER_BOT_TOKEN, {
    to: adminGroupId,
    messages: [{ type: 'text', text: text }]
  });
}
