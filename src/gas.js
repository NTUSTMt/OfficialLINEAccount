// ==============================================================================
// 🌲 台科登山社社團系統 GAS 模組 1：環境設定、認證與共通工具 (01_Config_Auth.js)
// ==============================================================================

// ⭐️ 1. 全域變數與環境設定
var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
var ADMIN_GROUP_ID = PropertiesService.getScriptProperties().getProperty('ADMIN_GROUP_ID');
var DEFAULT_ADMIN_EMAIL = 'ntustmountain@gmail.com';
var ADMIN_EMAIL = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL;

function getAdminEmail() {
  try {
    return PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  } catch (e) {
    return DEFAULT_ADMIN_EMAIL;
  }
}

var MEMBER_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('MEMBER_BOT_TOKEN');
var ADMIN_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty('ADMIN_BOT_TOKEN');
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
var LIFF_CHANNEL_ID = PropertiesService.getScriptProperties().getProperty('LIFF_CHANNEL_ID') || '2009217429';
var SUPABASE_URL = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
var SUPABASE_SERVICE_ROLE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
var DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';
var WEB_APP_URL = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL') || DEFAULT_WEB_APP_URL;
var DEFAULT_FRONTEND_WEB_URL = 'https://equipments-seven.vercel.app';
var FRONTEND_WEB_URL = PropertiesService.getScriptProperties().getProperty('FRONTEND_WEB_URL') || DEFAULT_FRONTEND_WEB_URL;

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

// 以英文欄位名稱精確查找表頭索引 (自動忽略使用者添加的中文，支援如 "status 審核狀態"、"審核狀態 (status)"、"status")
function _findColByEnglishName(headers, colName) {
  if (!headers || !headers.length || !colName) return -1;
  var pattern = new RegExp("(^|[^a-zA-Z0-9_])" + colName + "([^a-zA-Z0-9_]|$)", "i");
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").trim();
    if (pattern.test(h)) {
      return i;
    }
  }
  return -1;
}

