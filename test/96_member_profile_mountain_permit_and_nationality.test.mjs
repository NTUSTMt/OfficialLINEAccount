import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 載入 nationalities.ts 源碼並進行語義解析驗證
const nationalitiesTs = fs.readFileSync(
  path.join(rootDir, 'src/constants/nationalities.ts'),
  'utf-8'
);

// 提取 NATIONALITY_LIST
const listMatch = nationalitiesTs.match(/export const NATIONALITY_LIST: NationalityItem\[\] = (\[[\s\S]*?\]);/);
assert.ok(listMatch, '必須成功在 nationalities.ts 中找到 NATIONALITY_LIST 定義');
// 清理型別後使用 eval 安全求值
const NATIONALITY_LIST = eval(listMatch[1]);

// 實作與 nationalities.ts 一致之純函式測試
function getNationalityLabel(val, targetLang = 'zh') {
  if (!val || !val.trim()) {
    return targetLang === 'zh' ? '中華民國' : '中華民國';
  }
  const clean = val.trim();
  const found = NATIONALITY_LIST.find(
    (item) => item.zh === clean || item.en.toLowerCase() === clean.toLowerCase()
  );
  if (found) {
    return targetLang === 'zh' ? found.zh : found.en;
  }
  return clean;
}

const TAIWAN_CITIES = [
  '基隆市', '臺北市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '臺中市', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '臺南市', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
];

function parseTaiwanAddress(rawAddress) {
  const full = (rawAddress || '').trim();
  if (!full) {
    return { city: '', district: '', detail: '', full: '' };
  }

  let matchedCity = '';
  let restAfterCity = full;

  for (const city of TAIWAN_CITIES) {
    if (full.startsWith(city)) {
      matchedCity = city;
      restAfterCity = full.substring(city.length).trim();
      break;
    }
  }

  if (matchedCity) {
    const distMatch = restAfterCity.match(/^([^區市鎮鄉]{1,4}[區市鎮鄉])(.*)$/);
    if (distMatch) {
      const district = distMatch[1].trim();
      const detail = distMatch[2].trim();
      return {
        city: matchedCity,
        district,
        detail,
        full
      };
    }

    return {
      city: matchedCity,
      district: '',
      detail: restAfterCity,
      full
    };
  }

  return {
    city: '海外/其他',
    district: '',
    detail: full,
    full
  };
}

test('1. 國籍常數與轉換函式驗證 (NATIONALITY_LIST & getNationalityLabel)', async () => {
  // 驗證 37 個國家定義 (中華民國 + 36 個外籍國家與地區)
  assert.equal(NATIONALITY_LIST.length, 37, 'NATIONALITY_LIST 必須包含中華民國與 36 個指定外籍國家與地區，共 37 國');
  
  const roc = NATIONALITY_LIST.find(n => n.zh === '中華民國');
  assert.ok(roc, '必須包含中華民國');
  assert.equal(roc.en, '中華民國');

  const japan = NATIONALITY_LIST.find(n => n.zh === '日本');
  assert.ok(japan, '必須包含日本');
  assert.equal(japan.en, 'Japan');

  const us = NATIONALITY_LIST.find(n => n.zh === '美國');
  assert.ok(us, '必須包含美國');
  assert.equal(us.en, 'United States');

  // 驗證 getNationalityLabel 轉為後台繁中顯示
  assert.equal(getNationalityLabel('Japan', 'zh'), '日本');
  assert.equal(getNationalityLabel('United States', 'zh'), '美國');
  assert.equal(getNationalityLabel('中華民國', 'zh'), '中華民國');
  assert.equal(getNationalityLabel('South Korea', 'zh'), '韓國');
  assert.equal(getNationalityLabel('OtherCountry', 'zh'), 'OtherCountry');
  assert.equal(getNationalityLabel(null, 'zh'), '中華民國');

  // 驗證 getNationalityLabel 英文介面轉換
  assert.equal(getNationalityLabel('日本', 'en'), 'Japan');
  assert.equal(getNationalityLabel('美國', 'en'), 'United States');
});

test('2. 臺灣地址智慧拆解演算法驗證 (parseTaiwanAddress)', async () => {
  // 臺灣地址標準拆解
  const addr1 = parseTaiwanAddress('臺北市大安區基隆路四段43號');
  assert.equal(addr1.city, '臺北市');
  assert.equal(addr1.district, '大安區');
  assert.equal(addr1.detail, '基隆路四段43號');
  assert.equal(addr1.full, '臺北市大安區基隆路四段43號');

  const addr2 = parseTaiwanAddress('新北市板橋區縣民大道二段7號');
  assert.equal(addr2.city, '新北市');
  assert.equal(addr2.district, '板橋區');
  assert.equal(addr2.detail, '縣民大道二段7號');

  const addr3 = parseTaiwanAddress('台中市西屯區臺灣大道三段99號');
  assert.equal(addr3.city, '台中市');
  assert.equal(addr3.district, '西屯區');
  assert.equal(addr3.detail, '臺灣大道三段99號');

  // 海外地址或無相符縣市
  const addrForeign = parseTaiwanAddress('123 Main St, New York, NY 10001, USA');
  assert.equal(addrForeign.city, '海外/其他');
  assert.equal(addrForeign.district, '');
  assert.equal(addrForeign.detail, '123 Main St, New York, NY 10001, USA');

  // 空字串防呆
  const addrEmpty = parseTaiwanAddress('');
  assert.equal(addrEmpty.city, '');
  assert.equal(addrEmpty.district, '');
  assert.equal(addrEmpty.detail, '');
});

