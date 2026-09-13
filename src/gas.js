// ==============================================================================
// 🌲 台科登山社社團系統 GAS 模組 1：環境設定、認證與共通工具 (01_Config_Auth.js)
// ==============================================================================

// ⭐️ 1. 全域變數與環境設定
var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
var ADMIN_GROUP_ID = PropertiesService.getScriptProperties().getProperty('ADMIN_GROUP_ID');

var MEMBER_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('MEMBER_BOT_TOKEN');
var ADMIN_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('ADMIN_BOT_TOKEN');
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
var LIFF_CHANNEL_ID = PropertiesService.getScriptProperties().getProperty('LIFF_CHANNEL_ID') || '2009217429';
var SUPABASE_URL = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
var SUPABASE_SERVICE_ROLE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');

// 🛡️ LINE ID Token (JWT) 數位簽章驗證核心
function verifyLineIdToken(idToken, expectedUserId) {
  if (!idToken) {
    return { success: false, error: "缺少身分驗證 Token (Missing ID Token)" };
  }

  // 1. 先查 GAS 快取 (以 Token MD5 摘要為 Key，避免超過長度限制)
  var cache = CacheService.getScriptCache();
  var tokenHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idToken));
  var cachedSub = cache.get("line_token_" + tokenHash);

  if (cachedSub) {
    if (expectedUserId && expectedUserId !== "TEST_USER_ID" && cachedSub !== expectedUserId) {
      return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
    }
    return { success: true, userId: cachedSub };
  }

  // 2. 呼叫 LINE 官方端點校驗 Token
  try {
    var response = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: "id_token=" + encodeURIComponent(idToken) + "&client_id=" + encodeURIComponent(LIFF_CHANNEL_ID),
      muteHttpExceptions: true
    });

    var resCode = response.getResponseCode();
    var resText = response.getContentText();
    var data = JSON.parse(resText);

    if (resCode === 200 && data && data.sub) {
      var verifiedUserId = data.sub;
      cache.put("line_token_" + tokenHash, verifiedUserId, 600); // 快取 10 分鐘

      if (expectedUserId && expectedUserId !== "TEST_USER_ID" && verifiedUserId !== expectedUserId) {
        return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
      }
      return { success: true, userId: verifiedUserId };
    } else {
      console.warn("LINE Token 驗證未通過:", resText);
      return { success: false, error: (data && data.error_description) ? data.error_description : "無效或過期的 Token" };
    }
  } catch (err) {
    console.error("verifyLineIdToken 執行錯誤:", err);
    return { success: false, error: "身分驗證系統異常: " + err.toString() };
  }
}

/**
 * 取得經認證之 User ID (整合 GET 與 POST 請求)
 */
function getAuthenticatedUserId(paramObj, fallbackUserId) {
  var idToken = (paramObj && paramObj.idToken) ? paramObj.idToken : "";
  if (idToken) {
    var auth = verifyLineIdToken(idToken, fallbackUserId);
    if (!auth.success) {
      return { ok: false, error: auth.error };
    }
    return { ok: true, userId: auth.userId, verified: true };
  }
  if (fallbackUserId) {
    return { ok: true, userId: fallbackUserId, verified: false };
  }
  return { ok: false, error: "未授權的請求：缺少使用者識別 (Missing User ID)" };
}

// ⭐️ 共用工具函式

// 共用 LINE API 呼叫核心
function _lineAPI(endpoint, token, payload) {
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + endpoint, {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + token
    },
    'method': 'post',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  });
}

// 安全釋放 LockService 鎖定 (防止 Lock was not released 崩潰)
function _safeReleaseLock(lock) {
  try {
    if (lock && typeof lock.hasLock === "function" && lock.hasLock()) {
      lock.releaseLock();
    }
  } catch (e) {
    console.warn("Safe release lock warn: " + e);
  }
}

// 統一 JSON 回應封裝
function _jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function _errorResponse(message, extra) {
  var res = { status: "error", message: message };
  if (extra && typeof extra === "object") {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) {
        res[k] = extra[k];
      }
    }
  }
  return _jsonResponse(res);
}

function _successResponse(data) {
  var res = { status: "success" };
  if (data && typeof data === "object") {
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        res[k] = data[k];
      }
    }
  }
  return _jsonResponse(res);
}

// 動態欄位查找 (在 headers 中搜尋包含 keyword 的欄位索引)
function _fi(headers, keyword) {
  if (!headers || !headers.length) return -1;
  return headers.findIndex(function (h) {
    return String(h).includes(keyword);
  });
}

// 遮罩敏感字串 (個資保護)
function _maskString(str, visibleStart, visibleEnd) {
  if (!str) return "";
  var s = String(str);
  if (s.length <= visibleStart + visibleEnd) return s;
  var start = s.substring(0, visibleStart);
  var end = s.substring(s.length - visibleEnd);
  var maskLen = s.length - visibleStart - visibleEnd;
  var mask = "";
  for (var i = 0; i < maskLen; i++) mask += "*";
  return start + mask + end;
}

// 安全取得試算表實例 (容錯 openById 與 getActiveSpreadsheet)
function _getSpreadsheet() {
  try {
    if (SPREADSHEET_ID) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
  } catch (e) {
    console.warn("openById failed: " + e);
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    console.warn("getActiveSpreadsheet failed: " + e);
  }
  return null;
}

// 動態查找「與緊急聯絡人關係」欄位索引（防呆：排除登山經驗相關欄位，鎖定緊急關係）
function _findEmerRelColIdx(headers) {
  if (!headers || !headers.length) return -1;
  var bestIdx = -1;
  var fallbackIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    var hStr = String(headers[i]);
    if (hStr.includes("經驗") || hStr.includes("登山") || hStr.includes("爬山") || hStr.includes("經歷") || hStr.toLowerCase().includes("exp")) {
      continue;
    }
    var isRel = hStr.includes("關係") || hStr.toLowerCase().includes("relation");
    if (!isRel) continue;

    var isEmer = hStr.includes("緊急") || hStr.toLowerCase().includes("emergency");
    if (isEmer) return i;
    if (fallbackIdx === -1) fallbackIdx = i;
  }
  return fallbackIdx;
}

// 提取指定 row 中的「與緊急聯絡人關係」值
function _getEmerRelValue(headers, row) {
  if (!headers || !row) return "";
  var bestVal = "";
  var fallbackVal = "";
  for (var i = 0; i < headers.length; i++) {
    var hStr = String(headers[i]);
    if (hStr.includes("經驗") || hStr.includes("登山") || hStr.includes("爬山") || hStr.includes("經歷") || hStr.toLowerCase().includes("exp")) {
      continue;
    }
    var isRel = hStr.includes("關係") || hStr.toLowerCase().includes("relation");
    if (!isRel) continue;

    var val = String(row[i] || "").trim();
    if (!val) continue;

    var isEmer = hStr.includes("緊急") || hStr.toLowerCase().includes("emergency");
    if (isEmer && !bestVal) {
      bestVal = val;
    } else if (!fallbackVal) {
      fallbackVal = val;
    }
  }
  return bestVal || fallbackVal;
}

