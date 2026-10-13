import {
  LineWebhookPayload,
  LineWebhookEvent,
  PreferredLanguage,
  EventRecord,
} from "../_shared/types.ts";
import {
  validateSignature,
  replyMessage,
  getLineUserProfile,
} from "../_shared/lineClient.ts";
import {
  getSupabaseAdminClient,
  setAppConfig,
  recordWorkerFailure,
} from "../_shared/supabaseClient.ts";
import { render, getUserPreferredLanguage } from "../_shared/i18n.ts";
import { messages } from "../_shared/messages.ts";
import { generateSignupId, formatTaipeiDate } from "../_shared/dateUtils.ts";
import { handleGeminiChat } from "./geminiService.ts";
import {
  buildEventListFlex,
  buildEventDetailFlex,
  buildMoreServicesFlex,
  buildOfficerMenuFlex,
  buildAiGuideFlex,
  buildMemberGuideFlex,
  buildFeedbackFlex,
  buildMemberNotFoundFlex,
  buildProfileIncompleteFlex,
  buildProfileExpiredFlex,
  buildSignupSuccessFlex,
  buildEventClosedFlex,
  buildWaitlistConfirmedFlex,
  buildWaitlistFailedFlex,
  buildAdminAssistantGuideFlex,
} from "./flexTemplates.ts";

async function sendEventList(replyToken: string, userId: string): Promise<void> {
  const prefLang = await getUserPreferredLanguage(userId);
  const client = getSupabaseAdminClient();

  const { data: events, error } = await client
    .from("events")
    .select("id,title,title_en,fee,start_date,end_date,deadline,status,summary,summary_en,cover_image_url")
    .order("start_date", { ascending: false });

  if (error || !events || events.length === 0) {
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.noScheduledEvents(), prefLang),
    }]);
    return;
  }

  const eventIds = events.map((e) => e.id);
  const signupCounts: Record<string, number> = {};

  if (eventIds.length > 0) {
    const { data: signups } = await client
      .from("event_signups")
      .select("event_id,status")
      .in("event_id", eventIds);

    if (signups) {
      for (const su of signups) {
        const sStatus = String(su.status || "").toLowerCase();
        if (!sStatus.includes("取消") && !sStatus.includes("cancel")) {
          signupCounts[su.event_id] = (signupCounts[su.event_id] || 0) + 1;
        }
      }
    }
  }

  const bubbles = buildEventListFlex(events as EventRecord[], signupCounts, prefLang);

  if (bubbles.length === 0) {
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.noScheduledEvents(), prefLang),
    }]);
  } else {
    const altText = prefLang === "en" ? "Event List" : "請查看本學期活動列表 / Event List";
    await replyMessage(replyToken, [{
      type: "flex",
      altText,
      contents: {
        type: "carousel",
        contents: bubbles,
      },
    }]);
  }
}

async function sendEventDetail(
  replyToken: string,
  eventId: string,
  userId: string
): Promise<void> {
  const prefLang = await getUserPreferredLanguage(userId);
  if (!eventId) {
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.signupEventNotFound(), prefLang),
    }]);
    return;
  }

  const client = getSupabaseAdminClient();
  const { data: event, error } = await client
    .from("events")
    .select("*")
    .eq("id", eventId.trim())
    .maybeSingle();

  if (error || !event) {
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.signupEventNotFound(), prefLang),
    }]);
    return;
  }

  const { data: signups } = await client
    .from("event_signups")
    .select("id,status")
    .eq("event_id", eventId.trim());

  let regCount = 0;
  if (signups) {
    for (const su of signups) {
      const sStatus = String(su.status || "").toLowerCase();
      if (!sStatus.includes("取消") && !sStatus.includes("cancel")) {
        regCount++;
      }
    }
  }

  const bubble = buildEventDetailFlex(event as EventRecord, regCount, prefLang);
  const altText = prefLang === "en" ? `Event: ${event.title_en || event.title}` : `活動詳情: ${event.title}`;

  await replyMessage(replyToken, [{
    type: "flex",
    altText,
    contents: bubble,
  }]);
}

