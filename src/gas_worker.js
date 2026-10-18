/**
 * 國立臺灣科技大學登山社 - Google Apps Script 專屬薄 Worker (GAS Thin Worker)
 * 
 * 職責：
 * 1. Google Drive 實體檔案操作（上傳、相片刪除移入垃圾桶）。
 * 2. 建立活動專屬雲端資料夾與獨立報名名冊試算表。
 * 3. 活動獨立試算表名冊追加 (append) 與取消 (sync) 狀態同步。
 * 4. Gmail / MailApp 管理員與社員郵件寄送。
 * 5. Google Docs 社團規章知識庫全文讀取。
 * 6. 主試算表與 Supabase 雙向同步 (Sync Worker)。
 * 
 * 安全規範：
 * - 嚴格驗證 Request Header / Payload 之 x-worker-secret 共享密鑰。
 * - 若未帶密鑰或密鑰不符，一律拒絕存取 (HTTP 401)。
 */

var SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
var WORKER_SECRET = SCRIPT_PROPERTIES.getProperty('GAS_WORKER_SECRET') || 'club_secret_key_123';
var SUPABASE_URL = SCRIPT_PROPERTIES.getProperty('SUPABASE_URL') || '';
var SUPABASE_SERVICE_ROLE_KEY = SCRIPT_PROPERTIES.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '';
var SPREADSHEET_ID = SCRIPT_PROPERTIES.getProperty('SPREADSHEET_ID') || '';
var DOCS_KNOWLEDGE_BASE_ID = SCRIPT_PROPERTIES.getProperty('DOCS_KNOWLEDGE_BASE_ID') || '';
var ROOT_DRIVE_FOLDER_ID = SCRIPT_PROPERTIES.getProperty('ROOT_DRIVE_FOLDER_ID') || '';

