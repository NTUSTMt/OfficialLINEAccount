import liff from '@line/liff';
import { GAS_API_URL, NOTIFY_DISPATCHER_URL } from '../constants/api';
import type { ApplicantEvaluation, EventTranslationInput, EventTranslationResult } from '../types/admin';

export { GAS_API_URL, NOTIFY_DISPATCHER_URL };

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
    const res = await fetch(url);
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

/**
 * 取得當前 LIFF 登入之 Access Token
 */
export const getAccessToken = (): string => {
  try {
    if (liff && typeof liff.getAccessToken === 'function') {
      return liff.getAccessToken() || '';
    }
  } catch (e) {
    console.warn('無法獲取 LIFF Access Token:', e);
  }
  return '';
};

/**
 * 取得當前階段簽發之 Supabase Custom JWT
 */
export const getCustomJwt = (): string => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const direct =
        sessionStorage.getItem('club_user_jwt') ||
        sessionStorage.getItem('web_admin_jwt');
      if (direct) return direct;

      const rawSession = sessionStorage.getItem('web_admin_session');
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession);
          if (parsed && typeof parsed.jwt === 'string') {
            return parsed.jwt;
          }
        } catch {
          // ignore json parse error
        }
      }
    }
  } catch (e) {
    console.warn('無法讀取 sessionStorage JWT:', e);
  }
  return '';
};

/**
 * 取得當前 Web 管理後台登入者之使用者 ID
 */
export const getWebAdminUserId = (): string => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const rawSession = sessionStorage.getItem('web_admin_session');
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession);
          if (parsed && typeof parsed.userId === 'string') {
            return parsed.userId;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return '';
};

/**
 * 調用 Supabase 通知調度中心 (notify-dispatcher)
 */
