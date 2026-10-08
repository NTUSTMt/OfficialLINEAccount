import { getAppConfig } from "./supabaseClient.ts";
import { pushMessage } from "./lineClient.ts";

export interface PushAdminOptions {
  customSubject?: string;
  optionsOrHtml?: {
    htmlBody?: string;
    flexMessage?: unknown;
    flexContents?: unknown;
    altText?: string;
  };
}

export async function sendAdminEmail(
  subject: string,
  text: string,
  optionsOrHtml?: { htmlBody?: string }
): Promise<boolean> {
  const workerUrl = Deno.env.get("GAS_WORKER_URL");
  const workerSecret = Deno.env.get("GAS_WORKER_SECRET");

  if (!workerUrl || !workerSecret) {
    return false;
  }

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        action: "send_admin_email",
        subject,
        text,
        htmlBody: optionsOrHtml?.htmlBody || "",
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("sendAdminEmail via GAS Worker failed:", err);
    return false;
  }
}

export async function pushAdminMessage(
  text: string,
  customSubject?: string,
  optionsOrHtml?: {
    htmlBody?: string;
    flexMessage?: unknown;
    flexContents?: unknown;
    altText?: string;
  }
): Promise<void> {
  if (!text) return;

  // 1. 自動推導 Email 主旨
  let subject = customSubject;
  if (!subject) {
    const lines = text.split("\n");
    const firstLine = lines[0] ? lines[0].trim() : "";
    if (firstLine.includes("【") && firstLine.includes("】")) {
      subject = firstLine;
    } else if (text.includes("新裝備租借申請")) {
      subject = "【台科登山社】新裝備租借申請通知";
    } else if (text.includes("新繳費申報")) {
      subject = "【台科登山社】新繳費申報通知";
    } else if (text.includes("幹部意願登記")) {
      subject = "【台科登山社】新幹部意願登記通知";
    } else {
      subject = "【台科登山社】幹部系統通知";
    }
  }

  // 2. 雙軌寄送 Email (透過 GAS Worker 非同步背景執行)
  sendAdminEmail(subject, text, optionsOrHtml).catch((err) => {
    console.warn("GAS Email worker push failed:", err);
  });

  // 3. LINE 官方帳號 Push 發送至幹部群組
  const adminGroupId = await getAppConfig("ADMIN_GROUP_ID");
  if (!adminGroupId) {
    console.warn("pushAdminMessage LINE 略過: ADMIN_GROUP_ID 未設定");
    return;
  }

  let lineMessages: unknown[] = [];
  if (optionsOrHtml?.flexMessage) {
    lineMessages = [optionsOrHtml.flexMessage];
  } else if (optionsOrHtml?.flexContents) {
    lineMessages = [
      {
        type: "flex",
        altText:
          optionsOrHtml.altText ||
          subject ||
          (text ? text.slice(0, 400) : "新申報通知"),
        contents: optionsOrHtml.flexContents,
      },
    ];
  } else {
    lineMessages = [{ type: "text", text }];
  }

  // 優先使用 ADMIN_BOT_TOKEN 推播
  const pushRes = await pushMessage(adminGroupId, lineMessages, true);
  if (!pushRes.success) {
    console.warn("pushAdminMessage LINE push warning:", pushRes.error);
  }
}
