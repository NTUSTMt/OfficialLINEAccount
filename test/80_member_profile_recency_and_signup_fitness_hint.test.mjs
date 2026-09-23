import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('80. 活動報名 6 個月資料更新檢查與爬山經歷體能更新說明測試 (v0.1.185)', () => {
  const gasPath = path.join(rootDir, 'src', 'gas.js');
  const gasContent = fs.readFileSync(gasPath, 'utf8');

  const flexPath = path.join(rootDir, 'gas_modules', '03_Flex_Templates.js');
  const flexContent = fs.readFileSync(flexPath, 'utf8');

  const registerPath = path.join(rootDir, 'src', 'pages', 'Register.tsx');
  const registerContent = fs.readFileSync(registerPath, 'utf8');

  const zhPath = path.join(rootDir, 'src', 'locales', 'zh.json');
  const zhContent = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

  const enPath = path.join(rootDir, 'src', 'locales', 'en.json');
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));

  it('1. _checkProfileComplete 必須記錄 members 資料之 updatedAt 與 createdAt', () => {
    assert.ok(gasContent.includes('p.updatedAt = m.updated_at || "";'), 'gas.js 必須存取 updated_at');
    assert.ok(gasContent.includes('p.createdAt = m.created_at || "";'), 'gas.js 必須存取 created_at');

    assert.ok(flexContent.includes('p.updatedAt = m.updated_at || "";'), '03_Flex_Templates 必須存取 updated_at');
    assert.ok(flexContent.includes('p.createdAt = m.created_at || "";'), '03_Flex_Templates 必須存取 created_at');
  });

  it('2. handleSignup 必須具備 6 個月 (180 天) 未更新阻擋檢查與提示訊息', () => {
    assert.ok(gasContent.includes('diffDays > 180'), 'gas.js 必須檢驗 180 天門檻');
    assert.ok(gasContent.includes('您的個人資料與體能紀錄已超過 6 個月未更新'), 'gas.js 阻擋訊息中文字串');
    assert.ok(gasContent.includes('https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard'), 'gas.js 必須包含 LIFF 更新資料連結');

    assert.ok(flexContent.includes('diffDays > 180'), '03_Flex_Templates 必須檢驗 180 天門檻');
    assert.ok(flexContent.includes('您的個人資料與體能紀錄已超過 6 個月未更新'), '03_Flex_Templates 阻擋訊息中文字串');
    assert.ok(flexContent.includes('https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard'), '03_Flex_Templates 必須包含 LIFF 更新資料連結');
  });

  it('3. 報名成功收據必須包含出隊看爬山經驗與體能之說明', () => {
    assert.ok(gasContent.includes('社團出團會依據爬山經驗與體能進行評估'), 'gas.js 中文收據必須包含體能經歷更新說明');
    assert.ok(gasContent.includes('增加自己的錄取機會喔'), 'gas.js 中文收據錄取機會提示');
    assert.ok(gasContent.includes('Admission is evaluated based on hiking experience and fitness'), 'gas.js 英文收據說明');

    assert.ok(flexContent.includes('社團出團會依據爬山經驗與體能進行評估'), '03_Flex_Templates 中文收據說明');
    assert.ok(flexContent.includes('Admission is evaluated based on hiking experience and fitness'), '03_Flex_Templates 英文收據說明');
  });

  it('4. 日期計算邏輯模擬：大於 180 天阻擋，小於 180 天放行', () => {
    const now = new Date('2026-09-23T10:00:00Z').getTime();

    // 100 天前更新 -> 放行
    const recentDate = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();
    const diffRecent = (now - new Date(recentDate).getTime()) / (24 * 60 * 60 * 1000);
    assert.equal(diffRecent > 180, false, '100 天前應放行');

    // 200 天前更新 -> 阻擋
    const oldDate = new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString();
    const diffOld = (now - new Date(oldDate).getTime()) / (24 * 60 * 60 * 1000);
    assert.equal(diffOld > 180, true, '200 天前應阻擋');
  });

  it('5. 前端 Register.tsx 步驟 4 與多語言翻譯檔對齊', () => {
    assert.ok(registerContent.includes('register.step4.fitnessNotice'), 'Register.tsx 必須引用 fitnessNotice');

    assert.ok(zhContent.register.step4.fitnessNotice.includes('爬山經驗'), 'zh.json 必須包含爬山經驗');
    assert.ok(zhContent.register.step4.fitnessNotice.includes('增加錄取機會'), 'zh.json 必須包含增加錄取機會');
    assert.ok(zhContent.register.alert.updateSuccess.includes('增加出隊錄取機會'), 'zh.json 更新成功提醒');

    assert.ok(enContent.register.step4.fitnessNotice.includes('hiking experience and fitness'), 'en.json 必須包含 fitnessNotice');
    assert.ok(enContent.register.alert.updateSuccess.includes('outing admission chances'), 'en.json 更新成功提醒');
  });

  it('6. _syncSignupToSupabase 必須保留原有的 updatedAt 與 createdAt，防止報名動作刷新時鐘', () => {
    assert.ok(
      gasContent.includes('updated_at: p.updatedAt || p.updated_at || p.createdAt || p.created_at || new Date().toISOString()'),
      'gas.js 中的 _syncSignupToSupabase 必須保留 p.updatedAt 與 p.createdAt'
    );
    const workerPath = path.join(rootDir, 'gas_modules', '05_Sync_Worker.js');
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    assert.ok(
      workerContent.includes('updated_at: p.updatedAt || p.updated_at || p.createdAt || p.created_at || new Date().toISOString()'),
      '05_Sync_Worker 中的 _syncSignupToSupabase 必須保留 p.updatedAt 與 p.createdAt'
    );
  });

  it('7. handleSignup 必須精確分流「已逾 6 個月」與「時效未校驗/查無更新紀錄」之說明', () => {
    assert.ok(gasContent.includes('尚未完成時效校驗（或查無最近更新紀錄）'), 'gas.js 必須包含未校驗中文提示');
    assert.ok(gasContent.includes('unverified update time or no recent records found'), 'gas.js 必須包含未校驗英文提示');

    assert.ok(flexContent.includes('尚未完成時效校驗（或查無最近更新紀錄）'), '03_Flex_Templates 必須包含未校驗中文提示');
    assert.ok(flexContent.includes('unverified update time or no recent records found'), '03_Flex_Templates 必須包含未校驗英文提示');
  });
});