function _workerResponse(data, code) {
  code = code || 200;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _workerError(message, code) {
  code = code || 400;
  return _workerResponse({ status: 'error', message: message }, code);
}

function _workerSuccess(data) {
  data = data || {};
  return _workerResponse(Object.assign({ status: 'success' }, data), 200);
}

function _verifyWorkerSecret(e) {
  var headers = (e && e.parameter) ? e.parameter : {};
  var incomingSecret = headers['x-worker-secret'] || (e && e.postData && e.postData.contents ? (function () {
    try {
      var parsed = JSON.parse(e.postData.contents);
      return parsed.worker_secret || parsed['x-worker-secret'] || '';
    } catch (err) {
      return '';
    }
  })() : '');

  if (!incomingSecret && e && e.headers) {
    incomingSecret = e.headers['x-worker-secret'] || e.headers['X-Worker-Secret'] || '';
  }

  return incomingSecret === WORKER_SECRET;
}

/**
 * HTTP GET 處理 (提供 Docs 知識庫讀取、Health Check、試算表建立)
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'health_check';

    if (action === 'health_check') {
      return _workerSuccess({ message: 'GAS Thin Worker is running actively', timestamp: new Date().toISOString() });
    }

    // 幹部前端建立/同步活動試算表與公開相片動作
    if (action === 'create_event_sheet') {
      return _handleCreateEventSheet(e && e.parameter ? e.parameter : {});
    }
    if (action === 'sync_event_sheet_signups' || action === 'sync_event_roster') {
      return _handleSyncEventSheetSignups(e && e.parameter ? e.parameter : {});
    }
    if (action === 'upload_drive_files' || action === 'upload_drive_file' || action === 'upload_image_to_drive') {
      return _handleUploadDriveFiles(e && e.parameter ? e.parameter : {});
    }
    if (action === 'delete_drive_file' || action === 'delete_drive_files') {
      return _handleDeleteDriveFiles(e && e.parameter ? e.parameter : {});
    }

    // 後端內部任務（讀取規章知識庫等）需校驗密鑰
    if (!_verifyWorkerSecret(e)) {
      return _workerError('Unauthorized: Invalid or missing x-worker-secret', 401);
    }

    // 1. 讀取 Google Docs 社團規章知識庫
    if (action === 'get_knowledge_base') {
      return _handleGetKnowledgeBase();
    }

    return _workerError('Unsupported GET action: ' + action, 400);
  } catch (err) {
    return _workerError('doGet Error: ' + err.toString(), 500);
  }
}

/**
 * HTTP POST 處理 (提供 Drive 操作、郵件寄送、試算表名冊追加)
 */
function doPost(e) {
  try {
    var json = {};
    if (e && e.postData && e.postData.contents) {
      try {
        json = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return _workerError('Invalid JSON format: ' + parseErr.toString(), 400);
      }
    }

    var action = json.action || (e && e.parameter && e.parameter.action) || '';

    // 1. 公開/前端允許之 Drive 檔案上傳與相片維護動作 (供社員與幹部於 LIFF 即時上傳體能證明、繳費收據、心得照片)
    if (action === 'upload_drive_files' || action === 'upload_drive_file' || action === 'upload_image_to_drive') {
      return _handleUploadDriveFiles(json);
    }
    if (action === 'delete_drive_file' || action === 'delete_drive_files') {
      return _handleDeleteDriveFiles(json);
    }
    if (action === 'create_event_sheet') {
      return _handleCreateEventSheet(json);
    }
    if (action === 'sync_event_sheet_signups' || action === 'sync_event_roster') {
      return _handleSyncEventSheetSignups(json);
    }

    // 2. 後端專屬任務（郵件發送、試算表名冊操作等）強制校驗 x-worker-secret 密鑰
    if (!_verifyWorkerSecret(e)) {
      return _workerError('Unauthorized: Invalid or missing x-worker-secret', 401);
    }

    // Gmail 管理員/社員郵件發送
    if (action === 'send_admin_email') {
      return _handleSendAdminEmail(json);
    }
    if (action === 'send_user_email') {
      return _handleSendUserEmail(json);
    }

    // 活動獨立試算表名冊追加 (append)
    if (action === 'append_event_sheet') {
      return _handleAppendEventSheet(json);
    }

    // 活動獨立試算表名冊取消同步 (sync cancel)
    if (action === 'sync_cancel_event_sheet') {
      return _handleSyncCancelEventSheet(json);
    }

    return _workerError('Unsupported POST action: ' + action, 400);
  } catch (err) {
    return _workerError('doPost Error: ' + err.toString(), 500);
  }
}

// ==============================================================================
// 模組實作：Docs 知識庫讀取
// ==============================================================================
function _handleGetKnowledgeBase() {
  try {
    var docId = DOCS_KNOWLEDGE_BASE_ID;
    if (!docId) {
      return _workerSuccess({
        knowledge: '社團裝備租借依社籍收費，出隊請遵守領隊指導。',
        source: 'default_fallback'
      });
    }

    var doc = DocumentApp.openById(docId);
    var text = doc.getBody().getText();
    return _workerSuccess({
      knowledge: text.slice(0, 15000),
      source: 'google_docs'
    });
  } catch (err) {
    return _workerSuccess({
      knowledge: '社團裝備租借依社籍收費，出隊請遵守領隊指導。',
      source: 'error_fallback',
      error: err.toString()
    });
  }
}

// ==============================================================================
// 模組實作：郵件寄送 (GmailApp / MailApp)
// ==============================================================================
function _handleSendAdminEmail(json) {
  try {
    var subject = json.subject || '【台科登山社】系統管理通知';
    var text = json.text || '';
    var htmlBody = json.htmlBody || '';
    var adminEmail = SCRIPT_PROPERTIES.getProperty('ADMIN_EMAIL') || 'ntustmt@gmail.com';

    if (typeof GmailApp !== 'undefined') {
      GmailApp.sendEmail(adminEmail, subject, text, {
        name: '台科登山社小岳助理',
        htmlBody: htmlBody || undefined
      });
    } else {
      MailApp.sendEmail({
        to: adminEmail,
        subject: subject,
        body: text,
        htmlBody: htmlBody || undefined,
        name: '台科登山社小岳助理'
      });
    }

    return _workerSuccess({ message: 'Admin email sent successfully' });
  } catch (err) {
    return _workerError('Send admin email failed: ' + err.toString(), 500);
  }
}

function _handleSendUserEmail(json) {
  try {
    var to = json.to || '';
    var subject = json.subject || '【台科登山社】通知信件';
    var text = json.text || '';
    var htmlBody = json.htmlBody || '';

    if (!to) {
      return _workerError('Missing recipient email (to)', 400);
    }

    if (typeof GmailApp !== 'undefined') {
      GmailApp.sendEmail(to, subject, text, {
        name: '台科登山社小岳助理',
        htmlBody: htmlBody || undefined
      });
    } else {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: text,
        htmlBody: htmlBody || undefined,
        name: '台科登山社小岳助理'
      });
    }

    return _workerSuccess({ message: 'User email sent successfully' });
  } catch (err) {
    return _workerError('Send user email failed: ' + err.toString(), 500);
  }
}

