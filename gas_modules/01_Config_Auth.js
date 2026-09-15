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

