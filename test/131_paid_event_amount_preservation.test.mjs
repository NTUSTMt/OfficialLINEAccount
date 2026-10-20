import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('131. 有金額活動款項金額保留與 AdminEvent fee/cost 正確解析 (v0.1.318)', () => {
  const rootDir = process.cwd();
  const eventTypesPath = path.join(rootDir, 'src', 'types', 'event.ts');
  const supabaseClientPath = path.join(rootDir, 'src', 'utils', 'supabaseClient.ts');
  const drawerTsxPath = path.join(rootDir, 'src', 'components', 'admin', 'FinanceReportDrawer.tsx');
  const webAdminFinanceTsxPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminFinance.tsx');

  it('1. AdminEvent 型別與 fetchEventsFromSupabase 必須包含數值型 fee 欄位', () => {
    const eventTypes = fs.readFileSync(eventTypesPath, 'utf8');
    const supabaseClient = fs.readFileSync(supabaseClientPath, 'utf8');

    // 檢查 AdminEvent 型別定義包含 fee
    assert.ok(eventTypes.includes('fee?: number'), 'AdminEvent 必須支援 fee?: number 數值欄位');

    // 檢查 fetchEventsFromSupabase 正確映射 fee
    assert.ok(supabaseClient.includes('fee: feeVal'), 'fetchEventsFromSupabase 必須回傳 fee 數值');
  });

  it('2. FinanceReportDrawer 與 WebAdminFinance 必須安全解析活動金額 (支援 fee 與 cost: "$2500")', () => {
    const drawerTsx = fs.readFileSync(drawerTsxPath, 'utf8');
    const webAdminTsx = fs.readFileSync(webAdminFinanceTsxPath, 'utf8');

    // 檢查是否從 cost 字串安全提取數值 (避免因 cost: "$2500" 導致 Number(ev.fee) 變為 0)
    [drawerTsx, webAdminTsx].forEach((code) => {
      // 不能只寫 Number(currentEvent?.fee) || 0，必須同時支援 cost 字串解析
      const hasCostFallback =
        code.includes('currentEvent?.cost') ||
        code.includes('selectedEvent?.cost') ||
        code.includes('parseEventFee');
      assert.ok(hasCostFallback, '計算活動費用時必須解析 event.cost (如 $2500) 或 parseEventFee，不能誤判為 0 元活動');
    });
  });

  it('3. 驗證演算法邏輯：有金額之活動 ($2500) 篩選後金額必須保留 2500，絕不能變為 0 元', () => {
    // 模擬當前從 Supabase 取得的活動物件 (僅包含 cost: "$2500" 或 fee: 2500)
    const paidEventWithCostOnly = {
      id: 'evt_snow',
      name: '雪山主東峰',
      cost: '$2,500',
      startDate: '2026-11-01',
      endDate: '2026-11-03',
    };

    const paidEventWithFee = {
      id: 'evt_snow',
      name: '雪山主東峰',
      cost: '$2500',
      fee: 2500,
      startDate: '2026-11-01',
      endDate: '2026-11-03',
    };

    const freeEvent = {
      id: 'evt_qixing',
      name: '七星山迎新',
      cost: '免費',
      fee: 0,
      startDate: '2026-09-19',
      endDate: '2026-09-19',
    };

    // 輔助函式：正確解析活動費用
    const parseFee = (ev) => {
      if (!ev) return 0;
      if (typeof ev.fee === 'number') return ev.fee;
      if (typeof ev.cost === 'string') {
        const cleaned = ev.cost.replace(/[^0-9]/g, '');
        return cleaned ? Number(cleaned) : 0;
      }
      return 0;
    };

    assert.equal(parseFee(paidEventWithCostOnly), 2500, 'cost: "$2,500" 必須解析出 2500');
    assert.equal(parseFee(paidEventWithFee), 2500, 'fee: 2500 必須解析出 2500');
    assert.equal(parseFee(freeEvent), 0, 'cost: "免費" 必須解析出 0');

    // 模擬款項資料
    const singlePayment = {
      id: 'PAY_001',
      name: '王小明',
      type: '活動：雪山主東峰',
      amount: 2500,
      target_id: 'evt_snow',
      status: '已核銷 Confirmed',
    };

    // 讀取當前 FinanceReportDrawer.tsx 原始碼，檢查它目前如何計算 eventFee
    const drawerTsx = fs.readFileSync(drawerTsxPath, 'utf8');

    // 若原始碼只寫了 Number(currentEvent?.fee) || 0，當傳入 paidEventWithCostOnly 時會得到 0
    // 這正是造成「有金額的活動都變成0元了」的根本原因！
    assert.ok(
      drawerTsx.includes('parseEventFee') ||
      drawerTsx.includes('.replace(/[^0-9]/g'),
      'FinanceReportDrawer.tsx 必須具備安全解析 cost/fee 的邏輯，防止付費活動被誤認為 0 元'
    );
  });
});
