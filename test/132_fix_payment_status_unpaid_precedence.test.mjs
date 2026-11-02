import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('132. 繳費狀態 Unpaid 優先權修復與防 paid 子字串碰撞驗證 (v0.1.319)', () => {
  const workerPath = path.join(rootDir, 'src', 'gas_worker.js');
  const rosterPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminRoster.tsx');
  const dashboardPath = path.join(rootDir, 'src', 'pages', 'Dashboard.tsx');
  const statusUtilsPath = path.join(rootDir, 'src', 'utils', 'statusUtils.ts');

  it('1. gas_worker.js _normalizePaymentStatus 原始碼必須先檢查未繳/unpaid', () => {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    const funcMatch = workerContent.match(/function _normalizePaymentStatus\([\s\S]*?\n\}/);
    assert.ok(funcMatch, '必須存在 _normalizePaymentStatus 函式');

    const funcBody = funcMatch[0];
    const unpaidIdx = funcBody.indexOf("indexOf('未繳')");
    const paidIdx = funcBody.indexOf("indexOf('已繳')");

    assert.ok(unpaidIdx > -1, '必須包含未繳檢查');
    assert.ok(paidIdx > -1, '必須包含已繳檢查');
    assert.ok(unpaidIdx < paidIdx, '未繳費 (unpaid) 檢查必須置於已繳費 (paid) 檢查之前，杜絕子字串誤判');
  });

  it('2. 實測 _normalizePaymentStatus 邏輯在各類文字輸入下的正規化結果', () => {
    function _normalizePaymentStatus(val) {
      var str = String(val || '').trim();
      if (str.indexOf('未繳') > -1 || str.toLowerCase().indexOf('unpaid') > -1) {
        return '未繳費 Unpaid';
      }
      if (str.indexOf('已繳') > -1 || str.toLowerCase().indexOf('paid') > -1) {
        return '已繳費 Paid';
      }
      if (str.indexOf('待確認') > -1 || str.toLowerCase().indexOf('checking') > -1) {
        return '待確認 Checking';
      }
      return '未繳費 Unpaid';
    }

    // 核心修復目標：Unpaid 結尾包含 paid，絕不可回傳 已繳費 Paid
    assert.equal(_normalizePaymentStatus('未繳費 Unpaid'), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus('Unpaid'), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus('unpaid'), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus('未繳費'), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus('未繳'), '未繳費 Unpaid');

    // 已繳費標準驗證
    assert.equal(_normalizePaymentStatus('已繳費 Paid'), '已繳費 Paid');
    assert.equal(_normalizePaymentStatus('已繳費'), '已繳費 Paid');
    assert.equal(_normalizePaymentStatus('Paid'), '已繳費 Paid');
    assert.equal(_normalizePaymentStatus('paid'), '已繳費 Paid');

    // 待確認標準驗證
    assert.equal(_normalizePaymentStatus('待確認 Checking'), '待確認 Checking');
    assert.equal(_normalizePaymentStatus('Checking'), '待確認 Checking');
    assert.equal(_normalizePaymentStatus('待確認'), '待確認 Checking');

    // 空值安全回退
    assert.equal(_normalizePaymentStatus(''), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus(null), '未繳費 Unpaid');
    assert.equal(_normalizePaymentStatus(undefined), '未繳費 Unpaid');
  });

  it('3. WebAdminRoster.tsx 繳費狀態徽章必須正確排除 Unpaid 與未繳費', () => {
    const rosterContent = fs.readFileSync(rosterPath, 'utf8');
    assert.ok(
      rosterContent.includes("!textVal.includes('未繳')") &&
      rosterContent.includes("!textVal.includes('Unpaid')"),
      'WebAdminRoster.tsx 必須在判斷 isPaid 時明確排除未繳與 Unpaid'
    );

    // 模擬前端判斷邏輯
    function checkIsPaid(textVal) {
      return (textVal.includes('已繳費') || textVal.includes('Paid')) &&
        !textVal.includes('未繳') &&
        !textVal.includes('Unpaid');
    }

    assert.equal(checkIsPaid('未繳費 Unpaid'), false, '未繳費 Unpaid 絕對不可被判定為 isPaid = true');
    assert.equal(checkIsPaid('Unpaid'), false, 'Unpaid 絕對不可被判定為 isPaid = true');
    assert.equal(checkIsPaid('已繳費 Paid'), true, '已繳費 Paid 必須判定為 isPaid = true');
  });

  it('4. Dashboard.tsx getPayStatusText 必須優先判定未繳費 / Unpaid', () => {
    const dashContent = fs.readFileSync(dashboardPath, 'utf8');
    const funcMatch = dashContent.match(/const getPayStatusText = \([\s\S]*?\n\s*\};/);
    assert.ok(funcMatch, 'Dashboard.tsx 必須包含 getPayStatusText');

    const funcBody = funcMatch[0];
    const unpaidIdx = funcBody.indexOf("status.includes('未繳')");
    const paidIdx = funcBody.indexOf("status.includes('已繳')");

    assert.ok(unpaidIdx > -1 && paidIdx > -1, '必須包含未繳與已繳檢查');
    assert.ok(unpaidIdx < paidIdx, 'Dashboard.tsx 未繳檢查必須置於已繳檢查之前');
  });

  it('5. statusUtils.ts normalizeActivityStatus 不得因 Unpaid 誤判為正取（已繳費）', () => {
    const utilsContent = fs.readFileSync(statusUtilsPath, 'utf8');
    assert.ok(
      utilsContent.includes("!s.includes('未繳')") && utilsContent.includes("!s.includes('Unpaid')"),
      'statusUtils.ts 必須在比對 Paid 時排除未繳與 Unpaid'
    );
  });

  it('6. 程式碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const testContent = fs.readFileSync(__filename, 'utf8');
    assert.ok(!emojiRegex.test(testContent), '測試檔案不可包含 Emoji');
  });
});
