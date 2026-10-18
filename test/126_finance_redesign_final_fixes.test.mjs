import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('1. AddPaymentDrawer formats notification failure count and renders warning banner', () => {
  const code = fs.readFileSync('src/components/admin/AddPaymentDrawer.tsx', 'utf8');
  assert.match(
    code,
    /成功建立 \$\{res\.count\} 筆款項請求（其中 \$\{notifyFailCount\} 筆 LINE 通知推播失敗）/,
    'AddPaymentDrawer 必須格式化通知失敗筆數提醒'
  );
  assert.match(
    code,
    /wa-drawer-alert-warning/,
    'AddPaymentDrawer 必須提供 warning 警示橫幅樣式'
  );
  assert.match(
    code,
    /AlertTriangle/,
    'AddPaymentDrawer 必須引用 AlertTriangle 作為警告圖示'
  );
});

test('2. WebAdminFinance actions column updated to defaultWidth 70 and minWidth 64', () => {
  const code = fs.readFileSync('src/pages/web-admin/WebAdminFinance.tsx', 'utf8');
  assert.match(
    code,
    /key:\s*'actions',\s*label:\s*'操作',\s*defaultWidth:\s*70,\s*minWidth:\s*64/,
    'WebAdminFinance actions 欄位寬度必須擴充至 70 且 minWidth 為 64'
  );
});

test('3. Payment.tsx sanitizes urlAmount defensively against negative amounts', () => {
  const code = fs.readFileSync('src/pages/Payment.tsx', 'utf8');
  assert.match(
    code,
    /Math\.max\(0,\s*parseInt\(urlAmount,\s*10\)\)/,
    'Payment.tsx 必須以 Math.max(0, ...) 防禦性防範負數金額'
  );
});

test('4. FinanceReportCharts renders overlay tooltip after points loop and uses strokeLinecap butt for donut charts', () => {
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  
  // 檢查 StatusDonutChart 與 CategoryDonutChart 使用 strokeLinecap="butt"
  const buttMatches = code.match(/strokeLinecap="butt"/g);
  assert.ok(buttMatches && buttMatches.length >= 4, '圓環切片必須使用 strokeLinecap="butt" 消除接縫');
  assert.doesNotMatch(code, /<circle[^>]*?strokeDasharray[^>]*?strokeLinecap="round"/, '甜甜圈圖圓弧不可使用 strokeLinecap="round"');

  // 檢查 RevenueTrendChart Tooltip 置於 points 迴圈外部覆蓋層
  assert.match(
    code,
    /<\/g>\s*\);\s*\}\)[\s\S]*?懸浮 Tooltip 覆蓋層[\s\S]*?pointerEvents="none"/,
    'RevenueTrendChart 必須在 points.map 之後渲染 hover tooltip 覆蓋層'
  );
});

test('5. supabaseClient.ts formats createManualPaymentRequests error with code transparency', () => {
  const code = fs.readFileSync('src/utils/supabaseClient.ts', 'utf8');
  assert.match(
    code,
    /\[新增 payments 失敗\]: \$\{insertErr\.message\} \(代碼: \$\{insertErr\.code \|\| 'UNKNOWN'\}\)/,
    'createManualPaymentRequestsInSupabase 必須透明揭露錯誤原因與代碼'
  );
});

test('6. Newly modified files contain no emojis in code or comments', () => {
  const files = [
    'src/components/admin/AddPaymentDrawer.tsx',
    'src/pages/web-admin/WebAdminFinance.tsx',
    'src/components/admin/FinanceReportCharts.tsx',
    'src/utils/supabaseClient.ts',
    'src/pages/web-admin/webAdmin.css',
    'test/126_finance_redesign_final_fixes.test.mjs'
  ];

  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!emojiRegex.test(content), `檔案 ${file} 不得包含任何 Emoji 圖示`);
  }
});