// 跨表查詢活動名稱 (從 Events 表根據活動編號取得名稱)
function _getEventName(ss, eventId) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss || !eventId) return eventId || "活動";
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet) return eventId;
  var eData = eventSheet.getDataRange().getDisplayValues();
  if (eData.length <= 1) return eventId;
  var eIdIdx = _fi(eData[0], "活動編號");
  var eNameIdx = _fi(eData[0], "活動名稱");
  for (var i = 1; i < eData.length; i++) {
    if (eIdIdx > -1 && String(eData[i][eIdIdx]).trim() === String(eventId).trim()) {
      return (eNameIdx > -1 && eData[i][eNameIdx]) ? eData[i][eNameIdx] : eventId;
    }
  }
  return eventId;
}

// 輕量呼叫 Supabase REST API (GET)
function _supabaseGet(table, queryParams) {
  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    console.warn("⚠️ [Supabase] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }

  var queryString = "";
  if (queryParams && typeof queryParams === "object") {
    var parts = [];
    for (var k in queryParams) {
      if (Object.prototype.hasOwnProperty.call(queryParams, k)) {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(queryParams[k]));
      }
    }
    if (parts.length > 0) {
      queryString = "?" + parts.join("&");
    }
  }

  var url = sbUrl + "/rest/v1/" + table + queryString;
  try {
    var res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey
      },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      return JSON.parse(res.getContentText());
    } else {
      console.warn("⚠️ [Supabase GET] HTTP " + res.getResponseCode() + " on " + table + ": " + res.getContentText());
      return null;
    }
  } catch (err) {
    console.warn("⚠️ [Supabase GET] 呼叫例外 (" + table + "): " + err.toString());
    return null;
  }
}
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
  var isGroup = !!groupId || (ev && ev.source && (ev.source.type === "group" || ev.source.type === "room"));

  // 檢查是否提及機器人 (@小岳 或 mention.mentionees.isSelf 或 以「小岳」開頭)
  var isMentioned = false;
  if (ev && ev.message && ev.message.mention && Array.isArray(ev.message.mention.mentionees)) {
    isMentioned = ev.message.mention.mentionees.some(function(m) {
      return m.isSelf === true;
    });
  }
  if (!isMentioned) {
    if (text.indexOf("@小岳") > -1 || text.indexOf("小岳") === 0 || lowerText.indexOf("小岳") > -1) {
      isMentioned = true;
    }
  }

  // 群組防洗版過濾：在群組中若未被召喚（@或叫小岳），嚴格靜默不回覆
  if (isGroup && !isMentioned) {
    return;
  }

  // 若在群組被召喚，清理叫名文字
  var cleanText = text;
  if (isGroup && isMentioned) {
    cleanText = text.replace(/@\S+/g, "").replace(/小岳/g, "").trim();
  }

  // 1. 幹部專屬助理卡片（幹部在群組單純 @小岳、或輸入「小岳 幹部系統」/「幹部系統」/ 招呼語）
  if (
    (isGroup && isMentioned && (cleanText === "" || cleanText === "幹部系統" || cleanText === "嗨" || cleanText === "哈囉" || cleanText.toLowerCase() === "hi" || cleanText.toLowerCase() === "hello")) ||
    text === "小岳 幹部系統" ||
    text === "幹部系統"
  ) {
    var adminCard = "🌲 幹部專屬助理小岳在此！\n" +
      "─────────────\n" +
      "目前在幹部群組中支援以下功能與指令：\n\n" +
      "🛠️ 【幹部系統】\n" +
      "• 輸入「小岳 幹部系統」或點擊下方連結進入後台：\n" +
      "👉 https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents\n\n" +
      "💡 幹部小提醒：\n" +
      "若需要查詢或審核，請直接點擊上方幹部系統連結開啟管理後台進行操作。\n" +
      "若有其他問題，也可以直接在群組 @我 詢問登山社相關庶務！";
    _replyMessage(replyToken, adminCard);
    return;
  }

  // 若在群組中呼叫小岳帶有其他問題，將 cleanText 作為有效問題處理
  var queryText = (isGroup && isMentioned && cleanText) ? cleanText : text;
  var lowerQueryText = queryText.toLowerCase();

  // 2. 幹部群組綁定指令
  if (queryText === "綁定幹部群組" || queryText === "#bind_admin") {
    if (groupId) {
      PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', groupId);
      _replyMessage(replyToken, "✅ 已成功將此群組設定為【幹部管理推播群組】！");
    } else {
      _replyMessage(replyToken, "⚠️ 此指令僅能在幹部群組內執行。");
    }
    return;
  }

  // 3. 最新活動查詢 (支援「最新活動」、「最新活動 Activities」、「Activities」、「Events」)
  if (queryText.indexOf("最新活動") > -1 || lowerQueryText.indexOf("activities") > -1 || queryText.indexOf("報名活動") > -1 || lowerQueryText === "events") {
    sendEventList(replyToken, _getSpreadsheet());
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

  // 6. 裝備租借 (支援「裝備租借」、「器材借用」、「Equipment Loan」)
  if (queryText.indexOf("裝備租借") > -1 || queryText.indexOf("器材借用") > -1 || lowerQueryText.indexOf("equipment") > -1) {
    _replyMessage(replyToken, "🏕️ 歡迎使用裝備租借商城！\n請點擊下方連結進入多選借用表單：\n\nhttps://liff.line.me/2009217429-zXvGeSrI");
    return;
  }

  // 7. 繳費系統 (支援「繳費系統」、「繳費中心」、「Payment System」)
  if (queryText.indexOf("繳費系統") > -1 || queryText.indexOf("繳費中心") > -1 || lowerQueryText.indexOf("payment") > -1) {
    _replyMessage(replyToken, "💰 歡迎使用繳費與對帳申報系統！\n請點擊下方連結進入結帳申報表單：\n\nhttps://liff.line.me/2009217429-u7OCkmQO");
    return;
  }

  // 8. 個人主頁 / 我的狀態 (支援「我的狀態」、「個人主頁」、「My Status」、「Dashboard」)
  if (queryText.indexOf("我的狀態") > -1 || queryText.indexOf("個人主頁") > -1 || lowerQueryText.indexOf("dashboard") > -1 || lowerQueryText.indexOf("status") > -1) {
    _replyMessage(replyToken, "👤 查看出隊成就、個人資料與預約進度：\n\nhttps://liff.line.me/2009217429-jvj3ydDT");
    return;
  }

  // 9. 填寫資料 (支援「填寫資料」、「Register」)
  if (queryText.indexOf("填寫資料") > -1 || lowerQueryText.indexOf("register") > -1) {
    _replyMessage(replyToken, "📝 請填寫或更新您的社員基本資料：\n\nhttps://liff.line.me/2009217429-AhPRqAHg");
    return;
  }

  // 10. 預設交由 Gemini AI 客服進行智慧應答 (結合 Google Docs 知識庫與活動公開資訊)
  if (GEMINI_API_KEY) {
    var aiReply = _handleGeminiChat(userId, queryText);
    if (aiReply) {
      _replyMessage(replyToken, aiReply);
      return;
    }
  }

  // 若無特定處理，回傳友善提示（群組中若有召喚但未辨識且 AI 未回時才提示）
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
// ==============================================================================
// 🎨 台科登山社社團系統 GAS 模組 3：LINE Flex Message 樣板與展示 (03_Flex_Templates.js)
// ==============================================================================

/**
 * 輔助函式：判定活動報名截止日是否已過 (當天 23:59:59 截止)
 */
function _isEventExpired(deadlineVal) {
  if (!deadlineVal) return false;
  try {
    var now = new Date();
    if (deadlineVal instanceof Date) {
      var d = new Date(deadlineVal.getTime());
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        d.setHours(23, 59, 59, 999);
      }
      return now.getTime() > d.getTime();
    }
    var str = String(deadlineVal).trim();
    if (!str) return false;
    var cleanStr = str.replace(/[\/\.]/g, "-");
    var parts = cleanStr.split(" ")[0].split("-");
    if (parts.length >= 3) {
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var day = parseInt(parts[2], 10);
      var deadlineDate = new Date(year, month, day, 23, 59, 59, 999);
      return now.getTime() > deadlineDate.getTime();
    }
  } catch (e) {
    console.error("解析活動截止日期失敗:", deadlineVal, e);
  }
  return false;
}

