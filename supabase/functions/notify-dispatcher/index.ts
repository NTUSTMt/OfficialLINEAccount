import {
  getSupabaseAdminClient,
} from "../_shared/supabaseClient.ts";
import {
  verifyLineIdToken,
  pushMessage,
} from "../_shared/lineClient.ts";
import { pushAdminMessage } from "../_shared/pushAdminMessage.ts";
import { getUserPreferredLanguage, render } from "../_shared/i18n.ts";
import { PreferredLanguage } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-id-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

  const msg =
    "【🎒 幹部通知：新裝備租借申請】\n" +
    "─────────────\n" +
    `• 訂單編號：${loanId}\n` +
    `• 申請人：${borrowerName} (${identityDesc})\n` +
    `• LINE ID：${borrowerLineId}\n` +
    `• 聯絡電話：${borrowerPhone}\n` +
    `• 出隊天數：${days} 天 (${details.pickupDate || ""} ~ ${details.returnDate || ""})\n` +
    `• 租借用途：${purpose}\n` +
    `• 預估總租金：$${totalRent} 元\n\n` +
    "📦 借用裝備明細：\n" +
    (itemsSummary.length > 0 ? itemsSummary.join("\n") : "• 無品項") +
    "\n\n⚡ 本資料已安全寫入 Supabase，請至幹部後台確認備用！";

  const loanSubject = `【台科登山社】新裝備租借申請 - ${loanId} (${borrowerName})`;
  await pushAdminMessage(msg, loanSubject);

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
    adminSubject = `【台科登山社】裝備預約取消（⚠️需安排退款）- ${loanId} (${borrowerName})`;
    adminBody =
      "🔔 【幹部通知：裝備預約取消（需安排退款）】\n" +
      "─────────────\n" +
      `• 訂單編號：${loanId}\n` +
      `• 申請人：${borrowerName}\n` +
      (borrowerLineId ? `• LINE ID：${borrowerLineId}\n` : "") +
      `• 取消裝備品項：\n${itemsText}\n\n` +
      "⚠️ 該租借預約已繳費／待確認，請幹部依社團退費規範安排退款事宜！（庫存已由 Supabase 自動釋放回補）";
  } else {
    adminSubject = `【台科登山社】裝備預約取消通知 - ${loanId} (${borrowerName})`;
    adminBody =
      "【🎒 幹部通知：裝備預約取消】\n" +
      "─────────────\n" +
      `• 訂單編號：${loanId}\n` +
      `• 申請人：${borrowerName}\n` +
      (borrowerLineId ? `• LINE ID：${borrowerLineId}\n` : "") +
      `• 取消裝備品項：\n${itemsText}\n\n` +
      "⚡ 裝備庫存已由 Supabase 自動釋放回補！";
  }

  await pushAdminMessage(adminBody, adminSubject);
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
  await pushAdminMessage(adminMsg, paymentSubject);

  if (userId && userId !== "TEST_USER_ID") {
    const userMsg =
      "【繳費申報已成功送出】\n\n" +
      `您好${userName ? ` ${userName}` : ""}！系統已成功收到您的繳費申報資訊：\n\n` +
      (paymentId ? `• 繳費單號：${paymentId}\n` : "") +
      `• 申報金額：$${totalAmount} 元\n` +
      `• 帳號末五碼：${last5Digits}\n` +
      `• 申報項目：\n${itemsZh}` +
      `${noteZh}\n\n` +
      "幹部會於核對款項後自動更新您的繳費狀態。謝謝！\n" +
      "─────────────\n" +
      "【💳 Payment Report Submitted】\n\n" +
      `Hello${userName ? ` ${userName}` : ""}! Your payment report has been submitted:\n\n` +
      (paymentId ? `• Payment ID: ${paymentId}\n` : "") +
      `• Amount: $${totalAmount} TWD\n` +
      `• Last 5 Digits: ${last5Digits}\n` +
      `• Items:\n${itemsEn}` +
      `${noteEn}\n\n` +
      "Officers will verify your payment and update your status soon. Thank you!";

    await pushMessage(userId, [{ type: "text", text: userMsg }]);
  }

  return successResponse({ message: "繳費申報幹部與個人推播已成功送出" });
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
    const successMsg = isEn
      ? "🎉 Payment Confirmed\n\n" +
        `Dear ${userName},\n` +
        "Officers have confirmed your payment!\n\n" +
        `• Payment ID: ${paymentId}\n` +
        `• Amount: $${amount} TWD\n` +
        `• Items: ${items}\n` +
        "• Status: Confirmed\n\n" +
        "Thank you for your prompt payment. Your account status is now updated to [Confirmed]!"
      : "🎉 繳費成功通知 / Payment Confirmed\n\n" +
        `親愛的 ${userName} 您好：\n` +
        "幹部已確認收到您的款項囉！\nOfficer has confirmed your payment!\n\n" +
        `• 繳費單號：${paymentId}\n` +
        `• 核銷金額：$${amount} 元\n` +
        `• 核銷項目：${items}\n\n` +
        "感謝您的配合，您的帳務狀態已經更新為【已核銷 Confirmed】！期待在山林活動中與您相見！🏔️✨\n" +
        "─────────────\n" +
        `Dear ${userName},\n` +
        "Your payment has been successfully confirmed by the officers!\n\n" +
        `• Payment ID: ${paymentId}\n` +
        `• Amount: $${amount} TWD\n` +
        `• Items: ${items}\n\n` +
        "Thank you for your prompt payment. Your account status is now updated to [Confirmed]!";

    await pushMessage(lineUserId, [{ type: "text", text: successMsg }]);
  }

  // 3. 幹部管理群組推播
  const adminMsg =
    "【💳 幹部通知：繳費單已完成核銷】\n" +
    "─────────────\n" +
    `• 繳費單號：${paymentId}\n` +
    `• 申報人：${userName}\n` +
    `• 核銷金額：$${amount} 元\n` +
    `• 核銷項目：${items}\n` +
    `• 核銷途徑：${confirmedBy}\n` +
    "• 系統狀態：已成功更新 Supabase 資料庫";

  const adminSubject = `【台科登山社】繳費單已完成核銷 - ${paymentId} (${userName})`;
  await pushAdminMessage(adminMsg, adminSubject);

  return successResponse({ message: "核銷通知推播與確認信已成功送出" });
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
  const itemsText = Array.isArray(itemsSummary)
    ? itemsSummary.map((it: any) => `${it.name || it.equipment_id || "裝備"} x ${it.quantity || 1}`).join("\n• ")
    : String(itemsSummary || "無品項細項");

  if (userId && userId.startsWith("U")) {
    const prefLang = await getUserPreferredLanguage(userId);
    const userMsgZh =
      "【裝備租借狀態更新通知】\n\n" +
      `親愛的 ${borrowerName} 您好：\n` +
      "您的裝備租借申請單狀態已更新！\n\n" +
      `• 訂單編號：${loanId}\n` +
      `• 最新租借狀態：【${newStatus}】\n` +
      `• 租借期間：${pickupDate} ~ ${returnDate}\n` +
      (itemsText ? `• 租借裝備品項：\n• ${itemsText}\n\n` : "\n") +
      "如有任何疑問或需確認領取/歸還時間，請隨時與社團裝備幹部聯絡，謝謝！";

    const userMsgEn =
      "【Equipment Loan Status Update】\n\n" +
      `Dear ${borrowerName},\n` +
      "Your equipment loan application status has been updated!\n\n" +
      `• Order ID: ${loanId}\n` +
      `• Status: [${newStatus}]\n` +
      `• Period: ${pickupDate} ~ ${returnDate}\n` +
      (itemsText ? `• Items:\n• ${itemsText}\n\n` : "\n") +
      "If you have any questions or need to confirm pickup/return times, please contact equipment officers. Thank you!";

    const rendered = render({ zh: userMsgZh, en: userMsgEn }, prefLang);
    await pushMessage(userId, [{ type: "text", text: rendered }]);
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
  const groupMsg =
    `${titleTag}\n\n` +
    `• 活動名稱：${name}\n` +
    `• 活動代號：${eventId}\n` +
    `• 出隊日期：${dateRange}\n` +
    `• 報名截止：${deadline || "無"}\n` +
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
      "【🌟 幹部通知：新幹部意願登記】\n" +
      "─────────────\n" +
      `• 社員姓名：${member.name || "未填寫"}\n` +
      `• 系所學號：${member.department || ""} (${member.student_id || ""})\n` +
      `• 聯絡電話：${member.phone || ""}\n` +
      `• 意向組別：${member.officer_intent}\n` +
      (member.want_to_say ? `• 想對社團說的話：${member.want_to_say}\n\n` : "\n") +
      "熱騰騰的新幹部意願已送達，請幹部們多加留意與主動破冰認識！";

    await pushAdminMessage(adminMsg, `【台科登山社】新幹部意願登記 - ${member.name}`);
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
      `🔔 【幹部通知：正取取消（${isPaid ? "需安排替補與退費" : "需安排備取遞補"}）】\n` +
      "─────────────\n" +
      `• 活動名稱：${eventName} (${eventId})\n` +
      `• 棄權社員：${userName}\n` +
      "• 審核狀態：正取 (棄權)\n" +
      `• 取消原因：${cancelReason}\n\n` +
      (isPaid
        ? "⚠️ 該正取者已完成繳費／待對帳，請幹部安排備取遞補與退費事宜！"
        : "⚡ 正取名額已釋出，請幹部儘速檢視備取名單，聯繫有遞補意願之社員！");

    await pushAdminMessage(adminBody, adminSubject);
  }

  return successResponse({ message: "活動取消推播已成功送出" });
}

