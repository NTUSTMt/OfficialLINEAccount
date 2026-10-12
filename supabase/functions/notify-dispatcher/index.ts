import {
  getSupabaseAdminClient,
} from "../_shared/supabaseClient.ts";
import {
  verifyLineIdToken,
  verifyLineAccessToken,
  verifyCustomJwt,
  pushMessage,
} from "../_shared/lineClient.ts";
import { pushAdminMessage } from "../_shared/pushAdminMessage.ts";
import { getUserPreferredLanguage, render } from "../_shared/i18n.ts";
import { PreferredLanguage } from "../_shared/types.ts";
import { formatTaipeiDate } from "../_shared/dateUtils.ts";

let activeOrigin: string | null = null;

function getLiffChannelId(): string {
  const channelId = Deno.env.get("LIFF_CHANNEL_ID") || Deno.env.get("LINE_CHANNEL_ID");
  if (!channelId) {
    throw new Error("Missing LIFF_CHANNEL_ID / LINE_CHANNEL_ID environment variable");
  }
  return channelId;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://equipments-seven.vercel.app",
  "https://official-line-account.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(): Record<string, string> {
  const envOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
  const origin = activeOrigin || "";
  const matchedOrigin = isOriginAllowed(origin, allowedOrigins) ? origin : (allowedOrigins[0] || "null");
  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-id-token, x-line-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// 簡易記憶體速率限制 (Rate Limiting: 60 秒內最多 30 次請求)
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    ipRateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 30) {
    return false;
  }
  record.count += 1;
  return true;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ status: "error", message }, status);
}

function successResponse(data: Record<string, unknown> = {}) {
  return jsonResponse({ status: "success", ...data }, 200);
}

async function isUserOfficer(userId: string): Promise<boolean> {
  if (!userId) return false;
  const client = getSupabaseAdminClient();
  const { data: member } = await client
    .from("members")
    .select("is_officer")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (member && member.is_officer) return true;

  const { data: officer } = await client
    .from("officers")
    .select("line_user_id")
    .eq("line_user_id", userId)
    .maybeSingle();

  return Boolean(officer);
}

// 1. 裝備租借幹部推播
async function handleNotifyOfficersLoan(json: Record<string, any>) {
  const userId = json.userId;
  const details = json.details || {};
  const loanId = json.loanId || "新訂單";
  const totalRent = json.totalRent !== undefined ? json.totalRent : 0;
  let isOfficial = json.isOfficial;
  let borrowerName = json.borrowerName || "";
  let borrowerLineId = json.borrowerLineId || "";
  let borrowerPhone = json.borrowerPhone || "";
  let days = json.days;

  if (!days && details.pickupDate && details.returnDate) {
    const pTime = new Date(String(details.pickupDate).replace(/-/g, "/")).getTime();
    const rTime = new Date(String(details.returnDate).replace(/-/g, "/")).getTime();
    days = Math.max(1, Math.round((rTime - pTime) / (1000 * 60 * 60 * 24)) + 1);
  }
  if (!days) days = 1;

  if (!borrowerName || !borrowerLineId || !borrowerPhone) {
    const client = getSupabaseAdminClient();
    const { data: member } = await client
      .from("members")
      .select("name,line_id,phone,is_official_member")
      .eq("line_user_id", userId)
      .maybeSingle();

    if (member) {
      if (!borrowerName) borrowerName = member.name || "";
      if (!borrowerLineId) borrowerLineId = member.line_id || "";
      if (!borrowerPhone) borrowerPhone = member.phone || "";
      if (isOfficial === undefined) isOfficial = member.is_official_member;
    }
  }

  if (!borrowerName) borrowerName = "未知社員";
  if (!borrowerLineId) borrowerLineId = "未填寫";
  if (!borrowerPhone) borrowerPhone = "未填寫";

  let purpose = details.purpose || "社團出隊";
  if (purpose === "其他用途" && details.otherPurpose) {
    purpose = `其他用途 (${details.otherPurpose})`;
  }

  const identityDesc = purpose === "社團出隊" ? "社團出隊 (免租金)" : isOfficial ? "社員 (享5折)" : "非社員 (原價)";

  const itemsSummary: string[] = [];
  if (Array.isArray(json.cartDetails) && json.cartDetails.length > 0) {
    for (const itm of json.cartDetails) {
      const itmName = itm.name || itm.id || "裝備";
      const itmQty = itm.quantity || itm.qty || 1;
      itemsSummary.push(`• ${itmName}${itm.id && itm.name !== itm.id ? ` (${itm.id})` : ""} x ${itmQty}`);
    }
  } else if (details.cart) {
    for (const eqId of Object.keys(details.cart)) {
      if (details.cart[eqId] > 0) {
        itemsSummary.push(`• ${eqId} x ${details.cart[eqId]}`);
      }
    }
  }

  const liffChannelId = getLiffChannelId();
  const loanAdminUrl = `https://liff.line.me/${liffChannelId}-jvj3ydDT?liff.state=%2Fadmin%2Floans`;

  const loanFlex = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      contents: [
        {
          type: "text",
          text: "【幹部通知：新裝備租借申請】",
          weight: "bold",
          color: "#ffffff",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "訂單編號", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: loanId, weight: "bold", color: "#2563eb", size: "sm", flex: 5, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "申請人", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: `${borrowerName} (${identityDesc})`, weight: "bold", color: "#0f172a", size: "sm", flex: 5, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "LINE ID", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: borrowerLineId, color: "#0f172a", size: "sm", flex: 5 },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "聯絡電話", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: borrowerPhone, color: "#0f172a", size: "sm", flex: 5 },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "出隊天數", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: `${days} 天 (${details.pickupDate || ""} ~ ${details.returnDate || ""})`, color: "#0f172a", size: "xs", flex: 5, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "租借用途", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: purpose, color: "#0f172a", size: "sm", flex: 5, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "預估總租金", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: `$${totalRent} 元`, weight: "bold", color: "#059669", size: "md", flex: 5 },
          ],
        },
        { type: "separator", margin: "md", color: "#e2e8f0" },
        {
          type: "box",
          layout: "vertical",
          margin: "sm",
          spacing: "xs",
          contents: [
            { type: "text", text: "借用裝備明細：", color: "#64748b", size: "xs", weight: "bold" },
            ...(itemsSummary.length > 0
              ? itemsSummary.map((it) => ({ type: "text", text: it, color: "#334155", size: "xs", wrap: true }))
              : [{ type: "text", text: "• 無品項", color: "#94a3b8", size: "xs" }]),
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "uri",
            label: "進入幹部租借管理系統",
            uri: loanAdminUrl,
          },
        },
      ],
    },
  };

  const msg =
    "【幹部通知：新裝備租借申請】\n" +
    "─────────────\n" +
    `• 訂單編號：${loanId}\n` +
    `• 申請人：${borrowerName} (${identityDesc})\n` +
    `• LINE ID：${borrowerLineId}\n` +
    `• 聯絡電話：${borrowerPhone}\n` +
    `• 出隊天數：${days} 天 (${details.pickupDate || ""} ~ ${details.returnDate || ""})\n` +
    `• 租借用途：${purpose}\n` +
    `• 預估總租金：$${totalRent} 元\n\n` +
    "借用裝備明細：\n" +
    (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") +
    "\n\n本資料已安全寫入 Supabase，請至幹部後台確認備用！";

  const loanSubject = `【台科登山社】新裝備租借申請 - ${loanId} (${borrowerName})`;
  await pushAdminMessage(msg, loanSubject, { flexContents: loanFlex, altText: loanSubject });

  return successResponse({ message: "幹部推播已成功送出" });
}