/**
 * 產生最新活動卡片輪播 (100% 全動態對應最新欄位版 / 雙語升級)
 */
function sendEventList(replyToken, ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) {
    _replyMessage(replyToken, "目前無法連線活動資料表，請稍後再試！");
    return;
  }
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet) {
    _replyMessage(replyToken, "找不到活動資料表！\n─────────────\nEvent sheet not found!");
    return;
  }
  var data = eventSheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    _replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
    return;
  }
  var bubbles = [];

  var headers = data[0];
  var hIdx = {
    id: _fi(headers, "活動編號"),
    name: _fi(headers, "活動名稱"),
    startDate: _fi(headers, "活動開始日期"),
    endDate: _fi(headers, "活動結束日期"),
    deadline: _fi(headers, "報名截止日期"),
    cost: headers.findIndex(function (h) {
      return String(h).includes("預計費用") || String(h).includes("費用");
    }),
    status: headers.findIndex(function (h) {
      return String(h).includes("報名狀態") || String(h).includes("狀態");
    }),
    shortDesc: _fi(headers, "簡介"),
    img: headers.findIndex(function (h) {
      return String(h).includes("封面圖網址") || String(h).includes("照片") || String(h).includes("圖片");
    })
  };

  for (var i = 1; i < data.length; i++) {
    var status = hIdx.status > -1 ? String(data[i][hIdx.status] || "").trim() : "";
    var deadline = hIdx.deadline > -1 ? data[i][hIdx.deadline] : "";
    var isExpired = _isEventExpired(deadline);

    // 若活動標記為開放但已超過截止日，自動即時關閉並回寫試算表
    if (status === "開放" && isExpired) {
      status = "關閉";
      try {
        if (hIdx.status > -1) {
          eventSheet.getRange(i + 1, hIdx.status + 1).setValue("關閉");
        }
      } catch (err) { }
    }

    if (status === "開放" || status === "未來開放" || status.indexOf("開放") > -1 || status.toLowerCase().indexOf("open") > -1) {
      var eventId = hIdx.id > -1 ? data[i][hIdx.id] : "";
      var eventName = hIdx.name > -1 ? data[i][hIdx.name] : "未命名活動";
      var isOpen = (status === "開放" || status.indexOf("開放") > -1) && !isExpired;
      var tagColor = isOpen ? "#1DB446" : "#FF9800";
      var displayStatus = isOpen ? "開放 Open" : "未來開放 Coming Soon";

      var bubble = {
        "type": "bubble",
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "text",
            "text": displayStatus,
            "weight": "bold",
            "color": tagColor,
            "size": "sm"
          }, {
            "type": "text",
            "text": eventName,
            "weight": "bold",
            "size": "xl",
            "margin": "sm",
            "wrap": true
          }, {
            "type": "box",
            "layout": "vertical",
            "margin": "md",
            "spacing": "xs",
            "contents": [{
              "type": "text",
              "text": "費用 Cost: " + (hIdx.cost > -1 ? data[i][hIdx.cost] : ""),
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            }, {
              "type": "text",
              "text": "活動時間 Event Date:",
              "size": "sm",
              "color": "#666666",
              "margin": "sm"
            }, {
              "type": "text",
              "text": (hIdx.startDate > -1 ? data[i][hIdx.startDate] : "") + " ~ " + (hIdx.endDate > -1 ? data[i][hIdx.endDate] : ""),
              "size": "sm",
              "color": "#1DB446",
              "weight": "bold"
            }, {
              "type": "text",
              "text": "報名截止 Sign Up Deadline:",
              "size": "sm",
              "color": "#666666",
              "margin": "sm"
            }, {
              "type": "text",
              "text": (hIdx.deadline > -1 ? data[i][hIdx.deadline] : ""),
              "size": "sm",
              "color": "#E53935",
              "weight": "bold"
            }]
          }, {
            "type": "separator",
            "margin": "md"
          }, {
            "type": "text",
            "text": hIdx.shortDesc > -1 ? data[i][hIdx.shortDesc] : "",
            "size": "sm",
            "color": "#999999",
            "margin": "md",
            "wrap": true,
            "maxLines": 3
          }]
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "contents": [{
            "type": "button",
            "style": "secondary",
            "action": {
              "type": "postback",
              "label": "查看詳情 View",
              "data": "action=view&eventId=" + eventId,
              "displayText": "我想查看 " + eventName + " 的資訊 / I want to view details"
            }
          }]
        }
      };

      var imageUrl = hIdx.img > -1 ? String(data[i][hIdx.img] || "").trim() : "";
      if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
        bubble.hero = {
          "type": "image",
          "url": imageUrl,
          "size": "full",
          "aspectRatio": "20:13",
          "aspectMode": "cover"
        };
      }
      bubbles.push(bubble);
    }
  }

  if (bubbles.length === 0) {
    _replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
  } else {
    _replyFlexMessage(replyToken, "請查看本學期活動列表 / Event List", {
      "type": "carousel",
      "contents": bubbles
    });
  }
}

/**
 * 產生單一活動詳細內容大卡片
 */
