import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('WebAdminFinance.tsx integrates activity filter, report drawer, add payment drawer, and reminder modal', () => {
  const code = fs.readFileSync('src/pages/web-admin/WebAdminFinance.tsx', 'utf8');
  assert.match(code, /FinanceReportDrawer/);
  assert.match(code, /AddPaymentDrawer/);
  assert.match(code, /PaymentReminderModal/);
  assert.match(code, /selectedEventId/);
  assert.match(code, /財務分析報表/);
  assert.match(code, /新增繳費項目/);
  assert.match(code, /fetchEventsFromSupabase/);
  assert.match(code, /fetchAdminMembersFromSupabase|fetchMembersFromSupabase/);
  assert.match(code, /全部活動款項/);
  assert.match(code, /進行中 \/ 報名中活動/);
  assert.match(code, /籌備中 \/ 未來活動/);
  assert.match(code, /已結束歷史活動/);
});

test('Deferred fixes: AddPaymentDrawer cleans ev.cost with regex replace', () => {
  const code = fs.readFileSync('src/components/admin/AddPaymentDrawer.tsx', 'utf8');
  assert.match(code, /\.replace\(\/\[\^0-9\]\/g,\s*['"]['"]\)/);
});

test('Deferred fixes: FinanceReportDrawer useEffect only syncs on selectedEventId prop changes', () => {
  const code = fs.readFileSync('src/components/admin/FinanceReportDrawer.tsx', 'utf8');
  assert.match(code, /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},?\s*\[selectedEventId\]\)/);
});

test('Deferred fixes: webAdmin.css print styles are scoped to body:has(.wa-finance-report-drawer)', () => {
  const css = fs.readFileSync('src/pages/web-admin/webAdmin.css', 'utf8');
  assert.match(css, /body:has\(\.wa-finance-report-drawer\)/);
});

test('WebAdminFinance.tsx contains no emojis in code or comments', () => {
  const code = fs.readFileSync('src/pages/web-admin/WebAdminFinance.tsx', 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(code), 'No emojis allowed in WebAdminFinance.tsx');
});
