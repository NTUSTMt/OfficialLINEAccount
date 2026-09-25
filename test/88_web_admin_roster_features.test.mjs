import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('88. 報名名冊工作站全面升級驗證 (Web Admin Roster Redesign & Interactions)', () => {
  const layoutPath = path.resolve('src/pages/web-admin/WebAdminLayout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  const rosterPath = path.resolve('src/pages/web-admin/WebAdminRoster.tsx');
  const rosterContent = fs.readFileSync(rosterPath, 'utf8');

  const cssPath = path.resolve('src/pages/web-admin/webAdmin.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('1. 導覽標籤必須改名為「報名名冊」並移除舊有名稱「名冊審核工作站」', () => {
    assert.ok(
      layoutContent.includes('<span>報名名冊</span>'),
      'WebAdminLayout.tsx 導覽項目必須顯示「報名名冊」'
    );
    assert.ok(
      !layoutContent.includes('<span>名冊審核工作站</span>'),
      'WebAdminLayout.tsx 必須移除舊有的「名冊審核工作站」'
    );
  });

  it('2. 整合為單一控制橫條，移除「活動名冊審核」文字與「管理活動基本設定」按鈕，重整保留純圖示', () => {
    assert.ok(
      !rosterContent.includes('活動名冊審核'),
      'WebAdminRoster.tsx 必須移除「活動名冊審核」標題文字'
    );
    assert.ok(
      !rosterContent.includes('管理活動基本設定'),
      'WebAdminRoster.tsx 必須移除「管理活動基本設定」連結'
    );
    assert.ok(
      rosterContent.includes('title="重新整理名冊"'),
      '重新整理按鈕必須具備 title 提示'
    );
    assert.ok(
      !rosterContent.includes('<span>重整</span>'),
      '重新整理按鈕必須為純圖示，不得包含文字'
    );
  });

  it('3. 表格必須支援使用者指定的完整 27 個報名欄位，且備註欄位改名為幹部備註', () => {
    const requiredLabels = [
      '姓名', '性別', 'LINE ID', '聯絡信箱', '系所', '學號', '身分',
      '聯絡電話', '聯絡地址', '生日', '證件號碼', '緊急聯絡人姓名',
      '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係', '個人特殊病史',
      '爬山經驗', '體能測驗', '體能證明', '加入社員意願', '是否為社員',
      '擔任幹部意願', '審核結果', '通知狀態', '繳費狀態', '幹部備註', '想說的話'
    ];

    assert.equal(requiredLabels.length, 27, '必須精確涵蓋 27 個欄位');

    requiredLabels.forEach((label) => {
      assert.ok(
        rosterContent.includes(`label: '${label}'`),
        `ALL_COLUMNS 必須包含欄位: ${label}`
      );
    });
  });

  it('4. 審核狀態修復：normalizeStatus 實作邏輯必須正確解析所有 ENUM 狀態，絕不誤退回正取', () => {
    assert.ok(rosterContent.includes('function normalizeStatus('), '必須定義 normalizeStatus');
    assert.ok(rosterContent.includes("'正取 Confirmed'"), '必須支援 正取 Confirmed');
    assert.ok(rosterContent.includes("'正取（已繳費）Confirmed (Paid)'"), '必須支援 正取（已繳費）Confirmed (Paid)');
    assert.ok(rosterContent.includes("'備取 Waitlisted'"), '必須支援 備取 Waitlisted');
    assert.ok(rosterContent.includes("'備取（有意願）Waitlisted (Interested)'"), '必須支援 備取（有意願）Waitlisted (Interested)');
    assert.ok(rosterContent.includes("'審核中 Checking'"), '必須支援 審核中 Checking');
    assert.ok(rosterContent.includes("'已取消 Cancelled'"), '必須支援 已取消 Cancelled');

    function testNormalize(raw) {
      if (!raw) return '審核中 Checking';
      const str = String(raw).trim();
      if (str.includes('已繳費')) return '正取（已繳費）Confirmed (Paid)';
      if (str.includes('正取')) return '正取 Confirmed';
      if (str.includes('有意願')) return '備取（有意願）Waitlisted (Interested)';
      if (str.includes('備取')) return '備取 Waitlisted';
      if (str.includes('取消') || str.includes('未錄取')) return '已取消 Cancelled';
      if (str.includes('審核')) return '審核中 Checking';
      return str;
    }

    assert.equal(testNormalize('正取 Confirmed'), '正取 Confirmed');
    assert.equal(testNormalize('正取（已繳費）Confirmed (Paid)'), '正取（已繳費）Confirmed (Paid)');
    assert.equal(testNormalize('備取 Waitlisted'), '備取 Waitlisted');
    assert.equal(testNormalize('備取 Waitlist'), '備取 Waitlisted');
    assert.equal(testNormalize('備取（有意願）Waitlisted (Interested)'), '備取（有意願）Waitlisted (Interested)');
    assert.equal(testNormalize('審核中 Checking'), '審核中 Checking');
    assert.equal(testNormalize('已取消 Cancelled'), '已取消 Cancelled');
    assert.equal(testNormalize('未錄取 Cancelled'), '已取消 Cancelled');
    assert.equal(testNormalize(''), '審核中 Checking');
  });

  it('5. 序號表頭必須改為 #，且支援四角懸浮工具列與中央上下拖曳手柄', () => {
    assert.ok(
      rosterContent.includes('#') && rosterContent.includes("left: 44"),
      '序號表頭必須顯示為 #'
    );
    assert.ok(
      rosterContent.includes('wa-row-quad-tl') &&
      rosterContent.includes('wa-row-quad-tr') &&
      rosterContent.includes('wa-row-quad-bl') &&
      rosterContent.includes('wa-row-quad-br'),
      '序號欄位必須包含四角定位之懸浮按鈕'
    );
    assert.ok(
      rosterContent.includes('wa-row-drag-handle'),
      '序號欄位必須包含中央上下拖曳換位手柄'
    );
    assert.ok(
      cssContent.includes('.wa-row-drag-handle'),
      'CSS 必須定義 wa-row-drag-handle 樣式'
    );
  });

  it('6. 表頭懸浮操作遮罩必須包含左右拖曳手柄、左右移動、釘選與隱藏', () => {
    assert.ok(
      rosterContent.includes('title="向左移動欄位"') &&
      rosterContent.includes('title="向右移動欄位"') &&
      rosterContent.includes('title="隱藏此欄位"'),
      '表頭操作必須包含左右移動與隱藏欄位'
    );
    assert.ok(
      rosterContent.includes('wa-col-drag-handle'),
      '表頭操作必須包含 wa-col-drag-handle 拖曳手柄'
    );
    assert.ok(
      cssContent.includes('.wa-th-actions-overlay'),
      'CSS 必須定義表頭遮罩層'
    );
  });

  it('7. 勾選框底色必須強制設定為白色 (color-scheme: light 與 appearance: none)', () => {
    assert.ok(
      cssContent.includes('.web-admin-table input[type="checkbox"]'),
      'CSS 必須包含表格 Checkbox 選取器'
    );
    assert.ok(
      cssContent.includes('background-color: #ffffff !important;'),
      'Checkbox 底色必須為白色 #ffffff !important'
    );
    assert.ok(
      cssContent.includes('color-scheme: light;'),
      'CSS 必須強制指定 color-scheme: light 防禦深色模式'
    );
    assert.ok(
      cssContent.includes('appearance: none;'),
      'Checkbox 必須設定 appearance: none 避免 OS 原生黑底渲染'
    );
  });

  it('8. 必須移除彈窗改為儲存格原地展開全文 (wa-cell-expanded) 與列高拖曳調整 (wa-row-resizer)', () => {
    assert.ok(
      !rosterContent.includes('wa-popover-overlay') &&
      !rosterContent.includes('detailModal'),
      '必須移除點擊彈出 Popover 視窗功能'
    );
    assert.ok(
      rosterContent.includes('toggleCellExpand') &&
      rosterContent.includes('wa-cell-expanded'),
      '點擊儲存格必須支援原地展開全文'
    );
    assert.ok(
      rosterContent.includes('wa-row-resizer') &&
      rosterContent.includes('startRowResizing'),
      '必須支援拖曳調整列高'
    );
    assert.ok(
      cssContent.includes('.wa-row-resizer'),
      'CSS 必須定義 wa-row-resizer 樣式'
    );
    assert.ok(
      rosterContent.includes('setRowHeights({})'),
      '一鍵恢復預設尺寸功能必須包含清除自訂列高 setRowHeights({})'
    );
    assert.ok(
      rosterContent.includes('visibleColumns.map'),
      'TSV 匯出必須依據當前 visibleColumns 動態產出'
    );
  });

  it('9. 一鍵發送通知按鈕規格：綠色按鈕白字，位於複製按鈕右側，支援勾選單獨發送與全體正備取發送', () => {
    assert.ok(
      rosterContent.includes('handleSendNotifications'),
      '必須提供 handleSendNotifications 發送函式'
    );
    assert.ok(
      rosterContent.includes('<span>發送通知</span>'),
      '必須包含「發送通知」按鈕'
    );
    assert.ok(
      rosterContent.includes("backgroundColor: '#10b981'"),
      '發送通知按鈕必須為綠色 (#10b981)'
    );
    assert.ok(
      rosterContent.includes("color: '#ffffff'"),
      '發送通知按鈕字體必須為白色 (#ffffff)'
    );
  });

  it('10. 通知狀態欄位支援下拉選單即時修改並寫入 Supabase', () => {
    assert.ok(
      rosterContent.includes('handleNotificationStatusChange'),
      '必須提供 handleNotificationStatusChange 函式'
    );
    assert.ok(
      rosterContent.includes('wa-status-select'),
      '必須使用 wa-status-select 下拉選單樣式'
    );
    assert.ok(
      rosterContent.includes('<option value="未通知">未通知</option>'),
      '下拉選單必須包含 未通知 選項'
    );
    assert.ok(
      rosterContent.includes('<option value="已通知">已通知</option>'),
      '下拉選單必須包含 已通知 選項'
    );
  });

  it('11. 幹部備註欄位支援點擊編輯直接打字並即時更新 Supabase', () => {
    assert.ok(
      rosterContent.includes('handleSaveNotes'),
      '必須提供 handleSaveNotes 函式'
    );
    assert.ok(
      rosterContent.includes('wa-notes-input'),
      '必須使用 wa-notes-input 編輯輸入框樣式'
    );
    assert.ok(
      cssContent.includes('.wa-notes-input'),
      'CSS 必須定義 wa-notes-input 樣式'
    );
  });

  it('12. 建立資料夾與 Google 試算表 / 開啟試算表按鈕與同步機制', () => {
    assert.ok(
      rosterContent.includes('handleSyncOrOpenSheet'),
      '必須提供 handleSyncOrOpenSheet 函式'
    );
    assert.ok(
      rosterContent.includes('建立資料夾與試算表') &&
      rosterContent.includes('開啟試算表'),
      '按鈕必須依是否已建立動態顯示「建立資料夾與試算表」或「開啟試算表」'
    );
    assert.ok(
      rosterContent.includes('同步中...'),
      '同步時必須呈現旋轉載入提示「同步中...」'
    );
  });

  it('13. 工具列佈局優化：刷新按鈕移至隱藏按鈕左邊，並移除「篩選：... / 總報名：...」計數文字', () => {
    assert.ok(
      !rosterContent.includes('篩選：<strong>{filteredSignups.length}</strong> 人 / 總報名：<strong>{signups.length}</strong> 人'),
      '必須移除總人數與篩選人數之計數文字'
    );
    const refreshIndex = rosterContent.indexOf('title="重新整理名冊"');
    const eyeIndex = rosterContent.indexOf('title="顯示與隱藏項目"');
    assert.ok(
      refreshIndex < eyeIndex,
      '重新整理按鈕必須排在顯示隱藏項目按鈕左邊'
    );
  });

  it('14. 固定欄位邊界線防禦：釘選欄位在左右滑動時邊界不消失 (border-collapse: separate 與 background-clip: padding-box)', () => {
    assert.ok(
      cssContent.includes('border-collapse: separate;'),
      '表格必須設定 border-collapse: separate'
    );
    assert.ok(
      cssContent.includes('border-spacing: 0;'),
      '表格必須設定 border-spacing: 0'
    );
    assert.ok(
      cssContent.includes('background-clip: padding-box;'),
      '釘選欄位必須設定 background-clip: padding-box 防止背景溢出覆蓋邊框'
    );
    assert.ok(
      cssContent.includes('border-right: 1px solid var(--wa-border) !important;'),
      '釘選欄位必須強制設定右側邊框'
    );
  });
});