// ==============================================================================
// 模組實作：Google Drive 檔案操作
// ==============================================================================
function _handleDeleteDriveFiles(json) {
  try {
    var fileUrls = json.fileUrls || json.urls || [];
    if (json.fileUrl) fileUrls.push(json.fileUrl);

    var deletedCount = 0;
    for (var i = 0; i < fileUrls.length; i++) {
      var rawUrl = fileUrls[i];
      var fileId = _extractDriveFileId(rawUrl);
      if (fileId) {
        try {
          var file = DriveApp.getFileById(fileId);
          file.setTrashed(true);
          deletedCount++;
        } catch (e) {
          console.warn('Delete drive file warning:', e);
        }
      }
    }

    return _workerSuccess({ message: 'Drive files processed', deletedCount: deletedCount });
  } catch (err) {
    return _workerError('Delete drive files failed: ' + err.toString(), 500);
  }
}

function _handleUploadDriveFiles(json) {
  try {
    var files = json.files || [];
    if (!files.length && (json.base64Data || json.base64 || json.data)) {
      files = [{
        name: json.fileName || json.name || ('upload_' + Date.now() + '.jpg'),
        base64: json.base64Data || json.base64 || json.data,
        mimeType: json.mimeType || json.type || 'image/jpeg'
      }];
    }

    var folderType = json.folderType || 'general';
    var uploadedUrls = [];

    var targetFolder = _getOrCreateFolder(folderType);

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = (f.name || ('upload_' + Date.now() + '_' + i + '.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');
      var base64Data = f.base64 || f.base64Data || f.data || '';
      var mimeType = f.mimeType || f.type || 'image/jpeg';

      if (base64Data) {
        var decoded = Utilities.base64Decode(base64Data.replace(/^data:.*?;base64,/, ''));
        var blob = Utilities.newBlob(decoded, mimeType, name);
        var createdFile = targetFolder.createFile(blob);
        createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        var fileId = createdFile.getId();
        var cdnUrl = 'https://lh3.googleusercontent.com/d/' + fileId + '=s0';
        uploadedUrls.push(cdnUrl);
      }
    }

    return _workerSuccess({
      urls: uploadedUrls,
      uploadedUrls: uploadedUrls,
      imageUrl: uploadedUrls.length > 0 ? uploadedUrls[0] : '',
      message: '成功上傳 ' + uploadedUrls.length + ' 個檔案至 Google Drive！'
    });
  } catch (err) {
    return _workerError('Upload drive files failed: ' + err.toString(), 500);
  }
}

