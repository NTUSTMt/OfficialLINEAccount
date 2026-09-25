import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('88. 社員名冊頁面重構與優化驗證 (WebAdminMembers Redesign)', () => {
  const rootDir = process.cwd();
  const layoutPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLayout.tsx');
  const membersPath = path.join(rootDir, 'src/pages/web-admin/WebAdminMembers.tsx');
  const cssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');
  const migrationPath = path.join(rootDir, 'supabase/migrations/20260925_add_avatar_url_to_members.sql');

  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  const membersContent = fs.readFileSync(membersPath, 'utf-8');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

  it('1. 驗證 WebAdminLayout.tsx 導覽列更名為「社員名冊」', () => {
    assert.ok(
      layoutContent.includes('<span>社員名冊</span>'),
      'WebAdminLayout.tsx 導覽項目必須更名為「社員名冊」'
    );
    assert.ok(
      !layoutContent.includes('<span>全社社員名冊</span>'),
      'WebAdminLayout.tsx 導覽項目不應再包含「全社社員名冊」'
    );
  });

  it('2. 驗證 WebAdminMembers.tsx 頂部工具列移除橫條多餘文字，重整鈕改為純圖示按鈕', () => {
    // 移除橫條的「全社社員名冊」文字與圖示
    assert.ok(
      !membersContent.includes('<span>全社社員名冊</span>'),
      '工具列中不應再包含「全社社員名冊」橫條文字'
    );
    // 重整按鈕為純圖示（無 <span>重整</span>）
    assert.ok(
      membersContent.includes('aria-label="重新整理名冊"'),
      '重整按鈕必須具備無障礙標籤 aria-label'
    );
    assert.ok(
      !membersContent.includes('<span>重整</span>'),
      '重整按鈕不應再顯示文字，必須為純圖示'
    );
  });

  it('3. 驗證社員卡片採用純靠左排版、單鍵複製與雙軌頭貼機制', () => {
    assert.ok(
      membersContent.includes('wa-card-member'),
      '社員卡片必須使用 wa-card-member 專屬容器'
    );
    assert.ok(
      membersContent.includes('wa-card-top'),
      '社員卡片頂部必須包含 wa-card-top 排版容器'
    );
    assert.ok(
      membersContent.includes('avatar_url'),
      '社員卡片必須支援讀取 avatar_url'
    );
    assert.ok(
      membersContent.includes('wa-card-avatar-fallback'),
      '無頭貼時必須提供姓名首字之備援頭貼'
    );
    // 單鍵複製功能
    assert.ok(
      membersContent.includes('handleCopyText'),
      '必須具備 handleCopyText 處理單鍵複製'
    );
    assert.ok(
      membersContent.includes('wa-copy-btn'),
      '學號、LINE ID、電話、Gmail 必須包含 wa-copy-btn 複製按鈕'
    );
    assert.ok(
      membersContent.includes('e.stopPropagation()'),
      '點擊複製按鈕必須阻止事件冒泡，杜絕誤開啟側邊抽屜'
    );
    // 卡片標籤與底部
    assert.ok(
      membersContent.includes('<span>社員</span>') || membersContent.includes('非社員'),
      '卡片必須包含社員狀態標籤 (社員 / 非社員)'
    );
    assert.ok(
      membersContent.includes('註冊：'),
      '卡片底部靠左必須包含註冊日期'
    );
    assert.ok(
      membersContent.includes('編輯個人資料'),
      '卡片底部靠右必須包含編輯個人資料'
    );
  });

  it('4. 驗證側邊抽屜為懸浮圓角彈窗，並支援想說的話與左側照片放大檢視', () => {
    // 懸浮圓角樣式
    assert.ok(
      cssContent.includes('.wa-drawer-panel'),
      'webAdmin.css 必須定義 .wa-drawer-panel'
    );
    assert.ok(
      cssContent.includes('border-radius: 18px;'),
      '.wa-drawer-panel 必須設定 18px 圓角呈現圓滑彈窗感'
    );
    // 左側大圖檢視面板
    assert.ok(
      membersContent.includes('wa-drawer-side-preview'),
      '抽屜左側必須具備 wa-drawer-side-preview 照片放大面板'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-side-preview'),
      'webAdmin.css 必須定義 .wa-drawer-side-preview 樣式'
    );
    // 體能證明縮圖與想說的話
    assert.ok(
      membersContent.includes('want_to_say'),
      '抽屜表單必須包含 want_to_say (想說的話) 欄位'
    );
    assert.ok(
      membersContent.includes('proof_urls'),
      '抽屜表單必須支援 proof_urls 體能證明照片縮圖展示'
    );
    assert.ok(
      membersContent.includes('wa-proof-grid'),
      '必須使用 wa-proof-grid 容器排列體能證明縮圖'
    );
    // 儲存按鈕簡化
    assert.ok(
      membersContent.includes('<span>儲存變更</span>'),
      '儲存按鈕文字必須簡化為「儲存變更」'
    );
    assert.ok(
      !membersContent.includes('<span>儲存變更 (比對 Diff)</span>'),
      '儲存按鈕不應再包含「(比對 Diff)」後綴'
    );
  });

  it('5. 驗證歷史履歷徹底消除「日期：-」破圖，支援分類標籤與彩色狀態徽章', () => {
    assert.ok(
      membersContent.includes('item.date_display'),
      '履歷卡片必須優先讀取 RPC 之 date_display 欄位，徹底消除「-」破圖'
    );
    assert.ok(
      membersContent.includes('wa-timeline-card'),
      '履歷清單必須使用 wa-timeline-card 卡片樣式'
    );
    assert.ok(
      membersContent.includes('wa-timeline-category-tag'),
      '履歷卡片必須具備活動、裝備、繳費專屬類別標籤'
    );
    assert.ok(
      membersContent.includes('web-admin-badge-success'),
      '履歷狀態徽章必須支援成功/正取/已歸還綠色標籤'
    );
    assert.ok(
      membersContent.includes('web-admin-badge-warning'),
      '履歷狀態徽章必須支援待領取/待審核橘色標籤'
    );
  });

  it('6. 驗證 Diff 比對確認彈窗嚴格靠左對齊', () => {
    assert.ok(
      membersContent.includes("textAlign: 'left'"),
      'Diff 彈窗標題與文字必須設定靠左對齊'
    );
  });

  it('7. 驗證資料庫遷移檔 20260925_add_avatar_url_to_members.sql 結構正確', () => {
    assert.ok(
      migrationContent.includes('ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;'),
      '遷移檔必須包含向 members 表新增 avatar_url 欄位之 DDL 語法'
    );
  });
});
