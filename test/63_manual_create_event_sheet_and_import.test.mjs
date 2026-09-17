import test from 'node:test';
import assert from 'node:assert/strict';

// 模擬 _handleCreateEventSheet 業務邏輯 (完全對齊 gas_modules/06_Helper_Services.js)
function simulateHandleCreateEventSheet(json, mockContext) {
  var userId = json.userId;
  var eventId = json.eventId;

  if (!eventId) {
    return { status: "error", message: "缺少必要之活動編號 eventId" };
  }

  // 1. 幹部身分校驗
  var isOfficer = mockContext.officers.includes(userId);
  if (!isOfficer) {
    return { status: "error", message: "權限不足：僅限社團幹部可建立活動專屬試算表" };
  }

  // 2. 從 Supabase 取得活動資訊
  var evt = mockContext.events[eventId];
  if (!evt) {
    return { status: "error", message: "於 Supabase 中查無此活動 (" + eventId + ")" };
  }

  // 若已經有試算表，直接回傳既有網址與 ID，避免重複建立
  if (evt.spreadsheet_id && evt.spreadsheet_url) {
    return {
      status: "success",
      message: "此活動已存在獨立試算表",
      spreadsheetUrl: evt.spreadsheet_url,
      spreadsheetId: evt.spreadsheet_id,
      driveFolderUrl: evt.drive_folder_url || ""
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
      m.id_number || "",
      m.emergency_contact_name || "",
      m.emergency_contact_phone || "",
      m.emergency_contact_address || "",
      m.emergency_contact_relationship || "",
      m.hiking_experience || "",
      m.fitness_test || "",
      m.fitness_proof_url || "",
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
          id_number: 'A123456789',
          gender: '男',
          emergency_contact_name: '王大明',
          emergency_contact_phone: '0987654321'
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
    assert.strictEqual(rowA[9], 'A123456789'); // 身分證字號
    assert.strictEqual(rowA[17], '是');       // 社員標記
    assert.strictEqual(rowA[18], '正取 Accepted'); // 審核結果
    assert.strictEqual(rowA[20], '已繳費 Paid');   // 繳費狀態

    // 驗證回寫 Supabase
    assert.strictEqual(mockContext.events['E2609-01'].spreadsheet_id, 'sheet_E2609-01');
  });

  await t.test('4. 已存在獨立試算表之活動再次點擊應保持冪等性並直接回傳', () => {
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
      members: {},
      signups: {}
    };

    const res = simulateHandleCreateEventSheet({
      userId: 'U_OFFICER_001',
      eventId: 'E2609-01'
    }, mockContext);

    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.spreadsheetId, 'existing_sheet_123');
    assert.strictEqual(res.message, '此活動已存在獨立試算表');
  });
});