function sendEventDetail(replyToken, eventId, ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  var eventSheet = ss.getSheetByName("Events");
  if (!eventSheet) {
    _replyMessage(replyToken, "找不到活動資料表！\n─────────────\nEvent sheet not found!");
    return;
  }
  var data = eventSheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    _replyMessage(replyToken, "目前沒有任何活動資料！\n─────────────\nNo event data available yet!");
    return;
  }

  var headers = data[0];
  var hIdx = {
    id: _fi(headers, "活動編號"),
    name: _fi(headers, "活動名稱"),
    startDate: _fi(headers, "活動開始日期"),
    endDate: _fi(headers, "活動結束日期"),
    deadline: _fi(headers, "報名截止日期"),
    cost: headers.findIndex(function (h) {
      return String(h).includes("預計費用") || String(h).includes("費用");
    }),
    status: headers.findIndex(function (h) {
      return String(h).includes("報名狀態") || String(h).includes("狀態");
    }),
    shortDesc: _fi(headers, "簡介"),
    fullDesc: headers.findIndex(function (h) {
      return String(h).includes("詳細行程") || String(h).includes("行程");
    }),
    img: headers.findIndex(function (h) {
      return String(h).includes("封面圖網址") || String(h).includes("照片") || String(h).includes("圖片");
    })
  };

  var idCol = hIdx.id > -1 ? hIdx.id : 0;
  var eventData = null;
  var eventRowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === eventId) {
      eventData = data[i];
      eventRowIndex = i + 1;
      break;
    }
  }
  if (!eventData) {
    _replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var eventName = hIdx.name > -1 ? eventData[hIdx.name] : "未命名活動 (Untitled Event)";
  var status = hIdx.status > -1 ? eventData[hIdx.status] : "";
  var deadline = hIdx.deadline > -1 ? eventData[hIdx.deadline] : "";
  var isExpired = _isEventExpired(deadline);

  if (status === "開放" && isExpired) {
    status = "關閉";
    try {
      if (hIdx.status > -1 && eventRowIndex > 0) {
        eventSheet.getRange(eventRowIndex, hIdx.status + 1).setValue("關閉");
      }
    } catch (err) { }
  }

  var buttonBox;
  if (status === "開放" && !isExpired) {
    buttonBox = {
      "type": "button",
      "style": "primary",
      "color": "#1DB446",
      "action": {
        "type": "postback",
        "label": "一鍵報名 Sign Up",
        "data": "action=signup&eventId=" + eventId,
        "displayText": "我要報名 Sign up for: " + eventName
      }
    };
  } else {
    var closedLabel = isExpired ? "報名已截止 Closed" : "尚未開放 Not Open";
    buttonBox = {
      "type": "button",
      "style": "secondary",
      "color": "#CCCCCC",
      "action": {
        "type": "message",
        "label": closedLabel,
        "text": eventName + " " + closedLabel
      }
    };
  }

  var bubble = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": eventName,
        "weight": "bold",
        "size": "xl",
        "wrap": true
      }, {
        "type": "box",
        "layout": "vertical",
        "margin": "md",
        "spacing": "xs",
        "contents": [{
          "type": "text",
          "text": "費用 Cost: " + (hIdx.cost > -1 ? eventData[hIdx.cost] : ""),
          "size": "sm",
          "color": "#666666",
          "weight": "bold"
        }, {
          "type": "text",
          "text": "活動時間 Event Date:",
          "size": "sm",
          "color": "#666666",
          "margin": "sm"
        }, {
          "type": "text",
          "text": (hIdx.startDate > -1 ? eventData[hIdx.startDate] : "") + " ~ " + (hIdx.endDate > -1 ? eventData[hIdx.endDate] : ""),
          "size": "sm",
          "color": "#1DB446",
          "weight": "bold"
        }, {
          "type": "text",
          "text": "報名截止 Sign Up Deadline:",
          "size": "sm",
          "color": "#666666",
          "margin": "sm"
        }, {
          "type": "text",
          "text": (hIdx.deadline > -1 ? eventData[hIdx.deadline] : ""),
          "size": "sm",
          "color": "#E53935",
          "weight": "bold"
        }]
      }, {
        "type": "separator",
        "margin": "lg"
      }, {
        "type": "text",
        "text": "【詳細行程 Itinerary】",
        "weight": "bold",
        "size": "sm",
        "margin": "md"
      }, {
        "type": "text",
        "text": hIdx.fullDesc > -1 ? eventData[hIdx.fullDesc] : (hIdx.shortDesc > -1 ? eventData[hIdx.shortDesc] : "尚無行程資訊"),
        "size": "sm",
        "color": "#666666",
        "margin": "sm",
        "wrap": true
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [buttonBox]
    }
  };

  var imageUrl = hIdx.img > -1 ? String(eventData[hIdx.img] || "").trim() : "";
  if (imageUrl && imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
    bubble.hero = {
      "type": "image",
      "url": imageUrl,
      "size": "full",
      "aspectRatio": "20:13",
      "aspectMode": "cover"
    };
  }

  _replyFlexMessage(replyToken, "活動詳情: " + eventName, bubble);
}

/**
 * 產生幹部團隊名冊卡片 (支援職稱、頭像與負責業務)
 */
function sendOfficerMenu(replyToken, ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  try {
    var sheet = ss.getSheetByName("Officers");
    if (!sheet) {
      _replyMessage(replyToken, "目前幹部名冊維護中。");
      return;
    }
    var data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) {
      _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
      return;
    }

    var headers = data[0];
    var roleIdx = headers.findIndex(function (h) {
      return String(h).includes("職稱") || String(h).includes("職位") || String(h).includes("role") || String(h).includes("title");
    });
    var nameIdx = headers.findIndex(function (h) {
      return String(h).includes("姓名") || String(h).includes("名字") || String(h).includes("name");
    });
    var photoIdx = headers.findIndex(function (h) {
      return String(h).includes("照片") || String(h).includes("圖片") || String(h).includes("頭像");
    });
    var dutyIdx = headers.findIndex(function (h) {
      return String(h).includes("負責業務") || String(h).includes("負責") || String(h).includes("業務");
    });
    var quoteIdx = headers.findIndex(function (h) {
      return String(h).includes("給社員的話") || String(h).includes("介紹") || String(h).includes("備註");
    });

    var bubbles = [];

    if (nameIdx === -1) {
      _replyMessage(replyToken, "⚠️ 幹部名單的「姓名」欄位遺失了，請通知管理員檢查試算表！\n─────────────\n⚠️ 'Name' column is missing in the Officer sheet!");
      return;
    }

    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][nameIdx]).trim();
      if (name !== "") {
        var role = (roleIdx > -1 && data[i][roleIdx]) ? String(data[i][roleIdx]).trim() : "幹部 Officer";
        var photoUrl = (photoIdx > -1 && data[i][photoIdx]) ? String(data[i][photoIdx]).trim() : "";
        var duty = (dutyIdx > -1 && data[i][dutyIdx]) ? String(data[i][dutyIdx]).trim() : "協助社團事務 Assist with club affairs";
        var quote = (quoteIdx > -1 && data[i][quoteIdx]) ? String(data[i][quoteIdx]).trim() : "歡迎加入登山社！ Welcome to the club!";
        var themeColor = (role.indexOf("社長") > -1) ? "#FF9800" : "#0367D3";

        var bubble = {
          "type": "bubble",
          "size": "micro",
          "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "text",
              "text": role,
              "weight": "bold",
              "color": themeColor,
              "size": "sm"
            }, {
              "type": "text",
              "text": name,
              "weight": "bold",
              "size": "xl",
              "margin": "sm"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "📌 負責業務 Duties",
              "size": "xxs",
              "color": "#999999",
              "margin": "md"
            }, {
              "type": "text",
              "text": duty,
              "size": "xs",
              "color": "#333333",
              "wrap": true,
              "margin": "xs"
            }, {
              "type": "separator",
              "margin": "md"
            }, {
              "type": "text",
              "text": "💬 " + quote,
              "size": "xs",
              "color": "#666666",
              "wrap": true,
              "margin": "md",
              "style": "italic"
            }]
          }
        };

        if (photoUrl && (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) && !photoUrl.includes("drive.google.com")) {
          bubble.hero = {
            "type": "image",
            "url": photoUrl,
            "size": "full",
            "aspectRatio": "1:1",
            "aspectMode": "cover"
          };
        }

        bubbles.push(bubble);
        if (bubbles.length === 10) break;
      }
    }

    if (bubbles.length === 0) {
      _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
    } else {
      _replyFlexMessage(replyToken, "來認識一下登山社幹部吧！ / Meet the club officers!", {
        "type": "carousel",
        "contents": bubbles
      });
    }

  } catch (err) {
    console.error("幹部名單載入失敗:", err);
    _replyMessage(replyToken, "⚠️ 讀取幹部名單時發生錯誤，請稍後再試。\n─────────────\n⚠️ Error loading officer list, please try again later.");
  }
}

