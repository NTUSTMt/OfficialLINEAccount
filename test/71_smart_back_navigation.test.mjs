import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { safeNavigateBack } from '../src/utils/navigationUtils.ts';

describe('71. 管理頁面返回上一頁智慧歷程導航測試 (v0.1.163)', () => {
  const rootDir = process.cwd();

  test('1. safeNavigateBack 在有上一頁瀏覽歷程 (history.state.idx > 0) 時精準執行 navigate(-1)', () => {
    // 模擬瀏覽器歷程環境
    const originalWindow = global.window;
    global.window = {
      history: {
        state: { idx: 2 }
      }
    };

    let calledWith = null;
    const mockNavigate = (arg) => {
      calledWith = arg;
    };

    safeNavigateBack(mockNavigate, '/admin/fallback');
    assert.equal(calledWith, -1, '有上一頁歷程時必須執行 navigate(-1)');

    global.window = originalWindow;
  });

  test('2. safeNavigateBack 在無歷程 (idx === 0 或無 state) 時安全導向 fallbackPath', () => {
    // 模擬首頁直接載入無歷程
    const originalWindow = global.window;
    global.window = {
      history: {
        state: { idx: 0 }
      }
    };

    let calledPath = null;
    let calledOptions = null;
    const mockNavigate = (target, opts) => {
      calledPath = target;
      calledOptions = opts;
    };

    safeNavigateBack(mockNavigate, '/admin/members');
    assert.equal(calledPath, '/admin/members', '無歷程時必須導向指定 fallbackPath');
    assert.deepEqual(calledOptions, { replace: true }, 'fallback 必須採用 replace: true 防止歷程堆疊污染');

    // 模擬 state 為 null
    global.window.history.state = null;
    safeNavigateBack(mockNavigate, '/admin/events');
    assert.equal(calledPath, '/admin/events');

    global.window = originalWindow;
  });

  test('3. MemberDetailEdit.tsx 返回按鈕改用 safeNavigateBack 且文案為「返回上一頁」', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src/pages/MemberDetailEdit.tsx'), 'utf-8');
    assert.match(code, /safeNavigateBack\(navigate,\s*['"]\/admin\/members['"]\)/);
    assert.match(code, /<span>\s*返回上一頁\s*<\/span>/);
    assert.doesNotMatch(code, /<span>\s*返回社員列表\s*<\/span>/);
  });

  test('4. MemberRecords.tsx 返回按鈕改用 safeNavigateBack 且文案為「返回上一頁」', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src/pages/MemberRecords.tsx'), 'utf-8');
    assert.match(code, /safeNavigateBack\(navigate,\s*`\/admin\/members\/\$\{userId\}`\)/);
    assert.match(code, /<span>\s*返回上一頁\s*<\/span>/);
    assert.doesNotMatch(code, /<span>\s*返回社員詳細資料\s*<\/span>/);
  });

  test('5. AdminEventsHistory.tsx 與 AdminEvents.tsx 均使用 safeNavigateBack 且文案對齊', () => {
    const historyCode = fs.readFileSync(path.join(rootDir, 'src/pages/AdminEventsHistory.tsx'), 'utf-8');
    assert.match(historyCode, /safeNavigateBack\(navigate,\s*['"]\/admin\/events['"]\)/);
    assert.match(historyCode, /title="返回上一頁"/);

    const adminEventsCode = fs.readFileSync(path.join(rootDir, 'src/pages/AdminEvents.tsx'), 'utf-8');
    assert.match(adminEventsCode, /safeNavigateBack\(navigate,\s*['"]\/dashboard['"]\)/);
  });
});
