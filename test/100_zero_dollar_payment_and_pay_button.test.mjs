import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('100. 活動正取通知按鈕色彩優化與 0 元申報自動核銷驗證 (v0.1.256)', () => {
  const rootDir = process.cwd();
  const gasJsPath = path.join(rootDir, 'src', 'gas.js');
  const helperJsPath = path.join(rootDir, 'gas_modules', '06_Helper_Services.js');
  const paymentRpcPath = path.join(rootDir, 'supabase', 'verify_payment_rpc.sql');
  const paymentTsxPath = path.join(rootDir, 'src', 'pages', 'Payment.tsx');

  it('1. 正取通知推播卡片「前往繳費系統」按鈕升級為 Primary 樣式且色彩為經典深藍 #0367D3', () => {
    const gasJs = fs.readFileSync(gasJsPath, 'utf8');

    // 檢查 gas.js 中的按鈕宣告
    [gasJs].forEach((code) => {
      assert.ok(code.includes('style: "primary"'), 'payBtn 必須使用 primary 樣式');
      assert.ok(code.includes('color: "#0367D3"'), 'payBtn 必須使用經典深藍 #0367D3 色彩');
      assert.ok(code.includes('label: payBtn'), '必須綁定 payBtn 標籤變數');
      assert.ok(code.includes('-u7OCkmQO'), '必須導向 LIFF 繳費系統');
    });
  });

  it('2. 資料庫 RPC (submit_payment_rpc) 於 totalAmount = 0 時自動原子性核銷為「已繳費 Paid / 已核銷 Confirmed」', () => {
    const sql = fs.readFileSync(paymentRpcPath, 'utf8');

    assert.ok(sql.includes('IF v_total_amount = 0 THEN'), 'submit_payment_rpc 必須有 0 元判斷邏輯');
    assert.ok(sql.includes("v_target_item_status := text_to_payment_status_enum('已繳費 Paid');"), '0 元項目狀態必須設為已繳費 Paid');
    assert.ok(sql.includes("v_target_payment_status := '已核銷 Confirmed';"), '0 元繳費單狀態必須設為已核銷 Confirmed');
    assert.ok(sql.includes("v_officer_notes := '0元免費項目系統自動核銷';"), '0 元必須自動補上內部註記');
    assert.ok(sql.includes("v_notification_status := '免通知';"), '0 元通知狀態設為免通知');
    assert.ok(sql.includes("'is_zero_amount', (v_total_amount = 0)"), '回傳 JSON 必須包含 is_zero_amount 欄位');
  });

  it('3. 前端 Payment.tsx 於 0 元申報時跳過幹部推播 notify_officers_payment，並發送中英分流核銷確認 Flex 卡片', () => {
    const tsx = fs.readFileSync(paymentTsxPath, 'utf8');

    // 檢查略過幹部推播條件
    assert.ok(tsx.includes('if (!isZeroAmount) {'), '0 元申報必須略過幹部推播 notify_officers_payment');
    assert.ok(tsx.includes("'notify_officers_payment'"), '非 0 元維持幹部推播');

    // 檢查 0 元 Flex 卡片結構與中英分流
    assert.ok(tsx.includes("backgroundColor: '#059669'"), '0 元核銷確認 Flex 卡片必須採用與幹部核銷同款綠色頂部 #059669');
    assert.ok(tsx.includes("const titleText = isEn ? '🎉 Free Item Confirmed' : '🎉 0元項目核銷確認通知';"), '支援中英標題分流');
    assert.ok(tsx.includes("const subtitleText = isEn ? 'System has automatically confirmed your $0 item(s)!' : '系統已自動完成核銷作業！';"), '支援中英副標題分流');
    assert.ok(tsx.includes("const amountText = isEn ? '$0 TWD (Free)' : '$0 元 (免收費)';"), '金額顯示 $0 免收費');
    assert.ok(tsx.includes("const statusText = isEn ? 'Confirmed' : '已核銷 Confirmed';"), '狀態呈現已核銷');
    assert.ok(tsx.includes('await liff.sendMessages([zeroFlexMessage as any]);'), '透過 liff.sendMessages 發送 Flex 卡片，0 額度消耗');
  });
});
