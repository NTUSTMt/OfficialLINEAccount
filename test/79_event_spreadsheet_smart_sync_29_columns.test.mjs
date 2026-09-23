import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('79. 活動專屬試算表 29 欄位對齊與智慧雙重同步比對測試 (v0.1.183)', () => {
  const gasPath = path.join(rootDir, 'src', 'gas.js');
  const gasContent = fs.readFileSync(gasPath, 'utf8');

  it('1. _getGlobalColumnAliases 必須涵蓋 5 大新欄位及擔任幹部意願中文別名', () => {
    assert.ok(gasContent.includes('"department": ["系所", "系級", "科系", "學系"]'), '系所別名配置');
    assert.ok(gasContent.includes('"student_id": ["學號"]'), '學號別名配置');
    assert.ok(gasContent.includes('"個人特殊病史"') && gasContent.includes('"個人特殊病史或過敏"'), '個人特殊病史別名配置');
    assert.ok(gasContent.includes('"identity_status": ["身分"') && gasContent.includes('"身分狀態"'), '身分別名配置');
    assert.ok(gasContent.includes('"join_membership_intent": ["加入社員意願"') && gasContent.includes('"入社意願"'), '加入社員意願別名配置');
    assert.ok(gasContent.includes('"officer_intent": ["擔任幹部意願"') && gasContent.includes('"幹部意願"'), '擔任幹部意願別名配置');
  });

  it('2. _supabaseGet 必須妥善處理 in.(...) 語法，防止逗號被誤編碼為 %2C 導致查無多筆隊員', () => {
    assert.ok(
      gasContent.includes('valStr.indexOf("in.(") === 0') &&
      gasContent.includes('encVal = "in.(" + items.map('),
      '_supabaseGet 必須保留 in.(...) 中的逗號分隔符號'
    );
  });

  it('3. _createEventDriveFolderAndSheet 必須初始化完整的 29 個表頭欄位', () => {
    const headerBlock = gasContent.slice(
      gasContent.indexOf('var headers = ['),
      gasContent.indexOf('signupSheet.appendRow(headers);')
    );

    const expectedCols = [
      '系統識別碼', '專屬碼', '姓名', '性別', 'LINE ID', '聯絡信箱', '聯絡電話', '聯絡地址',
      '生日', '證件號碼', '緊急聯絡人姓名', '緊急聯絡人電話', '緊急聯絡人聯絡地址', '緊急聯絡人關係',
      '爬山經驗', '體能測驗', '體能證明', '是否為社員', '審核結果', '通知狀態', '繳費狀態', '備註', '想說的話', '擔任幹部意願',
      '系所', '學號', '個人特殊病史', '身分', '加入社員意願'
    ];

    assert.equal(expectedCols.length, 29, '規格必須剛好為 29 欄');
    expectedCols.forEach((col) => {
      assert.ok(headerBlock.includes(`"${col}"`), `表頭陣列必須包含欄位: ${col}`);
    });
  });

  it('4. _handleCreateEventSheet 新增試算表時必須依序匯入 29 欄位並將意願格式化為「是/否」', () => {
    assert.ok(
      gasContent.includes('m.is_official_member ? "是" :') &&
      gasContent.includes('m.want_to_say || ""') &&
      gasContent.includes('m.department || ""') &&
      gasContent.includes('m.medical_history || ""') &&
      gasContent.includes('m.identity_status || ""'),
      '_handleCreateEventSheet 必須完整組裝 29 欄位'
    );
    assert.ok(
      gasContent.includes('_setOrUpdateConfigRow(configSheet, "LAST_SYNCED_AT"'),
      '新建立試算表必須初始化 LAST_SYNCED_AT 時間戳記'
    );
  });

  it('5. _backfillEventSpreadsheetMemberInfo 必須具備動態補齊 6 大新欄位表頭能力', () => {
    assert.ok(
      gasContent.includes('name: "擔任幹部意願"') &&
      gasContent.includes('name: "系所"') &&
      gasContent.includes('name: "學號"') &&
      gasContent.includes('name: "個人特殊病史"') &&
      gasContent.includes('name: "身分"') &&
      gasContent.includes('name: "加入社員意願"'),
      '回補函式必須自動補齊缺漏表頭'
    );
  });

  it('6. _backfillEventSpreadsheetMemberInfo 必須支援 LAST_SYNCED_AT 讀取、比對與批次回寫', () => {
    assert.ok(
      gasContent.includes('_getConfigRow(configSheet, "LAST_SYNCED_AT")') &&
      gasContent.includes('lastSyncedTime = lastSyncedAtStr ? new Date(lastSyncedAtStr).getTime() : 0'),
      '必須從 _CONFIG 正確讀取上次同步時間'
    );
    assert.ok(
      gasContent.includes('memberNeedsUpdate = true') &&
      gasContent.includes('mTime > lastSyncedTime'),
      '必須依據隊員 updated_at 與上次同步時間進行篩選'
    );
    assert.ok(
      gasContent.includes('sheet.getRange(r + 1, 1, 1, headers.length).setValues([sData[r]])'),
      '必須使用列級批次 setValues 回寫，保留儲存格 highlight 底色與樣式'
    );
    assert.ok(
      gasContent.includes('_setOrUpdateConfigRow(configSheet, "LAST_SYNCED_AT", nowIso)'),
      '同步完成時必須更新 _CONFIG 中之 LAST_SYNCED_AT'
    );
  });

  it('7. gas_modules 模組檔案必須與主檔完全保持一致', () => {
    const modConfigPath = path.join(rootDir, 'gas_modules', '01_Config_Auth.js');
    const modConfig = fs.readFileSync(modConfigPath, 'utf8');
    assert.ok(modConfig.includes('"個人特殊病史"'), '01_Config_Auth 必須包含個人特殊病史別名');

    const modWorkerPath = path.join(rootDir, 'gas_modules', '05_Sync_Worker.js');
    const modWorker = fs.readFileSync(modWorkerPath, 'utf8');
    assert.ok(modWorker.includes('signupData.department = m.department'), '05_Sync_Worker 必須包含新欄位傳遞');

    const modHelperPath = path.join(rootDir, 'gas_modules', '06_Helper_Services.js');
    const modHelper = fs.readFileSync(modHelperPath, 'utf8');
    assert.ok(modHelper.includes('"加入社員意願"'), '06_Helper_Services 必須包含加入社員意願表頭');
    assert.ok(modHelper.includes('LAST_SYNCED_AT'), '06_Helper_Services 必須包含 LAST_SYNCED_AT 比對邏輯');
  });

  it('8. _getConfigRow 輔助函式必須存在於 src/gas.js 與 gas_modules/06_Helper_Services.js', () => {
    assert.ok(gasContent.includes('function _getConfigRow(configSheet, key)'), 'gas.js 必須實作 _getConfigRow');
    const modHelperPath = path.join(rootDir, 'gas_modules', '06_Helper_Services.js');
    const modHelper = fs.readFileSync(modHelperPath, 'utf8');
    assert.ok(modHelper.includes('function _getConfigRow(configSheet, key)'), '06_Helper_Services.js 必須實作 _getConfigRow');
  });
});