/**
 * 產生「更多服務 More Services」卡片 (100% 還原圖二「🛠️ 聯絡與支援 / 幫助中心」)
 */
function _buildMoreServicesFlex() {
  return {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
        "type": "text",
        "text": "🛠️ 聯絡與支援 Support",
        "weight": "bold",
        "color": "#0367D3",
        "size": "sm"
      }, {
        "type": "text",
        "text": "幫助中心 Help Center",
        "weight": "bold",
        "size": "xl",
        "margin": "md"
      }, {
        "type": "text",
        "text": "聯絡社團幹部 Contact Officers",
        "size": "xs",
        "color": "#999999",
        "margin": "sm"
      }]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": [{
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "👤 幹部是誰 Officers",
          "text": "幹部是誰 Officers"
        }
      }, {
        "type": "button",
        "style": "secondary",
        "action": {
          "type": "message",
          "label": "📢 意見與回饋 Feedback",
          "text": "意見與回饋 Feedback"
        }
      }]
    }
  };
}

/**
 * 發送「更多服務」選單
 */
function sendMoreOptionsMenu(replyToken) {
  var bubble = _buildMoreServicesFlex();
  _replyFlexMessage(replyToken, "更多服務 More Services", bubble);
}

/**
 * 發送「意見與回饋」連結表單
 */
function sendFeedbackLink(replyToken) {
  var googleFormUrl = "https://forms.gle/bCT7fjVP3bSrReF96";
  var msg = "【意見與回饋 / Feedback & Suggestions】\n\n" +
    "無論是想對社團說的話、活動建議、問題詢問，還是回報系統錯誤 (可附截圖)，都歡迎透過下方表單告訴我們！\n\n" +
    "Whether you have suggestions, questions, or want to report a bug (screenshots supported), please let us know!\n\n" +
    "點此填寫回饋表單 Click here to fill out the feedback form：\n" + googleFormUrl + "\n\n" +
    "收到您的回饋後，幹部會盡快查看並處理喔！After receiving your feedback, the club officers will review and handle it as soon as possible!🏔️";

  _replyMessage(replyToken, msg);
}

/**
 * 檢查隊員個人資料是否完整 (支援 signup 與 loan 兩種驗證等級)
 */
function _checkProfileComplete(userId, ss, type) {
  var missingFields = [];
  var p = {
    name: "", gender: "", realLineId: "", email: "", phone: "",
    department: "", studentId: "", birthday: "", idNumber: "", studentAddr: "",
    emerName: "", emerRel: "", emerAddr: "", emerPhone: "",
    exp: "", strength: "", strengthProof: "", medicalHistory: "", isOfficial: "否"
  };

  // 1. 優先直查 Supabase members 表（SSOT）
  var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
  if (sbMembers !== null) {
    if (sbMembers.length === 0) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
    var m = sbMembers[0];
    p.name = m.name || "";
    p.gender = m.gender || "";
    p.realLineId = m.line_id || "";
    p.email = m.email || "";
    p.phone = m.phone || "";
    p.department = m.department || "";
    p.studentId = m.student_id || "";
    p.birthday = m.birthday || "";
    p.idNumber = m.id_card || "";
    p.studentAddr = m.address || "";
    p.emerName = m.emergency_contact_name || "";
    p.emerRel = m.emergency_contact_rel || "";
    p.emerPhone = m.emergency_contact_phone || "";
    p.emerAddr = m.emergency_contact_address || "";
    p.exp = m.outdoor_experience || "";
    p.strength = m.fitness_desc || "";
    p.strengthProof = Array.isArray(m.proof_urls) ? m.proof_urls.join("\n") : (m.proof_urls || "");
    p.medicalHistory = m.medical_history || "";
    p.isOfficial = m.is_official_member ? "是" : "否";
  } else {
    // 2. 若 Supabase 連線異常，備援讀取試算表 Members 表
    if (!ss) ss = _getSpreadsheet();
    var memberSheet = ss ? ss.getSheetByName("Members") : null;
    if (!memberSheet) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
    var mData = memberSheet.getDataRange().getValues();
    var mH = mData.length > 0 ? mData[0] : [];
    var mSysIdx = _fi(mH, "系統識別碼");
    var isMember = false;

    for (var i = mData.length - 1; i >= 1; i--) {
      if (mSysIdx > -1 && String(mData[i][mSysIdx]).trim() === String(userId).trim()) {
        isMember = true;
        p.name = mData[i][_fi(mH, "姓名")] || "";
        p.gender = mData[i][_fi(mH, "性別")] || "";
        p.realLineId = mData[i][mH.findIndex(function (h) {
          return String(h).toUpperCase().includes("LINE");
        })] || "";
        p.email = mData[i][mH.findIndex(function (h) {
          return String(h).toUpperCase().includes("EMAIL") || String(h).includes("信箱");
        })] || "";
        p.phone = mData[i][mH.findIndex(function (h) {
          return String(h).includes("電話") && !String(h).includes("緊急");
        })] || "";
        p.department = mData[i][_fi(mH, "系所")] || "";
        p.studentId = mData[i][_fi(mH, "學號")] || "";
        p.birthday = mData[i][_fi(mH, "生日")] || "";
        p.idNumber = mData[i][_fi(mH, "證件")] || "";
        p.studentAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && !String(h).includes("緊急");
        })] || "";
        p.emerName = mData[i][mH.findIndex(function (h) {
          return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
        })] || "";
        p.emerRel = _getEmerRelValue(mH, mData[i]);
        p.emerAddr = mData[i][mH.findIndex(function (h) {
          return String(h).includes("地址") && String(h).includes("緊急");
        })] || "";
        p.emerPhone = mData[i][_fi(mH, "緊急聯絡人電話")] || "";
        p.exp = mData[i][_fi(mH, "經驗")] || "";
        p.strength = mData[i][_fi(mH, "體能")] || "";
        p.strengthProof = mData[i][_fi(mH, "證明")] || "";
        p.medicalHistory = mData[i][_fi(mH, "病史")] || "";

        var payIdx = _fi(mH, "繳費狀態");
        var paymentStatus = payIdx > -1 ? String(mData[i][payIdx]).trim() : "";
        p.isOfficial = (paymentStatus === "已繳費 Paid" || paymentStatus === "已繳" || paymentStatus === "是") ? "是" : "否";
        break;
      }
    }

    if (!isMember) {
      return { missingFields: ["NOT_FOUND"], p: null };
    }
  }

  // 統一檢驗必填項目
  if (String(p.name).trim() === "") missingFields.push("姓名 (Name)");
  if (String(p.gender).trim() === "") missingFields.push("性別 (Gender)");
  if (String(p.phone).trim() === "") missingFields.push("聯絡電話 (Phone)");

  if (type === "signup" || type === "activity") {
    if (String(p.birthday).trim() === "") missingFields.push("生日 (Birthday)");
    if (String(p.idNumber).trim() === "") missingFields.push("身分證/護照號碼 (ID/Passport)");
    if (String(p.studentAddr).trim() === "") missingFields.push("聯絡地址 (Correspondence Address)");
    if (String(p.emerName).trim() === "") missingFields.push("緊急聯絡人姓名 (Emergency Contact)");
    if (String(p.emerRel).trim() === "") missingFields.push("與緊急聯絡人關係 (Emergency Relation)");
    if (String(p.emerAddr).trim() === "") missingFields.push("緊急聯絡人地址 (Emergency Address)");
    if (String(p.emerPhone).trim() === "") missingFields.push("緊急聯絡人電話 (Emergency Phone)");
    if (String(p.strength).trim() === "") missingFields.push("體能 (Physical Fitness)");
    if (String(p.strengthProof).trim() === "") missingFields.push("體能證明 (Proof of Physical Fitness)");
    if (String(p.exp).trim() === "") missingFields.push("爬山經驗 (Mountaineering Experience)");
  }

  return { missingFields: missingFields, p: p };
}

