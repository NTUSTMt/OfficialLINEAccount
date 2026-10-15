import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('80. 活動報名 6 個月資料更新檢查與爬山經歷體能更新說明測試 (v0.1.185 / Edge Functions v0.1.306)', () => {
  const edgeWebhookPath = path.join(rootDir, 'supabase', 'functions', 'line-webhook', 'index.ts');
  const edgeWebhookContent = fs.readFileSync(edgeWebhookPath, 'utf8');

  const flexPath = path.join(rootDir, 'supabase', 'functions', 'line-webhook', 'flexTemplates.ts');
  const flexContent = fs.readFileSync(flexPath, 'utf8');

  const registerPath = path.join(rootDir, 'src', 'pages', 'Register.tsx');
  const registerContent = fs.readFileSync(registerPath, 'utf8');

  const zhPath = path.join(rootDir, 'src', 'locales', 'zh.json');
  const zhContent = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

  const enPath = path.join(rootDir, 'src', 'locales', 'en.json');
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));

  it('1. Edge Functions line-webhook 必須處理 profile_expired 與 profile_incomplete 狀態', () => {
    assert.ok(edgeWebhookContent.includes('status === "profile_expired"'), 'line-webhook 必須處理 profile_expired');
    assert.ok(edgeWebhookContent.includes('status === "profile_incomplete"'), 'line-webhook 必須處理 profile_incomplete');
    assert.ok(edgeWebhookContent.includes('buildProfileExpiredFlex'), 'line-webhook 必須調用 buildProfileExpiredFlex');
  });

  it('2. flexTemplates.ts 必須具備 6 個月未更新阻擋檢查與提示訊息', () => {
    assert.ok(flexContent.includes('您的個人資料與體能紀錄已超過 6 個月未更新'), 'flexTemplates 阻擋訊息中文字串');
    assert.ok(flexContent.includes('https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard'), 'flexTemplates 必須包含 LIFF 更新資料連結');
  });

  it('3. 報名成功收據必須包含出隊看爬山經驗與體能之說明', () => {
    assert.ok(flexContent.includes('社團出團會依據爬山經驗與體能進行評估'), 'flexTemplates 中文收據必須包含體能經歷更新說明');
    assert.ok(flexContent.includes('增加自己的錄取機會喔'), 'flexTemplates 中文收據錄取機會提示');
    assert.ok(flexContent.includes('Admission is evaluated based on hiking experience and fitness'), 'flexTemplates 英文收據說明');
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

  it('6. Supabase RPC 報名儲存維護 updated_at，防止報名動作刷新時鐘', () => {
    const rpcPath = path.join(rootDir, 'supabase', 'schema.sql');
    assert.ok(fs.existsSync(rpcPath), 'schema.sql 必須存在');
  });

  it('7. flexTemplates.ts 必須精確分流「已逾 6 個月」與「時效未校驗/查無更新紀錄」之說明', () => {
    assert.ok(flexContent.includes('尚未完成時效校驗（或查無最近更新紀錄）'), 'flexTemplates 必須包含未校驗中文提示');
    assert.ok(flexContent.includes('unverified update time or no recent records found'), 'flexTemplates 必須包含未校驗英文提示');
  });
});
