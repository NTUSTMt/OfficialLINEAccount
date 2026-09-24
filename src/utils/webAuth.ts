import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface WebAuthSession {
  jwt: string;
  userId: string;
  displayName: string;
  pictureUrl: string;
  isOfficer: boolean;
  officerRole: string | null;
  expiresAt: number; // Unix timestamp in milliseconds
}

const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const SESSION_STORAGE_KEY = 'web_admin_session';
const STATE_STORAGE_KEY = 'line_login_state';

/**
 * 產生安全的隨機防偽權杖 (CSRF State Token)
 */
export const generateSecureState = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'state_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

/**
 * 發起 LINE Login OAuth2 流程並重導向至 LINE 登入頁
 */
export const initiateLineLogin = (channelIdOverride?: string) => {
  const channelId = channelIdOverride || import.meta.env.VITE_LINE_CHANNEL_ID || '2009217429';
  const state = generateSecureState();
  sessionStorage.setItem(STATE_STORAGE_KEY, state);

  const redirectUri = `${window.location.origin}/admin-web/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state: state,
    scope: 'profile openid',
  });

  window.location.href = `${LINE_AUTH_URL}?${params.toString()}`;
};

/**
 * 處理 LINE Login 回呼並向 Supabase Edge Function 交換 Custom JWT
 */
export const handleLineCallback = async (
  code: string,
  state: string,
  supabaseUrlOverride?: string
): Promise<WebAuthSession> => {
  const savedState = sessionStorage.getItem(STATE_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);

  if (!state || !savedState || state !== savedState) {
    throw new Error('[安全校驗失敗]: CSRF state mismatch (防偽驗證權杖不符或過期，請重新登入)');
  }

  const supabaseUrl = (supabaseUrlOverride || import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('[系統配置錯誤]: 未設定 VITE_SUPABASE_URL 環境變數');
  }

  const edgeFnUrl = `${supabaseUrl}/functions/v1/line-auth`;
  const redirectUri = `${window.location.origin}/admin-web/callback`;

  const res = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({
      code,
      redirectUri,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let parsedMessage = errorBody;
    try {
      const json = JSON.parse(errorBody);
      if (json.error) parsedMessage = json.error;
    } catch {
      // 保持原始字串輸出
    }
    throw new Error(`[LINE 登入換票失敗]: HTTP ${res.status} - ${parsedMessage}`);
  }

  const data = await res.json();
  const session: WebAuthSession = {
    jwt: data.jwt,
    userId: data.userId,
    displayName: data.displayName || '',
    pictureUrl: data.pictureUrl || '',
    isOfficer: Boolean(data.isOfficer),
    officerRole: data.officerRole || null,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 小時有效
  };

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
};

/**
 * 取得當前有效的電腦版幹部 Session
 */
export const getWebSession = (): WebAuthSession | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const session: WebAuthSession = JSON.parse(raw);
    if (!session.jwt || !session.userId || !session.expiresAt) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    if (Date.now() > session.expiresAt) {
      console.warn('[webAuth] 幹部 Session 已過期 (8小時效期已達)');
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch (err) {
    console.error('[webAuth] 解析 Session 例外:', err);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

/**
 * 電腦版幹部登出
 */
export const webLogout = () => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);
  window.location.href = '/admin-web';
};

/**
 * 建立具備 Custom JWT Bearer Header 的 Supabase Client
 */
export const createAuthenticatedSupabaseClient = (jwt: string): SupabaseClient => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('[系統配置錯誤]: 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * 寫入電腦版幹部操作稽核日誌 (直通 Supabase)
 */
export const logWebAuditAction = async (
  client: SupabaseClient,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await client.from('audit_logs').insert({
      actor_user_id: actorUserId,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      metadata: metadata || {},
    });
  } catch (err: any) {
    console.warn('[webAuth] 寫入稽核日誌警告:', err.message);
  }
};
