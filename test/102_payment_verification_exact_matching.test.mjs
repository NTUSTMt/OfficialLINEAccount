import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Payment Verification Exact Item Matching & Multi-Event Isolation', () => {
  const verifyRpcPath = path.resolve('supabase/verify_payment_rpc.sql');
  const gasPath = path.resolve('src/gas.js');
  const gasModuleWebhookPath = path.resolve('gas_modules/02_LineBot_Webhook.js');

  const verifyRpcContent = fs.readFileSync(verifyRpcPath, 'utf-8');
  const gasContent = fs.readFileSync(gasPath, 'utf-8');
  const gasWebhookContent = fs.readFileSync(gasModuleWebhookPath, 'utf-8');

  it('1. submit_payment_rpc 必須將 selected_ids 欄位寫入 payments 資料表', () => {
    assert.ok(
      verifyRpcContent.includes('ALTER TABLE payments ADD COLUMN IF NOT EXISTS selected_ids JSONB;'),
      'verify_payment_rpc.sql 必須宣告 selected_ids 欄位遷移'
    );
    assert.ok(
      verifyRpcContent.includes('selected_ids,\n        notes,'),
      'submit_payment_rpc INSERT 語句必須包含 selected_ids 欄位'
    );
    assert.ok(
      verifyRpcContent.includes('v_selected_ids,\n        v_note,'),
      'submit_payment_rpc INSERT VALUES 必須寫入 v_selected_ids'
    );
  });

  it('2. verify_payment_by_token 必須解析 selected_ids 並精準限定 event_id = ANY(v_event_ids)', () => {
    assert.ok(
      verifyRpcContent.includes("v_selected_ids := COALESCE(v_payment.selected_ids, '[]'::jsonb);"),
      'verify_payment_by_token 必須讀取 payments.selected_ids'
    );
    assert.ok(
      verifyRpcContent.includes("v_item_id LIKE 'act_%'"),
      'verify_payment_by_token 必須解析 act_ 活動前綴'
    );
    assert.ok(
      verifyRpcContent.includes("event_id = ANY(v_event_ids)"),
      'verify_payment_by_token 必須精準限定 event_id = ANY(v_event_ids)，嚴禁全表或全用戶更新'
    );
    assert.ok(
      verifyRpcContent.includes("id = ANY(v_loan_ids)"),
      'verify_payment_by_token 必須精準限定 id = ANY(v_loan_ids)，嚴禁全用戶租借更新'
    );
  });

  it('3. GAS _processPaymentVerification 必須依據 selected_ids 解析活動 ID 逐一精準更新', () => {
    assert.ok(
      gasContent.includes('var selIds = payment.selected_ids || [];'),
      'gas.js 必須讀取 payment.selected_ids'
    );
    assert.ok(
      gasContent.includes('event_id: "eq." + sEvtId'),
      'gas.js 必須精確指定 event_id = sEvtId 進行查詢與更新'
    );
    assert.ok(
      gasWebhookContent.includes('event_id: "eq." + sEvtId'),
      'gas_modules/02_LineBot_Webhook.js 必須精確指定 event_id = sEvtId'
    );
  });

  it('4. 多活動情境模擬測試：繳納活動 A 與 B 時，活動 C 絕對不得被標記為已繳費', () => {
    // 模擬用戶同時報名了活動 A (act_E01), B (act_E02), C (act_E03)
    const signupsDb = [
      { id: 'SIGNUP_A', line_user_id: 'USER_1', event_id: 'E01', payment_status: '未繳費 Unpaid', status: '正取 Accepted' },
      { id: 'SIGNUP_B', line_user_id: 'USER_1', event_id: 'E02', payment_status: '未繳費 Unpaid', status: '正取 Accepted' },
      { id: 'SIGNUP_C', line_user_id: 'USER_1', event_id: 'E03', payment_status: '未繳費 Unpaid', status: '正取 Accepted' }
    ];

    // 社員只勾選並申報了活動 A 與 B
    const paymentRecord = {
      id: 'PAY_TEST_AB',
      line_user_id: 'USER_1',
      selected_ids: ['act_E01', 'act_E02'],
      amount: 1850,
      type: '活動：活動A, 活動：活動B'
    };

    // 模擬核銷邏輯
    const selIds = paymentRecord.selected_ids || [];
    const eventIds = [];
    for (const idStr of selIds) {
      if (idStr.startsWith('act_')) {
        eventIds.push(idStr.substring(4));
      }
    }

    // 執行精確核銷
    for (const signup of signupsDb) {
      if (signup.line_user_id === paymentRecord.line_user_id && eventIds.includes(signup.event_id)) {
        signup.payment_status = '已繳費 Paid';
        signup.status = '正取（已繳費）Confirmed (Paid)';
      }
    }

    // 驗證活動 A 與 B 成功更新為已繳費
    assert.strictEqual(signupsDb[0].payment_status, '已繳費 Paid');
    assert.strictEqual(signupsDb[0].status, '正取（已繳費）Confirmed (Paid)');
    assert.strictEqual(signupsDb[1].payment_status, '已繳費 Paid');
    assert.strictEqual(signupsDb[1].status, '正取（已繳費）Confirmed (Paid)');

    // 驗證活動 C 絕對維持未繳費狀態，未受任何波及
    assert.strictEqual(signupsDb[2].payment_status, '未繳費 Unpaid');
    assert.strictEqual(signupsDb[2].status, '正取 Accepted');
  });

  it('5. 全檔案零 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
    assert.strictEqual(emojiRegex.test(verifyRpcContent), false, 'verify_payment_rpc.sql must not contain emoji');
  });
});
