// test/150_roster_sheet_nationality_and_register_validation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('.');

test('150.1 WebAdminRoster 開啟試算表必須在非同步 await 前預開視窗並處理阻擋備援', () => {
  const rosterSrc = fs.readFileSync(
    path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx'),
    'utf8'
  );

  const fnMatch = rosterSrc.match(/const handleSyncOrOpenSheet = async \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, '必須找到 handleSyncOrOpenSheet 函式');
  const fnBody = fnMatch[1];

  // 必須在第一個 await 之前預先開啟視窗，保留使用者點擊手勢 (User Activation)
  const firstAwaitIdx = fnBody.indexOf('await ');
  const preOpenIdx = fnBody.indexOf("window.open('', '_blank')");
  assert.ok(firstAwaitIdx !== -1, 'handleSyncOrOpenSheet 應包含非同步呼叫');
  assert.ok(
    preOpenIdx !== -1 && preOpenIdx < firstAwaitIdx,
    '必須在第一個 await 之前呼叫 window.open(\'\', \'_blank\') 預開分頁，避免被瀏覽器彈窗攔截'
  );

  // 必須將預開分頁導向目標網址，並在失敗時關閉空白頁
  assert.ok(
    fnBody.includes('location.href = targetSpreadsheetUrl') || fnBody.includes('location.replace(targetSpreadsheetUrl)'),
    '必須在取得網址後將預開視窗導向 targetSpreadsheetUrl'
  );
  assert.ok(
    fnBody.includes('.close()'),
    '發生錯誤或無有效網址時必須關閉預開的空白分頁'
  );
});

test('150.2 國籍未填寫時在幹部系統與輔助函式必須顯示「－」而非「中華民國」', () => {
  const natSrc = fs.readFileSync(
    path.join(rootDir, 'src/constants/nationalities.ts'),
    'utf8'
  );
  const profileModalSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'),
    'utf8'
  );
  const editDrawerSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx'),
    'utf8'
  );

  // 1. 驗證 getNationalityLabel 空值行為
  const listMatch = natSrc.match(/export const NATIONALITY_LIST: NationalityItem\[\] = (\[[\s\S]*?\]);/);
  assert.ok(listMatch, '必須找到 NATIONALITY_LIST');
  const NATIONALITY_LIST = eval(listMatch[1]);

  const fnMatch = natSrc.match(/export function getNationalityLabel\([\s\S]*?\n\}/);
  assert.ok(fnMatch, '必須找到 getNationalityLabel 函式');
  const jsFnSrc = fnMatch[0]
    .replace(/export function getNationalityLabel\([^)]*\): string/, 'function getNationalityLabel(val, targetLang = "zh")');
  const getNationalityLabel = new Function('NATIONALITY_LIST', `${jsFnSrc}; return getNationalityLabel;`)(NATIONALITY_LIST);

  assert.equal(getNationalityLabel(null, 'zh'), '－', 'null 國籍應顯示「－」');
  assert.equal(getNationalityLabel(undefined, 'zh'), '－', 'undefined 國籍應顯示「－」');
  assert.equal(getNationalityLabel('', 'zh'), '－', '空字串國籍應顯示「－」');
  assert.equal(getNationalityLabel('   ', 'en'), '－', '空白字串國籍（英文介面）應顯示「－」');
  assert.equal(getNationalityLabel('Japan', 'zh'), '日本', '既有國籍轉換不可受影響');
  assert.equal(getNationalityLabel('中華民國', 'en'), 'Taiwan', '既有中華民國轉英文不可受影響');

  // 2. MemberProfileModal 不得將空國籍預設為「中華民國」
  assert.ok(
    !profileModalSrc.includes("merged.nationality || '中華民國'"),
    'MemberProfileModal 不得將空國籍 fallback 為「中華民國」'
  );

  // 3. MemberEditDrawer 國籍下拉選單必須包含空值「－」選項且不把空值轉成中華民國
  assert.ok(
    editDrawerSrc.includes('<option value="">－</option>'),
    'MemberEditDrawer 國籍選單必須提供 <option value="">－</option>'
  );
  assert.ok(
    !editDrawerSrc.includes("value={getNationalityLabel(formData.nationality, 'zh')}"),
    'MemberEditDrawer 國籍 select 的 value 不應直接套用預設會變色/填值的函式而掩蓋未填狀態'
  );
});

test('150.3 Register.tsx 點擊下一步與送出時必須驗證必填並跳轉滾動聚焦至第一個未填欄位', () => {
  const registerSrc = fs.readFileSync(
    path.join(rootDir, 'src/pages/Register.tsx'),
    'utf8'
  );

  // 1. 「下一步」按鈕必須經過驗證函式，而非直接 setStep(step + 1)
  assert.ok(
    registerSrc.includes('onClick={handleNextStep}'),
    '「下一步」按鈕必須綁定 handleNextStep 進行當前步驟驗證'
  );
  assert.ok(
    !registerSrc.includes('onClick={() => setStep(step + 1)}'),
    '「下一步」按鈕不得跳過驗證直接呼叫 setStep(step + 1)'
  );

  // 2. 必須具備欄位驗證與跳轉聚焦邏輯
  assert.ok(
    registerSrc.includes('focusMissingField') || registerSrc.includes('scrollIntoView'),
    'Register.tsx 必須實作滾動至缺漏欄位並聚焦的機制'
  );
  assert.ok(
    registerSrc.includes("block: 'center'"),
    '跳轉至未填欄位時必須使用 scrollIntoView(..., { behavior: \'smooth\', block: \'center\' })'
  );
  assert.ok(
    registerSrc.includes('.focus('),
    '跳轉至未填欄位後必須呼叫 .focus() 讓使用者可直接輸入'
  );

  // 3. 自訂國籍輸入框與非傳統 input 欄位（體能照片、正取意願、隱私權條款）必須有可定位屬性
  assert.ok(
    registerSrc.includes('data-field="strengthProof"') &&
    registerSrc.includes('data-field="intendOfficial"') &&
    registerSrc.includes('data-field="privacyAgreed"'),
    'Step 4 的體能照片、入社意願與隱私權同意書必須標記 data-field 以便跳轉聚焦'
  );
});
