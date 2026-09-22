import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('79. Google Drive 圖片上傳品質升級 2K (2048px / 0.88) 與 CDN =s0 測試 (v0.1.181)', () => {
  it('1. src/utils/image.ts 預設尺寸升級為 2048，並支援 =s0 原尺寸輸出', async () => {
    const { getDirectImageUrl } = await import('../src/utils/image.ts');
    
    // 預設解析 Drive 連結應為 2048
    const driveUrl = 'https://drive.google.com/file/d/testFile123/view';
    const resultDefault = getDirectImageUrl(driveUrl);
    assert.equal(resultDefault, 'https://lh3.googleusercontent.com/d/testFile123=w2048', '預設 CDN 尺寸應為 2048');

    // 支援傳入 s0 輸出原尺寸
    const resultS0 = getDirectImageUrl(driveUrl, 's0');
    assert.equal(resultS0, 'https://lh3.googleusercontent.com/d/testFile123=s0', '應支援 =s0 原生原寸格式');

    // 指定縮圖尺寸 (如卡片用的 400)
    const result400 = getDirectImageUrl(driveUrl, 400);
    assert.equal(result400, 'https://lh3.googleusercontent.com/d/testFile123=w400', '仍支援指定縮圖尺寸');
  });

  it('2. AdminEvents.tsx 活動封面照片尺寸上限 2048px，JPEG 品質 0.88', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('const maxWidth = 2048;'), 'AdminEvents maxWidth 必須為 2048');
    assert.ok(content.includes('const maxHeight = 2048;'), 'AdminEvents maxHeight 必須為 2048');
    assert.ok(content.includes("canvas.toDataURL('image/jpeg', 0.88)"), 'AdminEvents 品質必須為 0.88');
  });

  it('3. AdminInventory.tsx 裝備庫存相片尺寸上限 2048px，JPEG 品質 0.88', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'AdminInventory.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('const maxDim = 2048;'), 'AdminInventory maxDim 必須為 2048');
    assert.ok(content.includes("canvas.toDataURL('image/jpeg', 0.88)"), 'AdminInventory 品質必須為 0.88');
  });

  it('4. EquipmentDetailModal.tsx 裝備相片維護尺寸上限 2048px，JPEG 品質 0.88', () => {
    const filePath = path.join(rootDir, 'src', 'components', 'borrow', 'EquipmentDetailModal.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('const maxDim = 2048;'), 'EquipmentDetailModal maxDim 必須為 2048');
    assert.ok(content.includes("canvas.toDataURL('image/jpeg', 0.88)"), 'EquipmentDetailModal 品質必須為 0.88');
  });

  it('5. Register.tsx 體能與個資證明照片尺寸 2048px，JPEG 品質 0.88，並採單張獨立發送保護', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'Register.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('const maxWidth = 2048;'), 'Register maxWidth 必須為 2048');
    assert.ok(content.includes('const maxHeight = 2048;'), 'Register maxHeight 必須為 2048');
    assert.ok(content.includes("canvas.toDataURL('image/jpeg', 0.88)"), 'Register 品質必須為 0.88');
    assert.ok(content.includes('for (const proofFile of strengthProofFiles)'), 'Register 必須單張發送避免大 Payload 逾時');
  });

  it('6. Achievements.tsx 登頂心得照片尺寸 2048px，JPEG 品質 0.88，並採單張獨立發送保護', () => {
    const filePath = path.join(rootDir, 'src', 'pages', 'Achievements.tsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(content.includes('const maxWidth = 2048;'), 'Achievements maxWidth 必須為 2048');
    assert.ok(content.includes('const maxHeight = 2048;'), 'Achievements maxHeight 必須為 2048');
    assert.ok(content.includes("canvas.toDataURL('image/jpeg', 0.88)"), 'Achievements 品質必須為 0.88');
    assert.ok(content.includes('for (const photoFile of photoFiles)'), 'Achievements 必須單張發送避免大 Payload 逾時');
  });

  it('7. src/gas.js 與 gas_modules/06_Helper_Services.js CDN 輸出升級為 =s0', () => {
    const gasPath = path.join(rootDir, 'src', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(!gasContent.includes('uploadedUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=w1000");'), 'gas.js 不應包含舊的 =w1000 uploadedUrls');
    assert.ok(gasContent.includes('uploadedUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=s0");'), 'gas.js 必須使用 =s0');

    const helperPath = path.join(rootDir, 'gas_modules', '06_Helper_Services.js');
    const helperContent = fs.readFileSync(helperPath, 'utf8');
    assert.ok(helperContent.includes('uploadedUrls.push("https://lh3.googleusercontent.com/d/" + driveMatch[1] + "=s0");'), '06_Helper_Services.js 必須使用 =s0');
  });
});
