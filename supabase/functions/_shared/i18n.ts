import { BilingualText, PreferredLanguage } from "./types.ts";
import { getSupabaseAdminClient } from "./supabaseClient.ts";

const languageCache = new Map<string, { lang: PreferredLanguage; expireAt: number }>();

export function render(pair: BilingualText, prefLang: PreferredLanguage): string {
  if (prefLang === "en") {
    return pair.en;
  }
  if (prefLang === "zh") {
    return pair.zh;
  }
  return `${pair.zh}\n─────────────\n${pair.en}`;
}

export async function getUserPreferredLanguage(
  userId: string,
  lineProfileLanguage?: string,
  lineDisplayName?: string
): Promise<PreferredLanguage> {
  if (!userId || !userId.startsWith("U")) {
    return null;
  }

  const now = Date.now();
  const cached = languageCache.get(userId);
  if (cached && cached.expireAt > now) {
    return cached.lang;
  }

  try {
    const client = getSupabaseAdminClient();
    const { data: member } = await client
      .from("members")
      .select("preferred_language")
      .eq("line_user_id", userId)
      .maybeSingle();

    if (member && member.preferred_language) {
      const dbLang = String(member.preferred_language).toLowerCase();
      if (dbLang.startsWith("en")) {
        languageCache.set(userId, { lang: "en", expireAt: now + 300 * 1000 });
        return "en";
      }
      if (dbLang.startsWith("zh")) {
        languageCache.set(userId, { lang: "zh", expireAt: now + 300 * 1000 });
        return "zh";
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch preferred_language from DB for ${userId}:`, err);
  }

  if (lineProfileLanguage) {
    const profileLang = lineProfileLanguage.toLowerCase();
    if (profileLang.startsWith("en")) {
      languageCache.set(userId, { lang: "en", expireAt: now + 300 * 1000 });
      return "en";
    }
    if (profileLang.startsWith("zh")) {
      languageCache.set(userId, { lang: "zh", expireAt: now + 300 * 1000 });
      return "zh";
    }
  }

  if (lineDisplayName) {
    const hasHan = /[\u4e00-\u9fa5]/.test(lineDisplayName);
    const hasLatin = /[a-zA-Z]/.test(lineDisplayName);
    if (!hasHan && hasLatin) {
      languageCache.set(userId, { lang: "en", expireAt: now + 300 * 1000 });
      return "en";
    }
    if (hasHan) {
      languageCache.set(userId, { lang: "zh", expireAt: now + 300 * 1000 });
      return "zh";
    }
  }

  languageCache.set(userId, { lang: null, expireAt: now + 300 * 1000 });
  return null;
}
