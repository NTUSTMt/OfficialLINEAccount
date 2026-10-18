import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('src/types/admin.ts exports NewPaymentRequest interface with correct fields', () => {
  const code = fs.readFileSync('src/types/admin.ts', 'utf8');
  assert.match(code, /export interface NewPaymentRequest/);
  assert.match(code, /line_user_id:\s*string/);
  assert.match(code, /name:\s*string/);
  assert.match(code, /type:\s*string/);
  assert.match(code, /amount:\s*number/);
  assert.match(code, /target_type\?:/);
  assert.match(code, /target_id\?:/);
  assert.match(code, /notes\?:/);
  assert.match(code, /notification_status\?:/);
});

test('src/utils/supabaseClient.ts exports createManualPaymentRequestsInSupabase', () => {
  const code = fs.readFileSync('src/utils/supabaseClient.ts', 'utf8');
  assert.match(code, /export const createManualPaymentRequestsInSupabase/);
  assert.match(code, /PAY_/);
  assert.match(code, /status:\s*'待繳費 Unpaid'/);
  assert.match(code, /\.from\('payments'\)\.insert\(/);
});

test('src/utils/supabaseClient.ts does not include payment_status in payments insert payload', () => {
  const code = fs.readFileSync('src/utils/supabaseClient.ts', 'utf8');
  const createFuncMatch = code.match(/createManualPaymentRequestsInSupabase[\s\S]*?return[\s\S]*?}/);
  assert.ok(createFuncMatch, 'createManualPaymentRequestsInSupabase function body should exist');
  const funcBody = createFuncMatch[0];
  assert.ok(
    !funcBody.includes('payment_status:'),
    'payments table insert payload must not include payment_status column'
  );
});

test('src/utils/supabaseClient.ts fetchFinanceItemsFromSupabase preserves 待繳費 Unpaid in both RPC and fallback', () => {
  const code = fs.readFileSync('src/utils/supabaseClient.ts', 'utf8');
  const fetchFuncMatch = code.match(/fetchFinanceItemsFromSupabase[\s\S]*?updatePaymentAndLinkedStatusInSupabase/);
  assert.ok(fetchFuncMatch, 'fetchFinanceItemsFromSupabase function body should exist');
  const funcBody = fetchFuncMatch[0];

  // In fallback queries for paymentsData
  assert.ok(
    funcBody.includes('待繳費'),
    'fetchFinanceItemsFromSupabase fallback must check for 待繳費'
  );
  assert.match(
    funcBody,
    /status:.*待繳費 Unpaid/,
    'fetchFinanceItemsFromSupabase must map status to 待繳費 Unpaid when payment is unpaid'
  );
  assert.match(
    funcBody,
    /payment_status:.*未繳費 Unpaid/,
    'fetchFinanceItemsFromSupabase must map payment_status to 未繳費 Unpaid when payment is unpaid'
  );
});
