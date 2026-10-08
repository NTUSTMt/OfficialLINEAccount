import { getSupabaseAdminClient } from "../_shared/supabaseClient.ts";
import { formatTaipeiDate } from "../_shared/dateUtils.ts";

let cachedKnowledgeBase: { text: string; expireAt: number } = {
  text: "",
  expireAt: 0,
};

export function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .trim();
}

export async function fetchDocsKnowledgeBase(): Promise<string> {
  const now = Date.now();
  if (cachedKnowledgeBase.expireAt > now && cachedKnowledgeBase.text) {
    return cachedKnowledgeBase.text;
  }

  const workerUrl = Deno.env.get("GAS_WORKER_URL");
  const workerSecret = Deno.env.get("GAS_WORKER_SECRET");

  if (workerUrl && workerSecret) {
    try {
      const res = await fetch(`${workerUrl}?action=get_knowledge_base`, {
        method: "GET",
        headers: { "x-worker-secret": workerSecret },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.knowledge) {
          const kbText = String(data.knowledge).slice(0, 15000);
          cachedKnowledgeBase = {
            text: kbText,
            expireAt: now + 30 * 60 * 1000,
          };
          return kbText;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch knowledge base from GAS worker:", err);
    }
  }

  return "社團裝備租借依社籍收費，出隊請遵守領隊指導。";
}

export async function fetchOpenEventsContext(): Promise<string> {
  try {
    const client = getSupabaseAdminClient();
    const { data: events, error } = await client
      .from("events")
      .select("title,fee,start_date,end_date,deadline,status,summary,itinerary")
      .order("start_date", { ascending: true });

    if (error || !events || events.length === 0) {
      return "目前無開放報名或近期即將開始的活動資料。";
    }

    const todayStr = formatTaipeiDate(new Date(), "YYYY-MM-DD");
    const validEvents = events.filter((ev) => {
      const st = (ev.status || "").trim();
      const isOpen = st === "開放" || st === "開放中" || st === "Open" || st === "報名中 Open";
      const sDate = (ev.start_date || "").slice(0, 10);
      const eDate = (ev.end_date || ev.start_date || "").slice(0, 10);

      if (isOpen) return true;
      const isUpcomingOrOngoing = eDate >= todayStr || sDate >= todayStr;
      return isUpcomingOrOngoing;
    });

    if (validEvents.length === 0) {
      return "目前無開放報名或近期即將開始的活動資料。";
    }

    return validEvents
      .map((ev) => {
        const title = ev.title || "";
        const fee = ev.fee || 0;
        const start = ev.start_date || "";
        const end = ev.end_date || start;
        const desc = ev.summary || "";
        const itin = ev.itinerary ? ` 行程概要：${ev.itinerary}` : "";
        const st = (ev.status || "").trim();
        const isOpen = st === "開放" || st === "開放中" || st === "Open" || st === "報名中 Open";
        const statusLabel = isOpen
          ? "開放報名中 (Registration Open)"
          : "報名已截止/關閉 (Registration Closed，但活動尚未開始出隊)";
        const dateDisplay = start + (end && end !== start ? ` ~ ${end}` : "");
        return `• ${title} 【${statusLabel}】 (活動日期：${dateDisplay}，費用：$${fee})：${desc}${itin}`;
      })
      .join("\n\n");
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    return `無法讀取活動清單：${errString}`;
  }
}

export async function handleGeminiChat(
  _userId: string,
  userQuery: string
): Promise<{ success: boolean; reply?: string; error?: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY 未設定 (GEMINI_API_KEY Not Configured)" };
  }

  try {
    const [knowledgeBase, eventsContext] = await Promise.all([
      fetchDocsKnowledgeBase(),
      fetchOpenEventsContext(),
    ]);

    const systemInstruction =
      "你是一位熱情、親切且專業的「台科登山社社團系統」AI 智慧客服嚮導「小岳 (Yue)」。\n" +
      "請根據以下社團規章、活動與知識庫回答使用者的問題。若資訊不足，請禮貌引導向幹部洽詢。\n\n" +
      "【核心回覆原則與格式嚴格規範】：\n" +
      "1. 語言一致性（Mirror User Language）：提問者使用什麼語言提問，你就必須一律使用相同的語言回答（例如：使用者用英文提問，必須以自然流利的英文回覆；使用者用繁體中文提問，必須以台灣繁體中文回覆；使用者用日文提問，必須以日文回覆，切勿混雜或擅自變更語言）。\n" +
      "2. 嚴格純文字輸出（Strictly Plain Text Only, No Markdown）：LINE 官方帳號對話視窗不支援 Markdown 渲染，因此絕對禁止輸出任何 Markdown 語法標記！\n" +
      "   • 嚴禁使用粗體或斜體語法（禁止出現 **文字**、*文字*、__文字__、_文字_ 等星號或底線標記）。\n" +
      "   • 嚴禁使用標題語法（禁止出現 #、##、###）。\n" +
      "   • 嚴禁使用反引號程式碼語法（禁止出現 `code` 或 ```code```）。\n" +
      "   • 嚴禁使用 Markdown 格式超連結（禁止出現 [名稱](網址)，若需提供連結請直接輸出原始 URL）。\n" +
      "   • 排版僅允許使用自然換行、條列符號（• 或 1. 2. 3.）、適量 emoji 與空行分隔，呈現乾淨易讀的純文字視覺效果。\n" +
      "3. 活動諮詢與報名狀態指引：\n" +
      "   • 若使用者詢問「開放報名中」的活動，請熱情介紹行程亮點，並引導點擊圖文選單進行報名。\n" +
      "   • 若使用者詢問「報名已截止/已關閉 (Registration Closed)，但尚未開始出隊」的活動，你可以回答該活動的行程規劃、注意事項、裝備準備等資訊；但若使用者詢問是否還能報名，必須明確且禮貌告知「該活動目前報名已截止/已關閉，無法再報名」，若有特殊個案需求請直接在聊天室留言洽詢社團幹部。\n" +
      "   • 對於已結束之歷史活動，系統已排除未載入，若使用者詢問請告知無該近期活動資訊。\n\n" +
      "【當前活動資訊（開放報名中與近期即將出隊）】：\n" +
      eventsContext +
      "\n\n" +
      "【社團知識庫規章】：\n" +
      knowledgeBase +
      "\n";

    const modelName = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: systemInstruction }, { text: `使用者提問：${userQuery}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const resCode = res.status;
    if (res.ok) {
      const data = await res.json();
      if (
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts
      ) {
        const rawReply = data.candidates[0].content.parts[0].text;
        const cleanReply = stripMarkdown(rawReply);
        const finalReply = `${cleanReply}\n\n─────────────\n小岳是 AI，小岳可以出錯\nYue is AI. Yue can make mistake.`;
        return { success: true, reply: finalReply };
      } else {
        return { success: false, error: "模型未產生候選回覆內容 (Empty candidate response)" };
      }
    } else {
      let errorDetail = `HTTP ${resCode}`;
      try {
        const errJson = await res.json();
        if (errJson.error && errJson.error.message) {
          errorDetail += `: ${errJson.error.message}`;
        }
      } catch {
        const rawErr = await res.text();
        if (rawErr) errorDetail += `: ${rawErr.slice(0, 120)}`;
      }
      return { success: false, error: errorDetail };
    }
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    console.error("Gemini AI execution failed:", err);
    return { success: false, error: errString };
  }
}
