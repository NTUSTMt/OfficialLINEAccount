import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('90. 裝備借用頁面重構與優化驗證 (WebAdminLoans Redesign)', () => {
  const rootDir = process.cwd();
  const layoutPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLayout.tsx');
  const loansPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLoans.tsx');
  const cssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');

  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  const loansContent = fs.readFileSync(loansPath, 'utf-8');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  it('1. 驗證 WebAdminLayout.tsx 導覽列更名為「裝備借用」', () => {
    assert.ok(
      layoutContent.includes('<span>裝備借用</span>'),
      'WebAdminLayout.tsx 導覽項目必須更名為「裝備借用」'
    );
    assert.ok(
      !layoutContent.includes('<span>裝備借用管理</span>'),
      'WebAdminLayout.tsx 導覽項目不應再包含舊名稱「裝備借用管理」'
    );
  });

  it('2. 驗證 WebAdminLoans.tsx 頂部工具列移除橫條文字與圖示，重整鈕改為純圖示按鈕', () => {
    // 移除橫條的「裝備借用管理」文字與圖示
    assert.ok(
      !loansContent.includes('<span>裝備借用管理</span>'),
      '工具列中不應再包含「裝備借用管理」橫條文字'
    );
    // 重整按鈕為純圖示（無 <span>重整</span>）
    assert.ok(
      loansContent.includes('aria-label="重新整理借用清單"'),
      '重整按鈕必須具備無障礙標籤 aria-label'
    );
    assert.ok(
      !loansContent.includes('<span>重整</span>'),
      '重整按鈕不應再顯示文字，必須為純圖示'
    );
  });

  it('3. 驗證卡片使用雙倍寬度網格、文字靠左、純中文狀態、裝備條列與無押金規範', () => {
    assert.ok(
      loansContent.includes('wa-card-grid-loans'),
      '卡片容器必須使用 wa-card-grid-loans'
    );
    assert.ok(
      cssContent.includes('.wa-card-grid-loans'),
      'webAdmin.css 必須定義 .wa-card-grid-loans'
    );
    assert.ok(
      cssContent.includes('minmax(640px, 1fr)'),
      '.wa-card-grid-loans 必須設定 minmax(640px, 1fr) 實現卡片寬度加倍'
    );

    // 純中文狀態函式
    assert.ok(
      loansContent.includes('toChineseStatus'),
      '必須使用 toChineseStatus 將狀態轉為純中文'
    );

    // 裝備條列樣式
    assert.ok(
      loansContent.includes('wa-loan-items-row'),
      '卡片必須使用 wa-loan-items-row 條列借用裝備'
    );
    assert.ok(
      loansContent.includes('wa-loan-item-pill'),
      '裝備品項必須使用 wa-loan-item-pill 呈現'
    );

    // 租金與押金：卡片中必須只呈現租金，無押金字樣
    assert.ok(
      loansContent.includes('租金：${loan.total_rent} 元'),
      '卡片必須標示租金金額'
    );
    assert.ok(
      !loansContent.includes('押金：${loan.total_deposit}'),
      '卡片中嚴禁出現「押金：${loan.total_deposit}」'
    );

    // 底部固定列按鈕
    assert.ok(
      loansContent.includes('查看個人資料'),
      '卡片底部靠左必須包含「查看個人資料」按鈕'
    );
    assert.ok(
      loansContent.includes('查看詳細與操作'),
      '卡片底部靠右必須包含「查看詳細與操作」按鈕'
    );
  });

  const modalPath = path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx');
  const membersPath = path.join(rootDir, 'src/pages/web-admin/WebAdminMembers.tsx');

  const modalContent = fs.readFileSync(modalPath, 'utf-8');
  const membersContent = fs.readFileSync(membersPath, 'utf-8');

  it('4. 驗證卡片個人資料彈窗整合 MemberProfileModal 並支援帶參導向編輯頁面', () => {
    assert.ok(
      loansContent.includes('MemberProfileModal'),
      '必須引入並使用 MemberProfileModal'
    );
    assert.ok(
      loansContent.includes('cardProfileUserId'),
      '必須具備 cardProfileUserId 狀態控制彈窗'
    );
    assert.ok(
      loansContent.includes('/admin-web/members?userId='),
      '個人資料彈窗底部導向按鈕必須帶參導往 /admin-web/members?userId='
    );
  });

  it('5. 驗證側邊抽屜為懸浮圓角彈窗、姓名膠囊按鈕、共用 MemberProfileModal 內嵌模式與徹底移除押金', () => {
    // 姓名膠囊按鈕
    assert.ok(
      loansContent.includes('wa-name-capsule-btn'),
      '借用人姓名必須使用 wa-name-capsule-btn 膠囊按鈕包覆'
    );
    assert.ok(
      cssContent.includes('.wa-name-capsule-btn'),
      'webAdmin.css 必須定義 .wa-name-capsule-btn'
    );

    // 抽屜左側共用 MemberProfileModal inline 模式
    assert.ok(
      loansContent.includes('mode="inline"'),
      '抽屜左側展開必須共用 MemberProfileModal mode="inline"'
    );
    assert.ok(
      modalContent.includes('wa-drawer-side-profile'),
      'MemberProfileModal 必須定義 wa-drawer-side-profile 作為 inline 容器'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-side-profile'),
      'webAdmin.css 必須定義 .wa-drawer-side-profile'
    );
    assert.ok(
      loansContent.includes('sideProfileUserId'),
      '必須具備 sideProfileUserId 控制側邊個資展開'
    );

    // 抽屜中徹底移除押金
    assert.ok(
      !loansContent.includes('應付押金'),
      '抽屜時程與帳務區塊不應再出現「應付押金」'
    );
    assert.ok(
      !loansContent.includes('單項押金'),
      '抽屜借用清單表格不應再出現「單項押金」'
    );
    assert.ok(
      !loansContent.includes('已退還押金'),
      '抽屜幹部備註 placeholder 不應再出現「已退還押金」'
    );
  });

  it('6. 驗證裝備借用單詳情顯示學號、系所與 LINE ID，並支援體能證明大圖預覽面板與網址自動開抽屜', () => {
    // 學號/系所與 LINE ID 欄位
    assert.ok(
      loansContent.includes('selectedLoan.department') && loansContent.includes('selectedLoan.student_id'),
      '借用單詳情主面板必須顯示學號與系所'
    );
    assert.ok(
      loansContent.includes('selectedLoan.line_id'),
      '借用單詳情主面板必須顯示 LINE ID'
    );

    // 體能證明大圖預覽
    assert.ok(
      loansContent.includes('wa-drawer-side-preview'),
      '必須包含 wa-drawer-side-preview 大圖預覽面板'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-side-preview'),
      'webAdmin.css 必須定義 .wa-drawer-side-preview'
    );
    assert.ok(
      loansContent.includes('previewPhotoUrl'),
      '必須具備 previewPhotoUrl 狀態管理大圖預覽'
    );

    // WebAdminMembers 網址帶參自動定位
    assert.ok(
      membersContent.includes('searchParams.get(\'userId\')'),
      'WebAdminMembers 必須監聽網址 userId 參數'
    );
    assert.ok(
      membersContent.includes('handleOpenDrawer'),
      'WebAdminMembers 比對到 userId 時必須自動觸發 handleOpenDrawer'
    );
  });

  it('7. 驗證所有相關檔案嚴格遵守零 Emoji 規範', () => {
    const files = [layoutPath, loansPath, cssPath, modalPath, membersPath];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        emojiRegex.test(content),
        false,
        `檔案 ${path.basename(filePath)} 含有違規 Emoji 字元`
      );
    }
  });
});
