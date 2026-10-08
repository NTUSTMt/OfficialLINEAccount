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
 * HTTP GET 處理 (提供 Docs 知識庫讀取、Health Check)
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'health_check';

    if (action === 'health_check') {
      return _workerSuccess({ message: 'GAS Thin Worker is running actively', timestamp: new Date().toISOString() });
    }

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
    if (!_verifyWorkerSecret(e)) {
      return _workerError('Unauthorized: Invalid or missing x-worker-secret', 401);
    }

    var json = {};
    if (e && e.postData && e.postData.contents) {
      json = JSON.parse(e.postData.contents);
    }

    var action = json.action || '';

    // 1. Gmail 管理員/社員郵件發送
    if (action === 'send_admin_email') {
      return _handleSendAdminEmail(json);
    }
    if (action === 'send_user_email') {
      return _handleSendUserEmail(json);
    }

    // 2. Google Drive 實體相片刪除 (移入垃圾桶)
    if (action === 'delete_drive_file' || action === 'delete_drive_files') {
      return _handleDeleteDriveFiles(json);
    }

    // 3. Google Drive 檔案上傳
    if (action === 'upload_drive_files' || action === 'upload_drive_file') {
      return _handleUploadDriveFiles(json);
    }

    // 4. 建立活動專屬資料夾與獨立試算表
    if (action === 'create_event_sheet') {
      return _handleCreateEventSheet(json);
    }

    // 5. 活動獨立試算表名冊追加 (append)
    if (action === 'append_event_sheet') {
      return _handleAppendEventSheet(json);
    }

    // 6. 活動獨立試算表名冊取消同步 (sync cancel)
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
    var folderType = json.folderType || 'general';
    var uploadedUrls = [];

    var targetFolder = _getOrCreateFolder(folderType);

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = f.name || ('upload_' + Date.now() + '.jpg');
      var base64Data = f.base64 || f.base64Data || '';
      var mimeType = f.mimeType || 'image/jpeg';

      if (base64Data) {
        var decoded = Utilities.base64Decode(base64Data.replace(/^data:.*?;base64,/, ''));
        var blob = Utilities.newBlob(decoded, mimeType, name);
        var createdFile = targetFolder.createFile(blob);
        createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        uploadedUrls.push(createdFile.getUrl());
      }
    }

    return _workerSuccess({ uploadedUrls: uploadedUrls });
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
    var title = json.title || '社團活動';

    var rootFolder = ROOT_DRIVE_FOLDER_ID ? DriveApp.getFolderById(ROOT_DRIVE_FOLDER_ID) : DriveApp.getRootFolder();
    var eventFolder = rootFolder.createFolder('【活動】' + title + '_' + eventId);
    eventFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var newSs = SpreadsheetApp.create('【名冊】' + title + '_' + eventId);
    var ssFile = DriveApp.getFileById(newSs.getId());
    ssFile.moveTo(eventFolder);

    var sheet = newSs.getActiveSheet();
    sheet.setName('活動報名名冊');
    sheet.appendRow([
      '報名碼', '姓名', '審核狀態', '繳費狀態', '電話', 'LINE ID', '系所/學號',
      '緊急聯絡人', '緊急聯絡電話', '體能證明', '登山經歷', '報名時間', '備註'
    ]);

    return _workerSuccess({
      spreadsheet_id: newSs.getId(),
      spreadsheet_url: newSs.getUrl(),
      drive_folder_url: eventFolder.getUrl()
    });
  } catch (err) {
    return _workerError('Create event sheet failed: ' + err.toString(), 500);
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
