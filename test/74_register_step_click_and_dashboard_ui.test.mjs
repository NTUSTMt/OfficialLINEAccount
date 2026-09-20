import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('74. 個資填寫頁碼跳轉、大頭貼選單緊湊化與加入活動群組按鈕單語言顯示測試', () => {
  const registerContent = fs.readFileSync(path.resolve('src/pages/Register.tsx'), 'utf8');
  const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const dashboardContent = fs.readFileSync(path.resolve('src/pages/Dashboard.tsx'), 'utf8');
  const appCssContent = fs.readFileSync(path.resolve('src/App.css'), 'utf8');
  const zhJson = JSON.parse(fs.readFileSync(path.resolve('src/locales/zh.json'), 'utf8'));
  const enJson = JSON.parse(fs.readFileSync(path.resolve('src/locales/en.json'), 'utf8'));

  it('1. 資料填寫頂部頁碼應可點擊跳轉且具備 step 1 必填防呆保護', () => {
    // 檢查步驟進度條具備 onClick 點擊跳轉
    assert.ok(
      registerContent.includes('onClick={() => setStep(s)}'),
      'Step progress bar dots should be clickable with setStep(s)'
    );
    // 檢查有無障礙角色設定
    assert.ok(
      registerContent.includes('role="button"'),
      'Step progress dot should have role="button"'
    );
    // 檢查 CSS 中具備指針手勢
    assert.ok(
      appCssContent.includes('cursor: pointer;') && appCssContent.includes('.step-dot-wrapper:hover .step-dot'),
      'step-dot-wrapper should have cursor: pointer and hover micro-interaction'
    );
    // 檢查 handleSubmit 具備 step 1 必填校驗防呆（防止使用者直接跳到步驟 4 送出缺漏必填）
    assert.ok(
      registerContent.includes('isStep1Complete') && registerContent.includes('setStep(1)'),
      'handleSubmit should verify step 1 fields and redirect to step 1 if incomplete'
    );
  });

  it('2. 大頭貼下拉選單應緊湊自適應內容寬度，消除右側多餘空白', () => {
    // 檢查 dropdown-menu 寬度採用 max-content 與 minWidth: 120px
    assert.ok(
      appContent.includes("width: 'max-content'"),
      'dropdown-menu should use width: max-content'
    );
    assert.ok(
      appContent.includes("minWidth: '120px'"),
      'dropdown-menu should specify minWidth: 120px'
    );
    // 檢查選項 padding 調整為更緊湊的 8px 14px 且 whiteSpace 為 nowrap
    assert.ok(
      appContent.includes("padding: '8px 14px'"),
      'dropdown items should use compact padding 8px 14px'
    );
    assert.ok(
      appContent.includes("whiteSpace: 'nowrap'"),
      'dropdown items should have whiteSpace: nowrap'
    );
  });

  it('3. 個人主頁加入活動群組按鈕應依當前語系單語言顯示，不應中英並陳', () => {
    // 檢查多國語言字典包含 joinGroup 鍵
    assert.strictEqual(zhJson.dashboard?.activity?.joinGroup, '加入活動群組');
    assert.strictEqual(enJson.dashboard?.activity?.joinGroup, 'Join Group');

    // 檢查 Dashboard.tsx 不再硬編碼中英雙語文字
    assert.ok(
      !dashboardContent.includes('加入活動群組 Join Group'),
      'Dashboard.tsx should not contain hardcoded bilingual Join Group text'
    );
    // 檢查使用 i18n 翻譯標籤
    assert.ok(
      dashboardContent.includes("t('dashboard.activity.joinGroup', '加入活動群組')"),
      'Dashboard.tsx should use localized joinGroup key'
    );
  });
});