// 2. 裝備租借取消推播
async function handleNotifyLoanCancelled(json: Record<string, any>) {
  const loanId = json.loanId || "";
  const borrowerName = json.borrowerName || "社員";
  const borrowerLineId = json.borrowerLineId || "";
  const isPaid = Boolean(json.isPaid);
  const itemsSummary = json.itemsSummary || [];
  const itemsText = Array.isArray(itemsSummary)
    ? itemsSummary.length > 0
      ? itemsSummary.join("\n")
      : "• 無品項"
    : String(itemsSummary || "• 無品項");

  let adminSubject = "";
  let adminBody = "";

  if (isPaid) {
    adminSubject = `【台科登山社】裝備預約取消 (需安排退款) - ${loanId} (${borrowerName})`;
    adminBody =
      "【幹部通知：裝備預約取消（需安排退款）】\n" +
      "─────────────\n" +
      `• 訂單編號：${loanId}\n` +
      `• 申請人：${borrowerName}\n` +
      (borrowerLineId ? `• LINE ID：${borrowerLineId}\n` : "") +
      `• 取消裝備品項：\n${itemsText}\n\n` +
      "該租借預約已繳費／待確認，請幹部依社團退費規範安排退款事宜！（庫存已由 Supabase 自動釋放回補）";
  } else {
    adminSubject = `【台科登山社】裝備預約取消通知 - ${loanId} (${borrowerName})`;
    adminBody =
      "【幹部通知：裝備預約取消】\n" +
      "─────────────\n" +
      `• 訂單編號：${loanId}\n` +
      `• 申請人：${borrowerName}\n` +
      (borrowerLineId ? `• LINE ID：${borrowerLineId}\n` : "") +
      `• 取消裝備品項：\n${itemsText}\n\n` +
      "裝備庫存已由 Supabase 自動釋放回補。";
  }

  const loanCancelledFlex = buildLoanCancelledAdminFlex({
    loanId,
    borrowerName,
    borrowerLineId,
    itemsText,
    isPaid,
  });

  await pushAdminMessage(adminBody, adminSubject, {
    flexContents: loanCancelledFlex,
    altText: adminSubject,
  });
  return successResponse({ message: "裝備取消幹部推播已成功送出" });
}