// 智慧表頭欄位尋找器 (優先以英文名精確比對，次以中文別名回退)
function _findHeaderCol(headers, englishName, aliases) {
  var idx = _findColByEnglishName(headers, englishName);
  if (idx > -1) return idx;
  if (aliases) {
    if (!Array.isArray(aliases)) aliases = [aliases];
    for (var a = 0; a < aliases.length; a++) {
      var aIdx = _fi(headers, aliases[a]);
      if (aIdx > -1) return aIdx;
    }
  }
  return -1;
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

// 查詢活動名稱 (直查 Supabase events 單一信任源，出錯直接印出錯誤，杜絕試算表依賴)
function _getEventName(ss, eventId) {
  if (!eventId) return "活動";
  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      var res = UrlFetchApp.fetch(
        SUPABASE_URL + "/rest/v1/events?id=eq." + encodeURIComponent(eventId) + "&select=title",
        {
          method: "get",
          headers: _getSupabaseHeaders(),
          muteHttpExceptions: true
        }
      );
      if (res.getResponseCode() === 200) {
        var data = JSON.parse(res.getContentText());
        if (Array.isArray(data) && data.length > 0 && data[0].title) {
          return data[0].title;
        }
      } else {
        console.error("[_getEventName] Supabase 查詢活動失敗:", res.getResponseCode(), res.getContentText());
      }
    }
  } catch (err) {
    console.error("[_getEventName] 直查 Supabase 例外:", err.message || err);
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

// 輕量呼叫 Supabase REST API (PATCH)
function _supabasePatch(table, queryParams, payload) {
  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    console.warn("⚠️ [Supabase] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    return false;
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
      method: "patch",
      contentType: "application/json",
      headers: {
        "apikey": sbKey,
        "Authorization": "Bearer " + sbKey,
        "Prefer": "return=minimal"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (err) {
    console.warn("⚠️ [Supabase PATCH] 呼叫例外 (" + table + "): " + err.toString());
    return false;
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

  // 5.2 小岳助理使用說明 (支援「小岳助理說明」、「小岳助理指南」、「小岳說明」、「小岳指南」、「AI Guide」)
  if (
    queryText.indexOf("小岳助理說明") > -1 ||
    queryText.indexOf("小岳助理指南") > -1 ||
    queryText.indexOf("小岳說明") > -1 ||
    queryText.indexOf("小岳指南") > -1 ||
    lowerQueryText.indexOf("ai guide") > -1
  ) {
    var aiGuideMsg = "🏔️ 【小岳助理使用指南 / AI Assistant Guide】\n" +
      "─────────────\n" +
      "我是台科登山社的 AI 助理「小岳」！很高興為大家服務！\n\n" +
      "💬 【如何使用 How to Use】\n" +
      "1. 個人 1 對 1 聊天室：\n" +
      "   • 直接輸入任何登山相關問題即可！\n" +
      "   • 例如：「百岳新手推薦哪座山？」、「裝備該怎麼借？」、「睡袋要怎麼選？」\n\n" +
      "2. LINE 群組中使用：\n" +
      "   • 在群組中請「@小岳助理」並輸入您的問題。\n" +
      "   • 例如：「@小岳助理 請問這次活動費用多少？」\n\n" +
      "💡 貼心提醒：\n" +
      "若需要報名活動、租借裝備或查看個人訂單，歡迎直接點擊下方圖文選單（Rich Menu）探索各項服務喔！\n" +
      "─────────────\n" +
      "Feel free to ask climbing questions directly in 1-on-1 chat, or tag @小岳助理 in group chats!";
    _replyMessage(replyToken, aiGuideMsg);
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

  // 7. 防刷屏過濾：僅在使用者主動發送問候或詢問選單時提示，一般聊天不重複洗版
  var isGreetingOrHelp = (
    queryText === "嗨" || queryText === "哈囉" || queryText === "你好" || queryText === "您好" ||
    lowerQueryText === "hi" || lowerQueryText === "hello" || lowerQueryText === "hey" ||
    queryText === "選單" || lowerQueryText === "menu" || lowerQueryText === "help" || queryText === "說明"
  );
  if (isGreetingOrHelp) {
    _replyMessage(replyToken, "您好！請使用下方選單探索「最新活動」、「裝備租借」或「個人主頁」！若有特殊問題，歡迎直接留言詢問幹部！\n─────────────\nHello! Please use the rich menu below to explore Events, Equipment Loan, or Dashboard. If you have any questions, feel free to leave a message for the officers!");
    return;
  }

  // 群組中若已召喚 @小岳助理 但未辨識出特殊指令，給予簡潔回應；私聊一般訊息則保持靜默不洗版
  if (isGroup && isMentioned) {
    _replyMessage(replyToken, "小岳收到您的訊息囉！若需查詢特定功能，歡迎在群組輸入「幹部系統」或使用下方選單探索社團各項服務！");
    return;
  }
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
    var targetUserId = payment.line_user_id || payment.userId || "";
    var targetUserName = payment.name || "社員";
    var totalAmount = payment.amount || payment.total_amount || 0;
    var selectedItems = payment.type || (payment.selected_names ? (Array.isArray(payment.selected_names) ? payment.selected_names.join(", ") : String(payment.selected_names)) : (payment.items || "社團活動/裝備費用"));

    var selTypes = payment.selected_types || [];
    if (typeof selTypes === 'string') {
      try { selTypes = JSON.parse(selTypes); } catch (e) { selTypes = [selTypes]; }
    }
    var itemsStr = String(payment.type || "") + " " + String(payment.items || "") + " " + String(payment.selected_names || "");

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
 * @param {string|object} [optionsOrHtml] 郵件選項或 HTML 內文
 */
function pushAdminMessage(text, customSubject, optionsOrHtml) {
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
  sendAdminEmail(subject, text, optionsOrHtml);

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
    if (str.includes("T")) {
      var isoDate = new Date(str);
      if (!isNaN(isoDate.getTime())) {
        return now.getTime() > isoDate.getTime();
      }
    }
    var cleanStr = str.replace(/[\/\.]/g, "-");
    var datePart = cleanStr.split("T")[0].split(" ")[0];
    var parts = datePart.split("-");
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
 * 輔助函式：日期字串格式化 (依台灣時區轉換為 YYYY/MM/DD)
 */
function _formatEventDate(dateVal) {
  if (!dateVal) return "";
  var str = String(dateVal).trim();
  if (str.includes("T")) {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      var tzDate = new Date(d.getTime() + (8 * 60 * 60 * 1000));
      var pad = function(n) { return n < 10 ? '0' + n : n; };
      var yr = tzDate.getUTCFullYear();
      var mo = pad(tzDate.getUTCMonth() + 1);
      var dy = tzDate.getUTCDate();
      return yr + '/' + mo + '/' + dy;
    }
  }
  return str.replace(/-/g, "/").substring(0, 10);
}

/**
 * 產生最新活動卡片輪播 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventList(replyToken) {
  var sbEvents = _supabaseGet("events", {
    select: "id,title,fee,start_date,end_date,deadline,status,summary,cover_image_url",
    order: "start_date.desc"
  });

  if (!sbEvents || !Array.isArray(sbEvents) || sbEvents.length === 0) {
    _replyMessage(replyToken, "目前這學期還沒有排定的活動喔！\n─────────────\nThere are no scheduled activities for this semester yet!");
    return;
  }

  var bubbles = [];

  for (var i = 0; i < sbEvents.length; i++) {
    var ev = sbEvents[i];
    var status = String(ev.status || "").trim();
    var deadlineStr = ev.deadline || "";
    var isExpired = _isEventExpired(deadlineStr);

    // 判斷是否為未來開放或已過期
    var isFuture = status.indexOf("未來") > -1 || status.toLowerCase().indexOf("coming") > -1 || status.toLowerCase().indexOf("future") > -1;
    if (status === "開放" && isExpired) {
      status = "關閉";
    }

    // 僅顯示「開放」或「未來開放」之活動
    if (isFuture || status === "開放" || status.indexOf("開放") > -1 || status.toLowerCase().indexOf("open") > -1) {
      var eventId = ev.id || "";
      var eventName = ev.title || "未命名活動";
      var isOpen = !isFuture && (status === "開放" || status.indexOf("開放") > -1) && !isExpired;
      var tagColor = isFuture ? "#FF9800" : (isOpen ? "#1DB446" : "#999999");
      var displayStatus = isFuture ? "未來開放 Coming Soon" : (isOpen ? "開放 Open" : "已截止 Closed");
      var costStr = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費 Free";
      var startFormatted = _formatEventDate(ev.start_date);
      var endFormatted = _formatEventDate(ev.end_date);
      var deadlineFormatted = _formatEventDate(ev.deadline);

      var dateDisplay = startFormatted;
      if (endFormatted && endFormatted !== startFormatted) {
        dateDisplay += " ~ " + endFormatted;
      }

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
              "text": "費用 Cost: " + costStr,
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
              "text": dateDisplay,
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
              "text": deadlineFormatted,
              "size": "sm",
              "color": "#E53935",
              "weight": "bold"
            }]
          }, {
            "type": "separator",
            "margin": "md"
          }, {
            "type": "text",
            "text": ev.summary || "",
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

      var imageUrl = String(ev.cover_image_url || "").trim();
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
 * 產生單一活動詳細資訊卡片 (100% 直連 Supabase events 表，絕不讀取主試算表)
 */
function sendEventDetail(replyToken, eventId) {
  if (!eventId) {
    _replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var sbList = _supabaseGet("events", { id: "eq." + String(eventId).trim() });
  if (!sbList || !Array.isArray(sbList) || sbList.length === 0) {
    _replyMessage(replyToken, "找不到該活動的詳細資訊！\n─────────────\nEvent details not found!");
    return;
  }

  var ev = sbList[0];
  var eventName = ev.title || "未命名活動 (Untitled Event)";
  var status = String(ev.status || "").trim();
  var deadlineStr = ev.deadline || "";
  var isExpired = _isEventExpired(deadlineStr);

  var isFuture = status.indexOf("未來") > -1 || status.toLowerCase().indexOf("coming") > -1 || status.toLowerCase().indexOf("future") > -1;
  if (status === "開放" && isExpired) {
    status = "關閉";
  }

  var costStr = (ev.fee !== undefined && ev.fee !== null && ev.fee > 0) ? "$" + ev.fee : "免費 Free";
  var startFormatted = _formatEventDate(ev.start_date);
  var endFormatted = _formatEventDate(ev.end_date);
  var deadlineFormatted = _formatEventDate(ev.deadline);

  var dateDisplay = startFormatted;
  if (endFormatted && endFormatted !== startFormatted) {
    dateDisplay += " ~ " + endFormatted;
  }

  var buttonBox;
  if (!isFuture && status === "開放" && !isExpired) {
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
    var closedLabel = isFuture ? "即將開放 Coming Soon" : (isExpired ? "報名已截止 Closed" : "尚未開放 Not Open");
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
      "contents": [
        {
          "type": "text",
          "text": "【名稱】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446"
        },
        {
          "type": "text",
          "text": eventName,
          "weight": "bold",
          "size": "lg",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "text",
          "text": "【簡介】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": ev.summary || "尚無簡介",
          "size": "sm",
          "color": "#555555",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "text",
          "text": "【詳細行程】",
          "weight": "bold",
          "size": "sm",
          "color": "#1DB446",
          "margin": "lg"
        },
        {
          "type": "text",
          "text": ev.itinerary || "尚無詳細行程",
          "size": "sm",
          "color": "#555555",
          "wrap": true,
          "margin": "xs"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "xl",
          "spacing": "xs",
          "contents": [
            {
              "type": "text",
              "text": "費用 Cost: " + costStr,
              "size": "sm",
              "color": "#666666",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": "活動時間 Event Date: " + dateDisplay,
              "size": "sm",
              "color": "#1DB446",
              "weight": "bold"
            },
            {
              "type": "text",
              "text": "報名截止 Deadline: " + deadlineFormatted,
              "size": "sm",
              "color": "#E53935",
              "weight": "bold"
            }
          ]
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "contents": [buttonBox]
    }
  };

  var imageUrl = String(ev.cover_image_url || ev.image_url || "").trim();
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
  // 1. 優先直通 Supabase members 表 (is_officer: "eq.true") (SSOT)
  try {
    var sbOfficers = _supabaseGet("members", { is_officer: "eq.true", select: "name,role,quote,duty,photo_url" });
    if (sbOfficers && Array.isArray(sbOfficers) && sbOfficers.length > 0) {
      var bubbles = [];
      for (var k = 0; k < sbOfficers.length; k++) {
        var off = sbOfficers[k];
        var name = String(off.name || "").trim();
        if (!name) continue;
        var role = String(off.role || "幹部 Officer").trim();
        var duty = String(off.duty || "協助社團事務 Assist with club affairs").trim();
        var quote = String(off.quote || "歡迎加入登山社！ Welcome to the club!").trim();
        var photoUrl = String(off.photo_url || "").trim();
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

      if (bubbles.length > 0) {
        _replyFlexMessage(replyToken, "來認識一下登山社幹部吧！ / Meet the club officers!", {
          "type": "carousel",
          "contents": bubbles
        });
        return;
      }
    }
    _replyMessage(replyToken, "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!");
  } catch (sbErr) {
    console.error("[sendOfficerMenu] 直查 Supabase 幹部名冊失敗:", sbErr);
    _replyMessage(replyToken, "查詢幹部名冊失敗：" + (sbErr.message || sbErr) + "\n─────────────\nFailed to fetch officers: " + (sbErr.message || sbErr));
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
          "label": "🤖 小岳助理說明 AI Guide",
          "text": "小岳助理說明"
        }
      }, {
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

  // 1. 直查 Supabase members 表（SSOT）
  var sbMembers = _supabaseGet("members", { line_user_id: "eq." + userId });
  if (sbMembers !== null && Array.isArray(sbMembers)) {
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
    return { missingFields: ["NOT_FOUND"], p: null };
  }

  // 3. 必填欄位清單 (依據 signup / loan 檢查)
  if (!p.name) missingFields.push("姓名");
  if (!p.gender) missingFields.push("性別");
  if (!p.idNumber) missingFields.push("身分證字號/居留證號");
  if (!p.birthday) missingFields.push("生日");
  if (!p.phone) missingFields.push("聯絡電話");
  if (!p.department) missingFields.push("系所");
  if (!p.studentId) missingFields.push("學號");
  if (!p.studentAddr) missingFields.push("現居地址");
  if (!p.email) missingFields.push("電子郵件");
  if (!p.realLineId) missingFields.push("真實 LINE ID");
  if (!p.emerName) missingFields.push("緊急聯絡人姓名");
  if (!p.emerRel) missingFields.push("與緊急聯絡人關係");
  if (!p.emerPhone) missingFields.push("緊急聯絡人電話");
  if (!p.emerAddr) missingFields.push("緊急聯絡人現居地址");

  if (type === "signup") {
    if (!p.exp) missingFields.push("爬山經歷");
    if (!p.strength) missingFields.push("體能自評");
    if (!p.strengthProof) missingFields.push("體能證明");
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
    } else {
      _replyMessage(replyToken, "⚠️ 報名失敗：查無活動代號【" + eventId + "】，請確認活動代號是否正確！\n─────────────\n⚠️ Event not found for code: " + eventId);
      return;
    }

    // 2. 執行個人資料完整性檢查 (100% 直查 Supabase)
    var profileCheck = _checkProfileComplete(userId, ss, "signup");

    if (profileCheck.missingFields.indexOf("NOT_FOUND") > -1) {
      _replyMessage(replyToken, "⚠️ 報名失敗：系統找不到您的社員資料！\n請先點選單中的「填寫資料」完成註冊後再報名。\n─────────────\n⚠️ Registration Failed: Member profile not found!\nPlease click 'Register' in the menu to complete your profile first:\nhttps://liff.line.me/2009217429-AhPRqAHg");
      return;
    }

    if (profileCheck.missingFields.length > 0) {
      var fieldEnMap = {
        "姓名": "Name", "性別": "Gender", "身分證字號/居留證號": "ID / ARC Number",
        "生日": "Birthday", "聯絡電話": "Phone Number", "系所": "Department",
        "學號": "Student ID", "身分別": "Identity Status", "現居地址": "Current Address",
        "電子郵件": "Email", "真實 LINE ID": "LINE ID", "緊急聯絡人姓名": "Emergency Contact Name",
        "與緊急聯絡人關係": "Relationship", "緊急聯絡人電話": "Emergency Contact Phone",
        "緊急聯絡人現居地址": "Emergency Contact Address", "爬山經歷": "Hiking Experience",
        "體能自評": "Fitness Description", "體能證明": "Fitness Proof"
      };
      var missingFormatted = profileCheck.missingFields.map(function (f) {
        return "👉 " + f + (fieldEnMap[f] ? " (" + fieldEnMap[f] + ")" : "");
      }).join("\n");

      _replyMessage(replyToken, "⚠️ 報名失敗：您的個人資料尚不完整！\n\n為了辦理平安保險與確保戶外活動安全，請先點擊選單的「填寫資料」，補齊以下必填資訊：\n\n" + missingFormatted + "\n\n完成資料更新後，再回來點擊一鍵報名喔！🏕️\n─────────────\n⚠️ Registration Failed: Incomplete member profile!\nFor insurance and safety requirements, please click 'Register' in the menu to update the required information above, then try registering again:\n👉 https://liff.line.me/2009217429-AhPRqAHg");
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

    // 4.1 即時追加至活動專屬獨立試算表 (若有設定獨立試算表)
    try {
      if (typeof _asyncAppendToEventSpreadsheet === "function") {
        var sDataForEventSS = Object.assign({}, p, {
          userId: userId,
          signupCode: signupCode,
          eventName: evName,
          reviewStatus: "審核中 Checking",
          payStatus: "未繳費 Unpaid"
        });
        _asyncAppendToEventSpreadsheet(eventId, sDataForEventSS, evName);
      }
    } catch (evSSErr) {
      console.warn("同步至活動專屬試算表例外:", evSSErr);
    }



    // 6. 回傳確認收據 (中英完整雙語)
    _replyMessage(replyToken, "✅ 報名登記已送出！ / Registration Submitted!\n\n" +
      "活動 (Event)：\n" + evName + "\n" +
      "活動代號 (Event ID)：" + eventId + "\n" +
      "報名專屬碼 (Signup Code)：" + signupCode + "\n\n" +
      p.name + "，我們已收到您的報名資料。\n" +
      "Dear " + p.name + ", we have received your application.\n\n" +
      "⚠️ 【重要提醒 / Important Reminder】\n" +
      "此階段為「報名登記與資格審核」，幹部將進行體能評估與篩選，最終錄取名單（正取/備取）將透過本帳號推播通知您！\n" +
      "─────────────\n" +
      "This stage is registration & review. Officers will evaluate qualifications, and admission status (Confirmed/Waitlisted) will be notified to you via this LINE account!");

  } catch (err) {
    console.error("活動報名失敗:", err);
    _replyMessage(replyToken, "⚠️ 系統目前忙碌中，請稍後再試！\n─────────────\n⚠️ System is currently busy, please try again later!");
  } finally {
    _safeReleaseLock(lock);
  }
}

/**
 * 處理備取意願確認 (Postback) - 100% 直連 Supabase (SSOT)，杜絕試算表錯誤
 */
function handleConfirmWaitlist(replyToken, userId, paramsMap, ss) {
  var eventId = paramsMap["eventId"] || "";
  var targetUid = paramsMap["userId"] || userId;
  var targetCode = paramsMap["signupCode"] || paramsMap["targetId"] || "";

  if (!targetUid) {
    _replyMessage(replyToken, "系統錯誤：缺少使用者識別碼。\n─────────────\nSystem Error: Missing user identifier.");
    return;
  }

  try {
    // 1. 直查 Supabase event_signups
    var queryParams = {
      line_user_id: "eq." + targetUid,
      select: "id,event_id,status"
    };
    if (targetCode) {
      queryParams = { id: "eq." + targetCode, select: "id,event_id,status" };
    } else if (eventId) {
      queryParams.event_id = "eq." + eventId;
    }

    var signups = _supabaseGet("event_signups", queryParams);
    if (!signups || signups.length === 0) {
      _replyMessage(replyToken, "找不到該筆報名資料，請洽詢社團幹部！\n─────────────\nRegistration record not found, please contact club officers!");
      return;
    }

    var signup = signups[0];
    var currentStatus = String(signup.status || "");

    if (currentStatus.indexOf("備取（有意願）") > -1 || currentStatus.indexOf("有意願") > -1) {
      _replyMessage(replyToken, "您先前已確認過備取意願！若有名額釋出，幹部將主動與您聯絡！\n─────────────\nYou have already confirmed your waitlist preference! Officers will contact you if a spot opens up!");
      return;
    }

    // 2. 直寫 Supabase event_signups 狀態為 備取（有意願）Waitlisted (Interested)
    var patchSuccess = _supabasePatch("event_signups", { id: "eq." + signup.id }, {
      status: "備取（有意願）Waitlisted (Interested)",
      updated_at: new Date().toISOString()
    });

    if (patchSuccess) {
      _replyMessage(replyToken, "已成功確認您的備取意願！審核狀態已更新為：【備取（有意願）】。若有正取名額釋出，幹部將主動與您聯絡！\n─────────────\nSuccessfully confirmed waitlist preference! Status updated to: [Waitlisted (Interested)]. We will contact you if a spot opens up!");
    } else {
      _replyMessage(replyToken, "⚠️ 更新備取意願失敗，請稍後再試或洽詢幹部！\n─────────────\n⚠️ Failed to update waitlist preference, please try again later or contact officers!");
    }
  } catch (err) {
    console.error("[handleConfirmWaitlist] 例外:", err);
    _replyMessage(replyToken, "系統發生錯誤：" + (err.message || err) + "\n─────────────\nSystem error: " + (err.message || err));
  }
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
    // 100% 直通 Supabase events (SSOT)，杜絕試算表依賴
    if (typeof _supabaseGet === "function") {
      var sbEvents = _supabaseGet("events", { status: "eq.開放", select: "title,fee,start_date,summary,itinerary" });
      if (Array.isArray(sbEvents) && sbEvents.length > 0) {
        return sbEvents.map(function(ev) {
          var title = ev.title || "";
          var fee = ev.fee || 0;
          var start = ev.start_date || "";
          var desc = ev.summary || "";
          return "• " + title + " (開始日：" + start + "，費用：$" + fee + ")：" + desc;
        }).join("\n");
      }
    }
    return "目前無開放報名中的活動資料。";
  } catch (e) {
    console.error("[_fetchOpenEventsContext] 直查 Supabase 失敗:", e);
    return "無法讀取活動清單：" + (e.message || e);
  }
}

/**
 * 讀取 Google Docs 雲端大腦知識庫
 * 1. 優先掃描 KNOWLEDGE_FOLDER_ID 資料夾內所有 Docs/TXT 檔案
 * 2. 次之讀取 KNOWLEDGE_DOC_ID
 * 3. 預設回退歷史社團規章專屬文件 1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI
 */
function _fetchDocsKnowledgeBase() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("docs_kb_text");
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("KNOWLEDGE_FOLDER_ID");
  var docId = props.getProperty("KNOWLEDGE_DOC_ID") || "1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI";
  var allKnowledge = "";

  try {
    if (folderId && typeof DriveApp !== "undefined") {
      try {
        var folder = DriveApp.getFolderById(folderId);
        var files = folder.getFiles();
        while (files.hasNext()) {
          var file = files.next();
          var mimeType = file.getMimeType();
          if (mimeType === MimeType.GOOGLE_DOCS && typeof DocumentApp !== "undefined") {
            var doc = DocumentApp.openById(file.getId());
            allKnowledge += "【規章文件：" + file.getName() + "】\n" + doc.getBody().getText() + "\n\n";
          } else if (mimeType === MimeType.PLAIN_TEXT) {
            allKnowledge += "【規章文件：" + file.getName() + "】\n" + file.getAs("text/plain").getDataAsString() + "\n\n";
          }
        }
      } catch (folderErr) {
        console.warn("讀取 KNOWLEDGE_FOLDER_ID 異常，嘗試讀取單一文件:", folderErr);
      }
    }

    if (!allKnowledge && docId && typeof DocumentApp !== "undefined") {
      try {
        var singleDoc = DocumentApp.openById(docId);
        allKnowledge = singleDoc.getBody().getText();
      } catch (docErr) {
        console.warn("讀取單一 Docs 知識庫失敗:", docErr);
      }
    }

    if (allKnowledge) {
      if (allKnowledge.length > 15000) {
        allKnowledge = allKnowledge.substring(0, 15000);
      }
      try { cache.put("docs_kb_text", allKnowledge, 1800); } catch (cErr) {}
      return allKnowledge;
    }
  } catch (e) {
    console.warn("讀取知識庫整體例外:", e);
  }

  return "社團裝備租借依社籍收費，出隊請遵守領隊指導。";
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

  // 2. 批次去重 (按 table_name + record_id，短時間內多次異動只保留最新一筆執行，但所有舊 queue id 一併 mark completed)
  var dedupedMap = {};
  var itemOrder = [];
  var redundantCompletedIds = [];

  for (var i = 0; i < queue.length; i++) {
    var qItem = queue[i];
    var qPayload = qItem.payload || {};
    var recId = qItem.record_id || qPayload.id || qPayload.signupId || qPayload.line_user_id || qPayload.orderId || ('item_' + qItem.id);
    var dedupKey = qItem.table_name + ':' + recId;

    if (dedupedMap[dedupKey]) {
      // 舊的被覆蓋，舊 queue id 標記為完成
      redundantCompletedIds.push(dedupedMap[dedupKey].id);
    } else {
      itemOrder.push(dedupKey);
    }
    dedupedMap[dedupKey] = qItem;
  }

  // 3. 逐筆處理去重後的最新異動
  for (var k = 0; k < itemOrder.length; k++) {
    var itemKey = itemOrder[k];
    var item = dedupedMap[itemKey];
    try {
      _processSingleSyncItem(ss, item);
      completedIds.push(item.id);
    } catch (err) {
      Logger.log("⚠️ 處理事件失敗 (Queue ID " + item.id + "): " + err.toString());
      failedItems.push({ id: item.id, error: err.toString(), retry: (item.retry_count || 0) + 1 });
    }
  }

  // 合併已因去重而被取代的舊 queue IDs
  for (var r = 0; r < redundantCompletedIds.length; r++) {
    completedIds.push(redundantCompletedIds[r]);
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
      .addSeparator()
      .addItem("⚙️ 安裝試算表即時編輯觸發器", "setupSpreadsheetEditTrigger")
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
    // 嚴格防止 camelCase 臨時變數 (如 signupId, reviewResult, updatedBy) 被誤加入表頭
    if (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(colKey)) {
      continue;
    }
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

  // 1. 欄位別名正規化 (相容舊 RPC 或前端 camelCase 傳入)
  if (p.signupId && !p.id) p.id = p.signupId;
  if (p.eventId && !p.event_id) p.event_id = p.eventId;
  if (p.reviewResult && !p.status) p.status = p.reviewResult;
  if (p.lineUserId && !p.line_user_id) p.line_user_id = p.lineUserId;

  var sheet = _getSheetByTableName(ss, "event_signups");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];

  // 2. 嚴格過濾掉非標準 Schema 欄位，防止在主試算表長出 N, O, P, Q 欄
  var allowedCols = [
    "id", "event_id", "line_user_id", "status", "payment_status",
    "role", "paid_amount", "assigned_driver", "notes", "created_at", "updated_at"
  ];
  var sanitizedPayload = {};
  for (var key in p) {
    if (allowedCols.indexOf(key) > -1) {
      sanitizedPayload[key] = p[key];
    }
  }

  headers = _ensureColumnsExist(sheet, headers, sanitizedPayload);

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

  // 3. 處理 DELETE 刪除事件
  if (action === "DELETE") {
    if (targetRow > -1) {
      sheet.deleteRow(targetRow);
      Logger.log("🗑️ 已從 event_signups 表刪除報名紀錄: " + (p.id || (p.line_user_id + "_" + p.event_id)));
    }
    // 同步取消活動專屬獨立試算表
    if (typeof _syncCancelToEventSpreadsheet === "function") {
      _syncCancelToEventSpreadsheet(p.event_id, p.line_user_id, p.id, p.notes || "系統同步取消");
    }
    return;
  }

  // 4. 處理既有列 UPDATE
  if (targetRow > -1) {
    for (var k in sanitizedPayload) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1 && sanitizedPayload[k] !== undefined) {
        var val = sanitizedPayload[k];
        sheet.getRange(targetRow, cIdx + 1).setValue((typeof val === "object" && val !== null) ? JSON.stringify(val) : val);
      }
    }
  } else {
    // 5. 處理 INSERT 新增分支 (防呆：必須具備有效 id 或 line_user_id 才允許 appendRow，避免幽靈空白列)
    if (!p.id && !p.line_user_id) {
      Logger.log("⚠️ 略過無效之報名資料 (缺少 id 與 line_user_id)");
      return;
    }
    var newRow = new Array(headers.length).fill("");
    for (var k in sanitizedPayload) {
      var cIdx = _findHeaderCol(headers, k);
      if (cIdx > -1) {
        var val = sanitizedPayload[k];
        newRow[cIdx] = (typeof val === "object" && val !== null) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : "");
      }
    }
    sheet.appendRow(newRow);
    Logger.log("➕ 已新增報名紀錄至 event_signups 表: " + (p.id || p.line_user_id));
  }

  // 6. ⚡ 異步同步至該活動專屬獨立試算表 (依 events.spreadsheet_id)
  _syncSignupToEventSpecificSheet(p);
}

/**
 * ⚡ 將 Supabase 異動之報名紀錄同步更新至該活動的專屬獨立試算表
 */
function _syncSignupToEventSpecificSheet(p) {
  if (!p || !p.event_id) return;
  try {
    var eventId = p.event_id;
    var ssId = "";
    var evts = (typeof _supabaseGet === "function") 
      ? _supabaseGet("events", { id: "eq." + eventId, select: "title,spreadsheet_id,spreadsheet_url" })
      : [];
    if (evts && evts.length > 0) {
      if (evts[0].spreadsheet_id && typeof _extractSpreadsheetId === "function") {
        ssId = _extractSpreadsheetId(evts[0].spreadsheet_id);
      }
      if (!ssId && evts[0].spreadsheet_url && typeof _extractSpreadsheetId === "function") {
        ssId = _extractSpreadsheetId(evts[0].spreadsheet_url);
      }
    }
    if (!ssId) return;

    var eventSS = SpreadsheetApp.openById(ssId);
    var sheet = eventSS.getSheetByName("報名名冊") || eventSS.getSheets()[0];
    if (!sheet) return;

    var sData = sheet.getDataRange().getValues();
    var sHeaders = (sData.length > 0) ? sData[0] : [];
    if (sHeaders.length === 0) return;

    var targetRow = -1;
    var codeIdx = _findHeaderCol(sHeaders, "id", ["專屬碼", "報名編號"]);
    var uidIdx = _findHeaderCol(sHeaders, "line_user_id", ["系統識別碼", "userId"]);

    for (var r = 1; r < sData.length; r++) {
      var rCode = codeIdx > -1 ? String(sData[r][codeIdx]).trim() : "";
      var rUid = uidIdx > -1 ? String(sData[r][uidIdx]).trim() : "";
      if ((p.id && rCode === String(p.id).trim()) ||
          (p.line_user_id && rUid === String(p.line_user_id).trim())) {
        targetRow = r + 1;
        break;
      }
    }

    // 取得欄位索引
    var statusIdx = _findHeaderCol(sHeaders, "review_status", ["審核結果", "錄取狀態"]);
    var payStatusIdx = _findHeaderCol(sHeaders, "payment_status", ["繳費狀態"]);
    var notesIdx = _findHeaderCol(sHeaders, "notes", ["備註"]);
    var driverIdx = _findHeaderCol(sHeaders, "assigned_driver", ["車手分派", "車手", "司機"]);

    if (targetRow > -1) {
      if (statusIdx > -1 && p.status !== undefined) {
        sheet.getRange(targetRow, statusIdx + 1).setValue(p.status);
      }
      if (payStatusIdx > -1 && p.payment_status !== undefined) {
        sheet.getRange(targetRow, payStatusIdx + 1).setValue(p.payment_status);
      }
      if (notesIdx > -1 && p.notes !== undefined) {
        sheet.getRange(targetRow, notesIdx + 1).setValue(p.notes);
      }
      if (driverIdx > -1 && p.assigned_driver !== undefined) {
        sheet.getRange(targetRow, driverIdx + 1).setValue(p.assigned_driver);
      }
      Logger.log("⚡ [EventSheet] 成功同步報名紀錄至獨立試算表 " + ssId + " 第 " + targetRow + " 列");
    } else {
      // 獨立試算表尚無此人列，若具備完整資訊或能從 Supabase 補齊則追加
      if (typeof _appendToEventSpreadsheet === "function") {
        var signupData = {
          signupCode: p.id,
          userId: p.line_user_id,
          reviewStatus: p.status || "審核中",
          paymentStatus: p.payment_status || "未繳費",
          notes: p.notes || ""
        };
        // 嘗試撈取 member 補齊基本資料
        if (p.line_user_id && typeof _supabaseGet === "function") {
          var mems = _supabaseGet("members", { line_user_id: "eq." + p.line_user_id, select: "*" });
          if (mems && mems.length > 0) {
            var m = mems[0];
            signupData.name = m.name;
            signupData.gender = m.gender;
            signupData.phone = m.phone;
            signupData.email = m.email;
            signupData.realLineId = m.line_id;
            signupData.birthday = m.birthday;
            signupData.idNumber = m.id_card;
            signupData.studentAddr = m.address;
            signupData.emerName = m.emergency_contact_name;
            signupData.emerPhone = m.emergency_contact_phone;
            signupData.emerAddr = m.emergency_contact_address;
            signupData.emerRel = m.emergency_contact_rel;
            signupData.exp = m.outdoor_experience;
            signupData.strength = m.fitness_desc;
            signupData.strengthProof = m.proof_urls;
            signupData.isMember = m.is_official_member;
          }
        }
        _appendToEventSpreadsheet(eventId, signupData, (evts && evts[0] && evts[0].title) || "");
      }
    }
  } catch (err) {
    Logger.log("⚠️ [EventSheet] 同步至獨立試算表異常: " + err.toString());
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

/**
 * 🏔️ 系統每日自動巡檢核心 (dailyPatrol)
 * 1. 活動截止自動關閉
 * 2. 社員社籍到期自動重置為未繳費並發送期滿溫馨祝福
 * 3. 裝備借用逾期未歸還催收提醒
 * 4. 彙整巡檢報告雙軌推播 (Gmail + LINE Push)
 */
function dailyPatrol() {
  var props = PropertiesService.getScriptProperties();
  var sbUrl = props.getProperty('SUPABASE_URL') || SUPABASE_URL;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    Logger.log("❌ dailyPatrol 缺少 Supabase 設定");
    return { status: "error", message: "缺少 Supabase 設定" };
  }

  var now = new Date();
  var todayStr = Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd");

  var closedEvents = [];
  var expiredMembers = [];
  var overdueLoans = [];

  // ==============================================================================
  // 1. 活動截止巡檢：若超過報名截止日且狀態仍為「開放」，自動切換為「關閉」
  // ==============================================================================
  try {
    var evUrl = sbUrl + "/rest/v1/events?status=eq.開放&deadline=lt." + todayStr + "&select=id,name,deadline";
    var evRes = UrlFetchApp.fetch(evUrl, {
      method: "get",
      headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
      muteHttpExceptions: true
    });
    if (evRes.getResponseCode() === 200) {
      var expEvents = JSON.parse(evRes.getContentText()) || [];
      for (var i = 0; i < expEvents.length; i++) {
        var evt = expEvents[i];
        // 切換為關閉
        var patchEvtUrl = sbUrl + "/rest/v1/events?id=eq." + encodeURIComponent(evt.id);
        UrlFetchApp.fetch(patchEvtUrl, {
          method: "patch",
          contentType: "application/json",
          headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey, "Prefer": "return=minimal" },
          payload: JSON.stringify({ status: "關閉", updated_at: new Date().toISOString() }),
          muteHttpExceptions: true
        });
        closedEvents.push("• " + (evt.name || evt.id) + " (截止日: " + evt.deadline + ")");
      }
    }
  } catch (errEv) {
    console.warn("巡檢活動截止異常:", errEv);
  }

  // ==============================================================================
  // 2. 社員社籍期滿巡檢：到期日小於今日者，轉為未繳費並發送期滿祝福
  // ==============================================================================
  try {
    var memUrl = sbUrl + "/rest/v1/members?fee_status=eq.已繳費 Paid&expire_date=lt." + todayStr + "&select=line_user_id,name,expire_date";
    var memRes = UrlFetchApp.fetch(memUrl, {
      method: "get",
      headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
      muteHttpExceptions: true
    });
    if (memRes.getResponseCode() === 200) {
      var expMems = JSON.parse(memRes.getContentText()) || [];
      for (var j = 0; j < expMems.length; j++) {
        var mem = expMems[j];
        // 重置為未繳費
        var patchMemUrl = sbUrl + "/rest/v1/members?line_user_id=eq." + encodeURIComponent(mem.line_user_id);
        UrlFetchApp.fetch(patchMemUrl, {
          method: "patch",
          contentType: "application/json",
          headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey, "Prefer": "return=minimal" },
          payload: JSON.stringify({
            fee_status: "未繳費 Unpaid",
            is_member: false,
            updated_at: new Date().toISOString()
          }),
          muteHttpExceptions: true
        });
        expiredMembers.push("• " + (mem.name || "社員") + " (到期日: " + mem.expire_date + ")");

        // 推播期滿溫馨祝福至該社員個人 LINE
        if (mem.line_user_id && mem.line_user_id.indexOf("U") === 0) {
          var blessingMsg = "【社籍期滿溫馨祝福 / Club Membership Milestone】\n\n" +
            "親愛的 " + (mem.name || "山友") + " 您好：\n\n" +
            "您的登山社社員資格已於 " + mem.expire_date + " 圓滿告一段落。\n\n" +
            "非常感謝您這段時間以來對登山社的陪伴與熱情參與，與大家一同在山林與步道間留下了許多珍貴美好的回憶！\n\n" +
            "山一直在那裡，夥伴的情誼也始終常在。\n" +
            "無論未來您走向哪一座山頭、開啟怎樣的新冒險，登山社都由衷祝福您平安順遂、每一步都有美麗的風景相伴！🏔️✨\n\n" +
            "若想念山林或想再與大家聚聚，隨時都歡迎回到登山社這個溫暖大家庭！\n" +
            "─────────────\n" +
            "Dear " + (mem.name || "Member") + ",\n\n" +
            "Your club membership period has concluded on " + mem.expire_date + ".\n\n" +
            "Thank you so much for being an essential part of our mountaineering journey. You are always welcome back to our club family!";

          _pushMessage(mem.line_user_id, blessingMsg);
        }
      }
    }
  } catch (errMem) {
    console.warn("巡檢社員社籍異常:", errMem);
  }

  // ==============================================================================
  // 3. 裝備逾期巡檢：狀態為「使用中 Using」或「待領取」且預計歸還日小於今日
  // ==============================================================================
  try {
    var loanUrl = sbUrl + "/rest/v1/loans?status=in.(使用中 Using,待領取 To Be Collected)&return_date=lt." + todayStr + "&select=id,borrower_name,borrower_line_id,phone,return_date,status";
    var loanRes = UrlFetchApp.fetch(loanUrl, {
      method: "get",
      headers: { "apikey": sbKey, "Authorization": "Bearer " + sbKey },
      muteHttpExceptions: true
    });
    if (loanRes.getResponseCode() === 200) {
      var ovLoans = JSON.parse(loanRes.getContentText()) || [];
      for (var k = 0; k < ovLoans.length; k++) {
        var ln = ovLoans[k];
        overdueLoans.push("• 單號 " + ln.id + "：" + (ln.borrower_name || "借用人") + " (應還日期: " + ln.return_date + "，電話: " + (ln.phone || "無") + ")");
      }
    }
  } catch (errLn) {
    console.warn("巡檢逾期裝備異常:", errLn);
  }

  // ==============================================================================
  // 4. 彙整巡檢報告並推播給幹部 (僅在有項目異動或逾期時才發信，杜絕洗版)
  // ==============================================================================
  var noticeSections = [];
  if (closedEvents.length > 0) {
    noticeSections.push("【活動截止自動關閉】\n系統已自動將下列 " + closedEvents.length + " 場已過截止日之活動狀態切換為「關閉」：\n\n" +
      closedEvents.join("\n") +
      "\n\n社員將無法再進行報名，幹部可於管理中心進行後續名冊審核。");
  }
  if (expiredMembers.length > 0) {
    noticeSections.push("【社籍到期自動轉未繳費】\n系統巡檢偵測到下列 " + expiredMembers.length + " 位社員之社籍已逾期，已將繳費狀態自動重置為「未繳費 Unpaid」並發送期滿祝福：\n\n" +
      expiredMembers.join("\n") +
      "\n\n社員若欲續約登入繳費系統即可繳納新學期社費。");
  }
  if (overdueLoans.length > 0) {
    noticeSections.push("【⚠️ 裝備逾期未歸還催收提醒】\n系統偵測到下列 " + overdueLoans.length + " 筆裝備租借單已逾預計歸還日：\n\n" +
      overdueLoans.join("\n") +
      "\n\n請幹部主動與借用人聯繫確認歸還或續借狀況。");
  }

  if (noticeSections.length > 0) {
    var reportSubject = "【台科登山社】系統每日自動巡檢報告 - " + todayStr;
    var reportBody = "【系統每日自動巡檢報告】\n" +
      "─────────────\n\n" +
      noticeSections.join("\n\n────────────────────\n\n") +
      "\n\n⚡ 巡檢時間：" + Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");

    pushAdminMessage(reportBody, reportSubject);
    Logger.log("✅ 每日巡檢完成並發送報告：" + reportSubject);
  } else {
    Logger.log("ℹ️ 每日巡檢完成，今日無過期活動、無到期社員、無逾期裝備。");
  }

  return {
    status: "success",
    date: todayStr,
    closedEventsCount: closedEvents.length,
    expiredMembersCount: expiredMembers.length,
    overdueLoansCount: overdueLoans.length
  };
}

/**
 * 安裝每日定時巡檢觸發器 (每天凌晨 02:00 執行)
 */
function setupDailyPatrolTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "dailyPatrol") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("dailyPatrol")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log("✅ 已成功設定每日凌晨 02:00 執行 dailyPatrol 巡檢觸發器！");
}

/**
 * ⚡ 試算表可安裝編輯事件處理器 (Installable onEdit)
 * 幹部在試算表手動編輯儲存格時即時連動 Supabase 與推播通知：
 * 1. Payments 對帳狀態 -> 已確認無誤/已核銷 Confirmed 觸發核銷與推播社員
 * 2. Loan_Records/Loans 狀態 -> 已歸還 Returned 觸發還件與庫存回補
 * 3. Signups/Event_Signups 審核結果 -> 同步 Supabase，不主動通知社員
 */
function handleSpreadsheetEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row <= 1) return; // 忽略表頭列

  var newValue = String(e.value || "").trim();
  var oldValue = String(e.oldValue || "").trim();
  if (!newValue || newValue === oldValue) return; // 防呆無實質變更

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // 1. Payments / 繳費分頁對帳處理
  var isPaymentsSheet = sheetName.toLowerCase() === "payments" || sheetName.indexOf("繳費") > -1;
  if (isPaymentsSheet) {
    var pStatusCol = _findHeaderCol(headers, "status", ["對帳狀態", "狀態", "繳費狀態"]) + 1;
    if (pStatusCol > 0 && col === pStatusCol) {
      var isConfirmed = (newValue === "已確認無誤" || newValue === "已核銷 Confirmed" || newValue === "已核銷");
      if (isConfirmed) {
        var idCol = _findHeaderCol(headers, "id", ["單號", "payment_id", "繳費單號"]) + 1;
        var paymentId = idCol > 0 ? String(sheet.getRange(row, idCol).getValue()).trim() : "";

        if (paymentId) {
          // 檢查 Supabase 原狀態（防重複觸發）
          var currentSb = _supabaseGet("payments", { id: "eq." + paymentId, select: "status,amount,line_user_id" });
          if (currentSb && currentSb.length > 0 && currentSb[0].status === "已核銷 Confirmed") {
            Logger.log("ℹ️ 該筆繳費已於 Supabase 核銷過，跳過重複推播: " + paymentId);
            return;
          }

          // 呼叫統一核銷處理流程
          _processPaymentVerification(paymentId, "試算表即時對帳", false, null);
          try {
            e.source.toast("✅ 繳費單 " + paymentId + " 已核銷並同步 Supabase！", "對帳成功", 5);
          } catch (tErr) {}
        }
      }
    }
    return;
  }

  // 2. Loans / Loan_Records / 裝備借用分頁歸還處理
  var isLoansSheet = sheetName.toLowerCase() === "loans" || sheetName === "Loan_Records" || sheetName.indexOf("裝備") > -1 || sheetName.indexOf("借用") > -1;
  if (isLoansSheet) {
    var lStatusCol = _findHeaderCol(headers, "status", ["領取/歸還", "歸還狀態", "狀態"]) + 1;
    if (lStatusCol > 0 && col === lStatusCol) {
      var isReturned = (newValue === "已歸還 Returned" || newValue === "已歸還");
      if (isReturned) {
        var loanIdCol = _findHeaderCol(headers, "id", ["租借單號", "loan_id", "訂單編號", "序號"]) + 1;
        var loanId = loanIdCol > 0 ? String(sheet.getRange(row, loanIdCol).getValue()).trim() : "";
        var equipIdCol = _findHeaderCol(headers, "equipment_id", ["裝備代號", "裝備編號", "器材編號"]) + 1;
        var equipId = equipIdCol > 0 ? String(sheet.getRange(row, equipIdCol).getValue()).trim() : "";
        var qtyCol = _findHeaderCol(headers, "quantity", ["借用數量", "數量"]) + 1;
        var qty = qtyCol > 0 ? (parseInt(sheet.getRange(row, qtyCol).getValue(), 10) || 1) : 1;

        if (loanId) {
          // 更新 Supabase loans 狀態
          _supabasePatch("loans", { id: "eq." + loanId }, { status: "已歸還 Returned" });

          // 若有裝備代號，回補 Supabase equipments 庫存
          if (equipId) {
            var eqData = _supabaseGet("equipments", { id: "eq." + equipId, select: "id,stock_available" });
            if (eqData && eqData.length > 0) {
              var currentStock = parseInt(eqData[0].stock_available, 10) || 0;
              var newStock = currentStock + qty;
              _supabasePatch("equipments", { id: "eq." + equipId }, { stock_available: newStock });
              Logger.log("✅ 已將裝備 " + equipId + " 庫存回補 " + qty + " 件至 " + newStock);
            }

            // 同步試算表 Equipments 剩餘數量分頁
            var equipSheet = e.source.getSheetByName("Equipments") || e.source.getSheetByName("器材清單");
            if (equipSheet) {
              var eData = equipSheet.getDataRange().getValues();
              var eH = eData[0];
              var eIdIdx = _findHeaderCol(eH, "id", ["裝備代號", "裝備編號"]);
              var eStockIdx = _findHeaderCol(eH, "stock_available", ["剩餘數量", "庫存"]);
              if (eIdIdx > -1 && eStockIdx > -1) {
                for (var r = 1; r < eData.length; r++) {
                  if (String(eData[r][eIdIdx]).trim() === equipId) {
                    var sVal = parseInt(eData[r][eStockIdx], 10) || 0;
                    equipSheet.getRange(r + 1, eStockIdx + 1).setValue(sVal + qty);
                    break;
                  }
                }
              }
            }
          }

          try {
            e.source.toast("✅ 裝備借用單 " + loanId + " 已標記歸還並回補庫存！", "歸還成功", 5);
          } catch (tErr) {}
        }
      }
    }
    return;
  }

  // 3. Event_Signups / Signups / 報名名冊 / 活動專屬試算表反向同步 (同步 Supabase，不主動發送推播通知)
  var isSignupsSheet = sheetName.toLowerCase() === "event_signups" || sheetName === "Signups" || sheetName.indexOf("報名") > -1;
  if (isSignupsSheet) {
    var signupIdCol = _findHeaderCol(headers, "id", ["專屬碼", "報名編號", "signup_id", "專屬代碼"]) + 1;
    var signupId = signupIdCol > 0 ? String(sheet.getRange(row, signupIdCol).getValue()).trim() : "";

    // ⭐️ 僅同步具備專屬碼的有效資料列，幹部自訂欄位或無專屬碼的自用註記列不予干擾
    if (signupId) {
      var headerName = String(headers[col - 1] || "").trim().toLowerCase();
      var patchPayload = null;

      if (headerName.indexOf("審核") > -1 || headerName.indexOf("錄取") > -1 || headerName === "review_status") {
        patchPayload = { review_status: newValue };
      } else if (headerName.indexOf("狀態") > -1 && headerName.indexOf("繳費") === -1 && headerName.indexOf("審核") === -1 || headerName === "status") {
        patchPayload = { status: newValue };
      } else if (headerName.indexOf("繳費") > -1 || headerName.indexOf("付款") > -1 || headerName === "payment_status") {
        patchPayload = { payment_status: newValue };
      } else if (headerName.indexOf("備註") > -1 || headerName === "notes") {
        patchPayload = { notes: newValue };
      }

      if (patchPayload) {
        _supabasePatch("event_signups", { id: "eq." + signupId }, patchPayload);
        Logger.log("⚡ [專屬試算表反向同步] 已同步報名紀錄 " + signupId + " (欄位 " + headers[col - 1] + " -> " + newValue + ")");
        try {
          e.source.toast("✅ 報名資料 (" + headers[col - 1] + " -> " + newValue + ") 已同步至 Supabase！", "反向同步成功", 5);
        } catch (tErr) {}
      }
    }
    return;
  }
}

