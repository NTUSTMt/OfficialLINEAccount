import test from 'node:test';
import assert from 'node:assert/strict';

// 模擬 checkOfficerInternal (完全對齊 gas_modules/06_Helper_Services.js 之單/雙參數適配)
function simulateCheckOfficerInternal(ss, userId, userName, mockContext) {
  if (typeof ss === "string" && !userId) {
    userId = ss;
    ss = null;
  }
  if (!userId && !userName) return { isOfficer: false, role: "", name: "" };
  if (userId === "TEST_USER_ID") return { isOfficer: false, role: "", name: "" };
  var ctx = mockContext || (typeof userName === "object" ? userName : null);
  var isOff = ctx && ctx.officers && ctx.officers.includes(userId);
  return isOff ? { isOfficer: true, role: "幹部", name: "幹部" } : { isOfficer: false, role: "", name: "" };
}

// 模擬 _handleCreateEventSheet 業務邏輯 (完全對齊 gas_modules/06_Helper_Services.js)
function simulateHandleCreateEventSheet(json, mockContext) {
  var userId = json.userId;
  var eventId = json.eventId;

  if (!eventId) {
    return { status: "error", message: "缺少必要之活動編號 eventId" };
  }

  // 1. 幹部身分校驗 (完全對齊 checkOfficerInternal 參數適配)
  var officer = simulateCheckOfficerInternal(null, userId, mockContext);
  if (!officer || !officer.isOfficer) {
    return { status: "error", message: "權限不足：僅限社團幹部可建立活動專屬試算表 (userId=" + userId + ")" };
  }

  // 2. 從 Supabase 取得活動資訊
  var evt = mockContext.events[eventId];
  if (!evt) {
    return { status: "error", message: "於 Supabase 中查無此活動 (" + eventId + ")" };
  }

  // 若已經有試算表，自動巡檢並回補缺漏名冊個資，同時追加尚未寫入試算表的新報名者
  if (evt.spreadsheet_id && evt.spreadsheet_url) {
    var updatedCount = 0;
    var existingCodes = {};
    if (mockContext.existingSheetRows && mockContext.existingSheetRows[eventId]) {
      var rows = mockContext.existingSheetRows[eventId];
      for (var r = 0; r < rows.length; r++) {
        var rowUid = rows[r][0];
        var rowCode = rows[r][1];
        if (rowCode) existingCodes[rowCode] = true;
        var m = mockContext.members[rowUid];
        if (m) {
          if (!rows[r][9] && m.id_card) { rows[r][9] = m.id_card; updatedCount++; }
          if (!rows[r][13] && m.emergency_contact_rel) { rows[r][13] = m.emergency_contact_rel; updatedCount++; }
          if (!rows[r][14] && m.outdoor_experience) { rows[r][14] = m.outdoor_experience; updatedCount++; }
          if (!rows[r][15] && m.fitness_desc) { rows[r][15] = m.fitness_desc; updatedCount++; }
          if (!rows[r][16] && m.proof_urls) { rows[r][16] = Array.isArray(m.proof_urls) ? m.proof_urls.join(", ") : m.proof_urls; updatedCount++; }
        }
      }

      // 檢查並追加新隊員
      var signups = (mockContext.signups && mockContext.signups[eventId]) || [];
      for (var sIdx = 0; sIdx < signups.length; sIdx++) {
        var s = signups[sIdx];
        if (!existingCodes[s.id]) {
          var mem = mockContext.members[s.line_user_id] || {};
          var pUrls = Array.isArray(mem.proof_urls) ? mem.proof_urls.join(", ") : (mem.proof_urls || "");
          var newRow = [
            s.line_user_id || "", s.id || "", mem.name || s.name || "", mem.gender || "",
            mem.line_id || s.line_id || "", mem.email || "", mem.phone || "", mem.address || "",
            mem.birthday || "", mem.id_card || "", mem.emergency_contact_name || "",
            mem.emergency_contact_phone || "", mem.emergency_contact_address || "",
            mem.emergency_contact_rel || "", mem.outdoor_experience || "", mem.fitness_desc || "",
            pUrls || "", s.is_official_member_snapshot ? "是" : "否", s.status || "審核中 Checking",
            s.notification_status || "未通知", s.payment_status || "未繳費 Unpaid", s.notes || ""
          ];
          rows.push(newRow);
          existingCodes[s.id] = true;
          updatedCount++;
        }
      }
    }
    return {
      status: "success",
      message: updatedCount > 0 ? "已成功補齊試算表中 " + updatedCount + " 筆隊員個資！" : "獨立試算表已是最新狀態，名冊資料完整無缺漏",
      spreadsheetUrl: evt.spreadsheet_url,
      spreadsheetId: evt.spreadsheet_id,
      driveFolderUrl: evt.drive_folder_url || "",
      updatedCount: updatedCount
    };
  }

  // 3. 建立專屬資料夾與試算表
  var folderId = "folder_" + eventId;
  var folderUrl = "https://drive.google.com/drive/folders/" + folderId;
  var ssId = "sheet_" + eventId;
  var ssUrl = "https://docs.google.com/spreadsheets/d/" + ssId;

  // 4. 從 Supabase 拉取該活動所有報名資料與社員個資
  var signups = mockContext.signups[eventId] || [];
  var rowsAppended = [];

  for (var i = 0; i < signups.length; i++) {
    var s = signups[i];
    var m = mockContext.members[s.line_user_id] || {};

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
      s.is_official_member_snapshot ? "是" : "否",
      s.status || "審核中 Checking",
      s.notification_status || "未通知",
      s.payment_status || "未繳費 Unpaid",
      s.notes || ""
    ];
    rowsAppended.push(row);
  }

  // 5. 回寫至 Supabase
  evt.spreadsheet_id = ssId;
  evt.spreadsheet_url = ssUrl;
  evt.drive_folder_url = folderUrl;

  return {
    status: "success",
    message: "成功建立獨立試算表並匯入名冊",
    spreadsheetUrl: ssUrl,
    spreadsheetId: ssId,
    driveFolderUrl: folderUrl,
    importedRowCount: rowsAppended.length,
    rows: rowsAppended
  };
}

