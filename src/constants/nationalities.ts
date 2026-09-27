// 國籍常數與臺灣地址拆解輔助工具
// 支援中華民國與 35 個指定外籍國家（註冊時可顯示英文，管理後台顯示繁體中文）

export interface NationalityItem {
  zh: string;
  en: string;
  native: string;
  flag: string;
  label: string;
}

export const NATIONALITY_LIST: NationalityItem[] = [
  { zh: '中華民國', en: 'Taiwan', native: '中華民國', flag: '🇹🇼', label: '🇹🇼 中華民國 - Taiwan' },
  { zh: '日本', en: 'Japan', native: '日本', flag: '🇯🇵', label: '🇯🇵 日本 - Japan' },
  { zh: '韓國', en: 'Korea', native: '대한민국', flag: '🇰🇷', label: '🇰🇷 대한민국 - Korea' },
  { zh: '香港', en: 'Hong Kong', native: '香港', flag: '🇭🇰', label: '🇭🇰 香港 - Hong Kong' },
  { zh: '澳門', en: 'Macau', native: '澳門', flag: '🇲🇴', label: '🇲🇴 澳門 - Macau' },
  { zh: '馬來西亞', en: 'Malaysia', native: 'Malaysia', flag: '🇲🇾', label: '🇲🇾 Malaysia - Malaysia' },
  { zh: '新加坡', en: 'Singapore', native: 'Singapore', flag: '🇸🇬', label: '🇸🇬 Singapore - Singapore' },
  { zh: '越南', en: 'Vietnam', native: 'Việt Nam', flag: '🇻🇳', label: '🇻🇳 Việt Nam - Vietnam' },
  { zh: '印尼', en: 'Indonesia', native: 'Indonesia', flag: '🇮🇩', label: '🇮🇩 Indonesia - Indonesia' },
  { zh: '菲律賓', en: 'Philippines', native: 'Pilipinas', flag: '🇵🇭', label: '🇵🇭 Pilipinas - Philippines' },
  { zh: '泰國', en: 'Thailand', native: 'ประเทศไทย', flag: '🇹🇭', label: '🇹🇭 ประเทศไทย - Thailand' },
  { zh: '美國', en: 'USA', native: 'United States', flag: '🇺🇸', label: '🇺🇸 United States - USA' },
  { zh: '加拿大', en: 'Canada', native: 'Canada', flag: '🇨🇦', label: '🇨🇦 Canada - Canada' },
  { zh: '英國', en: 'UK', native: 'United Kingdom', flag: '🇬🇧', label: '🇬🇧 United Kingdom - UK' },
  { zh: '德國', en: 'Germany', native: 'Deutschland', flag: '🇩🇪', label: '🇩🇪 Deutschland - Germany' },
  { zh: '法國', en: 'France', native: 'France', flag: '🇫🇷', label: '🇫🇷 France - France' },
  { zh: '荷蘭', en: 'Netherlands', native: 'Nederland', flag: '🇳🇱', label: '🇳🇱 Nederland - Netherlands' },
  { zh: '比利時', en: 'Belgium', native: 'België', flag: '🇧🇪', label: '🇧🇪 België - Belgium' },
  { zh: '瑞士', en: 'Switzerland', native: 'Schweiz', flag: '🇨🇭', label: '🇨🇭 Schweiz - Switzerland' },
  { zh: '奧地利', en: 'Austria', native: 'Österreich', flag: '🇦🇹', label: '🇦🇹 Österreich - Austria' },
  { zh: '捷克', en: 'Czech Republic', native: 'Česko', flag: '🇨🇿', label: '🇨🇿 Česko - Czech Republic' },
  { zh: '波蘭', en: 'Poland', native: 'Polska', flag: '🇵🇱', label: '🇵🇱 Polska - Poland' },
  { zh: '西班牙', en: 'Spain', native: 'España', flag: '🇪🇸', label: '🇪🇸 España - Spain' },
  { zh: '義大利', en: 'Italy', native: 'Italia', flag: '🇮🇹', label: '🇮🇹 Italia - Italy' },
  { zh: '俄羅斯', en: 'Russia', native: 'Россия', flag: '🇷🇺', label: '🇷🇺 Россия - Russia' },
  { zh: '瑞典', en: 'Sweden', native: 'Sverige', flag: '🇸🇪', label: '🇸🇪 Sverige - Sweden' },
  { zh: '丹麥', en: 'Denmark', native: 'Danmark', flag: '🇩🇰', label: '🇩🇰 Danmark - Denmark' },
  { zh: '挪威', en: 'Norway', native: 'Norge', flag: '🇳🇴', label: '🇳🇴 Norge - Norway' },
  { zh: '芬蘭', en: 'Finland', native: 'Suomi', flag: '🇫🇮', label: '🇫🇮 Suomi - Finland' },
  { zh: '匈牙利', en: 'Hungary', native: 'Magyarország', flag: '🇭🇺', label: '🇭🇺 Magyarország - Hungary' },
  { zh: '澳大利亞', en: 'Australia', native: 'Australia', flag: '🇦🇺', label: '🇦🇺 Australia - Australia' },
  { zh: '紐西蘭', en: 'New Zealand', native: 'New Zealand', flag: '🇳🇿', label: '🇳🇿 New Zealand - New Zealand' },
  { zh: '印度', en: 'India', native: 'भारत', flag: '🇮🇳', label: '🇮🇳 भारत - India' },
  { zh: '緬甸', en: 'Myanmar', native: 'မြန်မာ', flag: '🇲🇲', label: '🇲🇲 မြန်မာ - Myanmar' },
  { zh: '中國大陸', en: 'China', native: '中国', flag: '🇨🇳', label: '🇨🇳 中国 - China' },
  { zh: '以色列', en: 'Israel', native: 'ישראל', flag: '🇮🇱', label: '🇮🇱 ישראל - Israel' },
  { zh: '南非共和國', en: 'South Africa', native: 'South Africa', flag: '🇿🇦', label: '🇿🇦 South Africa - South Africa' }
];

/**
 * 取得國籍顯示文字
 * @param val 儲存於資料庫的國籍字串 (可能為中文、英文、自訂字串或完整標籤)
 * @param targetLang 目標語系 ('zh' 給管理後台，'en' 給英文介面)
 */
export function getNationalityLabel(val?: string | null, targetLang: 'zh' | 'en' = 'zh'): string {
  if (!val || !val.trim()) {
    return targetLang === 'zh' ? '中華民國' : 'Taiwan';
  }
  const clean = val.trim();
  const cleanLower = clean.toLowerCase();
  const found = NATIONALITY_LIST.find(
    (item) =>
      item.zh === clean ||
      item.en.toLowerCase() === cleanLower ||
      item.native === clean ||
      item.label === clean ||
      cleanLower.includes(item.en.toLowerCase()) ||
      clean.includes(item.zh)
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