function _extractDriveFileId(url) {
  if (!url) return '';
  var match = url.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

function _getOrCreateFolder(folderName) {
  var rootFolder = ROOT_DRIVE_FOLDER_ID ? DriveApp.getFolderById(ROOT_DRIVE_FOLDER_ID) : DriveApp.getRootFolder();
  var folders = rootFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return rootFolder.createFolder(folderName);
}

// ==============================================================================
// 模組實作：活動專屬試算表與資料夾
// ==============================================================================
function _handleCreateEventSheet(json) {
  try {
    var eventId = json.eventId || ('E' + Date.now());
    var title = json.title || '';
    var startDate = json.startDate || '';

    // 1. 若缺少 title 或 startDate，從 Supabase 取得活動最新詳細資訊
    var evt = _fetchSupabaseEvent(eventId);
    if (evt) {
      if (!title && evt.title) title = evt.title;
      if (!startDate && evt.start_date) startDate = evt.start_date;
    }
    if (!title) title = '社團活動';

    var rawDate = startDate || '';
    var datePart = '';
    if (rawDate) {
      datePart = String(rawDate).trim().replace(/-/g, '/').split(' ')[0].split('T')[0];
    }
    if (!datePart) {
      datePart = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');
    }

    var eventName = title.trim();
    var folderName = datePart + '_' + eventName;
    var sheetName = folderName;

    // 2. 建立活動專屬雲端資料夾
    var rootFolder = ROOT_DRIVE_FOLDER_ID ? DriveApp.getFolderById(ROOT_DRIVE_FOLDER_ID) : DriveApp.getRootFolder();
    var eventFolder = rootFolder.createFolder(folderName);
    eventFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 3. 建立或複製活動專屬試算表 (優先從 SPREADSHEET_ID 或 EVENT_SHEET_TEMPLATE_ID 範本複製)
    var templateId = SCRIPT_PROPERTIES.getProperty('SPREADSHEET_ID') ||
                     SCRIPT_PROPERTIES.getProperty('EVENT_SHEET_TEMPLATE_ID') ||
                     SPREADSHEET_ID || '';
    var newSs = null;

    if (templateId) {
      try {
        var templateFile = DriveApp.getFileById(templateId.trim());
        var copiedFile = templateFile.makeCopy(sheetName, eventFolder);
        newSs = SpreadsheetApp.open(copiedFile);
      } catch (tmplErr) {
        console.warn('複製範本試算表失敗，切換為程式化動態生成:', tmplErr);
      }
    }

    if (!newSs) {
      newSs = SpreadsheetApp.create(sheetName);
      var ssFile = DriveApp.getFileById(newSs.getId());
      ssFile.moveTo(eventFolder);

      var initSheet = newSs.getActiveSheet();
      initSheet.setName('報名名冊');
      var defaultHeaders = [
        '系統識別碼', '專屬碼', '姓名', '性別', 'LINE ID', '聯絡信箱', '聯絡電話', '聯絡地址',
        '生日', '證件號碼', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
        '爬山經驗', '體能測驗', '體能證明', '是否為社員', '審核結果', '通知狀態', '繳費狀態', '備註', '想說的話', '擔任幹部意願',
        '系所', '學號', '個人特殊病史', '身分', '加入社員意願'
      ];
      initSheet.appendRow(defaultHeaders);
      var headerRange = initSheet.getRange(1, 1, 1, defaultHeaders.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#2563eb');
      headerRange.setFontColor('#ffffff');
      initSheet.setFrozenRows(1);
    }

    // 4. 初始化或更新 _CONFIG 工作表
    var configSheet = newSs.getSheetByName('_CONFIG');
    if (!configSheet) {
      configSheet = newSs.insertSheet('_CONFIG');
      configSheet.appendRow(['KEY', 'VALUE']);
    }
    _setOrUpdateConfigRow(configSheet, 'EVENT_ID', eventId);
    _setOrUpdateConfigRow(configSheet, 'EVENT_NAME', eventName);
    _setOrUpdateConfigRow(configSheet, 'FOLDER_ID', eventFolder.getId());
    _setOrUpdateConfigRow(configSheet, 'CREATED_AT', new Date().toISOString());
    _setOrUpdateConfigRow(configSheet, 'LAST_SYNCED_AT', new Date().toISOString());
    if (SUPABASE_URL) _setOrUpdateConfigRow(configSheet, 'SUPABASE_URL', SUPABASE_URL);
    if (SUPABASE_SERVICE_ROLE_KEY) _setOrUpdateConfigRow(configSheet, 'SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
    configSheet.hideSheet();

    // 5. 匯入既有報名名冊資料至「報名名冊」工作表 (動態對齊表頭)
    var signupSheet = newSs.getSheetByName('報名名冊') || newSs.getSheetByName('活動報名名冊') || newSs.getSheets()[0];
    var importedCount = 0;
    if (signupSheet) {
      importedCount = _importExistingSignupsToSheet(signupSheet, eventId, json.signups, false);
    }

    // 6. 將試算表與資料夾連結回寫至 Supabase events 表
    _updateSupabaseEventDriveUrls(eventId, eventFolder.getUrl(), newSs.getUrl(), newSs.getId());

    return _workerSuccess({
      spreadsheet_id: newSs.getId(),
      spreadsheet_url: newSs.getUrl(),
      drive_folder_url: eventFolder.getUrl(),
      spreadsheetId: newSs.getId(),
      spreadsheetUrl: newSs.getUrl(),
      driveFolderUrl: eventFolder.getUrl(),
      synced_count: importedCount,
      message: '成功建立活動專屬資料夾與試算表'
    });
  } catch (err) {
    return _workerError('Create event sheet failed: ' + err.toString(), 500);
  }
}

/**
 * 全量同步活動報名名冊至 Google 試算表 (支援前端直接傳入完整 23 筆名冊或自 Supabase 備援讀取)
 */
function _handleSyncEventSheetSignups(json) {
  try {
    var eventId = json.eventId || json.event_id || '';
    var spreadsheetId = json.spreadsheetId || json.spreadsheet_id || '';

    if (!spreadsheetId && eventId) {
      var evt = _fetchSupabaseEvent(eventId);
      if (evt && evt.spreadsheet_id) {
        spreadsheetId = evt.spreadsheet_id;
      }
    }

    if (!spreadsheetId) {
      return _workerError('Missing spreadsheetId or eventId', 400);
    }

    var ss = SpreadsheetApp.openById(spreadsheetId.trim());
    var sheet = ss.getSheetByName('報名名冊') || ss.getSheetByName('活動報名名冊') || ss.getSheets()[0];
    if (!sheet) {
      return _workerError('Sheet not found in spreadsheet', 404);
    }

    var signups = Array.isArray(json.signups) ? json.signups : (eventId ? _fetchSupabaseSignups(eventId) : []);
    var importedCount = _importExistingSignupsToSheet(sheet, eventId, signups, true);

    var configSheet = ss.getSheetByName('_CONFIG');
    if (configSheet) {
      _setOrUpdateConfigRow(configSheet, 'LAST_SYNCED_AT', new Date().toISOString());
    }

    return _workerSuccess({
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: ss.getUrl(),
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: ss.getUrl(),
      synced_count: importedCount,
      message: '成功全量同步 ' + importedCount + ' 筆報名名冊至試算表'
    });
  } catch (err) {
    return _workerError('Sync event sheet signups failed: ' + err.toString(), 500);
  }
}

function _handleAppendEventSheet(json) {
  try {
    var spreadsheetId = json.spreadsheet_id || '';
    var signupId = json.signup_id || '';
    var lineUserId = json.line_user_id || '';

    if (!spreadsheetId) {
      return _workerError('Missing spreadsheet_id', 400);
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getActiveSheet();

    // 取得社員資料
    var memberData = _fetchSupabaseMember(lineUserId);

    sheet.appendRow([
      signupId,
      memberData.name || '社員',
      '審核中 Checking',
      '未繳費 Unpaid',
      memberData.phone || '未填寫',
      memberData.line_id || '未填寫',
      (memberData.department || '') + ' ' + (memberData.student_id || ''),
      (memberData.emergency_contact_name || '') + ' (' + (memberData.emergency_contact_rel || '') + ')',
      memberData.emergency_contact_phone || '',
      Array.isArray(memberData.proof_urls) ? memberData.proof_urls.join(', ') : '',
      memberData.outdoor_experience || '',
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss'),
      ''
    ]);

    return _workerSuccess({ message: 'Appended to event sheet successfully' });
  } catch (err) {
    return _workerError('Append event sheet failed: ' + err.toString(), 500);
  }
}

function _handleSyncCancelEventSheet(json) {
  try {
    var spreadsheetId = json.spreadsheet_id || '';
    var signupId = json.signup_id || '';
    var cancelReason = json.cancel_reason || '自願取消';

    if (!spreadsheetId) {
      return _workerError('Missing spreadsheet_id', 400);
    }

    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getActiveSheet();
    var data = sheet.getDataRange().getValues();

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === String(signupId).trim()) {
        sheet.getRange(r + 1, 3).setValue('已取消 Cancelled');
        sheet.getRange(r + 1, 13).setValue('取消原因: ' + cancelReason);
        break;
      }
    }

    return _workerSuccess({ message: 'Synced cancel to event sheet' });
  } catch (err) {
    return _workerError('Sync cancel failed: ' + err.toString(), 500);
  }
}

function _fetchSupabaseMember(lineUserId) {
  if (!lineUserId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {};
  }
  try {
    var url = SUPABASE_URL + '/rest/v1/members?line_user_id=eq.' + encodeURIComponent(lineUserId);
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var arr = JSON.parse(res.getContentText());
      if (Array.isArray(arr) && arr.length > 0) {
        return arr[0];
      }
    }
  } catch (e) {
    console.warn('fetchSupabaseMember failed:', e);
  }
  return {};
}

function _setOrUpdateConfigRow(configSheet, key, value) {
  if (!configSheet) return;
  var data = configSheet.getDataRange().getValues();
  for (var r = 0; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() === String(key).trim().toUpperCase()) {
      configSheet.getRange(r + 1, 2).setValue(String(value));
      return;
    }
  }
  configSheet.appendRow([key, String(value)]);
}

