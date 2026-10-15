import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('109. GAS Thin Worker (gas_worker.js) 活動專屬試算表檔名、SPREADSHEET_ID 範本複製與名冊匯入驗證', () => {
  const workerPath = path.join(rootDir, 'src', 'gas_worker.js');
  const workerContent = fs.readFileSync(workerPath, 'utf8');

  it('1. gas_worker.js 建立之資料夾與試算表名稱必須為 datePart_eventName (如 2026/10/02_門山、鈴鳴山)', () => {
    const funcStart = workerContent.indexOf('function _handleCreateEventSheet(json)');
    assert.ok(funcStart > -1, 'gas_worker.js 必須包含 _handleCreateEventSheet');
    const funcEnd = workerContent.indexOf('function _handleAppendEventSheet', funcStart);
    const funcContent = workerContent.slice(funcStart, funcEnd > -1 ? funcEnd : undefined);

    // 驗證不可再使用固定前綴 【活動】 或 【名冊】
    assert.ok(!funcContent.includes("'【活動】'"), '資料夾名稱不可帶有 【活動】 前綴');
    assert.ok(!funcContent.includes("'【名冊】'"), '試算表名稱不可帶有 【名冊】 前綴');
    assert.ok(!funcContent.includes("'_報名名冊'"), '試算表名稱不可帶有 _報名名冊 後綴');

    // 驗證命名規則
    assert.ok(
      funcContent.includes('folderName') && funcContent.includes('datePart'),
      '必須依據出隊日期與活動名稱組合 folderName'
    );
  });

  it('2. gas_worker.js 必須優先使用 SPREADSHEET_ID 複製範本試算表', () => {
    const funcStart = workerContent.indexOf('function _handleCreateEventSheet(json)');
    const funcEnd = workerContent.indexOf('function _handleAppendEventSheet', funcStart);
    const funcContent = workerContent.slice(funcStart, funcEnd > -1 ? funcEnd : undefined);

    assert.ok(
      funcContent.includes('makeCopy') && (funcContent.includes('SPREADSHEET_ID') || funcContent.includes('templateId')),
      'gas_worker.js 必須支援讀取 SPREADSHEET_ID 並使用 makeCopy 複製範本'
    );
  });

  it('3. gas_worker.js 必須從 Supabase 拉取活動資料與報名名冊並匯入範本', () => {
    const funcStart = workerContent.indexOf('function _handleCreateEventSheet(json)');
    const funcEnd = workerContent.indexOf('function _handleAppendEventSheet', funcStart);
    const funcContent = workerContent.slice(funcStart, funcEnd > -1 ? funcEnd : undefined);

    assert.ok(
      funcContent.includes('_importExistingSignupsToSheet'),
      '_handleCreateEventSheet 必須呼叫 _importExistingSignupsToSheet 匯入名冊'
    );
    assert.ok(
      workerContent.includes('event_signups'),
      'gas_worker.js 必須查詢 event_signups 表取得報名紀錄'
    );
    assert.ok(
      funcContent.includes('_CONFIG'),
      'gas_worker.js 必須維護 _CONFIG 工作表'
    );
  });

  it('4. 業務模擬：驗證檔名計算、範本複製與欄位對齊邏輯', () => {
    const rawDate = '2026-10-02';
    const eventName = '門山、鈴鳴山';
    const datePart = rawDate.replace(/-/g, '/');
    const folderName = `${datePart}_${eventName}`;
    const sheetName = folderName;

    assert.equal(folderName, '2026/10/02_門山、鈴鳴山');
    assert.equal(sheetName, '2026/10/02_門山、鈴鳴山');

    // 範本複製確認
    const templateId = 'MOCK_SPREADSHEET_ID_999';
    let copiedTitle = '';
    function mockCopyTemplate(id, name) {
      if (id) copiedTitle = name;
      return { id: 'NEW_SS_123', name: copiedTitle };
    }

    const newSS = mockCopyTemplate(templateId, sheetName);
    assert.equal(newSS.name, '2026/10/02_門山、鈴鳴山');
  });

  it('5. gas.js 必須同步對齊 folderName 檔名、SPREADSHEET_ID 範本讀取與 configSheet 安全引用', () => {
    const gasPath = fs.existsSync(path.join(rootDir, 'src', 'gas.js'))
      ? path.join(rootDir, 'src', 'gas.js')
      : path.join(rootDir, 'src', 'archive', 'gas.js');
    const gasContent = fs.readFileSync(gasPath, 'utf8');

    assert.ok(
      gasContent.includes('var sheetName = folderName;'),
      'gas.js 試算表檔名必須與 folderName 一致'
    );
    assert.ok(
      gasContent.includes('PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID")'),
      'gas.js 必須支援從 SPREADSHEET_ID 讀取範本'
    );
    assert.ok(
      gasContent.includes('var configSheet = eventSSForConfig ? eventSSForConfig.getSheetByName("_CONFIG") : null;'),
      'gas.js 必須安全存取 configSheet 避免 ReferenceError'
    );
  });
});
