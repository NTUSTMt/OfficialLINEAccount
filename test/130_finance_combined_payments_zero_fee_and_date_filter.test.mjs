import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('130. 財務報表自訂日期排版修復、合併繳費依活動拆分計算與 0 元活動對帳清單 (v0.1.317)', () => {
  const rootDir = process.cwd();
  const drawerTsxPath = path.join(rootDir, 'src', 'components', 'admin', 'FinanceReportDrawer.tsx');
  const webAdminCssPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'webAdmin.css');
  const webAdminFinanceTsxPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminFinance.tsx');
  const supabaseClientTsPath = path.join(rootDir, 'src', 'utils', 'supabaseClient.ts');
  const adminRpcSqlPath = path.join(rootDir, 'supabase', 'admin_portal_rpc.sql');

  it('1. 報表抽屜篩選列採固定上下分行排列，並包含專屬日期容器樣式防破圖', () => {
    const drawerTsx = fs.readFileSync(drawerTsxPath, 'utf8');
    const css = fs.readFileSync(webAdminCssPath, 'utf8');

    // 檢查 CSS 類別宣告
    assert.ok(css.includes('.wa-report-date-inputs'), '必須定義 .wa-report-date-inputs 樣式');
    assert.ok(css.includes('.wa-report-date-separator'), '必須定義 .wa-report-date-separator 樣式');

    // 檢查 Drawer JSX 結構為兩個分立的 wa-report-filter-row
    assert.ok(drawerTsx.includes('className="wa-report-date-inputs"'), '自訂起訖必須使用 wa-report-date-inputs 容器');
    assert.ok(drawerTsx.includes('className="wa-report-date-separator">至</span>'), '至分隔符號必須套用 wa-report-date-separator');
  });

  it('2. 財務報表 Mode A 活動明細支援合併繳費金額依活動拆分與 0 元活動達成率', () => {
    const drawerTsx = fs.readFileSync(drawerTsxPath, 'utf8');

    // 檢查活動專案篩選之合併繳費拆分邏輯
    assert.ok(drawerTsx.includes('const eventFee = parseEventFee(currentEvent)'), '必須讀取當前活動的標準定價');
    assert.ok(drawerTsx.includes('amount: eventFee'), '合併繳費在該活動之金額必須拆分為該活動本身的費用');
    assert.ok(drawerTsx.includes('is_combined: true'), '必須標記 is_combined 旗標');
    assert.ok(drawerTsx.includes('combined_total: it.amount'), '必須保存原始合併總額');

    // 檢查 0 元活動達成率：當應收為 0 且無欠款時應為 100%
    assert.ok(drawerTsx.includes('exp > 0 ? (conf / exp) * 100 : (unp === 0 && chk === 0) ? 100 : 0'), '0 元活動且無未繳待確認時達成率必須為 100%');

    // 檢查異常與未繳名冊中呈現合併總額說明
    assert.ok(drawerTsx.includes('item.is_combined'), '名冊必須支援 is_combined 判定');
    assert.ok(drawerTsx.includes('合併繳費，總額 NT$'), '名冊必須呈現合併繳費總額提示');
  });

  it('3. 財務管理總表 (WebAdminFinance) 篩選活動時同步拆分金額並標示合併總額', () => {
    const tsx = fs.readFileSync(webAdminFinanceTsxPath, 'utf8');

    // 檢查 activityFilteredItems
    assert.ok(tsx.includes('const eventFee = parseEventFee(selectedEvent)'), 'WebAdminFinance 必須讀取選定活動費用');
    assert.ok(tsx.includes('amount: eventFee'), 'WebAdminFinance 篩選活動時合併繳費金額拆分');
    assert.ok(tsx.includes('is_combined: true'), 'WebAdminFinance 標註 is_combined');

    // 檢查表格金額欄位
    assert.ok(tsx.includes('item.is_combined'), '金額欄位必須判定 is_combined');
    assert.ok(tsx.includes('合併總額 $'), '金額欄位下方提示原始合併總額');
  });

  it('4. Supabase Client 映射 selected_ids、備援查詢納入 0 元活動、支援原子核銷連動', () => {
    const clientTs = fs.readFileSync(supabaseClientTsPath, 'utf8');

    // 檢查 selected_ids 欄位映射
    assert.ok(clientTs.includes('selected_ids: it.selected_ids || null'), 'RPC 項目映射必須包含 selected_ids');
    assert.ok(clientTs.includes('selected_ids: p.selected_ids || null'), '直查 payments 映射必須包含 selected_ids');

    // 檢查 0 元活動納入正取名單
    assert.ok(clientTs.includes('const isFree = fee === 0;'), '必須判斷 0 元免費活動');
    assert.ok(clientTs.includes("status: isFree") && clientTs.includes("'已核銷 Confirmed'"), '0 元活動預設標註為已核銷 Confirmed');
    assert.ok(clientTs.includes("notes: s.notes || (isFree ? '免費活動免繳費' : '')"), '0 元活動自動加入免繳費備註');

    // 檢查 updatePaymentAndLinkedStatusInSupabase 原子連動 selected_ids
    assert.ok(clientTs.includes("const actIds = selectedIds"), '必須從 selectedIds 提取活動編號');
    assert.ok(clientTs.includes("const loanIds = selectedIds"), '必須從 selectedIds 提取租借編號');
    assert.ok(clientTs.includes("const hasMembership = selectedIds.some"), '必須判定是否包含社費');
    assert.ok(clientTs.includes(".in('event_id', actIds)"), '必須批次連動所有包含之活動報名');
    assert.ok(clientTs.includes(".in('id', loanIds)"), '必須批次連動所有包含之裝備租借');
  });

  it('5. 資料庫 RPC (get_admin_finance_rpc 與 update_admin_payment_status_rpc) 支援 0 元活動與 selected_ids 連動', () => {
    const sql = fs.readFileSync(adminRpcSqlPath, 'utf8');

    // get_admin_finance_rpc
    assert.ok(sql.includes('p.selected_ids'), 'payments 查詢必須選取 selected_ids 欄位');
    assert.ok(sql.includes('COALESCE(e.fee, 0) = 0'), '正取活動報名查詢必須納入 0 元活動');
    assert.ok(sql.includes('COALESCE(e.fee, 0) AS amount'), '0 元活動金額正確計入');
    assert.ok(sql.includes("p.selected_ids ? ('act_' || e.id)"), '排除邏輯必須支援 selected_ids ? act_');

    // update_admin_payment_status_rpc
    assert.ok(sql.includes('v_payment.selected_ids IS NOT NULL'), '核銷 RPC 必須檢查 selected_ids');
    assert.ok(sql.includes("('act_' || event_id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids))"), '必須連動 selected_ids 內所有活動報名');
    assert.ok(sql.includes("('eq_' || id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids))"), '必須連動 selected_ids 內所有裝備租借');
    assert.ok(sql.includes("v_payment.selected_ids ? 'fee_membership'"), '必須連動 selected_ids 內社費狀態');
  });
});
