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
  category: "loan_created" | "loan_cancelled" | "event_cancelled" | "officer_intent" | "patrol_report" | "payment_declared";
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

export async function fetchUnsentAdminDigest(limit = 50): Promise<DigestQueueItem[]> {
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

  // LINE 單次推播支援最多打包 5 個 Carousel 訊息框 (最多 50 張卡片)
  const targetChunks = chunkedBubbles.slice(0, 5);
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
  let items = await fetchUnsentAdminDigest(50);
  if (items.length === 0) {
    return {
      success: true,
      count: 0,
      message: "目前無待處理之彙整項目，已自動略過推播以節省額度",
    };
  }

  const client = getSupabaseAdminClient();

  // 1. 推播前防呆去重：過濾已在後台完成核銷的繳費單
  const paymentItems = items.filter((it) => it.category === "payment_declared");
  if (paymentItems.length > 0) {
    const paymentIds = paymentItems
      .map((it) => (it.bubble_payload as any)?.payment_id)
      .filter((pid): pid is string => Boolean(pid && String(pid).trim()));

    if (paymentIds.length > 0) {
      try {
        const { data: verifiedPayments } = await client
          .from("payments")
          .select("id, status")
          .in("id", paymentIds);

        if (verifiedPayments && verifiedPayments.length > 0) {
          const verifiedSet = new Set(
            verifiedPayments
              .filter((p) => {
                const st = String(p.status || "");
                return (
                  st.includes("已繳費") ||
                  st.includes("已核銷") ||
                  st.includes("Paid") ||
                  st.includes("Confirmed")
                );
              })
              .map((p) => p.id)
          );

          if (verifiedSet.size > 0) {
            const alreadyVerifiedItemIds: string[] = [];
            items = items.filter((it) => {
              const pid = (it.bubble_payload as any)?.payment_id;
              if (pid && verifiedSet.has(pid)) {
                alreadyVerifiedItemIds.push(it.id);
                return false;
              }
              return true;
            });

            if (alreadyVerifiedItemIds.length > 0) {
              await markAdminDigestSent(alreadyVerifiedItemIds);
            }
          }
        }
      } catch (checkErr) {
        console.warn("dispatchAdminDigest payment verification check error:", checkErr);
      }
    }
  }

  if (items.length === 0) {
    return {
      success: true,
      count: 0,
      message: "待處理項目均已在後台完成對帳核銷，已自動略過推播以節省額度",
    };
  }

  // 2. 智慧優先序排序：高急迫性（繳費申報、正取棄權）優先排在最前
  const CATEGORY_PRIORITY: Record<string, number> = {
    payment_declared: 1,
    event_cancelled: 2,
    loan_created: 3,
    loan_cancelled: 4,
    officer_intent: 5,
    patrol_report: 6,
  };

  items.sort((a, b) => {
    const prioA = CATEGORY_PRIORITY[a.category] || 99;
    const prioB = CATEGORY_PRIORITY[b.category] || 99;
    if (prioA !== prioB) return prioA - prioB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

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
