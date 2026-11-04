import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('144. 活動內容 AI 一鍵雙語翻譯前端介面驗證', () => {
  const rootDir = process.cwd();
  const formPath = path.join(rootDir, 'src/components/admin/AdminEventForm.tsx');
  const webEventsPath = path.join(rootDir, 'src/pages/web-admin/WebAdminEvents.tsx');

  const formCode = fs.readFileSync(formPath, 'utf8');
  const webEventsCode = fs.readFileSync(webEventsPath, 'utf8');

  it('1. AdminEventForm.tsx 必須具備 AI 翻譯與一鍵還原能力', () => {
    assert.ok(formCode.includes('translateEventViaAi'), '必須引用 translateEventViaAi');
    assert.ok(formCode.includes('AI 一鍵雙語翻譯'), '必須提供 AI 一鍵雙語翻譯 按鈕');
    assert.ok(formCode.includes('handleUndoTranslation'), '必須具備 handleUndoTranslation 還原邏輯');
    assert.ok(formCode.includes('一鍵還原'), '必須顯示 一鍵還原 按鈕');
  });

  it('2. WebAdminEvents.tsx 必須具備 AI 翻譯與一鍵還原能力', () => {
    assert.ok(webEventsCode.includes('translateEventViaAi'), '必須引用 translateEventViaAi');
    assert.ok(webEventsCode.includes('AI 一鍵雙語翻譯'), '必須提供 AI 一鍵雙語翻譯 按鈕');
    assert.ok(webEventsCode.includes('handleUndoTranslation'), '必須具備 handleUndoTranslation 還原邏輯');
    assert.ok(webEventsCode.includes('一鍵還原'), '必須顯示 一鍵還原 按鈕');
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(formCode), false, 'AdminEventForm.tsx 代碼不得包含 Emoji');
    assert.strictEqual(emojiRegex.test(webEventsCode), false, 'WebAdminEvents.tsx 代碼不得包含 Emoji');
  });
});