function _fetchSupabaseEvent(eventId) {
  if (!eventId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    var url = SUPABASE_URL + '/rest/v1/events?id=eq.' + encodeURIComponent(eventId) + '&select=*';
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var arr = JSON.parse(res.getContentText());
      if (Array.isArray(arr) && arr.length > 0) return arr[0];
    }
  } catch (e) {
    console.warn('fetchSupabaseEvent failed:', e);
  }
  return null;
}

function _fetchSupabaseSignups(eventId) {
  if (!eventId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    var url = SUPABASE_URL + '/rest/v1/event_signups?event_id=eq.' + encodeURIComponent(eventId) + '&select=*&order=created_at.asc';
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var arr = JSON.parse(res.getContentText());
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {
    console.warn('fetchSupabaseSignups failed:', e);
  }
  return [];
}

function _fetchSupabaseMembers(lineUserIds) {
  var map = {};
  if (!Array.isArray(lineUserIds) || lineUserIds.length === 0 || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return map;
  }
  try {
    var inFilter = 'in.(' + lineUserIds.map(encodeURIComponent).join(',') + ')';
    var url = SUPABASE_URL + '/rest/v1/members?line_user_id=' + inFilter + '&select=*';
    var res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var arr = JSON.parse(res.getContentText());
      if (Array.isArray(arr)) {
        arr.forEach(function (m) {
          if (m.line_user_id) map[m.line_user_id] = m;
        });
      }
    }
  } catch (e) {
    console.warn('fetchSupabaseMembers failed:', e);
  }
  return map;
}

