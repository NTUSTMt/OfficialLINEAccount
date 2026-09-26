import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('93. 電腦工作站全模組高階表格與個人資料編輯重構驗證 (Web Admin Advanced Tables & Member Drawer)', () => {
  const rootDir = process.cwd();
  const drawerPath = path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx');
  const modalPath = path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx');
  const rosterPath = path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx');
  const loansPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLoans.tsx');
  const membersPath = path.join(rootDir, 'src/pages/web-admin/WebAdminMembers.tsx');
  const inventoryPath = path.join(rootDir, 'src/pages/web-admin/WebAdminInventory.tsx');
  const financePath = path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx');
  const webAdminCssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');

  const drawerContent = fs.readFileSync(drawerPath, 'utf-8');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');
  const rosterContent = fs.readFileSync(rosterPath, 'utf-8');
  const loansContent = fs.readFileSync(loansPath, 'utf-8');
  const membersContent = fs.readFileSync(membersPath, 'utf-8');
  const inventoryContent = fs.readFileSync(inventoryPath, 'utf-8');
  const financeContent = fs.readFileSync(financePath, 'utf-8');
  const webAdminCssContent = fs.readFileSync(webAdminCssPath, 'utf-8');

  it('1. 驗證 MemberEditDrawer 獨立共用封裝、雙分頁與 0 Diff 自動關閉邏輯', () => {
    assert.ok(
      drawerContent.includes('export const MemberEditDrawer'),
      'MemberEditDrawer 必須被匯出為獨立組件'
    );
    assert.ok(
      drawerContent.includes('wa-drawer-side-timeline') || (drawerContent.includes("'profile'") && drawerContent.includes("'timeline'")),
      'MemberEditDrawer 必須支援 Profile 表單與 Timeline 歷史履歷'
    );
    assert.ok(
      drawerContent.includes('handleTriggerDiffCheck') && drawerContent.includes('diffs'),
      'MemberEditDrawer 必須具備 handleTriggerDiffCheck 比對欄位差異'
    );
    assert.ok(
      drawerContent.includes('diffs.length === 0'),
      'MemberEditDrawer 必須檢查 diffs.length === 0'
    );
    assert.ok(
      drawerContent.includes('onClose()'),
      '0 Diff 時按下儲存變更必須直接調用 onClose() 關閉'
    );
    assert.ok(
      drawerContent.includes('logWebAuditAction'),
      'MemberEditDrawer 儲存時必須記錄幹部審計日誌'
    );
  });

  it('2. 驗證 MemberProfileModal 支援 onOpenEditDrawer 且按鈕文案為「開啟詳細資料編輯頁面」', () => {
    assert.ok(
      modalContent.includes('onOpenEditDrawer?: (userId: string) => void;'),
      'MemberProfileModal Props 必須包含 onOpenEditDrawer 選填屬性'
    );
    assert.ok(
      modalContent.includes('開啟詳細資料編輯頁面'),
      'MemberProfileModal 底部按鈕文字必須更新為「開啟詳細資料編輯頁面」'
    );
    assert.ok(
      modalContent.includes('onOpenEditDrawer(targetUserId)'),
      '點擊時若傳入 onOpenEditDrawer 必須執行該回呼'
    );
  });

  it('3. 驗證報名名冊、裝備借用、財務對帳與社員名冊皆正確掛載 MemberEditDrawer', () => {
    assert.ok(
      rosterContent.includes('MemberEditDrawer'),
      'WebAdminRoster 必須引入並掛載 MemberEditDrawer'
    );
    assert.ok(
      loansContent.includes('MemberEditDrawer'),
      'WebAdminLoans 必須引入並掛載 MemberEditDrawer'
    );
    assert.ok(
      financeContent.includes('MemberEditDrawer'),
      'WebAdminFinance 必須引入並掛載 MemberEditDrawer'
    );
    assert.ok(
      membersContent.includes('MemberEditDrawer'),
      'WebAdminMembers 必須引入並掛載 MemberEditDrawer'
    );
  });

  it('4. 驗證裝備庫存與財務對帳引進高階表格狀態引擎 (useAdvancedTable) 與相關操作特徵', () => {
    assert.ok(
      inventoryContent.includes('useAdvancedTable'),
      'WebAdminInventory 必須使用 useAdvancedTable 勾子'
    );
    assert.ok(
      inventoryContent.includes('wa-col-resizer'),
      'WebAdminInventory 表頭必須包含拖曳調整欄寬手柄 (wa-col-resizer)'
    );
    assert.ok(
      inventoryContent.includes('wa-row-actions-quad'),
      'WebAdminInventory 必須包含序號列四角懸浮操作列 (wa-row-actions-quad)'
    );
    assert.ok(
      inventoryContent.includes('wa-row-drag-handle'),
      'WebAdminInventory 必須包含列中央拖曳手柄 (wa-row-drag-handle)'
    );

    assert.ok(
      financeContent.includes('useAdvancedTable'),
      'WebAdminFinance 必須使用 useAdvancedTable 勾子'
    );
    assert.ok(
      financeContent.includes('wa-col-resizer'),
      'WebAdminFinance 表頭必須包含拖曳調整欄寬手柄 (wa-col-resizer)'
    );
    assert.ok(
      financeContent.includes('wa-row-actions-quad'),
      'WebAdminFinance 必須包含序號列四角懸浮操作列 (wa-row-actions-quad)'
    );
    assert.ok(
      financeContent.includes('wa-row-drag-handle'),
      'WebAdminFinance 必須包含列中央拖曳手柄 (wa-row-drag-handle)'
    );
  });

  it('5. 驗證 webAdmin.css 中 wa-th-actions-overlay 具備 flex-wrap: wrap 與安全換行排版', () => {
    assert.ok(
      webAdminCssContent.includes('.wa-th-actions-overlay'),
      'webAdmin.css 必須包含 .wa-th-actions-overlay 樣式'
    );
    assert.ok(
      webAdminCssContent.includes('flex-wrap: wrap;'),
      '.wa-th-actions-overlay 必須包含 flex-wrap: wrap 以保護窄欄位'
    );
  });

  it('6. 驗證裝備借用卡片網格支援自適應 3 欄排版規則 (.wa-card-grid-loans)', () => {
    assert.ok(
      webAdminCssContent.includes('.wa-card-grid-loans'),
      'webAdmin.css 必須定義 .wa-card-grid-loans'
    );
    assert.ok(
      webAdminCssContent.includes('minmax(360px, 1fr)'),
      '.wa-card-grid-loans 必須設定基礎單欄最小寬度 minmax(360px, 1fr)'
    );
    assert.ok(
      loansContent.includes('wa-card-grid-loans'),
      'WebAdminLoans 卡片列表容器必須套用 wa-card-grid-loans 樣式類別'
    );
  });

  it('7. 驗證社員名冊身分簡稱「臺科在校生」與卡片底部固定貼齊 (wa-card-footer 貼底)', () => {
    assert.ok(
      membersContent.includes('<option value="臺科在校生">臺科在校生</option>'),
      'WebAdminMembers 身分篩選選項必須為「臺科在校生」'
    );
    assert.ok(
      !membersContent.includes('<option value="臺科大在校學生">'),
      'WebAdminMembers 身分篩選選項不應再包含舊長文案「臺科大在校學生」'
    );
    assert.ok(
      webAdminCssContent.includes('.wa-card-footer') &&
      webAdminCssContent.includes('margin-top: auto;'),
      '卡片底部 .wa-card-footer 必須包含 margin-top: auto 確保貼齊底部'
    );
  });

  it('8. 驗證所有相關模組嚴格遵守零 Emoji 規範', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const filesToCheck = [
      { name: 'MemberEditDrawer.tsx', content: drawerContent },
      { name: 'MemberProfileModal.tsx', content: modalContent },
      { name: 'WebAdminRoster.tsx', content: rosterContent },
      { name: 'WebAdminLoans.tsx', content: loansContent },
      { name: 'WebAdminMembers.tsx', content: membersContent },
      { name: 'WebAdminInventory.tsx', content: inventoryContent },
      { name: 'WebAdminFinance.tsx', content: financeContent },
      { name: 'webAdmin.css', content: webAdminCssContent },
    ];

    for (const f of filesToCheck) {
      assert.ok(
        !emojiRegex.test(f.content),
        `檔案 ${f.name} 不得包含任何 Emoji 符號`
      );
    }
  });
});
