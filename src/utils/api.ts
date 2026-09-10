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
 * 安全的 GAS GET 請求：先以 fetch 嘗試，若 Safari/WebKit 拋出 'Load failed'
 * 則自動降級為 XMLHttpRequest（XHR 處理 302 跨域轉址的相容性更佳）。
 * Safari 的 fetch API 在 GAS 302 → googleusercontent.com 跨域轉址時，
 * 部分情境會因 WebKit 安全策略直接阻斷並拋出 TypeError: Load failed，
 * 而 XHR 在相同場景下能正常跟隨轉址取回回應。
 */
export const gasGet = async (url: string): Promise<any> => {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (fetchErr) {
    // fetch 失敗 (Safari Load failed)，降級為 XHR
    console.warn('[gasGet] fetch 失敗，降級為 XHR:', fetchErr);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 30000;
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (parseErr) {
            reject(new Error('GAS 回應格式異常 (Invalid JSON)'));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error('網路連線失敗 (XHR Network Error)'));
      xhr.ontimeout = () => reject(new Error('請求逾時 (XHR Timeout)'));
      xhr.send();
    });
  }
};
