import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('FinanceReportDrawer.tsx exports drawer with dual modes, CSV export and print view', () => {
  assert.ok(fs.existsSync('src/components/admin/FinanceReportDrawer.tsx'), 'src/components/admin/FinanceReportDrawer.tsx must exist');
  const code = fs.readFileSync('src/components/admin/FinanceReportDrawer.tsx', 'utf8');

  // Exports
  assert.match(code, /export const FinanceReportDrawer/, 'Must export FinanceReportDrawer component');
  assert.match(code, /export interface FinanceReportDrawerProps/, 'Must export FinanceReportDrawerProps interface');

  // Props requirement
  assert.match(code, /isOpen\s*:\s*boolean/, 'Props must contain isOpen: boolean');
  assert.match(code, /onClose\s*:\s*\(\)\s*=>\s*void/, 'Props must contain onClose: () => void');
  assert.match(code, /items\s*:\s*AdminFinanceItem\[\]/, 'Props must contain items: AdminFinanceItem[]');
  assert.match(code, /events\s*:\s*AdminEvent\[\]/, 'Props must contain events: AdminEvent[]');
  assert.match(code, /selectedEventId\?\s*:\s*string/, 'Props must contain selectedEventId?: string');
  assert.match(code, /onSelectEvent\?\s*:\s*\(eventId:\s*string\)\s*=>\s*void/, 'Props must contain onSelectEvent');
  assert.match(code, /onTriggerReminder\?\s*:\s*\(item:\s*AdminFinanceItem\)\s*=>\s*void/, 'Props must contain onTriggerReminder');

  // Dual modes
  assert.match(code, /活動 \/ 專題明細/, 'Must support Mode A 活動 / 專題明細');
  assert.match(code, /全社綜合走勢/, 'Must support Mode B 全社綜合走勢');

  // Semester & Date filters
  assert.match(code, /113-2/, 'Semester filter should support 113-2');
  assert.match(code, /113-1/, 'Semester filter should support 113-1');
  assert.match(code, /112-2/, 'Semester filter should support 112-2');
  assert.match(code, /112-1/, 'Semester filter should support 112-1');
  assert.match(code, /全期/, 'Semester filter should support 全期');

  // Charts integration
  assert.match(code, /ExpectedVsReceivedBar/, 'Must include ExpectedVsReceivedBar');
  assert.match(code, /StatusDonutChart/, 'Must include StatusDonutChart');
  assert.match(code, /CategoryDonutChart/, 'Must include CategoryDonutChart');
  assert.match(code, /RevenueTrendChart/, 'Must include RevenueTrendChart');

  // KPI cards
  assert.match(code, /應收總額/, 'Must display 應收總額');
  assert.match(code, /實收已核銷/, 'Must display 實收已核銷');
  assert.match(code, /待核銷/, 'Must display 待核銷 / 待繳費');
  assert.match(code, /繳費達成率|達成率/, 'Must display 達成率');

  // Unpaid roster & reminder
  assert.match(code, /發送提醒/, 'Must have 發送提醒 button');

  // CSV export with UTF-8 BOM
  assert.match(code, /exportCsv/, 'Must include exportCsv function');
  assert.match(code, /\\uFEFF/, 'CSV export must include UTF-8 BOM \\uFEFF');
  assert.match(code, /財務報表_/, 'CSV filename must start with 財務報表_');

  // Friendly print
  assert.match(code, /window\.print/, 'Must support window.print()');
});

test('FinanceReportDrawer.tsx contains no emojis in code or comments', () => {
  if (fs.existsSync('src/components/admin/FinanceReportDrawer.tsx')) {
    const code = fs.readFileSync('src/components/admin/FinanceReportDrawer.tsx', 'utf8');
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    assert.ok(!emojiRegex.test(code), 'No emojis allowed in FinanceReportDrawer.tsx');
  }
});

test('webAdmin.css contains supporting styles for FinanceReportDrawer and print layout', () => {
  const css = fs.readFileSync('src/pages/web-admin/webAdmin.css', 'utf8');
  assert.match(css, /\.wa-finance-report-drawer/, 'CSS should define .wa-finance-report-drawer');
  assert.match(css, /@media print/, 'CSS should define @media print styles');
});
