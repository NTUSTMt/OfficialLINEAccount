import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('92. 電腦版工作站版面優化、頂部狀態列重構與財務核銷工作流驗證 (Web Admin Redesign & Finance Workflow)', () => {
  const rootDir = process.cwd();
  const indexCssPath = path.join(rootDir, 'src/index.css');
  const webAdminCssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');
  const layoutPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLayout.tsx');
  const financePath = path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx');

  const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');
  const webAdminCssContent = fs.readFileSync(webAdminCssPath, 'utf-8');
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  const financeContent = fs.readFileSync(financePath, 'utf-8');

  it('1. 驗證全站左側大塊空白移除：index.css #root 移除 1126px 限制，webAdmin.css wrapper 採用 width: 100%', () => {
    assert.ok(
      !indexCssContent.includes('1126px'),
      'index.css #root 必須移除 1126px 固定寬度設定'
    );
    assert.ok(
      indexCssContent.includes('width: 100%'),
      'index.css #root 必須設定為全寬 width: 100%'
    );
    assert.ok(
      webAdminCssContent.includes('width: 100%'),
      'webAdmin.css .web-admin-wrapper 必須為 width: 100%'
    );
    assert.ok(
      !webAdminCssContent.includes('width: 100vw'),
      'webAdmin.css .web-admin-wrapper 必須移除 width: 100vw 以免造成橫向溢出'
    );
  });

  it('2. 驗證頂部狀態列品牌更名為 NTUST Mountaineering 並移除電腦工作站徽章', () => {
    assert.ok(
      layoutContent.includes('<span>NTUST Mountaineering</span>'),
      '頂部品牌文字必須為「NTUST Mountaineering」'
    );
    assert.ok(
      !layoutContent.includes('台科登山社'),
      '頂部品牌不應再包含舊名稱「台科登山社」'
    );
    assert.ok(
      !layoutContent.includes('web-admin-brand-badge'),
      '頂部品牌必須移除「電腦工作站」徽章'
    );
  });

  it('3. 驗證頂部分頁導航排序：活動管理 -> 報名名冊 -> 社員名冊 -> 財務對帳 -> 裝備借用 -> 裝備庫存', () => {
    const navItems = [
      '/admin-web/events',
      '/admin-web/roster',
      '/admin-web/members',
      '/admin-web/finance',
      '/admin-web/loans',
      '/admin-web/inventory',
    ];

    let lastIdx = -1;
    for (const item of navItems) {
      const currentIdx = layoutContent.indexOf(item);
      assert.ok(currentIdx > -1, `導覽列必須包含路由 ${item}`);
      assert.ok(
        currentIdx > lastIdx,
        `路由 ${item} 的順序不正確，必須依照指定順序排列`
      );
      lastIdx = currentIdx;
    }
  });

  it('4. 驗證幹部資訊懸浮下拉選單展示登出按鈕 (Dropdown Popover)', () => {
    assert.ok(
      layoutContent.includes('web-admin-user-dropdown'),
      'WebAdminLayout 必須包含幹部下拉選單容器'
    );
    assert.ok(
      layoutContent.includes('isUserMenuOpen'),
      'WebAdminLayout 必須具備 isUserMenuOpen 狀態管理'
    );
    assert.ok(
      layoutContent.includes('web-admin-dropdown-logout-btn'),
      '下拉選單必須包含登出按鈕'
    );
    assert.ok(
      layoutContent.includes('onMouseEnter') && layoutContent.includes('onMouseLeave'),
      '幹部使用者區塊必須掛載滑鼠懸停事件'
    );
    assert.ok(
      webAdminCssContent.includes('.web-admin-user-dropdown'),
      'webAdmin.css 必須具備 .web-admin-user-dropdown 樣式'
    );
  });

  it('5. 驗證財務對帳申請人姓名膠囊化、整合 MemberProfileModal 與直通社員編輯', () => {
    assert.ok(
      financeContent.includes('wa-name-capsule-btn'),
      '財務對帳表格申請人姓名必須以 wa-name-capsule-btn 膠囊包覆'
    );
    assert.ok(
      financeContent.includes('MemberProfileModal'),
      'WebAdminFinance 必須引入並使用 MemberProfileModal'
    );
    assert.ok(
      financeContent.includes('/admin-web/members?userId='),
      '個人資料彈窗底部必須具備直通電腦版社員編輯之導航連結'
    );
  });

  it('6. 驗證待繳費 Unpaid 狀態嚴格隱藏「確認核銷」按鈕，僅待確認顯示核銷', () => {
    assert.ok(
      financeContent.includes('isChecking'),
      'WebAdminFinance 必須定義 isChecking 狀態判定'
    );
    // 檢查確認核銷按鈕僅在 isChecking 時渲染
    const verifyBtnConditionMatch = financeContent.includes('isChecking ? (') || financeContent.includes('isChecking &&');
    assert.ok(
      verifyBtnConditionMatch,
      '「確認核銷」按鈕必須只在待確認 (isChecking) 狀態時渲染'
    );
  });

  it('7. 驗證操作欄放入筆圖示 (Pencil) 與右側滑出式編輯抽屜 (Slide-over Drawer)', () => {
    assert.ok(
      financeContent.includes('<Pencil size={13} />'),
      '操作欄位必須具備筆的圖示按鈕'
    );
    assert.ok(
      financeContent.includes('wa-drawer-backdrop') && financeContent.includes('wa-drawer-panel'),
      'WebAdminFinance 必須具備懸浮圓角側邊抽屜結構'
    );
    assert.ok(
      financeContent.includes('drawerStatus') && financeContent.includes('drawerNotes'),
      '側邊抽屜必須支援編輯狀態與幹部備註'
    );
    assert.ok(
      financeContent.includes('updatePaymentAndLinkedStatusInSupabase'),
      '側邊抽屜儲存必須調用 updatePaymentAndLinkedStatusInSupabase'
    );
  });

  it('8. 驗證長文字欄位點擊原地展開調整欄高 (Cell Expansion)', () => {
    assert.ok(
      financeContent.includes('toggleCellExpand'),
      'WebAdminFinance 必須提供 toggleCellExpand 函式'
    );
    assert.ok(
      financeContent.includes('wa-cell-expanded') && financeContent.includes('wa-cell-ellipsis'),
      '欄位展開必須支援 wa-cell-expanded 與 wa-cell-ellipsis 切換以自適應調整欄高'
    );
    assert.ok(
      financeContent.includes('wa-clickable-cell'),
      '支援展開之欄位必須套用 wa-clickable-cell 類別'
    );
  });
});
