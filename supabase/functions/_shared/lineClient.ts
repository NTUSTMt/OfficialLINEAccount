import { getAppConfig } from "./supabaseClient.ts";

interface TokenCacheItem {
  userId: string;
  expiresAt: number;
}

const idTokenCache = new Map<string, TokenCacheItem>();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function validateSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string
): Promise<boolean> {
  const cleanSig = (signature || "").trim();
  const cleanSecret = (channelSecret || "").trim().replace(/^["']|["']$/g, "");

  if (!cleanSig || !cleanSecret) {
    console.warn(`[validateSignature] 缺少簽章或密鑰: signature present=${Boolean(cleanSig)}, secret present=${Boolean(cleanSecret)}`);
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(cleanSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(rawBody)
    );

    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = btoa(String.fromCharCode(...hashArray));

    if (!timingSafeEqual(computedSignature, cleanSig)) {
      console.warn(`[validateSignature] 簽章不符: computed=${computedSignature.slice(0, 10)}... vs received=${cleanSig.slice(0, 10)}... (secret長度=${cleanSecret.length})`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[validateSignature] 簽章驗證異常:", err);
    return false;
  }
}

export async function verifyLineIdToken(
  idToken: string,
  expectedUserId?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  if (!idToken) {
    return { success: false, error: "缺少身分驗證 Token (Missing ID Token)" };
  }

  const liffChannelId = Deno.env.get("LIFF_CHANNEL_ID") || Deno.env.get("LINE_CHANNEL_ID");
  if (!liffChannelId) {
    return { success: false, error: "缺少 LIFF_CHANNEL_ID 環境變數 (Missing LIFF_CHANNEL_ID env var)" };
  }
  const now = Date.now();

  const cached = idTokenCache.get(idToken);
  if (cached && cached.expiresAt > now) {
    if (expectedUserId && cached.userId !== expectedUserId) {
      return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
    }
    return { success: true, userId: cached.userId };
  }

  try {
    const params = new URLSearchParams();
    params.append("id_token", idToken);
    params.append("client_id", liffChannelId);

    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const resText = await response.text();
    let data: { sub?: string; error_description?: string; error?: string } = {};
    try {
      data = JSON.parse(resText);
    } catch {
      return { success: false, error: "LINE 驗證端點回應格式異常: " + resText };
    }

    if (response.ok && data.sub) {
      const verifiedUserId = data.sub;
      idTokenCache.set(idToken, {
        userId: verifiedUserId,
        expiresAt: now + 600 * 1000,
      });

      if (expectedUserId && verifiedUserId !== expectedUserId) {
        return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
      }
      return { success: true, userId: verifiedUserId };
    } else {
      const errorMsg = data.error_description || data.error || "無效或過期的 Token";
      return { success: false, error: errorMsg };
    }
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    console.error("verifyLineIdToken execution error:", err);
    return { success: false, error: "身分驗證系統異常: " + errString };
  }
}

async function sendLineApiRequest(
  endpoint: "reply" | "push",
  payload: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `https://api.line.me/v2/bot/message/${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

export async function replyMessage(
  replyToken: string,
  messages: unknown[],
  preferAdminToken = false
): Promise<{ success: boolean; error?: string }> {
  const memberToken = Deno.env.get("MEMBER_BOT_TOKEN") || "";
  const adminToken = Deno.env.get("ADMIN_BOT_TOKEN") || "";

  const primaryToken = preferAdminToken ? (adminToken || memberToken) : (memberToken || adminToken);
  const secondaryToken = preferAdminToken ? memberToken : adminToken;

  const payload = {
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages],
  };

  if (!primaryToken) {
    return { success: false, error: "Missing LINE Bot Token in environment." };
  }

  const firstTry = await sendLineApiRequest("reply", payload, primaryToken);
  if (firstTry.ok) {
    return { success: true };
  }

  console.warn(`LINE Reply primary token failed (${firstTry.status}): ${firstTry.text}`);

  if (secondaryToken && secondaryToken !== primaryToken) {
    const secondTry = await sendLineApiRequest("reply", payload, secondaryToken);
    if (secondTry.ok) {
      return { success: true };
    }
    console.error(`LINE Reply fallback token failed (${secondTry.status}): ${secondTry.text}`);
    return { success: false, error: secondTry.text };
  }

  return { success: false, error: firstTry.text };
}

export async function pushMessage(
  to: string,
  messages: unknown[],
  preferAdminToken = false
): Promise<{ success: boolean; error?: string }> {
  const memberToken = Deno.env.get("MEMBER_BOT_TOKEN") || "";
  const adminToken = Deno.env.get("ADMIN_BOT_TOKEN") || "";

  const primaryToken = preferAdminToken ? (adminToken || memberToken) : (memberToken || adminToken);
  const secondaryToken = preferAdminToken ? memberToken : adminToken;

  const payload = {
    to,
    messages: Array.isArray(messages) ? messages : [messages],
  };

  if (!primaryToken) {
    return { success: false, error: "Missing LINE Bot Token in environment." };
  }

  const firstTry = await sendLineApiRequest("push", payload, primaryToken);
  if (firstTry.ok) {
    return { success: true };
  }

  console.warn(`LINE Push primary token failed (${firstTry.status}): ${firstTry.text}`);

  if (secondaryToken && secondaryToken !== primaryToken) {
    const secondTry = await sendLineApiRequest("push", payload, secondaryToken);
    if (secondTry.ok) {
      return { success: true };
    }
    console.error(`LINE Push fallback token failed (${secondTry.status}): ${secondTry.text}`);
    return { success: false, error: secondTry.text };
  }

  return { success: false, error: firstTry.text };
}

export async function verifyLineAccessToken(
  accessToken: string,
  expectedUserId?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  if (!accessToken) {
    return { success: false, error: "缺少 Access Token (Missing Access Token)" };
  }

  const now = Date.now();
  const cached = idTokenCache.get(`acc:${accessToken}`);
  if (cached && cached.expiresAt > now) {
    if (expectedUserId && cached.userId !== expectedUserId) {
      return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
    }
    return { success: true, userId: cached.userId };
  }

  try {
    const response = await fetch("https://api.line.me/v2/profile", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const resText = await response.text();
    let data: { userId?: string; message?: string } = {};
    try {
      data = JSON.parse(resText);
    } catch {
      return { success: false, error: "LINE Profile 驗證端點回應格式異常: " + resText };
    }

    if (response.ok && data.userId) {
      const verifiedUserId = data.userId;
      idTokenCache.set(`acc:${accessToken}`, {
        userId: verifiedUserId,
        expiresAt: now + 600 * 1000,
      });

      if (expectedUserId && verifiedUserId !== expectedUserId) {
        return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
      }
      return { success: true, userId: verifiedUserId };
    } else {
      return { success: false, error: data.message || "無效或過期的 Access Token" };
    }
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    console.error("verifyLineAccessToken execution error:", err);
    return { success: false, error: "Access Token 驗證系統異常: " + errString };
  }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyCustomJwt(
  jwtToken: string,
  expectedUserId?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  if (!jwtToken || jwtToken.split(".").length !== 3) {
    return { success: false, error: "Invalid JWT format" };
  }

  const secret =
    Deno.env.get("JWT_SECRET") ||
    Deno.env.get("CUSTOM_JWT_SECRET") ||
    Deno.env.get("SUPABASE_JWT_SECRET");

  if (!secret) {
    return { success: false, error: "Missing JWT_SECRET environment variable" };
  }

  try {
    const [headerB64, payloadB64, sigB64] = jwtToken.split(".");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToUint8Array(sigB64);
    const isValid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!isValid) {
      return { success: false, error: "Custom JWT signature verification failed" };
    }

    const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { success: false, error: "Custom JWT expired" };
    }

    const sub = payload.sub ? String(payload.sub).trim() : "";
    if (!sub || !sub.startsWith("U")) {
      return { success: false, error: "Custom JWT missing valid LINE user sub" };
    }

    if (expectedUserId && sub !== expectedUserId) {
      return { success: false, error: "身分與 Token 不符 (Identity Mismatch)" };
    }

    return { success: true, userId: sub };
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    return { success: false, error: "Custom JWT verification error: " + errString };
  }
}

export async function getLineUserProfile(
  userId: string
): Promise<{ userId?: string; displayName?: string; pictureUrl?: string; language?: string } | null> {
  if (!userId || !userId.startsWith("U")) {
    return null;
  }

  const memberToken = Deno.env.get("MEMBER_BOT_TOKEN") || "";
  const adminToken = Deno.env.get("ADMIN_BOT_TOKEN") || "";
  const tokens = [memberToken, adminToken].filter(Boolean);

  for (const token of tokens) {
    try {
      const response = await fetch(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn(`[getLineUserProfile] 查詢失敗 (${userId}):`, err);
    }
  }
  return null;
}

let cachedAdminGroupId: { value: string | null; expireAt: number } = {
  value: null,
  expireAt: 0,
};

export async function getAdminGroupId(): Promise<string | null> {
  const now = Date.now();
  if (cachedAdminGroupId.expireAt > now) {
    return cachedAdminGroupId.value;
  }

  const value = await getAppConfig("ADMIN_GROUP_ID");
  cachedAdminGroupId = {
    value,
    expireAt: now + 30 * 1000,
  };

  return value;
}