// 3. 繳費申報幹部推播
async function handleNotifyOfficersPayment(json: Record<string, any>) {
  const userId = json.userId;
  const details = json.details || {};
  const totalAmount = details.totalAmount || 0;
  const last5Digits = details.last5Digits || "無";
  const noteZh = details.note ? `\n• 備註：${details.note}` : "";
  const noteEn = details.note ? `\n• Note: ${details.note}` : "";
  const userName = details.userName || "";
  let selectedNames = details.selectedNames || [];
  const paymentId = details.paymentId || details.id || json.paymentId || "";

  if ((!selectedNames || selectedNames.length === 0) && details.selectedIds && Array.isArray(details.selectedIds)) {
    selectedNames = details.selectedIds.map((id: string) => {
      if (id === "fee_membership") return "社籍與社費 (Membership Fee)";
      if (id.startsWith("act_")) return `活動費用 (${id})`;
      if (id.startsWith("eq_")) return `裝備租借 (${id})`;
      return id;
    });
  }

  let selectedNamesEn = details.selectedNamesEn || json.selectedNamesEn;
  if ((!selectedNamesEn || selectedNamesEn.length === 0) && details.selectedIds && Array.isArray(details.selectedIds)) {
    selectedNamesEn = details.selectedIds.map((id: string) => {
      if (id === "fee_membership") return "Membership Fee";
      if (id.startsWith("act_")) return `Event Fee (${id})`;
      if (id.startsWith("eq_")) return `Equipment Loan (${id})`;
      return id;
    });
  }

  const itemsZh = selectedNames.length > 0 ? selectedNames.map((n: string) => `  - ${n}`).join("\n") : "  - 無項目";
  const itemsEn = selectedNamesEn && selectedNamesEn.length > 0
    ? selectedNamesEn.map((n: string) => `  - ${n}`).join("\n")
    : selectedNames.length > 0
    ? selectedNames.map((n: string) => `  - ${n.replace(/含社員5折優惠/g, "Member 50% discount applied")}`).join("\n")
    : "  - None";

  const verifyToken = details.verifyToken || json.verifyToken || "";
  const proofImageUrl = details.proofImageUrl || json.proofImageUrl || "";
  const frontendWebUrl = Deno.env.get("FRONTEND_WEB_URL") || "https://equipments-seven.vercel.app";

  const verifyLink = paymentId
    ? `${frontendWebUrl}/confirm-payment?paymentId=${encodeURIComponent(paymentId)}${verifyToken ? `&token=${encodeURIComponent(verifyToken)}` : ""}`
    : "";

  const paymentFlex = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#065f46",
      contents: [
        {
          type: "text",
          text: "【幹部通知：新繳費申報】",
          weight: "bold",
          color: "#ffffff",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      margin: "sm",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "申報人", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: userName || userId, weight: "bold", color: "#0f172a", size: "sm", flex: 5, wrap: true },
          ],
        },
        ...(paymentId ? [{
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "單號", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: paymentId, color: "#2563eb", size: "xs", flex: 5, wrap: true, weight: "bold" },
          ],
        }] : []),
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "末五碼", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: last5Digits, weight: "bold", color: "#0f172a", size: "sm", flex: 5 },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "申報金額", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: `$${totalAmount} 元`, weight: "bold", color: "#059669", size: "lg", flex: 5 },
          ],
        },
        { type: "separator", margin: "md", color: "#e2e8f0" },
        {
          type: "box",
          layout: "vertical",
          margin: "sm",
          spacing: "xs",
          contents: [
            { type: "text", text: "申報項目：", color: "#64748b", size: "xs", weight: "bold" },
            ...(selectedNames.length > 0
              ? selectedNames.map((n: string) => ({ type: "text", text: `• ${n}`, color: "#334155", size: "xs", wrap: true }))
              : [{ type: "text", text: "• 無項目", color: "#94a3b8", size: "xs" }]),
          ],
        },
        ...(details.note ? [{
          type: "box",
          layout: "vertical",
          margin: "xs",
          contents: [
            { type: "text", text: `備註：${details.note}`, color: "#64748b", size: "xs", wrap: true },
          ],
        }] : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        ...(verifyLink ? [{
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "uri",
            label: "確認無誤（一鍵核銷）",
            uri: verifyLink,
          },
        }] : []),
        ...(proofImageUrl ? [{
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "uri",
            label: "查看匯款證明照片",
            uri: proofImageUrl,
          },
        }] : []),
      ],
    },
  };

  const adminMsg =
    "【幹部通知：新繳費申報】\n\n" +
    (userName ? `申報人：${userName}\n` : "") +
    `申報人 ID：${userId}\n` +
    (paymentId ? `繳費單號：${paymentId}\n` : "") +
    `申報金額：$${totalAmount} 元\n` +
    `帳號末五碼：${last5Digits}\n` +
    `申報項目：\n${itemsZh}` +
    (proofImageUrl ? `\n• 匯款證明圖片：${proofImageUrl}` : "") +
    `${noteZh}\n\n` +
    (verifyLink ? `點擊單鍵核銷連結完成核銷：${verifyLink}\n` : "請至管理後台更新對帳狀態\n") +
    "\n資料已安全記錄於 Supabase，請幹部核對網銀後核銷！";

  const paymentSubject = `【台科登山社】新繳費申報 - $${totalAmount} (${userName || "未知社員"}，末5碼 ${last5Digits})`;
  await pushAdminMessage(adminMsg, paymentSubject, { flexContents: paymentFlex, altText: paymentSubject });

  // 停用個人 pushMessage 以節省 LINE Messaging API 每月免費額度 (前端已透過 liff.sendMessages 發送 0 額度發話憑證)
  return successResponse({ message: "繳費申報幹部推播已成功送出" });
}

// 4. 繳費單核銷完成推播
async function handleNotifyPaymentConfirmed(json: Record<string, any>) {
  const paymentId = json.paymentId || "";
  const userName = json.userName || "社員";
  let userEmail = json.userEmail || "";
  let userLanguage = json.userLanguage || json.lang || json.preferredLanguage || "";
  const amount = json.amount || 0;
  const items = json.items || json.type || "社團活動/裝備費用";
  const lineUserId = json.lineUserId || "";
  const confirmedBy = json.confirmedBy || "單鍵快速核銷";

  const client = getSupabaseAdminClient();
  if ((!userEmail || !userLanguage) && lineUserId) {
    const { data: member } = await client
      .from("members")
      .select("email,preferred_language")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (member) {
      if (!userEmail && member.email) userEmail = member.email;
      if (!userLanguage && member.preferred_language) userLanguage = member.preferred_language;
    }
  }

  const isEn = userLanguage === "en" || userLanguage === "en-US";

  // 1. Email 發送 (GAS Worker)
  const workerUrl = Deno.env.get("GAS_WORKER_URL");
  const workerSecret = Deno.env.get("GAS_WORKER_SECRET");
  if (userEmail && workerUrl && workerSecret) {
    const emailSubject = isEn
      ? `Payment Confirmation - ${paymentId} (NTUST Mountaineering Club)`
      : `【台科登山社】繳費成功確認通知 - ${paymentId}`;

    const emailBody = isEn
      ? `Dear ${userName},\n\n` +
        "Your payment has been successfully verified and confirmed by the club officers!\n\n" +
        `• Payment ID: ${paymentId}\n` +
        `• Amount: $${amount} TWD\n` +
        `• Items: ${items}\n` +
        "• Status: Confirmed\n\n" +
        "Your event registration and gear rental status have been updated. You can check your status anytime on your LINE Dashboard. Thank you for your support!\n\n" +
        "NTUST Mountaineering Club • Automated Notification System"
      : `親愛的 ${userName} 您好：\n\n` +
        "社團幹部已確認收到您的款項並完成核銷！\n\n" +
        `• 繳費單號：${paymentId}\n` +
        `• 核銷金額：$${amount} 元\n` +
        `• 核銷項目：${items}\n` +
        "• 核銷狀態：已核銷 Confirmed\n\n" +
        "相關活動報名與裝備租借狀態已同步更新，您可隨時至社團 LINE 個人主頁查看最新狀態。感謝您的配合與支持！\n\n" +
        "台科登山社 • 自動發送系統";

    fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        action: "send_user_email",
        to: userEmail,
        subject: emailSubject,
        text: emailBody,
      }),
    }).catch((err) => console.warn("GAS send_user_email failed:", err));
  }

  // 2. 社員個人 LINE 推播
  if (lineUserId && lineUserId.startsWith("U")) {
    const personalFlex = buildPaymentVerifiedPersonalFlex({
      userName,
      paymentId,
      amount,
      items,
    });
    const altPersonalText = `繳費核銷完成: ${items} (NT$ ${amount})`;
    await pushMessage(lineUserId, [{
      type: "flex",
      altText: altPersonalText,
      contents: personalFlex,
    }]);
  }

  // 3. 幹部管理群組推播
  const adminMsg =
    "【幹部通知：繳費單已完成核銷】\n" +
    "─────────────\n" +
    `• 繳費單號：${paymentId}\n` +
    `• 申報人：${userName}\n` +
    `• 核銷金額：$${amount} 元\n` +
    `• 核銷項目：${items}\n` +
    `• 核銷途徑：${confirmedBy}\n` +
    "• 系統狀態：已成功更新 Supabase 資料庫";

  const adminSubject = `【台科登山社】繳費單已完成核銷 - ${paymentId} (${userName})`;
  const paymentAdminFlex = buildPaymentConfirmedAdminFlex({
    paymentId,
    userName,
    amount,
    items,
    confirmedBy,
  });
  await pushAdminMessage(adminMsg, adminSubject, {
    flexContents: paymentAdminFlex,
    altText: adminSubject,
  });

  return successResponse({ message: "核銷通知推播與確認信已成功送出" });
}

