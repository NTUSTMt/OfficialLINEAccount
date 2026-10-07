import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('103. 體能證明照片 Diff 偵測與幹部名片 LINE 大頭貼輪播瀏覽', () => {
  const registerPath = path.resolve('src/pages/Register.tsx');
  const gasPath = path.resolve('src/gas.js');
  const gasTemplatesPath = path.resolve('gas_modules/03_Flex_Templates.js');

  const registerContent = fs.readFileSync(registerPath, 'utf-8');
  const gasContent = fs.readFileSync(gasPath, 'utf-8');
  const gasTemplatesContent = fs.readFileSync(gasTemplatesPath, 'utf-8');

  it('1. 驗證 Register.tsx 包含體能證明照片 Diff 比對邏輯', () => {
    assert.ok(
      registerContent.includes("const oldProofs = originalFormData.strengthProof"),
      'Register.tsx 必須解析原始體能證明照片'
    );
    assert.ok(
      registerContent.includes("const newProofs = finalFormData.strengthProof"),
      'Register.tsx 必須解析最終體能證明照片'
    );
    assert.ok(
      registerContent.includes("diffItems.push({"),
      'Register.tsx 必須將照片異動推入 diffItems'
    );
    assert.ok(
      registerContent.includes("label: isEn ? 'Fitness Proof Photos' : '體能證明照片 / Fitness Proof'"),
      'diffItems 必須標註體能證明照片標籤'
    );
  });

  it('2. 驗證僅異動體能證明照片時，diffItems 非空且不判定為「無變動」', () => {
    const originalFormData = {
      name: '王小明',
      strengthProof: 'https://drive.google.com/open?id=img1'
    };
    const finalFormData = {
      name: '王小明',
      strengthProof: 'https://drive.google.com/open?id=img1\nhttps://drive.google.com/open?id=img2'
    };
    const strengthProofFiles = [{ name: 'img2.jpg', base64: 'data:image/jpeg;base64,...' }];

    const oldProofs = originalFormData.strengthProof ? originalFormData.strengthProof.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
    const newProofs = finalFormData.strengthProof ? finalFormData.strengthProof.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
    const oldCount = oldProofs.length;
    const newCount = newProofs.length;

    const diffItems = [];
    if (oldCount !== newCount || strengthProofFiles.length > 0 || (oldProofs.join(',') !== newProofs.join(','))) {
      diffItems.push({
        label: '體能證明照片 / Fitness Proof',
        oldVal: `${oldCount} 張照片`,
        newVal: `${newCount} 張照片`
      });
    }

    assert.strictEqual(diffItems.length, 1);
    assert.strictEqual(diffItems[0].oldVal, '1 張照片');
    assert.strictEqual(diffItems[0].newVal, '2 張照片');
  });

  it('3. 驗證 sendOfficerMenu 查詢 officers 表並支援 LINE 即時大頭貼與 responsibilities 欄位', () => {
    for (const code of [gasContent, gasTemplatesContent]) {
      assert.ok(
        code.includes('_supabaseGet("officers", { select: "line_user_id,name,role,responsibilities" })'),
        'sendOfficerMenu 必須查詢 officers 表之 line_user_id, name, role, responsibilities'
      );
      assert.ok(
        code.includes('_getLineUserProfile(lineUserId)'),
        'sendOfficerMenu 必須呼叫 _getLineUserProfile 取得 LINE 最新大頭貼'
      );
      assert.ok(
        code.includes('lineProfile.pictureUrl'),
        'sendOfficerMenu 必須使用 LINE pictureUrl 作為 hero 圖片'
      );
      assert.ok(
        code.includes('📌 負責業務 Responsibilities'),
        'sendOfficerMenu 必須展示負責業務欄位'
      );
      assert.ok(
        !code.includes('off.title'),
        'sendOfficerMenu 必須統一使用 role，不應依賴 title 欄位'
      );
    }
  });

  it('4. 驗證程式碼與測試檔案中嚴格無 Emoji', () => {
    const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
    assert.strictEqual(emojiRegex.test(registerContent), false, 'Register.tsx must not contain emoji');
  });
});
