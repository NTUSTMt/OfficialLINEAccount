import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('94. 體能證明上傳 UI 重構與 Google Drive 檔案連動刪除驗證 (Fitness Proof Upload Overhaul & Drive Deletion)', () => {
  const rootDir = process.cwd();
  const registerPath = path.join(rootDir, 'src/pages/Register.tsx');
  const gasPath = path.join(rootDir, 'src/gas.js');
  const zhPath = path.join(rootDir, 'src/locales/zh.json');
  const enPath = path.join(rootDir, 'src/locales/en.json');

  const registerContent = fs.readFileSync(registerPath, 'utf-8');
  const gasContent = fs.readFileSync(gasPath, 'utf-8');
  const zhContent = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  it('1. 驗證 Register.tsx 縮圖方塊、虛線新增方框與上限 5 張隱藏邏輯', () => {
    assert.ok(
      registerContent.includes('totalProofsCount < 5'),
      '滿 5 張時必須自動隱藏虛線新增方塊'
    );
    assert.ok(
      registerContent.includes('2px dashed #94a3b8'),
      '新增按鈕必須採用 2px dashed 虛線邊框'
    );
    assert.ok(
      registerContent.includes('84px'),
      '縮圖與虛線框應為固定正方形尺寸'
    );
    assert.ok(
      registerContent.includes('historicalProofUrls.map'),
      '歷史照片需解析為列表並呈現縮圖'
    );
    assert.ok(
      registerContent.includes('strengthProofFiles.map'),
      '新選取的照片需呈現在同一個縮圖列表'
    );
  });

  it('2. 驗證刪除二次確認對話框與歷史/新檔案處理', () => {
    assert.ok(
      registerContent.includes('handleRemoveHistoricalProof'),
      '必須具備刪除歷史已上傳照片之處理函式'
    );
    assert.ok(
      registerContent.includes('handleRemoveNewFile'),
      '必須具備刪除新選取待上傳照片之處理函式'
    );
    assert.ok(
      registerContent.includes("window.confirm(t('register.step4.deleteConfirm'))"),
      '刪除前必須彈出二次確認對話框'
    );
    assert.ok(
      registerContent.includes('setDeletedProofUrls'),
      '歷史照片刪除後必須排入待刪除清單供送出時連動'
    );
  });

  it('3. 驗證全螢幕遮罩燈箱 (Lightbox Modal) 大圖預覽功能', () => {
    assert.ok(
      registerContent.includes('setLightboxImageUrl'),
      '點擊縮圖必須觸發 setLightboxImageUrl'
    );
    assert.ok(
      registerContent.includes('lightboxImageUrl &&'),
      '必須具備燈箱 Modal 條件渲染'
    );
    assert.ok(
      registerContent.includes("backgroundColor: 'rgba(0, 0, 0, 0.85)'"),
      '燈箱必須具備暗色滿版遮罩'
    );
  });

  it('4. 驗證機制 B：表單送出時連動呼叫 GAS delete_drive_files 移入垃圾桶', () => {
    assert.ok(
      registerContent.includes("action: 'delete_drive_files'"),
      'Register.tsx 送出時必須傳遞 delete_drive_files 動作'
    );
    assert.ok(
      gasContent.includes('delete_drive_files'),
      'GAS 後端必須具備 delete_drive_files 路由支援'
    );
    assert.ok(
      gasContent.includes('function _handleDriveDeleteHelper'),
      'GAS 後端必須實作 _handleDriveDeleteHelper'
    );
    assert.ok(
      gasContent.includes('file.setTrashed(true)'),
      'GAS 後端必須透過 setTrashed(true) 將檔案移入垃圾桶'
    );
  });

  it('5. 驗證多國語系中英文翻譯齊全', () => {
    assert.ok(zhContent.register.step4.deleteConfirm, '繁體中文需包含 deleteConfirm');
    assert.ok(enContent.register.step4.deleteConfirm, '英文需包含 deleteConfirm');
    assert.ok(zhContent.register.step4.previewProof, '繁體中文需包含 previewProof');
    assert.ok(enContent.register.step4.previewProof, '英文需包含 previewProof');
    assert.ok(zhContent.register.step4.addProof, '繁體中文需包含 addProof');
    assert.ok(enContent.register.step4.addProof, '英文需包含 addProof');
    assert.ok(zhContent.register.step4.maxProofTip, '繁體中文需包含 maxProofTip');
    assert.ok(enContent.register.step4.maxProofTip, '英文需包含 maxProofTip');
  });
});