function buildLoanCancelledAdminFlex(params: {
  loanId: string;
  borrowerName: string;
  borrowerLineId?: string;
  itemsText: string;
  isPaid: boolean;
}) {
  const adminLoansUrl = `https://liff.line.me/${getLiffChannelId()}-jvj3ydDT?liff.state=%2Fadmin%2Floans`;
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: params.isPaid ? "#DC2626" : "#E11D48",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: params.isPaid ? "幹部通知：裝備預約取消 (需安排退款)" : "幹部通知：裝備預約取消",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "訂單編號：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.loanId, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "申請人：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.borrowerName, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        ...(params.borrowerLineId ? [{
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "LINE ID：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.borrowerLineId, size: "xs", color: "#0F172A", flex: 7 },
          ],
        }] : []),
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "取消裝備品項：", weight: "bold", size: "xs", color: "#0F172A" },
            { type: "text", text: params.itemsText || "無品項", size: "xs", color: "#475569", wrap: true },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: params.isPaid
            ? "該預約已繳費／待確認，請幹部安排退款事宜。（庫存已自動回補）"
            : "裝備庫存已由 Supabase 自動釋放回補。",
          size: "xxs",
          color: params.isPaid ? "#DC2626" : "#64748B",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: params.isPaid ? "#DC2626" : "#E11D48",
          height: "sm",
          action: {
            type: "uri",
            label: "進入幹部租借管理系統",
            uri: adminLoansUrl,
          },
        },
      ],
    },
  };
}

function buildPaymentVerifiedPersonalFlex(params: {
  userName: string;
  paymentId: string;
  amount: number | string;
  items: string;
}) {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "繳費核銷完成 / Payment Confirmed",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "申報社員：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.userName, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "繳費單號：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.paymentId, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "核銷金額：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: `NT$ ${params.amount}`, size: "xs", color: "#059669", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "核銷項目：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.items, size: "xs", color: "#0F172A", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "帳務狀態：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: "已核銷 Confirmed", size: "xs", color: "#059669", weight: "bold", flex: 7 },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: "感謝您的配合！您的款項已完成核銷並入帳，期待在山林活動中與您相見！",
          size: "xxs",
          color: "#64748B",
          wrap: true,
        },
      ],
    },
  };
}

function buildPaymentConfirmedAdminFlex(params: {
  paymentId: string;
  userName: string;
  amount: number | string;
  items: string;
  confirmedBy: string;
}) {
  const adminFinanceUrl = `https://liff.line.me/${getLiffChannelId()}-jvj3ydDT?liff.state=%2Fadmin%2Ffinance`;
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0284C7",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "幹部通知：繳費單已完成核銷",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "繳費單號：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.paymentId, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "申報人：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.userName, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "核銷金額：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: `NT$ ${params.amount}`, size: "xs", color: "#0284C7", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "核銷項目：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.items, size: "xs", color: "#0F172A", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "核銷途徑：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.confirmedBy, size: "xs", color: "#475569", flex: 7 },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: "該筆款項已確認入帳，系統資料庫已即時同步更新完成。",
          size: "xxs",
          color: "#64748B",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#0284C7",
          height: "sm",
          action: {
            type: "uri",
            label: "進入幹部財務系統",
            uri: adminFinanceUrl,
          },
        },
      ],
    },
  };
}

function buildOfficerIntentAdminFlex(params: {
  name: string;
  deptAndId: string;
  phone: string;
  intentRole: string;
  wantToSay: string;
}) {
  const adminMembersUrl = `https://liff.line.me/${getLiffChannelId()}-jvj3ydDT?liff.state=%2Fadmin%2Fmembers`;
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#7C3AED",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "幹部通知：新幹部意願登記",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "社員姓名：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.name, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "系所學號：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.deptAndId || "未填寫", size: "xs", color: "#0F172A", flex: 7 },
          ],
        },
        ...(params.phone ? [{
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "聯絡電話：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.phone, size: "xs", color: "#0F172A", flex: 7 },
          ],
        }] : []),
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "意向組別：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.intentRole, size: "xs", color: "#7C3AED", weight: "bold", flex: 7 },
          ],
        },
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            { type: "text", text: "想對社團說的話：", weight: "bold", size: "xs", color: "#0F172A" },
            { type: "text", text: params.wantToSay || "(無留言)", size: "xs", color: "#475569", wrap: true },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: "新幹部意願已送達，請幹部們多加留意與主動破冰認識！",
          size: "xxs",
          color: "#64748B",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#7C3AED",
          height: "sm",
          action: {
            type: "uri",
            label: "查看社員名冊",
            uri: adminMembersUrl,
          },
        },
      ],
    },
  };
}

function buildEventCancelledAdminFlex(params: {
  eventName: string;
  eventId: string;
  userName: string;
  cancelReason: string;
  isPaid: boolean;
}) {
  const adminEventsUrl = `https://liff.line.me/${getLiffChannelId()}-jvj3ydDT?liff.state=%2Fadmin%2Fevents`;
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#DC2626",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: params.isPaid
            ? "幹部緊急通知：正取取消 (需替補與退費)"
            : "幹部通知：正取取消 (需安排遞補)",
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "活動名稱：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: `${params.eventName} (${params.eventId})`, size: "xs", color: "#0F172A", weight: "bold", flex: 7, wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "棄權社員：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.userName, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "審核狀態：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: "正取 (棄權)", size: "xs", color: "#DC2626", weight: "bold", flex: 7 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "取消原因：", size: "xs", color: "#64748B", flex: 3 },
            { type: "text", text: params.cancelReason, size: "xs", color: "#475569", flex: 7, wrap: true },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: params.isPaid
            ? "該正取者已完成繳費／待對帳，請幹部安排備取遞補與退費事宜！"
            : "正取名額已釋出，請幹部儘速檢視備取名單，聯繫有遞補意願之社員！",
          size: "xxs",
          color: "#DC2626",
          weight: "bold",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#DC2626",
          height: "sm",
          action: {
            type: "uri",
            label: "查看活動名冊",
            uri: adminEventsUrl,
          },
        },
      ],
    },
  };
}

