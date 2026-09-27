import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('96. 繳費申報匯款證明圖片上傳與各頁面縮圖燈箱預覽 (Payment Proof Image Upload & Preview)', () => {
  const rootDir = process.cwd();
  const paymentPath = path.join(rootDir, 'src/pages/Payment.tsx');
  const historyPath = path.join(rootDir, 'src/pages/History.tsx');
  const confirmPaymentPath = path.join(rootDir, 'src/pages/ConfirmPayment.tsx');
  const adminFinancePath = path.join(rootDir, 'src/pages/AdminFinance.tsx');
  const webAdminFinancePath = path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx');
  const memberRecordsPath = path.join(rootDir, 'src/pages/MemberRecords.tsx');
  const supabaseClientPath = path.join(rootDir, 'src/utils/supabaseClient.ts');
  const verifyRpcPath = path.join(rootDir, 'supabase/verify_payment_rpc.sql');
  const historyRpcPath = path.join(rootDir, 'supabase/fix_history_payment_status.sql');
  const gasServicesPath = path.join(rootDir, 'gas_modules/06_Helper_Services.js');
  const gasJsPath = path.join(rootDir, 'src/gas.js');
  const zhPath = path.join(rootDir, 'src/locales/zh.json');
  const enPath = path.join(rootDir, 'src/locales/en.json');

  const paymentContent = fs.readFileSync(paymentPath, 'utf-8');
  const historyContent = fs.readFileSync(historyPath, 'utf-8');
  const confirmPaymentContent = fs.readFileSync(confirmPaymentPath, 'utf-8');
  const adminFinanceContent = fs.readFileSync(adminFinancePath, 'utf-8');
  const webAdminFinanceContent = fs.readFileSync(webAdminFinancePath, 'utf-8');
  const memberRecordsContent = fs.readFileSync(memberRecordsPath, 'utf-8');
  const supabaseClientContent = fs.readFileSync(supabaseClientPath, 'utf-8');
  const verifyRpcContent = fs.readFileSync(verifyRpcPath, 'utf-8');
  const historyRpcContent = fs.readFileSync(historyRpcPath, 'utf-8');
  const gasServicesContent = fs.readFileSync(gasServicesPath, 'utf-8');
  const gasJsContent = fs.readFileSync(gasJsPath, 'utf-8');
  const zhContent = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  it('1. 驗證 en.json 與 zh.json 使用者修改之指南 (guide) 與繳費證明翻譯鍵齊全對齊', () => {
    // 檢查 guide step1, step3, step4 描述
    assert.ok(zhContent.guide.step1.desc.includes('如果不報名活動的話'), 'zh.json guide.step1 必須包含不報名活動說明');
    assert.ok(enContent.guide.step1.desc.includes('If you do not sign up for events'), 'en.json guide.step1 必須對應英文翻譯');
    assert.ok(zhContent.guide.step3.desc.includes('若體能與經驗篩選與他人相同'), 'zh.json guide.step3 必須包含同分優先錄取說明');
    assert.ok(enContent.guide.step3.desc.includes('screening scores are tied'), 'en.json guide.step3 必須對應英文翻譯');
    assert.ok(zhContent.guide.step4.desc.includes('社費、活動費用與裝備租借費用均可合併回報'), 'zh.json guide.step4 必須包含三者合併回報說明');
    assert.ok(enContent.guide.step4.desc.includes('Membership fees, event fees, and gear rental fees'), 'en.json guide.step4 必須對應英文翻譯');

    // 檢查 payment.form 繳費證明欄位
    assert.ok(zhContent.payment.form.proofLabel, 'zh.json 必須包含 proofLabel');
    assert.ok(enContent.payment.form.proofLabel, 'en.json 必須包含 proofLabel');
    assert.ok(zhContent.payment.form.proofTip, 'zh.json 必須包含 proofTip');
    assert.ok(enContent.payment.form.proofTip, 'en.json 必須包含 proofTip');
    assert.ok(zhContent.payment.form.addProof, 'zh.json 必須包含 addProof');
    assert.ok(enContent.payment.form.addProof, 'en.json 必須包含 addProof');
    assert.ok(zhContent.payment.form.removeProof, 'zh.json 必須包含 removeProof');
    assert.ok(enContent.payment.form.removeProof, 'en.json 必須包含 removeProof');
    assert.ok(zhContent.payment.form.confirmDeleteProof, 'zh.json 必須包含 confirmDeleteProof');
    assert.ok(enContent.payment.form.confirmDeleteProof, 'en.json 必須包含 confirmDeleteProof');
  });

  it('2. 驗證 Payment.tsx 具備 84x84px 虛線框、單張限制、刪除二次確認與 Lightbox 大圖預覽', () => {
    assert.ok(paymentContent.includes("2px dashed #94a3b8"), '必須包含 2px dashed 虛線上傳框');
    assert.ok(paymentContent.includes("width: '84px'"), '必須設定正方形 84px 寬度');
    assert.ok(paymentContent.includes("height: '84px'"), '必須設定正方形 84px 高度');
    assert.ok(paymentContent.includes('handleProofFileChange'), '必須包含 handleProofFileChange 函式');
    assert.ok(paymentContent.includes('handleRemoveProof'), '必須包含 handleRemoveProof 函式');
    assert.ok(paymentContent.includes('confirmDeleteProof'), '移除照片前必須跳出二次確認視窗');
    assert.ok(paymentContent.includes('lightboxImageUrl'), '必須支援 Lightbox 大圖預覽燈箱');
    assert.ok(paymentContent.includes("folderType: 'payments'"), '上傳 Google Drive 必須指定 folderType 為 payments');
    assert.ok(paymentContent.includes("action: 'upload_drive_file'"), '呼叫 GAS 上傳必須使用 upload_drive_file');
    assert.ok(paymentContent.includes('proofImageUrl: uploadedProofUrl'), '送出表單必須攜帶 proofImageUrl');
  });

  it('3. 驗證 Supabase Client 與 RPC 完整支援 proofImageUrl', () => {
    assert.ok(supabaseClientContent.includes('proofImageUrl?: string;'), 'PaymentSubmitDetails 必須宣告 proofImageUrl 屬性');
    assert.ok(verifyRpcContent.includes("v_proof_url := p_details->>'proofImageUrl';"), 'submit_payment_rpc 必須讀取 proofImageUrl');
    assert.ok(verifyRpcContent.includes('proof_image_url'), 'submit_payment_rpc 必須寫入 payments.proof_image_url 欄位');
    assert.ok(verifyRpcContent.includes("'proofImageUrl', v_payment.proof_image_url"), 'verify_payment_by_token 必須回傳 proofImageUrl');
    assert.ok(historyRpcContent.includes("'proofImageUrl', COALESCE(proof_image_url, '')"), 'get_my_payment_history 必須回傳 proofImageUrl');
  });

  it('4. 驗證各檢視頁面 (History, ConfirmPayment, AdminFinance, WebAdminFinance, MemberRecords) 具備縮圖展示與 Lightbox', () => {
    // History.tsx
    assert.ok(historyContent.includes('item.proofImageUrl'), 'History.tsx 必須檢查 proofImageUrl');
    assert.ok(historyContent.includes('lightboxImageUrl'), 'History.tsx 必須具備 lightbox 放大');

    // ConfirmPayment.tsx
    assert.ok(confirmPaymentContent.includes('resultData?.proofImageUrl'), 'ConfirmPayment.tsx 必須檢查 proofImageUrl');
    assert.ok(confirmPaymentContent.includes('lightboxImageUrl'), 'ConfirmPayment.tsx 必須具備 lightbox 放大');

    // AdminFinance.tsx
    assert.ok(adminFinanceContent.includes('it.proof_image_url'), 'AdminFinance.tsx 卡片列表必須檢查 proof_image_url');
    assert.ok(adminFinanceContent.includes('setPreviewImageUrl'), 'AdminFinance.tsx 點擊縮圖必須觸發預覽');

    // WebAdminFinance.tsx
    assert.ok(webAdminFinanceContent.includes("key: 'proof_image_url'"), 'WebAdminFinance.tsx 必須新增 proof_image_url 欄位定義');
    assert.ok(webAdminFinanceContent.includes("case 'proof_image_url':"), 'WebAdminFinance.tsx 表格 cell 必須處理 proof_image_url');
    assert.ok(webAdminFinanceContent.includes('setPreviewReceiptUrl'), 'WebAdminFinance.tsx 點擊縮圖必須觸發預覽');

    // MemberRecords.tsx
    assert.ok(memberRecordsContent.includes('r.details?.proofImageUrl'), 'MemberRecords.tsx 必須檢查 proofImageUrl');
    assert.ok(memberRecordsContent.includes('lightboxImageUrl'), 'MemberRecords.tsx 必須具備 lightbox 放大');
  });

  it('5. 驗證後端 GAS 支援在通知與信件中加入匯款證明截圖', () => {
    assert.ok(gasServicesContent.includes('proofImageUrl'), '06_Helper_Services 必須讀取 proofImageUrl');
    assert.ok(gasServicesContent.includes('匯款證明圖片：'), '06_Helper_Services LINE 幹部推播必須包含匯款證明');
    assert.ok(gasServicesContent.includes('proofImgHtml'), '06_Helper_Services Email 樣板必須內嵌縮圖');

    assert.ok(gasJsContent.includes('proofImageUrl'), 'gas.js 必須讀取 proofImageUrl');
    assert.ok(gasJsContent.includes('匯款證明圖片：'), 'gas.js LINE 幹部推播必須包含匯款證明');
    assert.ok(gasJsContent.includes('proofImgHtml'), 'gas.js Email 樣板必須內嵌縮圖');
  });
});