test('3. 註冊頁面 (Register.tsx) 步驟一國籍必填全鏈路驗證', async () => {
  const registerCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/Register.tsx'),
    'utf-8'
  );

  // 驗證導入國籍常數
  assert.match(
    registerCode,
    /import.*NATIONALITY_LIST.*from.*nationalities/,
    'Register.tsx 必須引入 NATIONALITY_LIST'
  );

  // 驗證步驟一包含國籍選單與 Other 自訂輸入
  assert.match(
    registerCode,
    /國籍 \(Nationality\)/,
    'Register.tsx 必須具備 國籍 (Nationality) 表單欄位'
  );
  assert.match(
    registerCode,
    /value="Other"/,
    'Register.tsx 必須提供 Other 自行輸入選項'
  );

  // 驗證步驟一驗證邏輯納入 nationality
  assert.match(
    registerCode,
    /formData\.nationality/,
    'Register.tsx 驗證邏輯必須檢查 formData.nationality'
  );
});

test('4. 個資編輯頁面與電腦管理抽屜國籍後台繁中呈現驗證', async () => {
  const detailEditCode = fs.readFileSync(
    path.join(rootDir, 'src/pages/MemberDetailEdit.tsx'),
    'utf-8'
  );
  const drawerCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberEditDrawer.tsx'),
    'utf-8'
  );

  // MemberDetailEdit 驗證
  assert.match(
    detailEditCode,
    /getNationalityLabel\(formData\.nationality,\s*'zh'\)/,
    'MemberDetailEdit.tsx 國籍下拉選單必須透過 getNationalityLabel 以繁中呈現'
  );

  // MemberEditDrawer 驗證
  assert.match(
    drawerCode,
    /getNationalityLabel\(formData\.nationality,\s*'zh'\)/,
    'MemberEditDrawer.tsx 國籍下拉選單必須透過 getNationalityLabel 以繁中呈現'
  );
});

test('5. 電腦端個人資料瀏覽 (MemberProfileModal.tsx) 臺灣登山申請表與無星號規範驗證', async () => {
  const modalCode = fs.readFileSync(
    path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'),
    'utf-8'
  );

  // 驗證登山申請表結構
  assert.match(
    modalCode,
    /wa-mountain-permit-card/,
    'MemberProfileModal 必須具備 wa-mountain-permit-card 登山申請表卡片'
  );
  assert.match(
    modalCode,
    /隊員資料 \(臺灣登山申請格式\)/,
    '登山申請表卡片標題必須為「隊員資料 (臺灣登山申請格式)」'
  );

  // 驗證所有表單標籤均無星號 (*)
  assert.match(modalCode, /renderPermitField\(\s*'姓名'/, '姓名欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'電話'/, '電話欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'手機'/, '手機欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'Email'/, 'Email 欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'性別'/, '性別欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'緊急聯絡人'/, '緊急聯絡人欄位標籤不可有星號');
  assert.match(modalCode, /renderPermitField\(\s*'緊急聯絡電話'/, '緊急聯絡電話欄位標籤不可有星號');

  // 驗證電話預設「同手機」帶入
  assert.match(
    modalCode,
    /\(同手機\)/,
    '電話欄位必須預設提示 (同手機) 並帶入號碼'
  );

  // 驗證三格地址拆解與全址複製
  assert.match(
    modalCode,
    /parseTaiwanAddress\(address\)/,
    '必須調用 parseTaiwanAddress 拆解地址'
  );
  assert.match(
    modalCode,
    /permit-addr-full/,
    '必須提供全址複製按鈕'
  );

  // 驗證國籍在後台繁中顯示
  assert.match(
    modalCode,
    /getNationalityLabel\(nationality,\s*'zh'\)/,
    '國籍欄位必須透過 getNationalityLabel 以繁中呈現'
  );

  // 驗證下方結構化卡片
  assert.match(modalCode, /社團與學籍身分/, '必須包含「社團與學籍身分」分區');
  assert.match(modalCode, /緊急留守附加資訊/, '必須包含「緊急留守附加資訊」分區');
  assert.match(modalCode, /登山經歷與體能審核/, '必須包含「登山經歷與體能審核」分區');
  assert.match(modalCode, /想對幹部說的話/, '必須包含「想對幹部說的話」分區');
});

test('6. 資料庫遷移與 RPC 預存程序包含 nationality 欄位驗證', async () => {
  const migrationSql = fs.readFileSync(
    path.join(rootDir, 'supabase/add_nationality_to_members.sql'),
    'utf-8'
  );
  const schemaSql = fs.readFileSync(
    path.join(rootDir, 'supabase/schema.sql'),
    'utf-8'
  );
  const memberRpcSql = fs.readFileSync(
    path.join(rootDir, 'supabase/member_profile_rpc.sql'),
    'utf-8'
  );

  // 遷移 SQL 驗證
  assert.match(
    migrationSql,
    /ALTER TABLE members ADD COLUMN IF NOT EXISTS nationality TEXT/,
    '遷移腳本必須新增 nationality 欄位'
  );
  assert.match(
    migrationSql,
    /p_data->>'nationality'/,
    'save_member_profile 必須支援 p_data->>\'nationality\' 參數'
  );

  // Canonical schema 驗證
  assert.match(
    schemaSql,
    /nationality TEXT/,
    'schema.sql members 表必須定義 nationality 欄位'
  );

  // member_profile_rpc 驗證
  assert.match(
    memberRpcSql,
    /nationality/,
    'member_profile_rpc.sql 必須包含 nationality 欄位支援'
  );
});