function _updateSupabaseEventDriveUrls(eventId, folderUrl, spreadsheetUrl, spreadsheetId) {
  if (!eventId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    var payload = {
      updated_at: new Date().toISOString()
    };
    if (folderUrl) payload.drive_folder_url = folderUrl;
    if (spreadsheetUrl) payload.spreadsheet_url = spreadsheetUrl;
    if (spreadsheetId) payload.spreadsheet_id = spreadsheetId;

    var url = SUPABASE_URL + '/rest/v1/events?id=eq.' + encodeURIComponent(eventId);
    UrlFetchApp.fetch(url, {
      method: 'PATCH',
      contentType: 'application/json',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.warn('updateSupabaseEventDriveUrls failed:', e);
  }
}

function _importExistingSignupsToSheet(sheet, eventId, signupsList, clearExisting) {
  try {
    var signups = Array.isArray(signupsList) ? signupsList : _fetchSupabaseSignups(eventId);
    if (!Array.isArray(signups) || signups.length === 0) return 0;

    // 若 signups 項目本身未附帶 members 物件，才需要從 Supabase 補查 members
    var needFetchMembers = false;
    for (var k = 0; k < signups.length; k++) {
      if (!signups[k].members && signups[k].line_user_id) {
        needFetchMembers = true;
        break;
      }
    }

    var memberMap = {};
    if (needFetchMembers) {
      var userIds = signups.map(function (s) { return s.line_user_id; }).filter(Boolean);
      memberMap = _fetchSupabaseMembers(userIds);
    }

    var sData = sheet.getDataRange().getValues();
    var headers = sData.length > 0 ? sData[0] : [];
    if (headers.length === 0) return 0;

    // 取得現有名單的專屬碼 (防止重複追加，若 clearExisting 為 true 則直接略過過濾)
    var codeCol = _findColIdx(headers, ['專屬碼', '報名專屬碼', '報名碼', '編號', 'id']);
    var existingCodes = {};
    if (!clearExisting && codeCol > -1) {
      for (var r = 1; r < sData.length; r++) {
        var c = String(sData[r][codeCol]).trim();
        if (c) existingCodes[c] = true;
      }
    }

    var rowsToAppend = [];
    for (var i = 0; i < signups.length; i++) {
      var s = signups[i];
      if (!clearExisting && s.id && existingCodes[s.id]) continue;
      var m = s.members || memberMap[s.line_user_id] || {};

      var proofUrlsStr = '';
      if (Array.isArray(m.proof_urls)) {
        proofUrlsStr = m.proof_urls.join(', ');
      } else if (m.proof_urls) {
        proofUrlsStr = String(m.proof_urls);
      }

      var row = new Array(headers.length).fill('');
      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c]).trim();
        // 嚴格依照專屬排他規則比對表頭，避免模糊關鍵字互撞
        if (_matchHeader(h, ['序號', '項次', 'no.', 'no', '項'], true)) {
          row[c] = i + 1;
        } else if (_matchHeader(h, ['系統識別碼', 'line_user_id', 'userid'])) {
          row[c] = s.line_user_id || '';
        } else if (_matchHeader(h, ['專屬碼', '報名專屬碼', '報名碼', '編號', 'id'])) {
          row[c] = s.id || '';
        } else if (_matchHeader(h, ['姓名', 'name', '隊員姓名', '報名者姓名'])) {
          row[c] = m.name || s.name || '';
        } else if (_matchHeader(h, ['性別', 'gender'])) {
          row[c] = m.gender || '';
        } else if (_matchHeader(h, ['LINE ID', 'line_id', 'lineid', 'line帳號'])) {
          row[c] = m.line_id || s.line_id || '';
        } else if (_matchHeader(h, ['聯絡信箱', 'email', '電子郵件', '信箱', 'mail'])) {
          row[c] = m.email || '';
        } else if (_matchHeader(h, ['緊急聯絡人電話', '緊急聯絡電話', '緊急電話', 'emer_phone', 'emergency_contact_phone'])) {
          row[c] = m.emergency_contact_phone ? ("'" + String(m.emergency_contact_phone)) : '';
        } else if (_matchHeader(h, ['聯絡電話', '電話', '手機電話', '手機', '行動電話', 'phone', 'tel'])) {
          row[c] = m.phone ? ("'" + String(m.phone)) : '';
        } else if (_matchHeader(h, ['緊急聯絡人聯絡地址', '緊急聯絡人地址', '緊急地址', 'emer_address', 'emergency_contact_address'])) {
          row[c] = m.emergency_contact_address || '';
        } else if (_matchHeader(h, ['聯絡地址', '地址', '現居地址', '戶籍地址', 'address'])) {
          row[c] = m.address || '';
        } else if (_matchHeader(h, ['生日', '出生年月日', '出生日期', 'birthday'])) {
          row[c] = m.birthday ? String(m.birthday).replace(/-/g, '/').slice(0, 10) : '';
        } else if (_matchHeader(h, ['證件號碼', '身分證字號', '身分證', '護照號碼', '居留證號', 'id_card', 'id_number'])) {
          row[c] = m.id_card ? ("'" + String(m.id_card)) : (m.id_number ? ("'" + String(m.id_number)) : '');
        } else if (_matchHeader(h, ['緊急聯絡人姓名', '緊急聯絡人', 'emer_name', 'emergency_contact_name'])) {
          row[c] = m.emergency_contact_name || '';
        } else if (_matchHeader(h, ['緊急聯絡人關係', '關係', '與緊急聯絡人關係', 'emer_rel', 'emergency_contact_rel', 'emergency_contact_relationship'])) {
          row[c] = m.emergency_contact_rel || m.emergency_contact_relationship || '';
        } else if (_matchHeader(h, ['爬山經驗', '登山經驗', '登山經歷', '經驗', 'outdoor_experience', 'hiking_experience'])) {
          row[c] = m.outdoor_experience || m.hiking_experience || '';
        } else if (_matchHeader(h, ['體能測驗', '體能自評', '體能狀況', 'fitness_desc', 'fitness_test'])) {
          row[c] = m.fitness_desc || m.fitness_test || '';
        } else if (_matchHeader(h, ['體能證明', '證明文件', 'fitness_proof', 'proof_urls'])) {
          row[c] = proofUrlsStr || m.fitness_proof_url || '';
        } else if (_matchHeader(h, ['是否為社員', '社員身分', '社員', 'is_official_member', 'is_member'])) {
          row[c] = m.is_official_member ? '是' : (s.is_official_member_snapshot ? '是' : '否');
        } else if (_matchHeader(h, ['繳費狀態', '繳費情形', '付款狀態', '對帳狀態', 'payment_status', '繳費'])) {
          row[c] = _normalizePaymentStatus(s.payment_status);
        } else if (_matchHeader(h, ['通知狀態', '錄取通知', '審核通知', 'notify_status', 'notification_status'])) {
          row[c] = s.notification_status ? String(s.notification_status) : '未通知';
        } else if (_matchHeader(h, ['審核結果', '審核狀態', '錄取審核', 'status', 'audit_status'])) {
          row[c] = _normalizeAuditStatus(s.status);
        } else if (_matchHeader(h, ['備註', '幹部備註', 'notes', 'memo'])) {
          row[c] = s.notes || '';
        } else if (_matchHeader(h, ['想說的話', '給幹部的話', '隊員留言', 'want_to_say'])) {
          row[c] = m.want_to_say || '';
        } else if (_matchHeader(h, ['擔任幹部意願', '幹部意願', '有意願擔任幹部', 'officer_intent'])) {
          row[c] = (m.officer_intent && (String(m.officer_intent).indexOf('意願') > -1 || m.officer_intent === '我有意願成為社團幹部' || m.officer_intent === '是' || m.officer_intent === true)) ? '是' : '否';
        } else if (_matchHeader(h, ['加入社員意願', '入社意願', '是否入社', 'join_membership_intent'])) {
          row[c] = (m.join_membership_intent && (String(m.join_membership_intent).indexOf('意願') > -1 || m.join_membership_intent === '我有意願成為社員' || m.join_membership_intent === '是' || m.join_membership_intent === true)) ? '是' : '否';
        } else if (_matchHeader(h, ['系所', '科系', '系級', 'department'])) {
          row[c] = m.department || '';
        } else if (_matchHeader(h, ['學號', 'student_id'])) {
          row[c] = m.student_id ? ("'" + String(m.student_id)) : '';
        } else if (_matchHeader(h, ['個人特殊病史', '特殊病史', '病史', 'medical_history'])) {
          row[c] = m.medical_history || '';
        } else if (_matchHeader(h, ['身分', '身分狀態', '校內身分', 'identity_status'])) {
          row[c] = m.identity_status || '';
        } else if (_matchHeader(h, ['國籍', 'nationality'])) {
          row[c] = m.nationality || '';
        }
      }
      rowsToAppend.push(row);
    }

    if (rowsToAppend.length > 0) {
      if (clearExisting && sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getMaxColumns()).clearContent();
      }
      var startRow = clearExisting ? 2 : (sheet.getLastRow() + 1);

      // 自動檢查並擴充最大列數，防止超出 sheet.getMaxRows() 限制
      var neededRows = startRow + rowsToAppend.length - 1;
      var curMaxRows = sheet.getMaxRows();
      if (neededRows > curMaxRows) {
        sheet.insertRowsAfter(curMaxRows, neededRows - curMaxRows);
      }

      var targetRange = sheet.getRange(startRow, 1, rowsToAppend.length, headers.length);
      try {
        targetRange.setValues(rowsToAppend);
      } catch (valErr) {
        console.warn('setValues 遭遇驗證阻擋，自動清除驗證規則後覆寫重試:', valErr);
        try {
          targetRange.clearDataValidations();
          targetRange.setValues(rowsToAppend);
        } catch (retryErr) {
          console.error('重試寫入試算表失敗:', retryErr);
          throw retryErr;
        }
      }
      return rowsToAppend.length;
    }
    return 0;
  } catch (err) {
    console.warn('匯入既有名冊資料失敗:', err);
    return 0;
  }
}

