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

  it('3. 表格必須支援使用者指定的完整 27 個報名欄位', () => {
    const requiredLabels = [
      '姓名', '性別', 'LINE ID', '聯絡信箱', '系所', '學號', '身分',
      '聯絡電話', '聯絡地址', '生日', '證件號碼', '緊急聯絡人姓名',
      '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係', '個人特殊病史',
      '爬山經驗', '體能測驗', '體能證明', '加入社員意願', '是否為社員',
      '擔任幹部意願', '審核結果', '通知狀態', '繳費狀態', '備註', '想說的話'
    ];

    assert.equal(requiredLabels.length, 27, '必須精確涵蓋 27 個欄位');

    requiredLabels.forEach((label) => {
      assert.ok(
        rosterContent.includes(`label: '${label}'`),
        `ALL_COLUMNS 必須包含欄位: ${label}`
      );
    });
  });

  it('4. 審核狀態修復：normalizeStatus 必須正確解析所有 ENUM 狀態，絕不誤退回正取', async () => {
    // 動態載入 WebAdminRoster 的 normalizeStatus
    const mod = await import('../src/pages/web-admin/WebAdminRoster.tsx');
    const { normalizeStatus } = mod;

    assert.equal(normalizeStatus('正取 Confirmed'), '正取 Confirmed');
    assert.equal(normalizeStatus('正取（已繳費）Confirmed (Paid)'), '正取（已繳費）Confirmed (Paid)');
    assert.equal(normalizeStatus('備取 Waitlisted'), '備取 Waitlisted');
    assert.equal(normalizeStatus('備取 Waitlist'), '備取 Waitlisted');
    assert.equal(normalizeStatus('備取（有意願）Waitlisted (Interested)'), '備取（有意願）Waitlisted (Interested)');
    assert.equal(normalizeStatus('審核中 Checking'), '審核中 Checking');
    assert.equal(normalizeStatus('已取消 Cancelled'), '已取消 Cancelled');
    assert.equal(normalizeStatus('未錄取 Cancelled'), '已取消 Cancelled');
    assert.equal(normalizeStatus(''), '審核中 Checking');
  });

  it('5. 序號表頭必須改為 #，且支援四角懸浮工具列覆蓋序號', () => {
    assert.ok(
      rosterContent.includes('<th style={{ width: 46, minWidth: 46, maxWidth: 46, textAlign: \'center\', position: \'sticky\', left: 44, zIndex: 20, backgroundColor: \'#f8fafc\' }}>\n                #\n              </th>'),
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
      cssContent.includes('.wa-row-quad-tl') &&
      cssContent.includes('.wa-row-quad-tr') &&
      cssContent.includes('.wa-row-quad-bl') &&
      cssContent.includes('.wa-row-quad-br'),
      'CSS 必須定義四角懸浮操作按鈕'
    );
  });

  it('6. 表頭懸浮操作遮罩必須包含左右移動、釘選與隱藏', () => {
    assert.ok(
      rosterContent.includes('title="向左移動欄位"') &&
      rosterContent.includes('title="向右移動欄位"') &&
      rosterContent.includes('title="隱藏此欄位"'),
      '表頭操作必須包含左右移動與隱藏欄位'
    );
    assert.ok(
      cssContent.includes('.wa-th-actions-overlay'),
      'CSS 必須定義表頭遮罩層'
    );
  });

  it('7. 勾選框底色必須強制設定為白色', () => {
    assert.ok(
      cssContent.includes('.web-admin-table input[type="checkbox"]'),
      'CSS 必須包含表格 Checkbox 選取器'
    );
    assert.ok(
      cssContent.includes('background-color: #ffffff !important;'),
      'Checkbox 底色必須為白色 #ffffff !important'
    );
  });

  it('8. 必須包含 Popover 展開長文字卡片與 TSV 所見即所得複製功能', () => {
    assert.ok(
      rosterContent.includes('wa-popover-overlay') &&
      rosterContent.includes('wa-popover-card'),
      '必須提供浮動彈窗 Popover 檢視長文字'
    );
    assert.ok(
      rosterContent.includes('visibleColumns.map'),
      'TSV 匯出必須依據當前 visibleColumns 動態產出'
    );
  });
});