/**
 * 處理活動一鍵報名 (漸進式個資檢查 + 報名寫入與多軌同步)
 */
function handleSignup(replyToken, userId, eventId, ss) {
  if (!ss) ss = _getSpreadsheet();

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // 1. 檢查活動是否存在與是否已截止/已關閉 (優先查 Supabase events 表)
    var evName = _getEventName(ss, eventId);
    var sbEvents = _supabaseGet("events", { id: "eq." + eventId, select: "id,title,status,deadline" });
    if (sbEvents && sbEvents.length > 0) {
      var ev = sbEvents[0];
      if (ev.title) evName = ev.title;
      var isEvExpired = _isEventExpired(ev.deadline);
      if (isEvExpired || ev.status === "關閉" || ev.status === "已截止") {
        _replyMessage(replyToken, "⚠️ 報名失敗：【" + evName + "】已於 " + (ev.deadline || "日前") + " 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️\n─────────────\n⚠️ Registration Closed: [" + evName + "] registration is closed.");
        return;
      }
    } else if (ss) {
      // 備援檢查 Sheets Events 表
      var eventSheet = ss.getSheetByName("Events");
      if (eventSheet) {
        var eData = eventSheet.getDataRange().getDisplayValues();
        if (eData.length > 1) {
          var eHeaders = eData[0];
          var eIdCol = _fi(eHeaders, "活動編號");
          var eNameCol = _fi(eHeaders, "活動名稱");
          var eStatusCol = eHeaders.findIndex(function (h) {
            return String(h).includes("報名狀態") || String(h).includes("狀態");
          });
          var eDeadCol = _fi(eHeaders, "報名截止日期");

          for (var row = 1; row < eData.length; row++) {
            if (String(eData[row][eIdCol > -1 ? eIdCol : 0]).trim() === String(eventId).trim()) {
              var evStatus = eStatusCol > -1 ? String(eData[row][eStatusCol]).trim() : "";
              var evDead = eDeadCol > -1 ? String(eData[row][eDeadCol]).trim() : "";
              if (eNameCol > -1 && eData[row][eNameCol]) evName = eData[row][eNameCol];
              if (_isEventExpired(evDead) || evStatus === "關閉" || evStatus === "已截止") {
                _replyMessage(replyToken, "⚠️ 報名失敗：【" + evName + "】已於 " + (evDead || "日前") + " 截止報名！\n感謝您的熱情關注，請期待下一次的精彩活動！🏕️");
                return;
              }
              break;
            }
          }
        }
      }
    }

    // 2. 執行個人資料完整性檢查 (100% 直查 Supabase)
    var profileCheck = _checkProfileComplete(userId, ss, "signup");

    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      _replyMessage(replyToken, "⚠️ 報名失敗：系統找不到您的社員資料！\n請先點選單中的「填寫資料」完成註冊後再報名。\n─────────────\n⚠️ Registration Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first:\nhttps://liff.line.me/2009217429-AhPRqAHg");
      return;
    }

    if (profileCheck.missingFields.length > 0) {
      _replyMessage(replyToken, "⚠️ 報名失敗：您的個人資料尚不完整！\n\n為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n👉 " + profileCheck.missingFields.join("\n👉 ") + "\n\n完成資料更新後，再回來點擊一鍵報名喔！🏕️\n─────────────\n👉 https://liff.line.me/2009217429-AhPRqAHg");
      return;
    }

    var p = profileCheck.p;

    // 3. 檢查重複報名 (⭐️ 100% 查 Supabase event_signups 表，絕不查主試算表！)
    var sbSignups = _supabaseGet("event_signups", { line_user_id: "eq." + userId, event_id: "eq." + eventId, select: "id,status" });
    if (sbSignups && sbSignups.length > 0) {
      // 只要有一筆狀態非「取消」的報名，才視為重複報名
      var hasActiveSignup = sbSignups.some(function (sig) {
        var st = String(sig.status || "");
        return st.indexOf("取消") === -1 && st.toLowerCase().indexOf("cancelled") === -1;
      });
      if (hasActiveSignup) {
        _replyMessage(replyToken, "⚠️ 您已經報名過【" + evName + "】囉！\n請耐心等候幹部審核，或是至個人主頁查詢進度。\n─────────────\n⚠️ You have already registered for [" + evName + "]!\nPlease wait for officer review.");
        return;
      }
    }

    // 4. 生成報名碼並即時寫入 Supabase (SSOT 優先)
    var signupCode = "S" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+8", "MMddHHmmss");
    try {
      _syncSignupToSupabase(userId, eventId, signupCode, p, "審核中 Checking", evName);
    } catch (sbErr) {
      console.warn("同步報名至 Supabase 例外 (略過不影響主流程):", sbErr);
    }

    // 5. 寫入主試算表 Signups 表（防呆覆蓋：若試算表殘留同人同活動舊列，覆蓋更新；否則 appendRow）
    if (ss) {
      var signupSheet = ss.getSheetByName("Signups");
      if (!signupSheet) {
        signupSheet = ss.insertSheet("Signups");
        signupSheet.appendRow(["活動編號", "系統識別碼", "專屬碼", "活動名稱", "姓名", "性別", "LINE ID", "聯絡信箱 Email", "聯絡電話", "生日", "證件號碼", "緊急聯絡人姓名", "與緊急聯絡人關係", "爬山經驗", "緊急聯絡人聯絡地址", "體能測驗", "是否為社員", "審核結果", "通知狀態", "繳費狀態", "聯絡地址", "緊急聯絡人電話"]);
      }
      var sheetHeaders = signupSheet.getRange(1, 1, 1, signupSheet.getLastColumn()).getValues()[0];
      var relColIdx = _findEmerRelColIdx(sheetHeaders);

      var rowData = new Array(sheetHeaders.length).fill("");
      function placeData(keyword, value) {
        var idx = _fi(sheetHeaders, keyword);
        if (idx > -1) rowData[idx] = value;
      }

      placeData("活動編號", eventId);
      placeData("系統識別碼", userId);
      placeData("專屬碼", signupCode);
      placeData("活動名稱", evName);
      placeData("姓名", p.name);
      placeData("性別", p.gender);
      placeData("LINE", p.realLineId);
      placeData("Email", p.email);

      var phoneIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("電話") && !String(h).includes("緊急");
      });
      if (phoneIdx > -1) rowData[phoneIdx] = p.phone ? "'" + String(p.phone) : "";

      placeData("生日", p.birthday);
      placeData("證件", p.idNumber);

      var studentAddrIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("地址") && !String(h).includes("緊急");
      });
      if (studentAddrIdx > -1) rowData[studentAddrIdx] = p.studentAddr;

      var emerNameIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("緊急聯絡人") && !String(h).includes("關係") && !String(h).includes("地址") && !String(h).includes("電話");
      });
      if (emerNameIdx > -1) rowData[emerNameIdx] = p.emerName;

      if (relColIdx > -1) rowData[relColIdx] = p.emerRel;

      var emerAddrIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("地址") && String(h).includes("緊急");
      });
      if (emerAddrIdx > -1) rowData[emerAddrIdx] = p.emerAddr;

      var emerPhoneIdx = sheetHeaders.findIndex(function (h) {
        return String(h).includes("電話") && String(h).includes("緊急");
      });
      if (emerPhoneIdx > -1) rowData[emerPhoneIdx] = p.emerPhone ? "'" + String(p.emerPhone) : "";

      placeData("經驗", p.exp);
      placeData("體能", p.strength);
      placeData("證明", p.strengthProof);
      placeData("是否為社員", p.isOfficial);
      placeData("審核結果", "審核中 Checking");
      placeData("通知狀態", "");
      placeData("繳費狀態", "未繳費 Unpaid");
      placeData("系所", p.department);
      placeData("學號", p.studentId);
      placeData("病史", p.medicalHistory);

      // 檢查試算表中是否有歷史舊列需要覆蓋
      var existingData = signupSheet.getDataRange().getValues();
      var foundRow = -1;
      if (existingData.length > 1) {
        var eSysIdx = _fi(sheetHeaders, "系統識別碼");
        var eEvtIdx = _fi(sheetHeaders, "活動編號");
        for (var s = 1; s < existingData.length; s++) {
          if (eSysIdx > -1 && String(existingData[s][eSysIdx]).trim() === String(userId).trim() &&
              eEvtIdx > -1 && String(existingData[s][eEvtIdx]).trim() === String(eventId).trim()) {
            foundRow = s + 1;
            break;
          }
        }
      }

      if (foundRow > -1) {
        signupSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        signupSheet.appendRow(rowData);
      }
    }

    // 6. 回傳確認收據
    _replyMessage(replyToken, "✅ 報名登記已送出！ / Registration Submitted!\n\n活動 (Event)：\n" + evName + "\n活動代號 (Event ID)：" + eventId + "\n報名專屬碼 (Signup Code)：" + signupCode + "\n\n" + p.name + "，我們已收到您的報名資料。\n\n⚠️ 【重要提醒 / Important】\n由於部分戶外行程有人數安全限制，此階段為「報名登記」。幹部將進行體能評估與審核，最終錄取名單（正取/備取）將透過本帳號推播通知您！");

  } catch (err) {
    console.error("活動報名失敗:", err);
    _replyMessage(replyToken, "⚠️ 系統目前忙碌中，請稍後再試！");
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * 處理備取意願確認 (Postback)
 */
function handleConfirmWaitlist(replyToken, userId, paramsMap, ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  var eventId = paramsMap["eventId"] || "";
  var targetUid = paramsMap["userId"] || userId;
  var sSheet = ss.getSheetByName("Signups");
  if (!sSheet) {
    _replyMessage(replyToken, "系統錯誤：找不到報名資料表。\n─────────────\nSystem Error: Signups sheet not found.");
    return;
  }
  var sData = sSheet.getDataRange().getValues();
  var sH = sData[0];
  var sSysIdx = _fi(sH, "系統識別碼");
  var sEventIdIdx = _fi(sH, "活動編號");
  var sStatusIdx = _fi(sH, "審核結果");

  for (var i = 1; i < sData.length; i++) {
    var rowUser = sSysIdx > -1 ? String(sData[i][sSysIdx]).trim() : "";
    var rowEvtId = sEventIdIdx > -1 ? String(sData[i][sEventIdIdx]).trim() : "";

    if (rowUser === targetUid && (!eventId || rowEvtId === eventId)) {
      var currentStatus = sStatusIdx > -1 ? String(sData[i][sStatusIdx]) : "";
      if (currentStatus.indexOf("備取（有意願）") > -1 || currentStatus.indexOf("有意願") > -1) {
        _replyMessage(replyToken, "您先前已確認過備取意願！若有名額釋出，幹部將主動與您聯絡！");
        return;
      }
      if (sStatusIdx > -1) {
        sSheet.getRange(i + 1, sStatusIdx + 1).setValue("備取（有意願）Waitlisted (Interested)");
        SpreadsheetApp.flush();
        _replyMessage(replyToken, "已成功確認您的備取意願！審核狀態已更新為：【備取（有意願）】。若有正取名額釋出，幹部將主動與您聯絡！");
        return;
      }
    }
  }
  _replyMessage(replyToken, "找不到該筆報名資料，請洽詢社團幹部！");
}
// ==============================================================================
// 🧠 台科登山社社團系統 GAS 模組 4：Gemini AI 智慧客服與知識庫 (04_Ai_Gemini.js)
// ==============================================================================

/**
 * 處理 Gemini AI 問答核心
 */
function _handleGeminiChat(userId, userQuery) {
  if (!GEMINI_API_KEY) return null;

  try {
    // 1. 取得 Docs 知識庫與開放活動摘要
    var knowledgeBase = _fetchDocsKnowledgeBase();
    var eventsContext = _fetchOpenEventsContext();

    var systemInstruction = "你是一位熱情、專業的「台科登山社社團系統社」AI 智慧客服嚮導。\n" +
      "請根據以下社團規章、活動與知識庫回答使用者的問題。若資訊不足，請禮貌引導向幹部洽詢。\n\n" +
      "【當前開放活動資訊】：\n" + eventsContext + "\n\n" +
      "【社團知識庫規章】：\n" + knowledgeBase + "\n";

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    var payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemInstruction },
            { text: "使用者提問：" + userQuery }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600
      }
    };

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text;
      }
    } else {
      console.warn("Gemini API 回應異常 (HTTP " + res.getResponseCode() + "):", res.getContentText());
    }
  } catch (err) {
    console.error("Gemini AI 客服執行失敗:", err);
  }
  return null;
}