function buildLoanStatusUpdatedFlex(
  params: {
    borrowerName: string;
    loanId: string;
    newStatus: string;
    pickupDate: string;
    returnDate: string;
    itemsSummary?: Array<{ name?: string; equipment_id?: string; quantity?: number }> | string;
  },
  prefLang?: "zh" | "en" | null
) {
  const isEn = prefLang === "en";

  let itemsTextZh = "";
  let itemsTextEn = "";
  if (Array.isArray(params.itemsSummary)) {
    itemsTextZh = params.itemsSummary
      .map((it: any) => `• ${it.name || it.equipment_id || "裝備"} x ${it.quantity || 1}`)
      .join("\n");
    itemsTextEn = params.itemsSummary
      .map((it: any) => `• ${it.name || it.equipment_id || "Equipment"} x ${it.quantity || 1}`)
      .join("\n");
  } else if (typeof params.itemsSummary === "string" && params.itemsSummary.trim()) {
    itemsTextZh = params.itemsSummary;
    itemsTextEn = params.itemsSummary;
  } else {
    itemsTextZh = "無品項細項";
    itemsTextEn = "No item details";
  }

  if (isEn) {
    return {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#059669",
        paddingTop: "14px",
        paddingBottom: "14px",
        paddingStart: "16px",
        paddingEnd: "16px",
        contents: [
          {
            type: "text",
            text: "Equipment Loan Status Update",
            color: "#FFFFFF",
            weight: "bold",
            size: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `Dear ${params.borrowerName},\nYour equipment loan application status has been updated!`,
            weight: "bold",
            size: "sm",
            color: "#0F172A",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Order ID:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: params.loanId, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Status:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: params.newStatus, size: "xs", color: "#059669", weight: "bold", flex: 7 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Period:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: `${params.pickupDate} ~ ${params.returnDate}`, size: "xs", color: "#0F172A", flex: 7 },
                ],
              },
            ],
          },
          { type: "separator" },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "Items:",
                weight: "bold",
                size: "xs",
                color: "#0F172A",
              },
              {
                type: "text",
                text: itemsTextEn,
                size: "xs",
                color: "#475569",
                wrap: true,
              },
            ],
          },
          { type: "separator" },
          {
            type: "text",
            text: "If you have any questions or need to confirm pickup/return times, please contact equipment officers. Thank you!",
            size: "xxs",
            color: "#64748B",
            wrap: true,
          },
        ],
      },
    };
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingTop: "14px",
      paddingBottom: "14px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        {
          type: "text",
          text: "裝備租借狀態更新通知",
          color: "#FFFFFF",
          weight: "bold",
          size: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `親愛的 ${params.borrowerName} 您好：\n您的裝備租借申請單狀態已更新！`,
          weight: "bold",
          size: "sm",
          color: "#0F172A",
          wrap: true,
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "訂單編號：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: params.loanId, size: "xs", color: "#0F172A", weight: "bold", flex: 7 },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "最新租借狀態：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: `【${params.newStatus}】`, size: "xs", color: "#059669", weight: "bold", flex: 7 },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "租借期間：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: `${params.pickupDate} ~ ${params.returnDate}`, size: "xs", color: "#0F172A", flex: 7 },
              ],
            },
          ],
        },
        { type: "separator" },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: "租借裝備品項：",
              weight: "bold",
              size: "xs",
              color: "#0F172A",
            },
            {
              type: "text",
              text: itemsTextZh,
              size: "xs",
              color: "#475569",
              wrap: true,
            },
          ],
        },
        { type: "separator" },
        {
          type: "text",
          text: "如有任何疑問或需確認領取/歸還時間，請隨時與社團裝備幹部聯絡，謝謝！",
          size: "xxs",
          color: "#64748B",
          wrap: true,
        },
      ],
    },
  };
}

// 5. 裝備狀態更新推播
async function handleNotifyLoanStatusUpdated(json: Record<string, any>) {
  const loanId = json.loanId || "";
  const userId = json.userId || "";
  const borrowerName = json.borrowerName || "社員";
  const newStatus = json.newStatus || "";
  const pickupDate = json.pickupDate || "";
  const returnDate = json.returnDate || "";
  const itemsSummary = json.itemsSummary || [];

  if (userId && userId.startsWith("U")) {
    const prefLang = await getUserPreferredLanguage(userId);
    const bubble = buildLoanStatusUpdatedFlex({
      borrowerName,
      loanId,
      newStatus,
      pickupDate,
      returnDate,
      itemsSummary,
    }, prefLang);

    const altText = prefLang === "en"
      ? `Equipment Loan Status Update - ${loanId}`
      : `裝備租借狀態更新通知 - ${loanId}`;

    await pushMessage(userId, [{
      type: "flex",
      altText,
      contents: bubble,
    }]);
  }

  return successResponse({ message: "裝備狀態推播通知已成功送出" });
}

// 6. 活動發布/更新推播至幹部群組
async function handleNotifyOfficerEvent(json: Record<string, any>) {
  const userId = json.userId || "";
  const eventId = json.eventId || "";
  const name = json.name || "未命名活動";
  const startDate = json.startDate || "";
  const endDate = json.endDate || "";
  const deadline = json.deadline || "";
  const cost = json.cost || "0";
  const status = json.status || "開放";
  const isUpdate = Boolean(json.isUpdate);

  const isOfficer = await isUserOfficer(userId);
  if (!isOfficer) {
    return errorResponse("權限不足：僅限幹部可發送活動推播", 403);
  }

  const titleTag = isUpdate ? "【幹部通知：活動資訊更新】" : "【幹部通知：新活動發布】";
  const dateRange = startDate ? startDate + (endDate && endDate !== startDate ? ` ~ ${endDate}` : "") : "未定";
  const deadlineDisplay = formatTaipeiDate(deadline, "YYYY/MM/DD HH:mm") || deadline || "無";
  const groupMsg =
    `${titleTag}\n\n` +
    `• 活動名稱：${name}\n` +
    `• 活動代號：${eventId}\n` +
    `• 出隊日期：${dateRange}\n` +
    `• 報名截止：${deadlineDisplay}\n` +
    `• 預計費用：NT$ ${cost}\n` +
    `• 目前狀態：【${status}】\n\n` +
    (isUpdate ? "活動資訊已同步更新完成！" : "已上架完成，社員可在「最新活動」瀏覽與報名！");

  await pushAdminMessage(groupMsg);

  return jsonResponse({
    status: "success",
    message: "成功推播活動資訊至幹部群組",
    eventId,
  });
}

