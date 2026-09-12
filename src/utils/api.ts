import liff from '@line/liff';
import { GAS_API_URL } from '../constants/api';

export { GAS_API_URL };

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
 * 為 GET 請求 URL 附加 idToken 與防快取時間戳記
 */
export const appendAuthToken = (url: string): string => {
  const token = getIdToken();
  const sep1 = url.includes('?') ? '&' : '?';
  let finalUrl = `${url}${sep1}_t=${Date.now()}`;
  if (token) {
    finalUrl += `&idToken=${encodeURIComponent(token)}`;
  }
  return finalUrl;
};

/**
 * 為 POST 請求 Payload 附加 idToken
 */
export const withAuthPayload = <T extends Record<string, unknown>>(payload: T): T & { idToken?: string } => {
  const token = getIdToken();
  if (!token) return payload;
  return {
    ...payload,
    idToken: token
  };
};

export interface GasApiResponse<T = unknown> {
  status?: string;
  message?: string;
  data?: T;
  events?: unknown[];
  signups?: unknown[];
  notifiedCount?: number;
  [key: string]: unknown;
}

/**
 * 安全的 GAS GET 請求：透過標準 fetch 發送並解析 JSON 回應
 */
export const gasGet = async <T = GasApiResponse>(url: string): Promise<T> => {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`伺服器回應異常 (HTTP ${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('[gasGet] 請求失敗:', err);
    throw err;
  }
};

/**
 * 安全的 GAS POST 請求：附帶身分憑證並處理重定向
 */
export const gasPost = async <T = unknown>(payload: Record<string, unknown>): Promise<T> => {
  try {
    const bodyWithAuth = withAuthPayload(payload);
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(bodyWithAuth),
      redirect: 'follow'
    });
    if (!res.ok) {
      throw new Error(`伺服器回應異常 (HTTP ${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('[gasPost] 請求失敗:', err);
    throw err;
  }
};