export const notifyDispatcher = async (
  action: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> => {
  try {
    const idToken = getIdToken();
    const accessToken = getAccessToken();
    const customJwt = getCustomJwt();
    const adminUserId = getWebAdminUserId();

    const bodyWithAuth: Record<string, unknown> = {
      action,
      ...(adminUserId ? { userId: adminUserId, callerId: adminUserId } : {}),
      ...payload,
      ...(idToken ? { idToken } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(customJwt ? { customJwt } : {})
    };

    const anonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (anonKey) {
      headers['apikey'] = anonKey;
    }
    if (idToken) {
      headers['x-line-id-token'] = idToken;
    }
    if (accessToken) {
      headers['x-line-access-token'] = accessToken;
    }
    const bearerToken = customJwt || idToken || accessToken;
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const res = await fetch(NOTIFY_DISPATCHER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyWithAuth)
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        parsedMsg = errJson.message || errJson.error || errText;
      } catch {
        // 保留原始文字
      }
      console.warn(`[notifyDispatcher] HTTP ${res.status}:`, parsedMsg);
      return { success: false, message: parsedMsg };
    }

    const json = await res.json();
    return { success: json.status === 'success', message: json.message };
  } catch (err) {
    console.warn('[notifyDispatcher] 推播發送失敗:', err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 調用 Supabase 通知調度中心 (notify-dispatcher) 並取得回傳之完整業務資料
 */
export const callDispatcherAction = async <T = any>(
  action: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; data?: T; message?: string }> => {
  try {
    const idToken = getIdToken();
    const accessToken = getAccessToken();
    const customJwt = getCustomJwt();
    const adminUserId = getWebAdminUserId();

    const bodyWithAuth: Record<string, unknown> = {
      action,
      ...(adminUserId ? { userId: adminUserId, callerId: adminUserId } : {}),
      ...payload,
      ...(idToken ? { idToken } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(customJwt ? { customJwt } : {})
    };

    const anonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (anonKey) {
      headers['apikey'] = anonKey;
    }
    if (idToken) {
      headers['x-line-id-token'] = idToken;
    }
    if (accessToken) {
      headers['x-line-access-token'] = accessToken;
    }
    const bearerToken = customJwt || idToken || accessToken;
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const res = await fetch(NOTIFY_DISPATCHER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyWithAuth)
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        parsedMsg = errJson.message || errJson.error || errText;
      } catch {
        // 保留原始文字
      }
      console.warn(`[callDispatcherAction] HTTP ${res.status}:`, parsedMsg);
      return { success: false, message: parsedMsg };
    }

    const json = await res.json();
    return {
      success: json.status === 'success' || !json.status || json.status === 200,
      data: json as T,
      message: json.message
    };
  } catch (err) {
    console.warn('[callDispatcherAction] 請求失敗:', err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 透過 AI 進行報名者體能與登山經驗去識別化評估
 * 前端第一道防護：徹底過濾姓名、電話、學號、Line ID 等敏感個資
 * 當名單超過 30 人時自動以 25 人為一組分批呼叫並合併結果
 */
export const evaluateApplicantsViaAi = async (
  event: {
    title: string;
    start_date?: string;
    end_date?: string;
    duration_days?: number;
    summary?: string;
    itinerary?: string;
  },
  rawApplicants: Array<{
    anonymousId: string;
    outdoor_experience?: string;
    fitness_desc?: string;
    medical_history?: string;
    [key: string]: any;
  }>,
  callerUserId?: string
): Promise<{ success: boolean; evaluations: ApplicantEvaluation[]; error?: string }> => {
  try {
    const effectiveUserId = callerUserId || getWebAdminUserId();

    // 嚴格白名單過濾個資
    const sanitized = rawApplicants.map((a, idx) => ({
      anonymousId: String(a.anonymousId || `A${idx + 1}`),
      outdoor_experience: typeof a.outdoor_experience === 'string' ? a.outdoor_experience.slice(0, 500) : '',
      fitness_desc: typeof a.fitness_desc === 'string' ? a.fitness_desc.slice(0, 500) : '',
      medical_history: typeof a.medical_history === 'string' ? a.medical_history.slice(0, 300) : ''
    }));

    if (sanitized.length === 0) {
      return { success: true, evaluations: [] };
    }

    // 當人數超過 30 人時，每 25 人一組分批送出
    const BATCH_SIZE = 25;
    const batches: typeof sanitized[] = [];
    for (let i = 0; i < sanitized.length; i += BATCH_SIZE) {
      batches.push(sanitized.slice(i, i + BATCH_SIZE));
    }

    const allEvaluations: ApplicantEvaluation[] = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const res = await callDispatcherAction<{ success: boolean; evaluations: ApplicantEvaluation[] }>(
        'ai_evaluate_applicants',
        {
          event,
          applicants: batch,
          ...(effectiveUserId ? { userId: effectiveUserId, callerId: effectiveUserId } : {})
        }
      );

      if (!res.success || !res.data) {
        return {
          success: false,
          evaluations: allEvaluations,
          error: res.message || `批次 ${b + 1} AI 評估失敗`
        };
      }

      if (Array.isArray(res.data.evaluations)) {
        allEvaluations.push(...res.data.evaluations);
      }
    }

    return {
      success: true,
      evaluations: allEvaluations
    };
  } catch (err) {
    return {
      success: false,
      evaluations: [],
      error: err instanceof Error ? err.message : String(err)
    };
  }
};

/**
 * 透過 AI 一鍵進行中文活動內容雙語翻譯 (鏡像對應格式，總字數限制 ≤ 1400 字元)
 */
export const translateEventViaAi = async (
  input: EventTranslationInput,
  callerUserId?: string
): Promise<{ success: boolean; translation?: EventTranslationResult; error?: string }> => {
  try {
    const effectiveUserId = callerUserId || getWebAdminUserId();
    const res = await callDispatcherAction<{ success: boolean; translation: EventTranslationResult }>(
      'ai_translate_event',
      {
        title: input.title,
        summary: input.summary,
        itinerary: input.itinerary,
        ...(effectiveUserId ? { userId: effectiveUserId, callerId: effectiveUserId } : {})
      }
    );

    if (!res.success || !res.data || !res.data.translation) {
      return {
        success: false,
        error: res.message || 'AI 翻譯服務回傳失敗'
      };
    }

    return {
      success: true,
      translation: res.data.translation
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};