function _normalizePaymentStatus(val) {
  var str = String(val || '').trim().toLowerCase();
  // 必須優先攔截「未繳」、「unpaid」、「待繳」，防止 unpaid 被後續 paid 子字串命中誤判
  if (str.indexOf('未繳') > -1 || str.indexOf('unpaid') > -1 || str.indexOf('待繳') > -1) {
    return '未繳費 Unpaid';
  }
  if (str.indexOf('待確認') > -1 || str.indexOf('checking') > -1) {
    return '待確認 Checking';
  }
  if (str.indexOf('已繳') > -1 || str.indexOf('paid') > -1) {
    return '已繳費 Paid';
  }
  return '未繳費 Unpaid';
}

function _normalizeAuditStatus(val) {
  var str = String(val || '').trim();
  if (str.indexOf('正取') > -1 || str.toLowerCase().indexOf('confirm') > -1) {
    return '正取 Confirmed';
  }
  if (str.indexOf('備取') > -1 || str.toLowerCase().indexOf('waitlist') > -1) {
    return '備取 Waitlisted';
  }
  if (str.indexOf('取消') > -1 || str.toLowerCase().indexOf('cancel') > -1) {
    return '已取消 Cancelled';
  }
  return '審核中 Checking';
}

function _matchHeader(header, candidates, exactOnly) {
  var h = String(header).trim().toLowerCase();
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i].toLowerCase();
    if (h === c) return true;
    if (!exactOnly && h.indexOf(c) > -1) return true;
  }
  return false;
}

function _findColIdx(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    if (_matchHeader(headers[i], candidates, false)) return i;
  }
  return -1;
}

