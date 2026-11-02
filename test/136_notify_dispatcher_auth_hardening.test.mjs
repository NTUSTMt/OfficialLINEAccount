import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('136. notify-dispatcher 鑑權防偽造加固驗證', () => {
  const rootDir = process.cwd();
  const dispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const code = fs.readFileSync(dispatcherPath, 'utf8');

  it('1. isPgCron 不得允許任意非 service_role 的 Bearer Token 偽造', () => {
    assert.strictEqual(
      code.includes('isServiceRole || Boolean(bearerToken)'),
      false,
      '禁止以任意 Bearer Token 判定為 isPgCron'
    );
    assert.ok(
      code.includes('isServiceRole') && code.includes('isPgCron'),
      'isPgCron 必須嚴格要求 isServiceRole'
    );
  });

  it('2. handleSendEventNotifications 必須優先採用 verifiedUserId 校驗幹部身分', () => {
    const handlerSection = code.substring(
      code.indexOf('async function handleSendEventNotifications'),
      code.indexOf('const { data: event }')
    );
    assert.ok(
      handlerSection.includes('json.verifiedUserId || json.userId') ||
      handlerSection.includes('const userId = json.verifiedUserId'),
      'handleSendEventNotifications 必須採用 verifiedUserId'
    );
  });

  it('3. 程式碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'notify-dispatcher 代碼不得包含 Emoji');
  });
});
