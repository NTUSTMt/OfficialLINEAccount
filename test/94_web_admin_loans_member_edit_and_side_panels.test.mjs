import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('94. 裝備借用開啟個資編輯抽屜、體能證明同級大圖預覽與歷史履歷左側同級展開驗證 (v0.1.218)', () => {
  const loansPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLoans.tsx');
  const drawerPath = path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx');
  const modalPath = path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx');
  const webAdminCssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');

  const loansContent = fs.readFileSync(loansPath, 'utf-8');
  const drawerContent = fs.readFileSync(drawerPath, 'utf-8');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');
  const cssContent = fs.readFileSync(webAdminCssPath, 'utf-8');

  it('1. 驗證 WebAdminLoans 在借用抽屜中點擊個資編輯直接開啟 MemberEditDrawer 且疊加在最上層', () => {
    assert.ok(
      loansContent.includes('onOpenEditDrawer={(uid) => {'),
      'WebAdminLoans inline 模式之 MemberProfileModal 必須傳入 onOpenEditDrawer'
    );
    assert.ok(
      loansContent.includes('setEditDrawerUserId(uid)') && loansContent.includes('setEditDrawerOpen(true)'),
      'onOpenEditDrawer 必須設定 editDrawerUserId 並開啟 editDrawer'
    );
    assert.ok(
      loansContent.includes('isStacked={drawerOpen}'),
      'MemberEditDrawer 必須支援 isStacked 屬性，在底層抽屜開啟時疊加於最上層'
    );
  });

  it('2. 驗證 MemberEditDrawer 之歷史履歷為左側同級視窗且抽屜主體維持編輯表單', () => {
    assert.ok(
      drawerContent.includes('showTimeline') && drawerContent.includes('setShowTimeline'),
      'MemberEditDrawer 必須具有 showTimeline 狀態切換'
    );
    assert.ok(
      drawerContent.includes('wa-drawer-side-timeline'),
      'MemberEditDrawer 必須渲染 wa-drawer-side-timeline 同級履歷面板'
    );
    assert.ok(
      drawerContent.includes('wa-drawer-side-preview'),
      'MemberEditDrawer 必須渲染 wa-drawer-side-preview 同級大圖面板'
    );
    // 驗證三欄 DOM 順序：preview (最左) -> timeline (中間) -> panel (主抽屜右側)
    const previewIdx = drawerContent.indexOf('wa-drawer-side-preview');
    const timelineIdx = drawerContent.indexOf('wa-drawer-side-timeline');
    const panelIdx = drawerContent.indexOf('wa-drawer-panel');
    assert.ok(
      previewIdx < timelineIdx && timelineIdx < panelIdx,
      'DOM 元素排列順序必須為：照片預覽 (最左) -> 歷史履歷 (中間) -> 主編輯表單 (右側)'
    );
  });

  it('3. 驗證 MemberProfileModal 體能證明顯示縮圖網格，且 Modal 模式下大圖展開於右側同級', () => {
    assert.ok(
      modalContent.includes('getDriveThumbnail'),
      'MemberProfileModal 必須使用 getDriveThumbnail 渲染體能證明縮圖'
    );
    assert.ok(
      modalContent.includes('internalPreviewUrl'),
      'MemberProfileModal 必須維護 internalPreviewUrl 預覽大圖狀態'
    );
    assert.ok(
      modalContent.includes('alt="體能證明大圖預覽"'),
      'Modal 模式下點擊縮圖必須在右側同級渲染大圖預覽卡片'
    );
  });

  it('4. 驗證 webAdmin.css 徹底杜絕 1500px 覆蓋樣式，並支援水平捲動與側邊同級面板', () => {
    assert.ok(
      !cssContent.includes('@media (max-width: 1500px)'),
      'webAdmin.css 必須徹底移除 1500px 將照片置中覆蓋的破版樣式'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-side-timeline'),
      'webAdmin.css 必須定義 .wa-drawer-side-timeline 樣式'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-backdrop-stacked'),
      'webAdmin.css 必須定義 .wa-drawer-backdrop-stacked 高層級樣式'
    );
    assert.ok(
      cssContent.includes('overflow-x: auto'),
      'wa-drawer-backdrop 必須具備 overflow-x: auto 支援多欄水平捲動'
    );
  });

  it('5. 驗證水平捲動手勢防穿透 (overscroll-behavior) 與大圖預覽亮色藝廊風格 (v0.1.219)', () => {
    assert.ok(
      cssContent.includes('overscroll-behavior-x: contain'),
      'wa-drawer-backdrop 必須具備 overscroll-behavior-x: contain 杜絕上一頁手勢衝突'
    );
    assert.ok(
      cssContent.includes('.wa-drawer-backdrop > *:first-child') && cssContent.includes('margin-left: auto'),
      'wa-drawer-backdrop 必須利用 first-child margin-left auto 消除負向座標捲動資料遺失'
    );
    assert.ok(
      drawerContent.includes('backdropRef'),
      'MemberEditDrawer 必須使用 backdropRef 實現多欄展開平滑對齊'
    );
    assert.ok(
      modalContent.includes('backgroundColor: \'#f8fafc\'') || modalContent.includes('backgroundColor: "#f8fafc"'),
      'MemberProfileModal 預覽大圖畫布必須改用柔和淺灰亮色藝廊風格'
    );
  });
});
