import { getSupabaseAdminClient, getAppConfig } from "./supabaseClient.ts";
import { pushMessage } from "./lineClient.ts";

export interface DigestQueueItem {
  id: string;
  category: string;
  title: string;
  summary?: string;
  bubble_payload: unknown;
  created_at: string;
}

export async function enqueueAdminDigest(params: {
  category: "loan_created" | "loan_cancelled" | "event_cancelled" | "officer_intent" | "patrol_report";
  title: string;
  summary: string;
  bubble: unknown;
}): Promise<boolean> {
  try {
    const client = getSupabaseAdminClient();
    const { error } = await client.from("admin_notification_digest_queue").insert({
      category: params.category,
      title: params.title,
      summary: params.summary,
      bubble_payload: params.bubble,
      is_sent: false,
    });
    if (error) {
      console.warn("enqueueAdminDigest failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("enqueueAdminDigest exception:", err);
    return false;
  }
}

export async function fetchUnsentAdminDigest(limit = 30): Promise<DigestQueueItem[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("admin_notification_digest_queue")
    .select("id, category, title, summary, bubble_payload, created_at")
    .eq("is_sent", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    console.warn("fetchUnsentAdminDigest failed:", error);
    return [];
  }
  return data as DigestQueueItem[];
}

export async function markAdminDigestSent(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const client = getSupabaseAdminClient();
  const { error } = await client
    .from("admin_notification_digest_queue")
    .update({ is_sent: true, sent_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    console.warn("markAdminDigestSent failed:", error);
    return false;
  }
  return true;
}

export function buildAdminDigestMessages(items: DigestQueueItem[]): unknown[] {
  if (items.length === 0) return [];

  const bubbles = items.map((item) => item.bubble_payload);
  const chunkedBubbles: unknown[][] = [];
  for (let i = 0; i < bubbles.length; i += 10) {
    chunkedBubbles.push(bubbles.slice(i, i + 10));
  }

  // LINE 單次推播支援最多打包 3 個 Carousel 訊息框 (最多 30 張卡片)
  const targetChunks = chunkedBubbles.slice(0, 3);
  return targetChunks.map((chunk, idx) => ({
    type: "flex",
    altText: `【台科登山社】幹部社務彙整報告 (${items.length} 則待處理事項${targetChunks.length > 1 ? ` 第 ${idx + 1} 部分` : ""})`,
    contents: {
      type: "carousel",
      contents: chunk,
    },
  }));
}

export async function dispatchAdminDigest(): Promise<{
  success: boolean;
  count: number;
  message: string;
}> {
  const items = await fetchUnsentAdminDigest(30);
  if (items.length === 0) {
    return {
      success: true,
      count: 0,
      message: "目前無待處理之彙整項目，已自動略過推播以節省額度",
    };
  }

  const adminGroupId = await getAppConfig("ADMIN_GROUP_ID");
  if (!adminGroupId) {
    console.warn("dispatchAdminDigest LINE 略過: ADMIN_GROUP_ID 未設定");
    return {
      success: false,
      count: items.length,
      message: "ADMIN_GROUP_ID 未設定，無法推播",
    };
  }

  const messages = buildAdminDigestMessages(items);
  const pushRes = await pushMessage(adminGroupId, messages, true);

  if (!pushRes.success) {
    console.warn("dispatchAdminDigest LINE push warning:", pushRes.error);
  }

  await markAdminDigestSent(items.map((i) => i.id));

  return {
    success: pushRes.success,
    count: items.length,
    message: `成功彙整並推播 ${items.length} 則社務卡片至幹部群組`,
  };
}
