import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const readText = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('WebAdminToolbar 元件與 Notion 極簡無框工具列樣式驗證 (v0.1.336)', async (t) => {
  const toolbarSrc = readText('src/components/admin/WebAdminToolbar.tsx');
  const cssSrc = readText('src/pages/web-admin/webAdmin.css');

  await t.test('1. WebAdminToolbar 具備展開式搜尋、統整 Filter Popover、Sort Popover 與固定按鈕順序', () => {
    assert.ok(toolbarSrc.includes('wa-notion-toolbar'), '應使用 .wa-notion-toolbar 容器');
    assert.ok(toolbarSrc.includes('wa-notion-icon-btn'), '應使用無框 .wa-notion-icon-btn 按鈕');
    assert.ok(toolbarSrc.includes('wa-notion-search-wrap'), '應支援展開式搜尋列');
    assert.ok(toolbarSrc.includes('wa-notion-popover'), '應支援浮動 Popover 小視窗');
    assert.ok(toolbarSrc.includes('重設篩選'), 'Filter Popover 應提供重設篩選按鈕');
    assert.ok(toolbarSrc.includes('wa-notion-primary-btn'), '最右側應固定主要新增按鈕');
  });

  await t.test('2. webAdmin.css 定義透明無框工具列與懸浮才顯示背景之按鈕樣式', () => {
    assert.ok(cssSrc.includes('.wa-notion-toolbar'), 'css 應包含 .wa-notion-toolbar');
    assert.ok(cssSrc.includes('background-color: transparent;'), '圖示按鈕平時應為透明無背景');
    assert.ok(cssSrc.includes('.wa-notion-icon-btn:hover:not(:disabled)'), '圖示按鈕懸浮時才顯示背景');
    assert.ok(cssSrc.includes('.wa-notion-popover'), 'css 應包含 .wa-notion-popover');
  });

  await t.test('3. 六大 Web Admin 頁面皆已統一導入 WebAdminToolbar', () => {
    const pages = [
      'src/pages/web-admin/WebAdminEvents.tsx',
      'src/pages/web-admin/WebAdminMembers.tsx',
      'src/pages/web-admin/WebAdminInventory.tsx',
      'src/pages/web-admin/WebAdminLoans.tsx',
      'src/pages/web-admin/WebAdminFinance.tsx',
      'src/pages/web-admin/WebAdminRoster.tsx',
      'src/pages/web-admin/WebAdminSchedule.tsx',
    ];
    for (const pagePath of pages) {
      const src = readText(pagePath);
      assert.ok(src.includes('<WebAdminToolbar'), `${pagePath} 必須使用 <WebAdminToolbar />`);
    }
  });
});