async function sendOfficerMenu(replyToken: string): Promise<void> {
  try {
    const client = getSupabaseAdminClient();
    const { data: officers, error } = await client
      .from("officers")
      .select("line_user_id,name,role,responsibilities,photo_url");

    if (error || !officers || officers.length === 0) {
      await replyMessage(replyToken, [{
        type: "text",
        text: "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!",
      }]);
      return;
    }

    const lineIds = officers
      .map((o) => String(o.line_user_id || "").trim())
      .filter((id) => id.startsWith("U"));

    const memberAvatarMap: Record<string, string> = {};
    if (lineIds.length > 0) {
      const { data: memberRows } = await client
        .from("members")
        .select("line_user_id,avatar_url")
        .in("line_user_id", lineIds);
      if (memberRows) {
        for (const m of memberRows) {
          if (m.line_user_id && m.avatar_url) {
            memberAvatarMap[m.line_user_id] = m.avatar_url;
          }
        }
      }
    }

    const enrichedOfficers = await Promise.all(
      officers.map(async (off) => {
        const uid = String(off.line_user_id || "").trim();
        const profile = uid ? await getLineUserProfile(uid) : null;
        const livePictureUrl = profile?.pictureUrl ? String(profile.pictureUrl).trim() : "";
        const memberAvatar = uid ? (memberAvatarMap[uid] || "") : "";
        const rawPhotoUrl = String(off.photo_url || "").trim();
        const validStoredPhoto =
          rawPhotoUrl && !rawPhotoUrl.includes("ysnp.gov.tw") ? rawPhotoUrl : "";

        const finalPhotoUrl = livePictureUrl || memberAvatar || validStoredPhoto || null;

        if (uid && livePictureUrl && livePictureUrl !== rawPhotoUrl) {
          client
            .from("officers")
            .update({ photo_url: livePictureUrl, updated_at: new Date().toISOString() })
            .eq("line_user_id", uid)
            .then(() => {});
          if (livePictureUrl !== memberAvatar) {
            client
              .from("members")
              .update({ avatar_url: livePictureUrl, updated_at: new Date().toISOString() })
              .eq("line_user_id", uid)
              .then(() => {});
          }
        }

        return {
          ...off,
          name: off.name || profile?.displayName || "幹部",
          photo_url: finalPhotoUrl,
        };
      })
    );

    const bubbles = buildOfficerMenuFlex(enrichedOfficers);
    if (bubbles.length > 0) {
      await replyMessage(replyToken, [{
        type: "flex",
        altText: "來認識一下登山社幹部吧！ / Meet the club officers!",
        contents: {
          type: "carousel",
          contents: bubbles,
        },
      }]);
    } else {
      await replyMessage(replyToken, [{
        type: "text",
        text: "目前還沒有建立幹部資料喔！敬請期待。\n─────────────\nOfficer data not set up yet. Stay tuned!",
      }]);
    }
  } catch (err: unknown) {
    const errString = err instanceof Error ? err.message : String(err);
    await replyMessage(replyToken, [{
      type: "text",
      text: `查詢幹部名冊失敗：${errString}\n─────────────\nFailed to fetch officers: ${errString}`,
    }]);
  }
}

