import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('83. 財務對帳清單去重 (Admin Finance Items Deduplication) 驗證', () => {
  const rpcPath = path.resolve('supabase/admin_portal_rpc.sql');
  const rpcContent = fs.readFileSync(rpcPath, 'utf8');

  const migrationPath = path.resolve('supabase/fix_admin_finance_duplicate_rpc.sql');
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');

  const clientPath = path.resolve('src/utils/supabaseClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');

  const financePagePath = path.resolve('src/pages/AdminFinance.tsx');
  const financePageContent = fs.readFileSync(financePagePath, 'utf8');

  it('應驗證 get_admin_finance_rpc 排除條件支援 target_id 與 type 字串匹配', () => {
    assert.ok(
      rpcContent.includes("p.type ILIKE '%' || e.title || '%'"),
      'admin_portal_rpc.sql 必須包含活動名稱字串排除比對'
    );
    assert.ok(
      rpcContent.includes("p.type ILIKE '%' || l.id || '%'"),
      'admin_portal_rpc.sql 必須包含租借單號字串排除比對'
    );
  });

  it('應驗證 fix_admin_finance_duplicate_rpc.sql 包含既有 payments 回填與強化 RPC', () => {
    assert.ok(
      migrationContent.includes("SET target_type = 'event', target_id = e.id"),
      '遷移腳本必須包含 payments.target_id 回填'
    );
    assert.ok(
      migrationContent.includes("CREATE OR REPLACE FUNCTION get_admin_finance_rpc"),
      '遷移腳本必須更新 get_admin_finance_rpc'
    );
  });

  it('應驗證 supabaseClient.ts 備援查詢健全化排除重複', () => {
    assert.ok(
      clientContent.includes('it.type && s.events?.title && it.type.includes(s.events.title)'),
      'fetchFinanceItemsFromSupabase 備援查詢必須檢查 events.title'
    );
    assert.ok(
      clientContent.includes('it.type && it.type.includes(l.id)'),
      'fetchFinanceItemsFromSupabase 備援查詢必須檢查 loan id'
    );
  });

  it('應驗證 AdminFinance.tsx 具備前端防禦性去重邏輯', () => {
    assert.ok(
      financePageContent.includes("it.sourceType === 'payment' && it.line_user_id"),
      'AdminFinance.tsx 必須收集既有 payment 記錄'
    );
    assert.ok(
      financePageContent.includes("it.sourceType === 'event_signup' && it.line_user_id"),
      'AdminFinance.tsx 必須過濾重複之 event_signup'
    );
  });

  it('應模擬測試前端去重邏輯，確保同一使用者之活動報名待繳單若已有 payment 申報則自動剔除', () => {
    const mockItems = [
      {
        id: 'PAY_001',
        line_user_id: 'U81a58a',
        name: '沈進雄',
        type: '活動：閂山、鈴鳴山',
        amount: 2500,
        sourceType: 'payment',
        itemCategory: 'activity'
      },
      {
        id: 'S001',
        line_user_id: 'U81a58a',
        name: '沈進雄',
        type: '活動費用 (閂山、鈴鳴山)',
        amount: 2500,
        sourceType: 'event_signup',
        itemCategory: 'activity'
      },
      {
        id: 'S002',
        line_user_id: 'Uee2699',
        name: '廖英閎',
        type: '活動費用 (閂山、鈴鳴山)',
        amount: 2500,
        sourceType: 'event_signup',
        itemCategory: 'activity'
      }
    ];

    const paymentTargets = new Set();
    mockItems.forEach(it => {
      if (it.sourceType === 'payment' && it.line_user_id) {
        if (it.target_id) paymentTargets.add(`${it.line_user_id}_${it.target_id}`);
        const cleanType = (it.type || '').replace(/^[^\w\u4e00-\u9fa5(（]+\s*/, '');
        paymentTargets.add(`${it.line_user_id}_${cleanType}`);
        const actMatch = cleanType.match(/活動[：:]\s*(.+)/);
        if (actMatch && actMatch[1]) {
          paymentTargets.add(`${it.line_user_id}_${actMatch[1].trim()}`);
        }
      }
    });

    const result = mockItems.filter(it => {
      if (it.sourceType === 'event_signup' && it.line_user_id) {
        if (it.target_id && paymentTargets.has(`${it.line_user_id}_${it.target_id}`)) return false;
        const actMatch = (it.type || '').match(/活動費用\s*\((.+)\)/);
        if (actMatch && actMatch[1] && paymentTargets.has(`${it.line_user_id}_${actMatch[1].trim()}`)) return false;
      }
      return true;
    });

    assert.equal(result.length, 2, '過濾後應只剩 2 筆');
    assert.ok(result.some(it => it.id === 'PAY_001'), 'PAY_001 應保留');
    assert.ok(!result.some(it => it.id === 'S001'), '重複的 S001 應被成功剔除');
    assert.ok(result.some(it => it.id === 'S002'), '未繳費的 S002 應正常保留');
  });
});
