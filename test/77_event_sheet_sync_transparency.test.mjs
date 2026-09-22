import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('77. 活動專屬試算表明冊同步透明度強化、智慧分頁與 Toast 通知測試 (v0.1.176)', () => {
  const rootDir = process.cwd();

  it('1. gas.js 必須實作 _findEventSignupSheet 且具備 _CONFIG 排除邏輯', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('function _findEventSignupSheet(eventSS)'),
      'gas.js 必須包含 _findEventSignupSheet 函式'
    );

    assert.ok(
      gasContent.includes('name !== "_CONFIG" && !name.startsWith("_")'),
      '_findEventSignupSheet 必須主動排除 _CONFIG 隱藏分頁'
    );
  });

  it('2. _backfillEventSpreadsheetMemberInfo 必須具備安全欄位擴展與結構化回傳狀態物件', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('sheet.insertColumnsAfter(curCols, reqCols - curCols)'),
      '_backfillEventSpreadsheetMemberInfo 必須在欄數不足時自動擴展欄位，避免越界錯誤'
    );

    assert.ok(
      gasContent.includes('appendedCount: appendedCount') &&
      gasContent.includes('sheetTotal: Math.max(0, lastValidRow - 1)') &&
      gasContent.includes('error: null'),
      '_backfillEventSpreadsheetMemberInfo 必須回傳結構化成功狀態物件'
    );

    assert.ok(
      gasContent.includes('success: false') &&
      gasContent.includes('error: (err && (err.message || err.toString()))'),
      '_backfillEventSpreadsheetMemberInfo 必須在例外時回傳具體錯誤字串，絕不私自吞噬'
    );
  });

  it('3. _handleCreateEventSheet 必須透傳回補失敗錯誤並回傳具體同步狀態文案', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('_errorResponse("同步 Google 試算表失敗: " + errDetail'),
      '_handleCreateEventSheet 必須在同步回補失敗時透傳錯誤原因'
    );

    assert.ok(
      gasContent.includes('backfillResult.appendedCount > 0') &&
      gasContent.includes('backfillResult.sheetTotal'),
      '_handleCreateEventSheet 必須在成功時包含追加筆數與目前名冊總人數'
    );
  });

  it('4. AdminEvents.tsx handleCreateEventSheet 必須彈出 setToastMessage 與透明錯誤 Alert', () => {
    const adminEventsPath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
    const adminEventsContent = fs.readFileSync(adminEventsPath, 'utf8');

    assert.ok(
      adminEventsContent.includes('setToastMessage(syncMsg)'),
      'AdminEvents.tsx 成功時必須顯示 Toast 狀態提示'
    );

    assert.ok(
      adminEventsContent.includes("setToastMessage('[錯誤] ' + errMsg)") &&
      adminEventsContent.includes("alert('[錯誤] 同步試算表失敗: ' + errMsg)"),
      'AdminEvents.tsx 失敗時必須直接彈出具體失敗原因，絕不掩蓋'
    );
  });

  it('5. AdminEventCard.tsx 點擊報名試算表必須觸發 onCreateSheet(evt.id, true, true)', () => {
    const cardPath = path.join(rootDir, 'src', 'components', 'admin', 'AdminEventCard.tsx');
    const cardContent = fs.readFileSync(cardPath, 'utf8');

    assert.ok(
      cardContent.includes('onCreateSheet(evt.id, true, true)'),
      'AdminEventCard.tsx 點擊報名試算表時必須呼叫 onCreateSheet(evt.id, true, true)'
    );
  });

  it('6. 必須支援 GET 模式同步試算表以根絕 iOS WebKit 302 POST 重導向之 Load failed 異常', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('if (action === "create_event_sheet")') &&
      gasContent.includes('doGet(e)'),
      'gas.js doGet 必須支援 action === "create_event_sheet"'
    );

    const adminEventsPath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
    const adminEventsContent = fs.readFileSync(adminEventsPath, 'utf8');

    assert.ok(
      adminEventsContent.includes('await gasGet<any>(appendAuthToken('),
      'AdminEvents.tsx handleCreateEventSheet 必須改用 gasGet 發送 GET 請求避開 WebKit 阻斷'
    );
  });

  it('7. 必須使用動態表頭定位 (Dynamic Header Mapping) 回補是否為社員、審核結果、通知狀態、繳費狀態等所有欄位', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('isMember: _findHeaderCol(headers, "is_official_member"') &&
      gasContent.includes('status: _findHeaderCol(headers, "status"') &&
      gasContent.includes('notify: _findHeaderCol(headers, "notification_status"') &&
      gasContent.includes('payment: _findHeaderCol(headers, "payment_status"'),
      'gas.js _backfillEventSpreadsheetMemberInfo 必須具備狀態欄位動態定位 colMap'
    );

    assert.ok(
      gasContent.includes('setCell(colMap.isMember') &&
      gasContent.includes('setCell(colMap.status') &&
      gasContent.includes('setCell(colMap.notify') &&
      gasContent.includes('setCell(colMap.payment'),
      '追加新列時必須依據 colMap 動態賦值，絕不能使用硬編碼陣列'
    );

    const adminEventsPath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
    const adminEventsContent = fs.readFileSync(adminEventsPath, 'utf8');

    assert.ok(
      adminEventsContent.includes('isWebKitLoadFailed') &&
      adminEventsContent.includes('targetUrl'),
      'AdminEvents.tsx handleCreateEventSheet 必須對 iOS WebKit Load failed 進行智慧容錯與順暢開表'
    );
  });
});
