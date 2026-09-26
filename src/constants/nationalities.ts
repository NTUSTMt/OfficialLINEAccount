// 國籍常數與臺灣地址拆解輔助工具
// 支援中華民國與 35 個指定外籍國家（註冊時可顯示英文，管理後台顯示繁體中文）

export interface NationalityItem {
  zh: string;
  en: string;
}

export const NATIONALITY_LIST: NationalityItem[] = [
  { zh: '中華民國', en: '中華民國' },
  { zh: '香港', en: 'Hong Kong' },
  { zh: '馬來西亞', en: 'Malaysia' },
  { zh: '菲律賓', en: 'Philippines' },
  { zh: '日本', en: 'Japan' },
  { zh: '新加坡', en: 'Singapore' },
  { zh: '美國', en: 'United States' },
  { zh: '中國大陸', en: 'China' },
  { zh: '韓國', en: 'South Korea' },
  { zh: '德國', en: 'Germany' },
  { zh: '印尼', en: 'Indonesia' },
  { zh: '法國', en: 'France' },
  { zh: '英國', en: 'United Kingdom' },
  { zh: '加拿大', en: 'Canada' },
  { zh: '澳大利亞', en: 'Australia' },
  { zh: '泰國', en: 'Thailand' },
  { zh: '越南', en: 'Vietnam' },
  { zh: '荷蘭', en: 'Netherlands' },
  { zh: '印度', en: 'India' },
  { zh: '捷克', en: 'Czech Republic' },
  { zh: '波蘭', en: 'Poland' },
  { zh: '比利時', en: 'Belgium' },
  { zh: '澳門', en: 'Macau' },
  { zh: '瑞士', en: 'Switzerland' },
  { zh: '西班牙', en: 'Spain' },
  { zh: '奧地利', en: 'Austria' },
  { zh: '義大利', en: 'Italy' },
  { zh: '紐西蘭', en: 'New Zealand' },
  { zh: '俄羅斯', en: 'Russia' },
  { zh: '瑞典', en: 'Sweden' },
  { zh: '丹麥', en: 'Denmark' },
  { zh: '挪威', en: 'Norway' },
  { zh: '緬甸', en: 'Myanmar' },
  { zh: '以色列', en: 'Israel' },
  { zh: '南非共和國', en: 'South Africa' },
  { zh: '匈牙利', en: 'Hungary' },
  { zh: '芬蘭', en: 'Finland' },
];

/**
 * 取得國籍顯示文字
 * @param val 儲存於資料庫的國籍字串 (可能為中文、英文或自訂字串)
 * @param targetLang 目標語系 ('zh' 給管理後台，'en' 給英文介面)
 */
export function getNationalityLabel(val?: string | null, targetLang: 'zh' | 'en' = 'zh'): string {
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

// 臺灣 22 縣市正規表示式
const TAIWAN_CITIES = [
  '基隆市', '臺北市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣',
  '苗栗縣', '臺中市', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
  '嘉義縣', '臺南市', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
];

export interface ParsedAddress {
  city: string;
  district: string;
  detail: string;
  full: string;
}

/**
 * 自動拆解臺灣地址為「縣市」、「鄉鎮市區」與「詳細地址」
 */
export function parseTaiwanAddress(rawAddress?: string | null): ParsedAddress {
  const full = (rawAddress || '').trim();
  if (!full) {
    return { city: '', district: '', detail: '', full: '' };
  }

  // 1. 比對開頭的縣市
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
    // 2. 比對緊接著的行政區 (區、市、鎮、鄉)
    // 通常為 2~4 個字，以 區|市|鎮|鄉 結尾
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

    // 若無法進一步拆解鄉鎮市區
    return {
      city: matchedCity,
      district: '',
      detail: restAfterCity,
      full
    };
  }

  // 3. 若無符合之臺灣縣市（例如海外或簡寫）
  return {
    city: '海外/其他',
    district: '',
    detail: full,
    full
  };
}