async function handleSignup(
  replyToken: string,
  userId: string,
  eventId: string
): Promise<void> {
  const prefLang = await getUserPreferredLanguage(userId);
  const frontendUrl = Deno.env.get("FRONTEND_WEB_URL") || "https://equipments-seven.vercel.app";
  const signupId = generateSignupId();

  const client = getSupabaseAdminClient();

  const { data: result, error } = await client.rpc("signup_rpc", {
    p_event_id: eventId,
    p_line_user_id: userId,
    p_signup_id: signupId,
  });

  if (error || !result) {
    const errString = error ? error.message : "RPC returned empty response";
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.signupSystemBusy(errString), prefLang),
    }]);
    return;
  }

  const status = result.status;
  if (status === "ok") {
    const actualSignupId = result.signup_id || signupId;
    const title = prefLang === "en"
      ? (result.event_title_en || result.event_title || "Event")
      : (result.event_title || "活動");
    const fee = result.fee || 0;
    const isOfficial = Boolean(result.is_official_member);

    // 非同步呼叫 GAS Worker 追加活動獨立試算表名冊 (失敗不影響回覆)
    const workerUrl = Deno.env.get("GAS_WORKER_URL");
    const workerSecret = Deno.env.get("GAS_WORKER_SECRET");
    if (workerUrl && workerSecret && result.spreadsheet_id) {
      fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": workerSecret,
        },
        body: JSON.stringify({
          action: "append_event_sheet",
          spreadsheet_id: result.spreadsheet_id,
          signup_id: actualSignupId,
          line_user_id: userId,
        }),
      }).catch((workerErr) => {
        console.warn("GAS worker append_event_sheet failed:", workerErr);
        recordWorkerFailure("append_event_sheet", { signup_id: actualSignupId, event_id: eventId }, String(workerErr));
      });
    }

    const memberName = result.member_name || result.name || (prefLang === "en" ? "Member" : "社員");

    await replyMessage(replyToken, [{
      type: "flex",
      altText: prefLang === "en" ? "Registration Submitted" : "報名登記已送出！",
      contents: buildSignupSuccessFlex({
        eventName: title,
        eventId: eventId,
        signupCode: actualSignupId,
        name: memberName,
      }, prefLang),
    }]);
    return;
  }

  if (status === "closed") {
    const evTitle = prefLang === "en"
      ? (result.event_title_en || result.event_title || "This event")
      : (result.event_title || "該活動");
    const evDeadline = formatTaipeiDate(result.deadline, "YYYY/MM/DD HH:mm") || result.deadline || "";
    const altText = prefLang === "en" ? `Registration Closed: ${evTitle}` : `活動報名已截止: ${evTitle}`;
    await replyMessage(replyToken, [{
      type: "flex",
      altText,
      contents: buildEventClosedFlex(evTitle, evDeadline, prefLang),
    }]);
    return;
  }

  if (status === "not_found") {
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.signupEventNotFound(eventId), prefLang),
    }]);
    return;
  }

  const registerLiffUrl = "https://liff.line.me/2009217429-AhPRqAHg";
  const dashboardLiffUrl = "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard";

  if (status === "not_found_member") {
    await replyMessage(replyToken, [{
      type: "flex",
      altText: prefLang === "en" ? "Registration Failed / Profile Required" : "報名失敗 / 需填寫資料",
      contents: buildMemberNotFoundFlex(registerLiffUrl, prefLang),
    }]);
    return;
  }

  if (status === "profile_incomplete") {
    const missingArr = Array.isArray(result.missing_fields)
      ? result.missing_fields
      : [];
    await replyMessage(replyToken, [{
      type: "flex",
      altText: prefLang === "en" ? "Registration Failed / Incomplete Profile" : "報名失敗 / 資料未完整",
      contents: buildProfileIncompleteFlex(missingArr, registerLiffUrl, prefLang),
    }]);
    return;
  }

  if (status === "profile_expired") {
    const reason = result.reason || "已超過 6 個月未更新";
    await replyMessage(replyToken, [{
      type: "flex",
      altText: prefLang === "en" ? "Registration Notice / Profile Update Required" : "報名提醒 / 經歷時效更新",
      contents: buildProfileExpiredFlex(reason, dashboardLiffUrl, prefLang),
    }]);
    return;
  }

  if (status === "duplicate") {
    const title = prefLang === "en"
      ? (result.event_title_en || result.event_title || "Event")
      : (result.event_title || "活動");
    await replyMessage(replyToken, [{
      type: "text",
      text: render(messages.signupDuplicate(title), prefLang),
    }]);
    return;
  }

  await replyMessage(replyToken, [{
    type: "text",
    text: render(messages.signupSystemBusy(result.message || "未知錯誤"), prefLang),
  }]);
}