// 7. 幹部意願登記通知 (個人推播依 R4 移除)
async function handleNotifyProfileSaved(json: Record<string, any>) {
  const userId = json.userId;
  if (!userId || userId === "TEST_USER_ID") {
    return successResponse({ message: "測試使用者略過推播" });
  }

  const client = getSupabaseAdminClient();
  const { data: member } = await client
    .from("members")
    .select("name,student_id,department,phone,officer_intent,want_to_say,is_officer")
    .eq("line_user_id", userId)
    .maybeSingle();

  if (member && member.officer_intent && member.officer_intent !== "無意願" && member.officer_intent !== "None") {
    const adminMsg =
      "【幹部通知：新幹部意願登記】\n" +
      "─────────────\n" +
      `• 社員姓名：${member.name || "未填寫"}\n` +
      `• 系所學號：${member.department || ""} (${member.student_id || ""})\n` +
      `• 聯絡電話：${member.phone || ""}\n` +
      `• 意向組別：${member.officer_intent}\n` +
      (member.want_to_say ? `• 想對社團說的話：${member.want_to_say}\n\n` : "\n") +
      "新幹部意願已送達，請幹部們多加留意與主動破冰認識！";

    const adminSubject = `【台科登山社】新幹部意願登記 - ${member.name}`;
    const officerIntentFlex = buildOfficerIntentAdminFlex({
      name: member.name || "未填寫",
      deptAndId: `${member.department || ""} (${member.student_id || ""})`,
      phone: member.phone || "",
      intentRole: member.officer_intent,
      wantToSay: member.want_to_say || "",
    });

    await pushAdminMessage(adminMsg, adminSubject, {
      flexContents: officerIntentFlex,
      altText: adminSubject,
    });
  }

  return successResponse({ message: "個人資料通知處理完成" });
}

// 8. 活動報名取消推播
async function handleNotifyEventCancelled(json: Record<string, any>) {
  const eventId = json.eventId || "";
  const eventName = json.eventName || "社團活動";
  const userName = json.userName || "社員";
  const reviewStatus = String(json.reviewStatus || "");
  const cancelReason = json.cancelReason || "自願取消";
  const isPaid = Boolean(json.isPaid);

  const isConfirmedUser = reviewStatus.includes("正取");

  if (isConfirmedUser) {
    const adminSubject = `【台科登山社】正取棄權緊急通知 - ${eventName} (${userName})`;
    const adminBody =
      `【幹部通知：正取取消（${isPaid ? "需安排替補與退費" : "需安排備取遞補"}）】\n` +
      "─────────────\n" +
      `• 活動名稱：${eventName} (${eventId})\n` +
      `• 棄權社員：${userName}\n` +
      "• 審核狀態：正取 (棄權)\n" +
      `• 取消原因：${cancelReason}\n\n` +
      (isPaid
        ? "該正取者已完成繳費／待對帳，請幹部安排備取遞補與退費事宜！"
        : "正取名額已釋出，請幹部儘速檢視備取名單，聯繫有遞補意願之社員！");

    const eventCancelledFlex = buildEventCancelledAdminFlex({
      eventName,
      eventId,
      userName,
      cancelReason,
      isPaid,
    });

    await pushAdminMessage(adminBody, adminSubject, {
      flexContents: eventCancelledFlex,
      altText: adminSubject,
    });
  }

  return successResponse({ message: "活動取消推播已成功送出" });
}

