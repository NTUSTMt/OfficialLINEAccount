import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('FinanceReportCharts.tsx exports SVG charting components', () => {
  assert.ok(fs.existsSync('src/components/admin/FinanceReportCharts.tsx'), 'FinanceReportCharts.tsx must exist');
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  assert.match(code, /export const ExpectedVsReceivedBar/, 'ExpectedVsReceivedBar must be exported');
  assert.match(code, /export const StatusDonutChart/, 'StatusDonutChart must be exported');
  assert.match(code, /export const CategoryDonutChart/, 'CategoryDonutChart must be exported');
  assert.match(code, /export const RevenueTrendChart/, 'RevenueTrendChart must be exported');
  assert.match(code, /<svg/, 'SVG elements must be rendered');
  assert.match(code, /strokeDasharray/, 'Donut charts should use strokeDasharray');
  assert.match(code, /strokeDashoffset/, 'Donut charts should use strokeDashoffset');
});

test('FinanceReportCharts.tsx has zero external charting library dependencies', () => {
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  assert.ok(!code.includes('recharts'), 'Must not import recharts');
  assert.ok(!code.includes('chart.js'), 'Must not import chart.js');
  assert.ok(!code.includes('d3'), 'Must not import d3');
  assert.ok(!code.includes('apexcharts'), 'Must not import apexcharts');
});

test('FinanceReportCharts.tsx uses standard status colors and handles edge cases', () => {
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  // Confirmed (#059669), checking (#d97706), unpaid (#dc2626)
  assert.match(code, /#059669/, 'Confirmed status color #059669 must be present');
  assert.match(code, /#d97706/, 'Checking status color #d97706 must be present');
  assert.match(code, /#dc2626/, 'Unpaid status color #dc2626 must be present');
  // Edge cases
  assert.match(code, /尚無走勢資料|無資料/, 'Empty data edge case must be handled');
});

test('FinanceReportCharts.tsx contains no emojis in code or comments', () => {
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(code), 'No emojis allowed in FinanceReportCharts.tsx');
});

test('webAdmin.css contains supporting styles for finance charts', () => {
  const css = fs.readFileSync('src/pages/web-admin/webAdmin.css', 'utf8');
  assert.match(css, /\.wa-chart-container|\.wa-finance-chart/, 'CSS should define chart container styles');
  assert.match(css, /\.wa-donut-wrapper/, 'CSS should define donut wrapper');
  assert.match(css, /\.wa-trend-svg/, 'CSS should define trend SVG styles');
  assert.match(css, /\.wa-chart-kpi-badge/, 'CSS should define KPI badge');
});