/**
 * 讀取開放活動摘要作為 AI 上下文
 */
function _fetchOpenEventsContext() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Events");
    if (!sheet) return "目前無活動資料。";

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var summaryArr = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[_fi(headers, "報名狀態")] || "").trim();
      if (status === "開放" || status === "Open") {
        var title = row[_fi(headers, "活動名稱")] || "";
        var fee = row[_fi(headers, "費用")] || 0;
        var start = row[_fi(headers, "開始日期")] || "";
        var desc = row[_fi(headers, "簡介")] || "";
        summaryArr.push("• " + title + " (開始日：" + start + "，費用：$" + fee + ")：" + desc);
      }
    }
    return summaryArr.join("\n");
  } catch (e) {
    return "無法讀取活動清單。";
  }
}

/**
 * 讀取 Google Docs 雲端大腦知識庫
 */
function _fetchDocsKnowledgeBase() {
  var docId = PropertiesService.getScriptProperties().getProperty("KNOWLEDGE_DOC_ID");
  if (!docId) return "社團裝備租借依社籍收費，出隊請遵守領隊指導。";

  var cache = CacheService.getScriptCache();
  var cached = cache.get("docs_kb_text");
  if (cached) return cached;

  try {
    var doc = DocumentApp.openById(docId);
    var text = doc.getBody().getText();
    if (text && text.length > 5000) {
      text = text.substring(0, 5000); // 截取前 5000 字避免上下文膨脹
    }
    cache.put("docs_kb_text", text, 1800); // 快取 30 分鐘
    return text;
  } catch (e) {
    console.warn("讀取 Docs 知識庫失敗:", e);
    return "社團常態運作規章。";
  }
}
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
  }
}

