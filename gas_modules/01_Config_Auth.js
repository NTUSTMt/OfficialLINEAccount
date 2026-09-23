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

// 全域常用中英欄位對照字典 (支援試算表純中文或純英文表頭自適應)
function _getGlobalColumnAliases(englishName) {
  var map = {
    "id": ["編號", "代號", "ID", "專屬碼", "單號", "序號"],
    "line_user_id": ["系統識別碼", "UID", "LINE UID", "User ID"],
    "name": ["姓名", "名字", "社員姓名", "稱呼", "聯絡人"],
    "gender": ["性別"],
    "line_id": ["Line ID", "LINE ID", "Line帳號", "LINE帳號", "自訂Line", "自訂LINE ID"],
    "email": ["電子郵件", "信箱", "Email", "E-mail"],
    "phone": ["電話", "聯絡電話", "手機", "行動電話"],
    "department": ["系所", "系級", "科系", "學系"],
    "student_id": ["學號"],
    "payment_status": ["繳費狀態", "對帳狀態", "付款狀態"],
    "membership_expires_at": ["社籍到期日", "到期日", "有效期限"],
    "birthday": ["生日", "出生年月日"],
    "id_card": ["身分證字號", "證件號碼", "居留證號", "身分證"],
    "address": ["地址", "聯絡地址", "住址"],
    "outdoor_experience": ["爬山經驗", "登山經驗", "百岳經歷", "戶外經驗"],
    "fitness_desc": ["體能狀況", "體能說明", "平時運動習慣"],
    "proof_urls": ["證明文件", "證照證明"],
    "emergency_contact_name": ["緊急聯絡人姓名", "緊急聯絡人", "聯絡人姓名"],
    "emergency_contact_rel": ["與緊急聯絡人關係", "緊急聯絡人關係", "關係"],
    "emergency_contact_phone": ["緊急聯絡人電話", "緊急聯絡電話"],
    "emergency_contact_address": ["緊急聯絡人地址", "緊急聯絡地址"],
    "medical_history": ["個人特殊病史", "個人特殊病史或過敏", "病史", "過敏史", "特殊病史"],
    "identity_status": ["身分", "身分狀態", "學生身分", "校內外身分"],
    "join_membership_intent": ["加入社員意願", "入社意願", "是否入社"],
    "officer_intent": ["擔任幹部意願", "幹部意願", "有意願擔任幹部"],
    "want_to_say": ["想說的話", "想說的話 I want to say...", "給幹部的話", "留言"],
    "is_official_member": ["是否為正式社員", "正式社員", "社員身分"],
    "is_officer": ["是否為幹部", "幹部身分"],
    "officer_role": ["幹部職稱", "幹部角色", "職稱"],
    "created_at": ["建立時間", "填寫時間", "建立日期"],
    "updated_at": ["更新時間", "最後更新", "修改時間"],
    // events
    "title": ["活動名稱", "活動標題", "名稱"],
    "fee": ["費用", "活動費用", "報名費", "金額"],
    "start_date": ["開始日期", "出發日期", "活動開始"],
    "end_date": ["結束日期", "回程日期", "活動結束"],
    "deadline": ["截止時間", "報名截止", "截止日期", "報名截止日"],
    "status": ["狀態", "活動狀態", "審核狀態", "報名狀態"],
    "summary": ["簡介", "活動簡介", "行程摘要"],
    "itinerary": ["詳細行程", "行程規劃", "行程"],
    "cover_image_url": ["封面圖", "封面照", "活動封面"],
    "drive_folder_url": ["雲端資料夾", "Drive 資料夾"],
    "spreadsheet_url": ["名冊試算表", "試算表網址"],
    // equipments & loans
    "total_qty": ["總數量", "總庫存"],
    "available_qty": ["剩餘數量", "可用庫存", "庫存"],
    "category": ["分類", "裝備類別", "器材類別"],
    "member_price_per_day": ["社員每日租金", "社員價"],
    "non_member_price_per_day": ["非社員每日租金", "非社員價"],
    "days": ["天數", "租借天數"],
    "purpose": ["用途", "活動用途"],
    "total_deposit": ["押金總額", "總押金", "押金"],
    "total_rent": ["租金總額", "總租金", "租金"],
    // payments
    "amount": ["金額", "繳費金額", "申報金額"],
    "bank_last5": ["後五碼", "帳號後五碼", "末五碼"],
    "proof_image_url": ["繳費憑證", "匯款證明", "水單圖片"]
  };
  return map[englishName] || null;
}

// 智慧表頭欄位尋找器 (優先以英文名精確比對，次以中文別名回退)
function _findHeaderCol(headers, englishName, aliases) {
  var idx = _findColByEnglishName(headers, englishName);
  if (idx > -1) return idx;
  if (!aliases) {
    aliases = _getGlobalColumnAliases(englishName);
  }
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
        var v = queryParams[k];
        var valStr = String(v);
        var encVal;
        if (valStr.indexOf("in.(") === 0 && valStr.slice(-1) === ")") {
          var inner = valStr.slice(4, -1);
          var items = inner.split(",");
          encVal = "in.(" + items.map(function(it) {
            return encodeURIComponent(decodeURIComponent(it.trim()));
          }).join(",") + ")";
        } else {
          var dotIdx = valStr.indexOf(".");
          var op = dotIdx > -1 ? valStr.substring(0, dotIdx) : "";
          if (["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "cs", "cd"].indexOf(op) > -1) {
            var rest = valStr.substring(dotIdx + 1);
            encVal = op + "." + encodeURIComponent(decodeURIComponent(rest));
          } else {
            encVal = encodeURIComponent(valStr);
          }
        }
        parts.push(encodeURIComponent(k) + "=" + encVal);
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