// 10. 發送審核結果推播通知 (send_event_notifications)
async function handleSendEventNotifications(json: Record<string, any>) {
  const userId = json.userId;
  const targetEventId = json.eventId ? String(json.eventId).trim() : "";

  const isOfficer = await isUserOfficer(userId);
  if (!isOfficer) {
    return errorResponse("權限不足，僅限幹部發送推播通知", 403);
  }

  if (!targetEventId) {
    return errorResponse("缺少活動代號 (eventId)");
  }

  const client = getSupabaseAdminClient();

  const { data: event } = await client
    .from("events")
    .select("id,title,title_en,line_group_url")
    .eq("id", targetEventId)
    .maybeSingle();

  if (!event) {
    return errorResponse("找不到該活動資料");
  }

  const targetEventTitle = event.title || targetEventId;
  const targetGroupUrl = (event.line_group_url || "").trim();

  // 查詢該活動所有名單以統計有效正取與備取人數（排除已取消與審核中）
  const { data: allEventSignups } = await client
    .from("event_signups")
    .select("status")
    .eq("event_id", targetEventId);

  let confirmedCount = 0;
  let waitlistedCount = 0;
  if (allEventSignups && Array.isArray(allEventSignups)) {
    for (const su of allEventSignups) {
      const st = String(su.status || "").trim();
      if (st.includes("取消") || st.includes("cancel") || st.includes("審核中") || st.includes("Checking")) {
        continue;
      }
      if (st.includes("正取")) {
        confirmedCount++;
      } else if (st.includes("備取")) {
        waitlistedCount++;
      }
    }
  }

  let query = client
    .from("event_signups")
    .select("id,event_id,line_user_id,name,status,notification_status")
    .eq("event_id", targetEventId);

  if (json.signupIds) {
    const allowedIdList = String(json.signupIds).split(",").map((x) => x.trim()).filter(Boolean);
    if (allowedIdList.length > 0) {
      query = query.in("id", allowedIdList);
    }
  }

  const { data: signups, error } = await query;
  if (error || !signups || signups.length === 0) {
    return successResponse({ message: "無待通知之報名者", notifiedCount: 0 });
  }

  // 檢驗：若有正取人員待推播通知，但活動未設定群組連結，立即阻擋
  const hasPendingAccepted = signups.some((item) => {
    const st = String(item.status || "");
    const noti = String(item.notification_status || "");
    const uid = String(item.line_user_id || "").trim();
    return st.includes("正取") && !st.includes("取消") && noti !== "已通知" && uid.startsWith("U");
  });

  if (hasPendingAccepted && !targetGroupUrl) {
    return errorResponse("此活動尚未設定專屬群組連結 (line_group_url)，請先至活動編輯填寫群組連結後再發送推播！");
  }

  let notifiedCount = 0;
  const liffChannelId = getLiffChannelId();

  for (const sItem of signups) {
    const statusStr = String(sItem.status || "").trim();
    const notifyStr = String(sItem.notification_status || "").trim();
    const targetUid = String(sItem.line_user_id || "").trim();
    const applicantName = String(sItem.name || "社員").trim();

    const isAcceptedOrWaitlisted = statusStr.includes("正取") || statusStr.includes("備取");
    if (isAcceptedOrWaitlisted && notifyStr !== "已通知" && !statusStr.includes("取消") && targetUid.startsWith("U")) {
      // 搶占式 claim 避免併發重複推播
      const { error: claimErr } = await client
        .from("event_signups")
        .update({ notification_status: "發送中", updated_at: new Date().toISOString() })
        .eq("id", sItem.id)
        .neq("notification_status", "已通知");

      if (claimErr) continue;

      const prefLang = await getUserPreferredLanguage(targetUid);
      const isEnglish = prefLang === "en";

      const targetEventTitle = isEnglish
        ? (event.title_en || event.title || targetEventId)
        : (event.title || targetEventId);

      const statsPillText = isEnglish
        ? `Confirmed: ${confirmedCount} | Waitlisted: ${waitlistedCount}`
        : `正取：${confirmedCount} 人 ｜ 備取：${waitlistedCount} 人`;

      if (statusStr.includes("正取")) {
        const resTag = isEnglish ? "Review Result Released" : "審核結果出爐";
        const resTitle = isEnglish ? "Admission Confirmed" : "活動正取通知";
        const greetText = isEnglish
          ? `Hello ${applicantName}! For the event:`
          : `哈囉 ${applicantName}！您報名的活動：`;
        const resPrompt = isEnglish ? "Review Result:" : "審核結果為：";
        const displayBadge = isEnglish ? "【 Confirmed 】" : "【 正取 】";
        const noticeText = isEnglish
          ? "Congratulations! Please click the button below to join the activity LINE group and complete payment before the deadline!"
          : "恭喜您錄取！請點擊下方按鈕加入出隊專屬群組，並請於期限內完成繳費！";
        const joinBtn = isEnglish ? "Join Group" : "加入活動群組";
        const payBtn = isEnglish ? "Pay Now" : "前往繳費系統";
        const altPushText = isEnglish ? "【Activity Admission Notice】" : "【活動正取通知】";

        const acceptedFlex = {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: resTag, weight: "bold", color: "#1DB446", size: "sm" },
              { type: "text", text: resTitle, weight: "bold", size: "xl", margin: "md" },
              { type: "text", text: greetText, margin: "md", size: "sm", wrap: true },
              { type: "text", text: targetEventTitle, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#F3F4F6",
                cornerRadius: "md",
                paddingStart: "md",
                paddingEnd: "md",
                paddingTop: "xs",
                paddingBottom: "xs",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: statsPillText,
                    size: "xs",
                    color: "#374151",
                    weight: "bold",
                    align: "center",
                  },
                ],
              },
              { type: "text", text: resPrompt, margin: "md", size: "sm" },
              { type: "text", text: displayBadge, weight: "bold", color: "#1DB446", size: "lg", align: "center", margin: "md" },
              { type: "separator", margin: "md" },
              { type: "text", text: noticeText, wrap: true, margin: "md", size: "xs", color: "#666666" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#1DB446",
                action: {
                  type: "uri",
                  label: joinBtn,
                  uri: targetGroupUrl,
                },
              },
              {
                type: "button",
                style: "primary",
                color: "#0367D3",
                action: {
                  type: "uri",
                  label: payBtn,
                  uri: `https://liff.line.me/${liffChannelId}-u7OCkmQO`,
                },
              },
            ],
          },
        };

        const pushRes = await pushMessage(targetUid, [{ type: "flex", altText: altPushText, contents: acceptedFlex }]);
        if (pushRes.success) {
          await client.from("event_signups").update({ notification_status: "已通知", updated_at: new Date().toISOString() }).eq("id", sItem.id);
          notifiedCount++;
        } else {
          await client.from("event_signups").update({ notification_status: "未發送", updated_at: new Date().toISOString() }).eq("id", sItem.id);
        }
      } else {
        const resTagW = isEnglish ? "Review Result Released" : "審核結果出爐";
        const resTitleW = isEnglish ? "Activity Waitlist Notice" : "活動備取通知";
        const greetTextW = isEnglish
          ? `Hello ${applicantName}! For the event:`
          : `哈囉 ${applicantName}！您報名的活動：`;
        const resPromptW = isEnglish ? "Review Result:" : "審核結果為：";
        const displayBadgeW = isEnglish ? "【 Waitlisted 】" : "【 備取 】";
        const noticeTextW = isEnglish
          ? "You are currently on the waitlist. We will contact you if a spot opens up!"
          : "目前為備取狀態，若有正取人員釋出名額，幹部將主動聯絡您遞補！";
        const confirmBtn = isEnglish ? "Confirm Waitlist" : "確認備取意願";
        const altPushTextW = isEnglish ? "【Activity Waitlist Notice】" : "【活動備取通知】";

        const waitlistFlex = {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: resTagW, weight: "bold", color: "#FF9800", size: "sm" },
              { type: "text", text: resTitleW, weight: "bold", size: "xl", margin: "md" },
              { type: "text", text: greetTextW, margin: "md", size: "sm", wrap: true },
              { type: "text", text: targetEventTitle, weight: "bold", color: "#111111", size: "md", wrap: true, margin: "sm" },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#F3F4F6",
                cornerRadius: "md",
                paddingStart: "md",
                paddingEnd: "md",
                paddingTop: "xs",
                paddingBottom: "xs",
                margin: "md",
                contents: [
                  {
                    type: "text",
                    text: statsPillText,
                    size: "xs",
                    color: "#374151",
                    weight: "bold",
                    align: "center",
                  },
                ],
              },
              { type: "text", text: resPromptW, margin: "md", size: "sm" },
              { type: "text", text: displayBadgeW, weight: "bold", color: "#FF9800", size: "lg", align: "center", margin: "md" },
              { type: "separator", margin: "md" },
              { type: "text", text: noticeTextW, wrap: true, margin: "md", size: "xs", color: "#666666" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#FF9800",
                action: {
                  type: "postback",
                  label: confirmBtn,
                  data: `action=confirm_waitlist&eventId=${encodeURIComponent(targetEventId)}&userId=${encodeURIComponent(targetUid)}`,
                },
              },
            ],
          },
        };

        const pushRes = await pushMessage(targetUid, [{ type: "flex", altText: altPushTextW, contents: waitlistFlex }]);
        if (pushRes.success) {
          await client.from("event_signups").update({ notification_status: "已通知", updated_at: new Date().toISOString() }).eq("id", sItem.id);
          notifiedCount++;
        } else {
          await client.from("event_signups").update({ notification_status: "未發送", updated_at: new Date().toISOString() }).eq("id", sItem.id);
        }
      }
    }
  }

  return successResponse({
    message: `成功發送 ${notifiedCount} 筆審核推播通知`,
    notifiedCount,
  });
}