function _syncMemberToSheet(ss, p, action) {
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

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 Members 表刪除隊員: " + p.line_user_id);
    }
    return;
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

function _syncEventToSheet(ss, p, action) {
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

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 Events 表刪除活動: " + p.id);
    }
    return;
  }

  if (targetRow > -1) {
    if (p.title) _setCellVal(sheet, targetRow, headers, "活動名稱", p.title);
    if (p.status) _setCellVal(sheet, targetRow, headers, "報名狀態", p.status);
    if (p.fee !== undefined) _setCellVal(sheet, targetRow, headers, "費用", p.fee);
    if (p.deadline) _setCellVal(sheet, targetRow, headers, "報名截止", p.deadline);
  }
}

function _syncSignupToSheet(ss, p, action) {
  var sheet = ss.getSheetByName("Signups");
  if (!sheet || !p) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var sIdx = _fi(headers, "專屬碼");
  var uIdx = _fi(headers, "系統識別碼");
  var eIdx = _fi(headers, "活動編號");
  var stCol = _fi(headers, "審核結果");
  var nCol = _fi(headers, "備註");
  var rCol = _fi(headers, "取消原因");

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
      Logger.log("🗑️ 已從 Signups 表刪除報名紀錄: " + (p.id || (p.line_user_id + "_" + p.event_id)));
    }
    return;
  }

  // 2. 處理既有列 UPDATE
  if (targetRow > -1) {
    if (stCol > -1 && p.status) sheet.getRange(targetRow, stCol + 1).setValue(p.status);
    if (nCol > -1 && p.notes !== undefined) sheet.getRange(targetRow, nCol + 1).setValue(p.notes);
    if (rCol > -1 && p.cancel_reason !== undefined) sheet.getRange(targetRow, rCol + 1).setValue(p.cancel_reason);
    if (p.id && sIdx > -1) sheet.getRange(targetRow, sIdx + 1).setValue(p.id);
  } else {
    // 3. 處理 INSERT 新增分支 (試算表尚無此紀錄)
    var newRow = new Array(headers.length).fill("");
    if (eIdx > -1) newRow[eIdx] = p.event_id || "";
    if (uIdx > -1) newRow[uIdx] = p.line_user_id || "";
    if (sIdx > -1) newRow[sIdx] = p.id || "";
    if (_fi(headers, "姓名") > -1) newRow[_fi(headers, "姓名")] = p.name || "";
    if (stCol > -1) newRow[stCol] = p.status || "審核中 Checking";
    if (nCol > -1) newRow[nCol] = p.notes || "";
    if (_fi(headers, "是否為社員") > -1) newRow[_fi(headers, "是否為社員")] = p.is_official_member_snapshot ? "是" : "否";
    sheet.appendRow(newRow);
    Logger.log("➕ 已新增報名紀錄至 Signups 表: " + (p.id || p.line_user_id));
  }
}

function _syncEquipmentToSheet(ss, p, action) {
  var sheet = ss.getSheetByName("Equipments");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = _fi(headers, "裝備代號");
  var rQtyCol = _fi(headers, "剩餘數量");
  var tQtyCol = _fi(headers, "總數量");

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 Equipments 表刪除裝備: " + p.id);
    }
    return;
  }

  if (targetRow > -1) {
    if (rQtyCol > -1 && p.available_qty !== undefined) sheet.getRange(targetRow, rQtyCol + 1).setValue(p.available_qty);
    if (tQtyCol > -1 && p.total_qty !== undefined) sheet.getRange(targetRow, tQtyCol + 1).setValue(p.total_qty);
    if (p.image_url) _setCellVal(sheet, targetRow, headers, "圖片網址", p.image_url);
  }
}

function _syncLoanToSheet(ss, p, action) {
  var sheet = ss.getSheetByName("Loan_Records");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var ordIdx = _fi(headers, "租借單號") > -1 ? _fi(headers, "租借單號") : _fi(headers, "租借編號");
  var stCol = _fi(headers, "租借狀態") > -1 ? _fi(headers, "租借狀態") : _fi(headers, "領取/歸還");
  var payCol = _fi(headers, "繳費狀態");

  if (ordIdx === -1) return;

  // 處理 DELETE 刪除事件 (倒序刪除該訂單所有項目列)
  if (action === "DELETE") {
    var delCount = 0;
    for (var r = data.length - 1; r >= 1; r--) {
      if (String(data[r][ordIdx]).trim() === String(p.id).trim()) {
        sheet.deleteRow(r + 1);
        delCount++;
      }
    }
    Logger.log("🗑️ 已從 Loan_Records 表刪除訂單 " + p.id + " 共 " + delCount + " 列");
    return;
  }

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

function _syncPaymentToSheet(ss, p, action) {
  var sheet = ss.getSheetByName("Payments");
  if (!sheet || !p || !p.id) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var pidIdx = _fi(headers, "繳費單號");
  var stCol = _fi(headers, "對帳狀態") > -1 ? _fi(headers, "對帳狀態") : _fi(headers, "審核狀態");

  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (pidIdx > -1 && String(data[i][pidIdx]).trim() === String(p.id).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 Payments 表刪除繳費單: " + p.id);
    }
    return;
  }

  if (targetRow > -1 && stCol > -1 && p.status) {
    sheet.getRange(targetRow, stCol + 1).setValue(p.status);
  }
}

function _syncReflectionToSheet(ss, p, action) {
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

  // 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 Reflections 表刪除心得: " + p.event_id + "_" + p.line_user_id);
    }
    return;
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

/**
 * 主試算表 Signups 自癒對齊函式 (Reconciliation Engine)
 * 目的：消滅歷史幽靈列，以 Supabase event_signups 為唯一準則，修剪已不存在的資料
 */
function reconcileSignupsWithSupabase(ss) {
  if (!ss) ss = _getSpreadsheet();
  if (!ss) return;
  var sheet = ss.getSheetByName("Signups");
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
  var sIdx = _fi(headers, "專屬碼");
  var uIdx = _fi(headers, "系統識別碼");
  var eIdx = _fi(headers, "活動編號");

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
    Logger.log("🧹 [自癒修剪] 已成功自 Signups 表清除 " + prunedCount + " 筆歷史幽靈報名列！");
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

