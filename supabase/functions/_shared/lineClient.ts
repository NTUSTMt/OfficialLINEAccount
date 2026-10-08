import { getAppConfig } from "./supabaseClient.ts";

interface TokenCacheItem {
  userId: string;
  expiresAt: number;
}

const idTokenCache = new Map<string, TokenCacheItem>();

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

    if (computedSignature !== cleanSig) {
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

  const liffChannelId = Deno.env.get("LIFF_CHANNEL_ID") || "2009217429";
  const now = Date.now();

  const cached = idTokenCache.get(idToken);
  if (cached && cached.expiresAt > now) {
    if (expectedUserId && expectedUserId !== "TEST_USER_ID" && cached.userId !== expectedUserId) {
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

      if (expectedUserId && expectedUserId !== "TEST_USER_ID" && verifiedUserId !== expectedUserId) {
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