// 9. 心得評分提交推播
async function handleNotifyReflectionSubmitted(json: Record<string, any>) {
  const userName = json.userName || "社員";
  const eventName = json.eventName || "社團活動";
  const difficulty = Math.min(5, Math.max(1, parseInt(json.difficulty, 10) || 3));
  const beauty = Math.min(5, Math.max(1, parseInt(json.beauty, 10) || 5));
  const content = json.content || "";
  const photoUrls = json.photoUrls || [];
  const photosText = Array.isArray(photoUrls) ? photoUrls.join("\n• ") : String(photoUrls || "");

  const diffStars = "★".repeat(difficulty);
  const beautyStars = "★".repeat(beauty);

  const adminSubject = `【台科登山社】新活動心得分享 - ${eventName} (${userName})`;
  const adminBody =
    "【📝 幹部通知：社員活動心得回饋】\n" +
    "─────────────\n" +
    `• 發表社員：${userName}\n` +
    `• 活動名稱：${eventName}\n` +
    `• 路線難度：${diffStars} (${difficulty}/5)\n` +
    `• 風景推薦：${beautyStars} (${beauty}/5)\n\n` +
    `💬 心得內容：\n${content || "(無文字心得)"}` +
    (photosText ? `\n\n📷 登頂相片：\n• ${photosText}` : "");

  await pushAdminMessage(adminBody, adminSubject);
  return successResponse({ message: "心得提交推播已成功送出" });
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
  const liffChannelId = Deno.env.get("LIFF_CHANNEL_ID") || "2009217429";

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  const enforceToken = Deno.env.get("ENFORCE_ID_TOKEN") === "true";
  const authHeader = req.headers.get("x-line-id-token") || req.headers.get("authorization");

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

  // 身分驗證 (若提供 Token 或啟用 ENFORCE_ID_TOKEN)
  if (authHeader) {
    const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const verifyRes = await verifyLineIdToken(idToken);
    if (!verifyRes.success && enforceToken) {
      return errorResponse(`身分驗證失敗: ${verifyRes.error}`, 401);
    }
    if (verifyRes.success && verifyRes.userId) {
      payload.verifiedUserId = verifyRes.userId;
    }
  }

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

    case "notify_reflection_submitted":
      return await handleNotifyReflectionSubmitted(payload);

    case "send_event_notifications":
      return await handleSendEventNotifications(payload);

    default:
      return errorResponse(`未支援的 Helper Action: ${action}`, 400);
  }
});
