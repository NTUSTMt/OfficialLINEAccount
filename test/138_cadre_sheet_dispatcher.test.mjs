import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('138. notify-dispatcher 幹部試算表轉發端點驗證 (Solution A)', () => {
  const rootDir = process.cwd();
  const dispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const code = fs.readFileSync(dispatcherPath, 'utf8');

  it('1. notify-dispatcher 必須支援 create_event_sheet 路由與幹部鑑權', () => {
    assert.ok(code.includes('case "create_event_sheet":'), '必須具備 create_event_sheet action');
    assert.ok(code.includes('handleCreateEventSheetDispatcher'), '必須具備 handleCreateEventSheetDispatcher 函式');
    
    const handler = code.substring(code.indexOf('async function handleCreateEventSheetDispatcher'));
    assert.ok(handler.includes('isUserOfficer'), '建立試算表必須校驗 isUserOfficer');
    assert.ok(handler.includes('x-worker-secret'), '轉發 GAS 必須攜帶 x-worker-secret');
    assert.ok(handler.includes('worker_secret: workerSecret'), '轉發 GAS Payload 必須包含 worker_secret');
  });

  it('2. notify-dispatcher 必須支援 sync_event_sheet_signups 路由與幹部鑑權', () => {
    assert.ok(code.includes('case "sync_event_sheet_signups":'), '必須具備 sync_event_sheet_signups action');
    assert.ok(code.includes('handleSyncEventSheetDispatcher'), '必須具備 handleSyncEventSheetDispatcher 函式');
    
    const handler = code.substring(code.indexOf('async function handleSyncEventSheetDispatcher'));
    assert.ok(handler.includes('isUserOfficer'), '名冊同步必須校驗 isUserOfficer');
    assert.ok(handler.includes('x-worker-secret'), '轉發 GAS 必須攜帶 x-worker-secret');
    assert.ok(handler.includes('worker_secret: workerSecret'), '轉發 GAS Payload 必須包含 worker_secret');
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'notify-dispatcher 代碼不得包含 Emoji');
  });
});
