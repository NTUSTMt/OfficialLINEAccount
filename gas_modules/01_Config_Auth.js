// ==============================================================================
// 🌲 野境戶外系統 GAS 模組 1：環境設定、認證與共通工具 (01_Config_Auth.js)
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
