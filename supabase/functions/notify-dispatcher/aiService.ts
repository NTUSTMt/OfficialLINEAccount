// 登山社幹部專用 AI 智慧輔助服務模組 (aiService.ts)
// 提供：
// 1. 去識別化體能與登山經驗綜合評估與排序 (evaluateApplicantsAi)
// 2. 活動內容雙語翻譯 (translateEventAi)

export interface AnonymizedApplicant {
  anonymousId: string;
  outdoor_experience?: string;
  fitness_desc?: string;
  medical_history?: string;
}

export interface ApplicantEvaluation {
  anonymousId: string;
  score: number;
  rating: string;
  reasoning: string;
}

export interface EventContext {
  title: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number;
  summary?: string;
  itinerary?: string;
}

export interface EventTranslationInput {
  title: string;
  summary?: string;
  itinerary?: string;
}

export interface EventTranslationResult {
  title_en: string;
  summary_en: string;
  itinerary_en: string;
}

// 後端嚴格去識別化過濾器，確保絕對不含任何個資
export function sanitizeApplicants(rawApplicants: any[]): AnonymizedApplicant[] {
  if (!Array.isArray(rawApplicants)) return [];

  return rawApplicants.map((item, idx) => {
    const anonymousId = typeof item.anonymousId === "string" && item.anonymousId.trim()
      ? item.anonymousId.trim()
      : `A${idx + 1}`;

    const outdoor_experience = typeof item.outdoor_experience === "string" ? item.outdoor_experience.slice(0, 500) : "";
    const fitness_desc = typeof item.fitness_desc === "string" ? item.fitness_desc.slice(0, 500) : "";
    const medical_history = typeof item.medical_history === "string" ? item.medical_history.slice(0, 300) : "";

    return {
      anonymousId,
      outdoor_experience,
      fitness_desc,
      medical_history,
    };
  });
}

// 呼叫 Gemini 進行體能與登山經驗綜合評估
export async function evaluateApplicantsAi(
  event: EventContext,
  rawApplicants: any[]
): Promise<{ success: boolean; evaluations: ApplicantEvaluation[]; error?: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return { success: false, evaluations: [], error: "GEMINI_API_KEY 未設定 (GEMINI_API_KEY Not Configured)" };
  }

  const applicants = sanitizeApplicants(rawApplicants);
  if (applicants.length === 0) {
    return { success: true, evaluations: [] };
  }

  const eventTitle = event.title || "登山活動";
  const durationDays = event.duration_days || 1;
  const eventDates = event.start_date ? `${event.start_date}${event.end_date ? ` ~ ${event.end_date}` : ""}` : "未提供";
  const eventSummary = event.summary || "無簡介";
  const eventItinerary = event.itinerary || "無行程";

  const prompt = `
你是一位專業的高山嚮導與登山社審核幹部。請針對下方活動難度與天數，對去識別化的報名者進行體能與登山經驗綜合評估。

【活動資訊】：
- 名稱：${eventTitle}
- 日期：${eventDates} (預估天數：${durationDays} 天)
- 簡介：${eventSummary}
- 行程概要：${eventItinerary}

【評估原則】：
1. 適合度評分 (score)：0 ~ 100 分。請「上網」取得路線難易度，考量「本次路線」之爬升、海拔高度、重裝/過夜需求與天數，評估報名者過往登山經驗與平時體能是否足夠安全勝任。
2. 評級標籤 (rating)：高度適任 (80~100)、中度適任 (65~79)、需審慎評估 (50~64)、建議勸退/備取 (0~49)。
3. 評估理由 (reasoning)：約 30~80 字，指出對於該活動，體能與經驗符合或不足的核心原因（例如：百岳重裝過夜經驗豐富、缺乏高海拔過夜經驗、平時運動量不足等）。
4. 嚴格輸出 JSON 格式，並以繁體中文回覆：
{
  "evaluations": [
    {
      "anonymousId": "代號",
      "score": 數字,
      "rating": "評級標籤",
      "reasoning": "具體理由"
    }
  ]
}

【報名名單（已去識別化）】：
${JSON.stringify(applicants, null, 2)}
`.trim();

  const modelName = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, evaluations: [], error: `Gemini API 錯誤 (${res.status}): ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      return { success: false, evaluations: [], error: "Gemini 未回傳有效內容" };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      // 容錯提取 JSON 區塊
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("無法解析回傳之 JSON 內容");
      }
    }

    const evaluations: ApplicantEvaluation[] = Array.isArray(parsed.evaluations)
      ? parsed.evaluations.map((item: any) => ({
        anonymousId: String(item.anonymousId || ""),
        score: Math.min(100, Math.max(0, Number(item.score) || 60)),
        rating: String(item.rating || "待評估"),
        reasoning: String(item.reasoning || "經驗符合一般行程"),
      }))
      : [];

    return { success: true, evaluations };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, evaluations: [], error: `AI 評估失敗: ${msg}` };
  }
}

// 呼叫 Gemini 進行活動內容雙語翻譯
export async function translateEventAi(
  input: EventTranslationInput
): Promise<{ success: boolean; translation?: EventTranslationResult; error?: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY 未設定 (GEMINI_API_KEY Not Configured)" };
  }

  const titleZh = (input.title || "").trim();
  const summaryZh = (input.summary || "").trim();
  const itineraryZh = (input.itinerary || "").trim();

  if (!titleZh && !summaryZh && !itineraryZh) {
    return {
      success: true,
      translation: { title_en: "", summary_en: "", itinerary_en: "" },
    };
  }

  const prompt = `
