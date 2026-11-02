import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('140. 幹部頁面試算表建立與同步接入 Dispatcher 驗證', () => {
  const rootDir = process.cwd();
  const rosterPath = path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx');
  const adminEventsPath = path.join(rootDir, 'src/pages/AdminEvents.tsx');
  const rosterCode = fs.readFileSync(rosterPath, 'utf8');
  const adminEventsCode = fs.readFileSync(adminEventsPath, 'utf8');

  it('1. WebAdminRoster 必須透過 callDispatcherAction 觸發 create_event_sheet 與 sync_event_sheet_signups', () => {
    assert.ok(rosterCode.includes('callDispatcherAction'), 'WebAdminRoster 必須引用 callDispatcherAction');
    assert.strictEqual(
      rosterCode.includes('fetch(`${GAS_API_URL}?${query.toString()}`)'),
      false,
      'WebAdminRoster 不得直連 GAS_API_URL 建立試算表'
    );
  });

  it('2. AdminEvents 必須透過 callDispatcherAction 觸發 create_event_sheet', () => {
    assert.ok(adminEventsCode.includes('callDispatcherAction'), 'AdminEvents 必須引用 callDispatcherAction');
    assert.ok(
      adminEventsCode.includes("callDispatcherAction<any>('create_event_sheet'"),
      'AdminEvents 必須以 callDispatcherAction 優先呼叫 create_event_sheet'
    );
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(rosterCode), false, 'WebAdminRoster 代碼不得包含 Emoji');
    assert.strictEqual(emojiRegex.test(adminEventsCode), false, 'AdminEvents 代碼不得包含 Emoji');
  });
});