Deno.serve(async (req: Request) => {
  activeOrigin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (!checkRateLimit(clientIp)) {
    return errorResponse("Too many requests. Please try again later.", 429);
  }

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }

  const action = payload.action;
  if (!action) {
    return errorResponse("Missing action parameter", 400);
  }

  const rawIdTokenHeader = req.headers.get("x-line-id-token") || "";
  const rawAccessTokenHeader = req.headers.get("x-line-access-token") || "";
  const rawAuthHeader = req.headers.get("authorization") || "";
  const bearerToken = rawAuthHeader.replace(/^Bearer\s+/i, "").trim();

  const candidateIdToken = (rawIdTokenHeader || payload.idToken || "").trim();
  const candidateAccessToken = (rawAccessTokenHeader || payload.accessToken || "").trim();
  const candidateCustomJwt = (payload.customJwt || "").trim();

  const paymentIdForToken = String(payload.paymentId || payload.details?.paymentId || "").trim();
  const verifyTokenForPayment = String(payload.verifyToken || payload.details?.verifyToken || "").trim();
  const hasPaymentVerifyToken =
    (action === "notify_officers_payment" || action === "notify_payment_confirmed") &&
    Boolean(paymentIdForToken && verifyTokenForPayment);

  if (
    !bearerToken &&
    !candidateIdToken &&
    !candidateAccessToken &&
    !candidateCustomJwt &&
    !hasPaymentVerifyToken
  ) {
    return errorResponse("缺少身分驗證 Token (Unauthorized: Missing ID Token)", 401);
  }

  let verifiedUserId = "";
  const authErrors: string[] = [];

  // 軌道 1: 驗證 Supabase Custom JWT (由 line-auth 簽發)
  for (const jwtCandidate of [candidateCustomJwt, bearerToken].filter(Boolean)) {
    if (jwtCandidate.split(".").length === 3) {
      const jwtRes = await verifyCustomJwt(jwtCandidate);
      if (jwtRes.success && jwtRes.userId) {
        verifiedUserId = jwtRes.userId;
        break;
      }
      if (jwtRes.error) authErrors.push(jwtRes.error);
    }
  }

  // 軌道 2: 驗證 LINE ID Token
  if (!verifiedUserId) {
    for (const idCandidate of [candidateIdToken, bearerToken].filter(Boolean)) {
      const idRes = await verifyLineIdToken(idCandidate);
      if (idRes.success && idRes.userId) {
        verifiedUserId = idRes.userId;
        break;
      }
      if (idRes.error) authErrors.push(idRes.error);
    }
  }

  // 軌道 3: 驗證 LINE Access Token (透過 LINE Profile API)
  if (!verifiedUserId) {
    for (const accCandidate of [candidateAccessToken, bearerToken].filter(Boolean)) {
      const accRes = await verifyLineAccessToken(accCandidate);
      if (accRes.success && accRes.userId) {
        verifiedUserId = accRes.userId;
        break;
      }
      if (accRes.error) authErrors.push(accRes.error);
    }
  }

  // 軌道 4: 針對繳費申報與單鍵核銷通知，支援以資料庫 payments.verify_token 進行安全憑證核驗
  if (!verifiedUserId && hasPaymentVerifyToken) {
    const client = getSupabaseAdminClient();
    const { data: payRow } = await client
      .from("payments")
      .select("id,line_user_id,verify_token")
      .eq("id", paymentIdForToken)
      .maybeSingle();

    if (payRow && payRow.verify_token && payRow.verify_token === verifyTokenForPayment) {
      verifiedUserId = payRow.line_user_id || payload.userId || "VERIFIED_PAYMENT_TOKEN";
    } else {
      authErrors.push("Invalid payment verifyToken");
    }
  }

  if (!verifiedUserId) {
    const lastErr = authErrors[0] || "無效或過期的 Token";
    return errorResponse(`身分驗證失敗: ${lastErr}`, 401);
  }

  payload.verifiedUserId = verifiedUserId;

  switch (action) {
    case "notify_officers_loan":
      return await handleNotifyOfficersLoan(payload);

    case "notify_loan_cancelled":
      return await handleNotifyLoanCancelled(payload);

    case "notify_officers_payment":
      return await handleNotifyOfficersPayment(payload);

    case "notify_payment_confirmed":
      return await handleNotifyPaymentConfirmed(payload);

    case "notify_loan_status_updated":
      return await handleNotifyLoanStatusUpdated(payload);

    case "notify_officer_event":
      return await handleNotifyOfficerEvent(payload);

    case "notify_profile_saved":
      return await handleNotifyProfileSaved(payload);

    case "notify_event_cancelled":
      return await handleNotifyEventCancelled(payload);

    case "send_event_notifications":
      return await handleSendEventNotifications(payload);

    default:
      return errorResponse(`未支援的 Helper Action: ${action}`, 400);
  }
});