async function handleConfirmWaitlist(
  replyToken: string,
  userId: string,
  params: Record<string, string>
): Promise<void> {
  const prefLang = await getUserPreferredLanguage(userId);
  const eventId = params.eventId || params.id || "";

  if (!eventId) {
    const errReason = prefLang === "en" ? "Missing Event ID" : "缺少活動代號";
    const altText = prefLang === "en" ? "Registration Failed" : "登記失敗";
    await replyMessage(replyToken, [{
      type: "flex",
      altText,
      contents: buildWaitlistFailedFlex(errReason, prefLang),
    }]);
    return;
  }

  const client = getSupabaseAdminClient();
  const { data: event } = await client
    .from("events")
    .select("title,title_en")
    .eq("id", eventId)
    .maybeSingle();

  const title = event
    ? (prefLang === "en" ? (event.title_en || event.title || "Event") : (event.title || "活動"))
    : (prefLang === "en" ? "Event" : "活動");

  const { error } = await client
    .from("event_signups")
    .update({
      status: "備取（有意願）Waitlisted (Interested)",
      updated_at: new Date().toISOString(),
    })
    .eq("line_user_id", userId)
    .eq("event_id", eventId);

  if (error) {
    const altText = prefLang === "en" ? "Registration Failed" : "登記失敗";
    await replyMessage(replyToken, [{
      type: "flex",
      altText,
      contents: buildWaitlistFailedFlex(error.message, prefLang),
    }]);
    return;
  }

  const altText = prefLang === "en" ? "Waitlist Interest Confirmed" : "備取意願已登記";
  await replyMessage(replyToken, [{
    type: "flex",
    altText,
    contents: buildWaitlistConfirmedFlex(title, prefLang),
  }]);
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

async function handleTextMessage(
  replyToken: string,
  userId: string,
  text: string,
  groupId: string,
  ev: LineWebhookEvent
): Promise<void> {
  const lowerText = text.toLowerCase();
  const targetGroupId = groupId || ev.source?.groupId || "";
  const isGroup = Boolean(targetGroupId || ev.source?.type === "group" || ev.source?.type === "room");

  const client = getSupabaseAdminClient();
  const { data: config } = await client
    .from("app_config")
    .select("value")
    .eq("key", "ADMIN_GROUP_ID")
    .maybeSingle();

  const adminGroupId = config?.value || "";
  const isAdminGroup = Boolean(targetGroupId && adminGroupId && targetGroupId === adminGroupId);

  const isAssistantMentioned = text.includes("@小岳助理") || text.includes("小岳助理");
  const tempWithoutAssistant = text.replace(/@?小岳助理/g, "");
  const isYueMentioned =
    tempWithoutAssistant.includes("@小岳") ||
    tempWithoutAssistant.includes("小岳") ||
    /\b@?yue\b/i.test(tempWithoutAssistant);

  // 守衛 3.1: 助理在非群組或非幹部群組靜默
  if (isAssistantMentioned) {
    const isBindAttempt = text.includes("綁定幹部群組") || text.includes("#bind_admin");
    if (!isGroup || (!isAdminGroup && !isBindAttempt)) {
      return;
    }
  }

  // 守衛 3.2: 群組防洗版
  if (isGroup && !isAssistantMentioned && !isYueMentioned) {
    return;
  }

  let cleanText = text;
  if (isAssistantMentioned) {
    cleanText = text
      .replace(/@\S+/g, "")
      .replace(/小岳助理/g, "")
      .replace(/助理/g, "")
      .replace(/^[\s,，:：]+/, "")
      .trim();
  } else if (isYueMentioned) {
    cleanText = tempWithoutAssistant
      .replace(/@\S+/g, "")
      .replace(/小岳/g, "")
      .replace(/\byue\b/gi, "")
      .replace(/^[\s,，:：]+/, "")
      .trim();
  }

  const queryText = (isAssistantMentioned || isYueMentioned) && cleanText ? cleanText : text;
  const lowerQueryText = queryText.toLowerCase();

  // 1. 綁定幹部群組
  const isBindCommand = queryText === "綁定幹部群組" || queryText === "#bind_admin" || text.includes("綁定幹部群組");
  if (isBindCommand) {
    const isOfficer = await isUserOfficer(userId);
    if (!isOfficer) {
      await replyMessage(replyToken, [{
        type: "text",
        text: "⚠️ 僅有社團幹部具備設定推播群組之權限。",
      }], true);
      return;
    }

    if (targetGroupId) {
      await setAppConfig("ADMIN_GROUP_ID", targetGroupId);
      await replyMessage(replyToken, [{
        type: "text",
        text: render(messages.bindAdminGroupSuccess(targetGroupId), "zh"),
      }], true);
    } else {
      await replyMessage(replyToken, [{
        type: "text",
        text: render(messages.bindAdminGroupOnlyInGroup(), "zh"),
      }], false);
    }
    return;
  }

  // 2. 幹部助理卡片
  if (
    (isAdminGroup &&
      isAssistantMentioned &&
      (cleanText === "" ||
        cleanText === "幹部系統" ||
        cleanText === "嗨" ||
        cleanText === "哈囉" ||
        cleanText.toLowerCase() === "hi" ||
        cleanText.toLowerCase() === "hello")) ||
    (isAdminGroup && text.includes("幹部系統"))
  ) {
    await replyMessage(replyToken, [{
      type: "flex",
      altText: "幹部專屬助理 小岳使用指南",
      contents: buildAdminAssistantGuideFlex(),
    }], true);
    return;
  }

  // 3. 最新活動
  if (
    text.includes("最新活動") ||
    lowerText.includes("activi") ||
    queryText.includes("最新活動") ||
    lowerQueryText.includes("activi") ||
    text.includes("報名活動") ||
    queryText.includes("報名活動") ||
    lowerText === "events" ||
    lowerQueryText === "events"
  ) {
    await sendEventList(replyToken, userId);
    return;
  }

  // 4. 更多服務
  if (text === "更多服務 More Services" || text === "更多服務" || queryText === "更多服務") {
    await replyMessage(replyToken, [{
      type: "flex",
      altText: "更多服務 More Services",
      contents: buildMoreServicesFlex(),
    }]);
    return;
  }

  // 5. 幹部名單
  if (text.includes("幹部是誰") || text.includes("幹部名單") || lowerText.includes("officers")) {
    await sendOfficerMenu(replyToken);
    return;
  }

  // 6. 意見回饋
  if (text.includes("意見回饋") || lowerText.includes("feedback")) {
    const prefLang = await getUserPreferredLanguage(userId);
    await replyMessage(replyToken, [{
      type: "flex",
      altText: "意見回饋與建議 / Feedback",
      contents: buildFeedbackFlex(prefLang),
    }]);
    return;
  }

  // 7. 小岳說明 / AI Guide
  if (
    text.includes("小岳說明") ||
    text.includes("小岳指南") ||
    lowerText.includes("ai guide") ||
    text.includes("小岳說明 AI Guide")
  ) {
    const prefLang = await getUserPreferredLanguage(userId);
    await replyMessage(replyToken, [{
      type: "flex",
      altText: "小岳 AI 客服使用指南 / Yue AI Guide",
      contents: buildAiGuideFlex(prefLang),
    }]);
    return;
  }

  // 8. 社員全方位使用指南
  if (
    text.includes("使用指南") ||
    text.includes("操作指南") ||
    text.includes("用戶手冊") ||
    text.includes("社員指南") ||
    lowerText.includes("member guide") ||
    lowerText.includes("user guide")
  ) {
    const prefLang = await getUserPreferredLanguage(userId);
    await replyMessage(replyToken, [{
      type: "flex",
      altText: "台科登山社 社員使用指南 / Member Guide",
      contents: buildMemberGuideFlex(prefLang),
    }]);
    return;
  }

  // 9. Gemini AI 客服
  if (isYueMentioned) {
    const prefLang = await getUserPreferredLanguage(userId);
    if (!cleanText) {
      await replyMessage(replyToken, [{
        type: "text",
        text: render(messages.welcomeAi(), prefLang),
      }]);
      return;
    }

    const aiRes = await handleGeminiChat(userId, cleanText);
    if (aiRes.success && aiRes.reply) {
      await replyMessage(replyToken, [{
        type: "text",
        text: aiRes.reply,
      }]);
    } else {
      const errReason = aiRes.error || "連線逾時或模型無回應 (Timeout or No Response)";
      await replyMessage(replyToken, [{
        type: "text",
        text: render(messages.geminiBusyFallback(errReason), prefLang),
      }]);
    }
    return;
  }

  // 11. 其餘情況保持完全靜默
}

async function handlePostback(
  replyToken: string,
  userId: string,
  postbackData: string
): Promise<void> {
  const params: Record<string, string> = {};
  const parts = postbackData.split("&");
  for (const part of parts) {
    const pair = part.split("=");
    if (pair.length === 2) {
      params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
  }

  const action = params.action;
  const eventId = params.eventId || (parts.length > 1 && parts[1].includes("=") ? parts[1].split("=")[1] : "");

  if (action === "view" || action === "view_event_detail") {
    await sendEventDetail(replyToken, eventId, userId);
    return;
  }

  if (action === "signup") {
    await handleSignup(replyToken, userId, eventId);
    return;
  }

  if (action === "confirm_waitlist") {
    await handleConfirmWaitlist(replyToken, userId, params);
    return;
  }

  if (action === "confirm_bind_admin_group") {
    const newGroupId = params.targetId || eventId;
    if (newGroupId) {
      const isOfficer = await isUserOfficer(userId);
      if (isOfficer) {
        await setAppConfig("ADMIN_GROUP_ID", newGroupId);
        await replyMessage(replyToken, [{
          type: "text",
          text: "✅ 已成功將此群組設定為【幹部管理推播群組】！",
        }]);
      }
    }
    return;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signature = req.headers.get("x-line-signature") || req.headers.get("X-Line-Signature");
  const memberSecret = Deno.env.get("MEMBER_BOT_SECRET") || "";
  const adminSecret = Deno.env.get("ADMIN_BOT_SECRET") || "";
  const generalSecret = Deno.env.get("LINE_CHANNEL_SECRET") || "";
  const availableSecrets = [memberSecret, adminSecret, generalSecret].filter((s) => Boolean(s && s.trim()));

  const rawBody = await req.text();

  if (availableSecrets.length === 0) {
    console.error("[line-webhook] 500 伺服器配置錯誤：缺少 LINE Webhook Channel Secret (MEMBER_BOT_SECRET / ADMIN_BOT_SECRET / LINE_CHANNEL_SECRET)，拒絕處理未經校驗之請求。");
    return new Response("Server configuration error: missing webhook secrets", { status: 500 });
  }

  let isValid = false;
  for (const secret of availableSecrets) {
    if (await validateSignature(rawBody, signature, secret)) {
      isValid = true;
      break;
    }
  }
  if (!isValid) {
    console.warn("[line-webhook] 401 拒絕存取：LINE Webhook 簽章驗證未通過。請確認 Supabase Secrets 中的 MEMBER_BOT_SECRET / ADMIN_BOT_SECRET 是否與 LINE 頻道 Channel secret 一致。");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch (parseErr) {
    console.error("[line-webhook] JSON 解析異常:", parseErr);
    return new Response("Bad Request", { status: 400 });
  }

  if (!payload.events || !Array.isArray(payload.events)) {
    return new Response("OK", { status: 200 });
  }

  const client = getSupabaseAdminClient();

  for (const ev of payload.events) {
    console.log(`[line-webhook] 收到事件: type=${ev.type}, user=${ev.source?.userId}, message=${ev.message?.text || ev.postback?.data || ""}`);
    const webhookEventId = ev.webhookEventId;
    if (webhookEventId) {
      const { error } = await client.from("webhook_events").insert({
        webhook_event_id: webhookEventId,
      });
      if (error && error.code === "23505") {
        console.log(`[line-webhook] 重複事件 (${webhookEventId})，已自動去重略過`);
        continue;
      }
    }

    const replyToken = ev.replyToken;
    const userId = ev.source?.userId || "";
    const groupId = ev.source?.groupId || "";

    if (ev.type === "message" && ev.message?.type === "text" && replyToken) {
      const text = ev.message.text ? ev.message.text.trim() : "";
      await handleTextMessage(replyToken, userId, text, groupId, ev);
    } else if (ev.type === "postback" && ev.postback?.data && replyToken) {
      await handlePostback(replyToken, userId, ev.postback.data);
    }
  }

  return new Response("OK", { status: 200 });
});
