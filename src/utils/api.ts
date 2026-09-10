import liff from '@line/liff';

export const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

/**
 * 取得當前 LIFF 登入之 ID Token (JWT)
 */
export const getIdToken = (): string => {
  try {
    if (liff && typeof liff.getIDToken === 'function') {
      return liff.getIDToken() || '';
    }
  } catch (e) {
    console.warn('無法獲取 LIFF ID Token:', e);
  }
  return '';
};

/**
 * 為 GET 請求 URL 附加 idToken
 */
export const appendAuthToken = (url: string): string => {
  const token = getIdToken();
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}idToken=${encodeURIComponent(token)}`;
};

/**
 * 為 POST 請求 Payload 附加 idToken
 */
export const withAuthPayload = <T extends Record<string, any>>(payload: T): T & { idToken?: string } => {
  const token = getIdToken();
  if (!token) return payload;
  return {
    ...payload,
    idToken: token
  };
};

/**
 * 安全的 GAS GET 請求：透過標準 fetch 發送並解析 JSON 回應
 */
export const gasGet = async (url: string): Promise<any> => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`伺服器回應異常 (HTTP ${res.status})`);
    }
    return await res.json();
  } catch (err) {
    console.error('[gasGet] 請求失敗:', err);
    throw err;
  }
};