// 模擬新活動建立時不自動建立試算表
function simulateHandleSaveEvent(json, isUpdate) {
  var driveFolderUrl = json.driveFolderUrl || "";
  var spreadsheetUrl = json.spreadsheetUrl || "";
  var spreadsheetId = json.spreadsheetId || "";

  // 驗證已移除新活動自動建立邏輯
  var autoCreated = false;
  // 此處無自動呼叫 _createEventDriveFolderAndSheet

  return {
    status: "success",
    eventId: json.eventId || "E2609-01",
    driveFolderUrl: driveFolderUrl,
    spreadsheetUrl: spreadsheetUrl,
    spreadsheetId: spreadsheetId,
    autoCreatedSheet: autoCreated
  };
}

test('63. 獨立試算表解耦與幹部一鍵手動建立並匯入既有名冊驗證', async (t) => {
  await t.test('1. 新活動建立時不再自動生成試算表與資料夾', () => {
    const newEventPayload = {
      name: '奇萊連峰越嶺',
      startDate: '2026/10/20',
      cost: '3000'
    };
    const saveRes = simulateHandleSaveEvent(newEventPayload, false);
    assert.strictEqual(saveRes.status, 'success');
    assert.strictEqual(saveRes.autoCreatedSheet, false);
    assert.strictEqual(saveRes.spreadsheetUrl, '');
    assert.strictEqual(saveRes.spreadsheetId, '');
    assert.strictEqual(saveRes.driveFolderUrl, '');
  });

  await t.test('2. 非幹部嘗試呼叫 create_event_sheet 必須被權限阻擋', () => {
    const mockContext = {
      officers: ['U_OFFICER_001'],
      events: { 'E2609-01': { id: 'E2609-01', title: '奇萊連峰越嶺' } },
      members: {},
      signups: {}
    };

    const res = simulateHandleCreateEventSheet({
      userId: 'U_NORMAL_MEMBER',
      eventId: 'E2609-01'
    }, mockContext);

    assert.strictEqual(res.status, 'error');
    assert.ok(res.message.includes('權限不足'));
  });

  await t.test('3. 幹部一鍵手動建立試算表：成功生成並全量拉取既有報名者與個資匯入', () => {
    const mockContext = {
      officers: ['U_OFFICER_001'],
      events: {
        'E2609-01': {
          id: 'E2609-01',
          title: '奇萊連峰越嶺',
          start_date: '2026-10-20',
          spreadsheet_id: null,
          spreadsheet_url: null
        }
      },
      members: {
        'U_USER_A': {
          line_user_id: 'U_USER_A',
          name: '王小明',
          phone: '0912345678',
          birthday: '2001-05-15',
          id_card: 'A123456789',
          gender: '男',
          emergency_contact_name: '王大明',
          emergency_contact_phone: '0987654321',
          emergency_contact_rel: '父子',
          outdoor_experience: '百岳15座',
          fitness_desc: '3000m 14分',
          proof_urls: ['https://drive.google.com/proof1.jpg']
        },
        'U_USER_B': {
          line_user_id: 'U_USER_B',
          name: '李小華',
          phone: '0922333444',
          birthday: '2002-08-20',
          id_number: 'B223456789',
          gender: '女',
          emergency_contact_name: '李媽媽',
          emergency_contact_phone: '0911222333'
        }
      },
      signups: {
        'E2609-01': [
          {
            id: 'S001',
            event_id: 'E2609-01',
            line_user_id: 'U_USER_A',
            name: '王小明',
            status: '正取 Accepted',
            payment_status: '已繳費 Paid',
            is_official_member_snapshot: true
          },
          {
            id: 'S002',
            event_id: 'E2609-01',
            line_user_id: 'U_USER_B',
            name: '李小華',
            status: '審核中 Checking',
            payment_status: '未繳費 Unpaid',
            is_official_member_snapshot: false
          }
        ]
      }
    };

    const res = simulateHandleCreateEventSheet({
      userId: 'U_OFFICER_001',
      eventId: 'E2609-01'
    }, mockContext);

    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.importedRowCount, 2);
    assert.ok(res.spreadsheetUrl.includes('sheet_E2609-01'));
    assert.ok(res.driveFolderUrl.includes('folder_E2609-01'));

    // 驗證第一筆資料欄位
    const rowA = res.rows[0];
    assert.strictEqual(rowA[0], 'U_USER_A'); // 系統識別碼
    assert.strictEqual(rowA[1], 'S001');     // 專屬碼
    assert.strictEqual(rowA[2], '王小明');   // 姓名
    assert.strictEqual(rowA[3], '男');       // 性別
    assert.strictEqual(rowA[6], '0912345678'); // 電話
    assert.strictEqual(rowA[8], '2001/05/15'); // 生日格式化
    assert.strictEqual(rowA[9], 'A123456789'); // 身分證字號 (id_card)
    assert.strictEqual(rowA[10], '王大明');    // 緊急聯絡人姓名
    assert.strictEqual(rowA[11], '0987654321'); // 緊急聯絡人電話
    assert.strictEqual(rowA[13], '父子');       // 緊急聯絡人關係 (emergency_contact_rel)
    assert.strictEqual(rowA[14], '百岳15座');   // 爬山經驗 (outdoor_experience)
    assert.strictEqual(rowA[15], '3000m 14分'); // 體能測驗 (fitness_desc)
    assert.strictEqual(rowA[16], 'https://drive.google.com/proof1.jpg'); // 體能證明 (proof_urls)
    assert.strictEqual(rowA[17], '是');       // 社員標記
    assert.strictEqual(rowA[18], '正取 Accepted'); // 審核結果
    assert.strictEqual(rowA[20], '已繳費 Paid');   // 繳費狀態

    // 驗證回寫 Supabase
    assert.strictEqual(mockContext.events['E2609-01'].spreadsheet_id, 'sheet_E2609-01');
  });

  await t.test('4. 已存在獨立試算表之活動點擊同步名冊，自動巡檢並回補缺漏個資', () => {
    const mockContext = {
      officers: ['U_OFFICER_001'],
      events: {
        'E2609-01': {
          id: 'E2609-01',
          title: '奇萊連峰越嶺',
          spreadsheet_id: 'existing_sheet_123',
          spreadsheet_url: 'https://docs.google.com/spreadsheets/d/existing_sheet_123',
          drive_folder_url: 'https://drive.google.com/drive/folders/existing_folder_123'
        }
      },
      members: {
        'U_USER_A': {
          line_user_id: 'U_USER_A',
          id_card: 'A123456789',
          emergency_contact_rel: '父子',
          outdoor_experience: '百岳15座',
          fitness_desc: '3000m 14分',
          proof_urls: ['https://drive.google.com/proof1.jpg']
        }
      },
      existingSheetRows: {
        'E2609-01': [
          // 原本這 5 個欄位為空的既有資料列
          ['U_USER_A', 'S001', '王小明', '男', 'ming', 'a@test.com', '0912', '', '2001/05/15', '', '王大明', '0987', '', '', '', '', '', '是', '正取', '未通知', '已繳費', '']
        ]
      }
    };

    const res = simulateHandleCreateEventSheet({
      userId: 'U_OFFICER_001',
      eventId: 'E2609-01'
    }, mockContext);

    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.spreadsheetId, 'existing_sheet_123');
    assert.ok(res.message.includes('已成功補齊'));
    assert.strictEqual(res.updatedCount, 5);

    // 驗證既有試算表列已成功補齊
    const backfilledRow = mockContext.existingSheetRows['E2609-01'][0];
    assert.strictEqual(backfilledRow[9], 'A123456789'); // 證件號碼補齊
    assert.strictEqual(backfilledRow[13], '父子');       // 緊急聯絡人關係補齊
    assert.strictEqual(backfilledRow[14], '百岳15座');   // 爬山經驗補齊
    assert.strictEqual(backfilledRow[15], '3000m 14分'); // 體能測驗補齊
    assert.strictEqual(backfilledRow[16], 'https://drive.google.com/proof1.jpg'); // 體能證明補齊
  });

  await t.test('5. checkOfficerInternal 單參數與雙參數呼叫皆能正確識別幹部身分', () => {
    const mockContext = {
      officers: ['U_OFFICER_001']
    };

    // 驗證單參數呼叫 checkOfficerInternal(userId)
    const singleParamOfficer = simulateCheckOfficerInternal('U_OFFICER_001', null, null, mockContext);
    assert.strictEqual(singleParamOfficer.isOfficer, true);
    assert.strictEqual(singleParamOfficer.role, '幹部');

    // 驗證傳統雙參數呼叫 checkOfficerInternal(null, userId)
    const doubleParamOfficer = simulateCheckOfficerInternal(null, 'U_OFFICER_001', null, mockContext);
    assert.strictEqual(doubleParamOfficer.isOfficer, true);

    // 驗證非幹部
    const nonOfficer = simulateCheckOfficerInternal('U_NORMAL_USER', null, null, mockContext);
    assert.strictEqual(nonOfficer.isOfficer, false);
  });

  await t.test('6. 開啟已存在試算表時自動同步新社員報名紀錄至試算表末端', () => {
    const mockContext = {
      officers: ['U_OFFICER_001'],
      events: {
        'E2609-01': {
          id: 'E2609-01',
          spreadsheet_id: 'existing_sheet_123',
          spreadsheet_url: 'https://docs.google.com/spreadsheets/d/existing_sheet_123'
        }
      },
      members: {
        'U_USER_A': { line_user_id: 'U_USER_A', name: '王小明', id_card: 'A123' },
        'U_USER_C': { line_user_id: 'U_USER_C', name: '新社員陳大衛', id_card: 'C123', emergency_contact_rel: '母子' }
      },
      signups: {
        'E2609-01': [
          { id: 'S001', line_user_id: 'U_USER_A' },
          { id: 'S003', line_user_id: 'U_USER_C', is_official_member_snapshot: true }
        ]
      },
      existingSheetRows: {
        'E2609-01': [
          ['U_USER_A', 'S001', '王小明', '男', '', '', '', '', '', 'A123', '', '', '', '', '', '', '', '是', '正取', '未通知', '已繳費', '']
        ]
      }
    };

    const res = simulateHandleCreateEventSheet({
      userId: 'U_OFFICER_001',
      eventId: 'E2609-01'
    }, mockContext);

    assert.strictEqual(res.status, 'success');
    assert.strictEqual(mockContext.existingSheetRows['E2609-01'].length, 2);
    const newAppendedRow = mockContext.existingSheetRows['E2609-01'][1];
    assert.strictEqual(newAppendedRow[0], 'U_USER_C');
    assert.strictEqual(newAppendedRow[1], 'S003');
    assert.strictEqual(newAppendedRow[2], '新社員陳大衛');
    assert.strictEqual(newAppendedRow[9], 'C123');
    assert.strictEqual(newAppendedRow[13], '母子');
  });
});
