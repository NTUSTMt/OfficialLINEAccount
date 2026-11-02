import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('133. GAS Worker 機密防洩漏與鑑權收攏測試', () => {
  const rootDir = process.cwd();
  const gasWorkerPath = path.join(rootDir, 'src/gas_worker.js');
  const code = fs.readFileSync(gasWorkerPath, 'utf8');

  it('1. _handleCreateEventSheet 不得將 SUPABASE_SERVICE_ROLE_KEY 寫入 _CONFIG 工作表', () => {
    assert.strictEqual(
      code.includes("_setOrUpdateConfigRow(configSheet, 'SUPABASE_SERVICE_ROLE_KEY'"),
      false,
      '禁止將 SUPABASE_SERVICE_ROLE_KEY 寫入 Google 試算表'
    );
  });

  it('2. _handleCreateEventSheet 不得預設將試算表或資料夾分享予 ANYONE_WITH_LINK', () => {
    const handleCreateSection = code.substring(
      code.indexOf('function _handleCreateEventSheet'),
      code.indexOf('function _handleSyncEventSheetSignups')
    );
    assert.strictEqual(
      handleCreateSection.includes('DriveApp.Access.ANYONE_WITH_LINK'),
      false,
      '禁止於建立活動試算表與資料夾時預設開放 ANYONE_WITH_LINK 讀取'
    );
  });

  it('3. doGet 中敏感操作 (試算表建立、名冊同步、檔案刪除) 必須位於 _verifyWorkerSecret 之後', () => {
    const doGetSection = code.substring(code.indexOf('function doGet'), code.indexOf('function doPost'));
    const verifyIndex = doGetSection.indexOf('_verifyWorkerSecret(e)');
    assert.ok(verifyIndex > 0, 'doGet 必須包含 _verifyWorkerSecret 檢查');

    const createSheetIndex = doGetSection.indexOf("action === 'create_event_sheet'");
    const syncSignupsIndex = doGetSection.indexOf("action === 'sync_event_sheet_signups'");
    const deleteDriveIndex = doGetSection.indexOf("action === 'delete_drive_file'");

    assert.ok(createSheetIndex > verifyIndex, 'create_event_sheet 必須在 _verifyWorkerSecret 之後');
    assert.ok(syncSignupsIndex > verifyIndex, 'sync_event_sheet_signups 必須在 _verifyWorkerSecret 之後');
    assert.ok(deleteDriveIndex > verifyIndex, 'delete_drive_file 必須在 _verifyWorkerSecret 之後');
  });

  it('4. doPost 中敏感操作 (檔案刪除、試算表建立、名冊同步) 必須位於 _verifyWorkerSecret 之後', () => {
    const doPostSection = code.substring(code.indexOf('function doPost'), code.indexOf('function _workerSuccess'));
    const verifyIndex = doPostSection.indexOf('_verifyWorkerSecret(e)');
    assert.ok(verifyIndex > 0, 'doPost 必須包含 _verifyWorkerSecret 檢查');

    const deleteDriveIndex = doPostSection.indexOf("action === 'delete_drive_file'");
    const createSheetIndex = doPostSection.indexOf("action === 'create_event_sheet'");
    const syncSignupsIndex = doPostSection.indexOf("action === 'sync_event_sheet_signups'");

    assert.ok(deleteDriveIndex > verifyIndex, 'delete_drive_file 必須在 _verifyWorkerSecret 之後');
    assert.ok(createSheetIndex > verifyIndex, 'create_event_sheet 必須在 _verifyWorkerSecret 之後');
    assert.ok(syncSignupsIndex > verifyIndex, 'sync_event_sheet_signups 必須在 _verifyWorkerSecret 之後');
  });

  it('5. 程式碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'gas_worker.js 不得包含任何 Emoji');
  });
});
