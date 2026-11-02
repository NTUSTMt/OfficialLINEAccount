import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('139. 前端 callDispatcherAction 通訊模組擴充驗證', () => {
  const rootDir = process.cwd();
  const apiPath = path.join(rootDir, 'src/utils/api.ts');
  const code = fs.readFileSync(apiPath, 'utf8');

  it('1. api.ts 必須匯出 callDispatcherAction 且回傳 data 泛型欄位', () => {
    assert.ok(code.includes('export const callDispatcherAction'), '必須匯出 callDispatcherAction');
    assert.ok(code.includes('data: json'), '必須將 json 封裝至 data 欄位回傳');
  });

  it('2. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'api.ts 代碼不得包含 Emoji');
  });
});