/**
 * 安裝試算表即時編輯觸發器 (Installable Trigger)
 */
function setupSpreadsheetEditTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || _getSpreadsheet();
  if (!ss) {
    Logger.log("❌ 找不到主試算表，無法安裝觸發器");
    return;
  }

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "handleSpreadsheetEdit") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("handleSpreadsheetEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log("✅ 已成功安裝 handleSpreadsheetEdit 可安裝觸發器！");
  try {
    SpreadsheetApp.getUi().alert("安裝成功", "✅ 已成功安裝試算表即時編輯觸發器！\n未來在 Payments、Loans 或 Signups 分頁修改狀態，將自動即時同步 Supabase！", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
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

    var itemsZh = selectedNames.length > 0 ? selectedNames.map(function (n) { return "  - " + n; }).join("\n") : "  - 無項目";
    var itemsEn = selectedNames.length > 0 ? selectedNames.map(function (n) { return "  - " + n; }).join("\n") : "  - None";

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
  if (!userId && !userName) return { isOfficer: false, role: "", name: "" };
  if (userId === "TEST_USER_ID") return { isOfficer: true, role: "管理員", name: "測試管理員" };

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
        "爬山經驗", "體能測驗", "體能證明", "是否為社員", "審核結果", "通知狀態", "繳費狀態", "備註"
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
      deadlineIso = dStr.includes("T") ? dStr : (dStr + "T23:59:59Z");
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

    // 若為新活動，自動於 Google Drive 建立專屬資料夾與報名名冊試算表
    var driveFolderUrl = json.driveFolderUrl || "";
    var spreadsheetUrl = json.spreadsheetUrl || "";
    var spreadsheetId = json.spreadsheetId || "";

    if (!isUpdate && (!driveFolderUrl || !spreadsheetUrl)) {
      var driveInfo = _createEventDriveFolderAndSheet(json, eventId);
      if (driveInfo) {
        driveFolderUrl = driveInfo.folderUrl;
        spreadsheetUrl = driveInfo.spreadsheetUrl;
        spreadsheetId = driveInfo.spreadsheetId;
        _syncEventDriveUrlsToSupabase(eventId, driveFolderUrl, spreadsheetUrl, spreadsheetId);
      }
    }

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
        // 取得活動名稱
        var evRes = _supabaseGet("events", { id: "eq." + targetEventId, select: "id,title" });
        var targetEventTitle = (evRes && evRes[0] && evRes[0].title) ? evRes[0].title : targetEventId;

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
                        { type: "text", text: "恭喜您錄取！請留意我們後續會透過您留下的真實 LINE ID 將您加入出隊群組，並請於期限內完成繳費！\nCongratulations! We will invite you to the LINE group soon. Please complete the payment before the deadline!", wrap: true, margin: "md", size: "xs", color: "#666666" }
                      ]
                    },
                    footer: {
                      type: "box",
                      layout: "vertical",
                      contents: [{
                        type: "button",
                        style: "primary",
                        color: "#1DB446",
                        action: {
                          type: "uri",
                          label: "前往繳費系統 Pay",
                          uri: "https://liff.line.me/" + (LIFF_CHANNEL_ID || "2009217429") + "-u7OCkmQO"
                        }
                      }]
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