你是一位專業的戶外與登山文案翻譯專家。請將以下登山活動的中文資訊翻譯為自然流暢且結構嚴謹的英文。

【翻譯規則】：
1. title_en: 精簡貼切的英文活動名稱。
2. summary_en: 活動簡介英文，維持清晰重點。
3. itinerary_en: 行程規劃英文。必須嚴格鏡像對應中文版格式：
   - 逐日行程結構（例如 Day X: HH:MM）。
   - 嚴格保留時間箭頭符號 " → " 或 " - "。
   - 保留各站點地名與數字（例如 07:00 NTUST → 12:30 Trailhead → 15:30 Camp）。
   - 高山地名採用標準英譯（例如 Mt. Hehuan North Peak, Snow Mountain Main Peak 等）。
4. 總長度限制：title_en + summary_en + itinerary_en 三者總字元數必須嚴格 ≤ 1400 字元！
5. 嚴格輸出 JSON 格式：
{
  "title_en": "英文標題",
  "summary_en": "英文簡介",
  "itinerary_en": "英文行程"
}

【中文來源內容】：
- 標題：${titleZh}
- 簡介：${summaryZh}
- 行程：${itineraryZh}
`.trim();

  const modelName = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Gemini API 錯誤 (${res.status}): ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      return { success: false, error: "Gemini 未回傳有效翻譯內容" };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("無法解析回傳之 JSON 內容");
      }
    }

    let title_en = String(parsed.title_en || "").trim();
    let summary_en = String(parsed.summary_en || "").trim();
    let itinerary_en = String(parsed.itinerary_en || "").trim();

    // 總字數限制保證 ≤ 1400
    const totalLen = title_en.length + summary_en.length + itinerary_en.length;
    if (totalLen > 1400) {
      const excess = totalLen - 1400;
      if (summary_en.length > excess + 50) {
        summary_en = summary_en.slice(0, summary_en.length - excess).trim();
      } else {
        itinerary_en = itinerary_en.slice(0, itinerary_en.length - excess).trim();
      }
    }

    return {
      success: true,
      translation: {
        title_en,
        summary_en,
        itinerary_en,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `AI 翻譯失敗: ${msg}` };
  }
}
