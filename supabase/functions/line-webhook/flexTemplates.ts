import { EventRecord, PreferredLanguage } from "../_shared/types.ts";
import { formatTaipeiDate, formatEventDate, isEventExpired } from "../_shared/dateUtils.ts";
import { isEventFuture, isEventOpen } from "../_shared/statusUtils.ts";

export function buildEventListFlex(
  events: EventRecord[],
  signupCounts: Record<string, number>,
  prefLang: PreferredLanguage
) {
  const bubbles = [];
  const now = new Date();

  for (const ev of events) {
    const rawStatus = (ev.status || "").trim().toLowerCase();
    const isClosed =
      rawStatus.includes("關閉") ||
      rawStatus.includes("closed") ||
      rawStatus.includes("draft") ||
      rawStatus.includes("草稿");

    if (isClosed) continue;

    // 結束超過 14 天不顯示
    const targetEndDateStr = ev.end_date || ev.start_date;
    if (targetEndDateStr) {
      const endD = new Date(targetEndDateStr);
      if (!isNaN(endD.getTime()) && now.getTime() - endD.getTime() > 14 * 86400000) {
        continue;
      }
    }

    const isFuture = isEventFuture(ev.status);
    const isOpen = isEventOpen(ev.status, ev.deadline);

    const eventId = ev.id || "";
    const eventNameZh = ev.title || "未命名活動";
    const eventNameEn = ev.title_en || eventNameZh;
    const hasEnglish = Boolean(ev.title_en || ev.summary_en);

    const eventName =
      prefLang === "en"
        ? eventNameEn
        : prefLang === "zh"
        ? eventNameZh
        : hasEnglish
        ? `${eventNameZh} ${eventNameEn}`
        : eventNameZh;

    const tagColor = isFuture ? "#FF9800" : isOpen ? "#1DB446" : "#999999";
    const displayStatusZh = isFuture ? "未來開放" : isOpen ? "開放" : "報名截止";
    const displayStatusEn = isFuture ? "Coming Soon" : isOpen ? "Open" : "Reg. Closed";
    const displayStatus =
      prefLang === "en"
        ? displayStatusEn
        : prefLang === "zh"
        ? displayStatusZh
        : `${displayStatusZh} ${displayStatusEn}`;

    const regCount = signupCounts[eventId] || 0;
    const regCountStrZh = `已報名：${regCount} 人`;
    const regCountStrEn = `Registered: ${regCount}`;
    const regCountDisplay =
      prefLang === "en"
        ? regCountStrEn
        : prefLang === "zh"
        ? regCountStrZh
        : `${regCountStrZh} / ${regCountStrEn}`;

    const costStrZh = ev.fee > 0 ? `$${ev.fee}` : "免費";
    const costStrEn = ev.fee > 0 ? `$${ev.fee}` : "Free";
    const costStr =
      prefLang === "en"
        ? costStrEn
        : prefLang === "zh"
        ? costStrZh
        : ev.fee > 0
        ? `$${ev.fee}`
        : "免費 Free";

    const costLabel = prefLang === "en" ? "Cost: " : prefLang === "zh" ? "費用: " : "費用 Cost: ";
    const dateLabel = prefLang === "en" ? "Event Date:" : prefLang === "zh" ? "活動時間:" : "活動時間 Event Date:";
    const deadlineLabel = prefLang === "en" ? "Sign Up Deadline:" : prefLang === "zh" ? "報名截止:" : "報名截止 Sign Up Deadline:";
    const viewBtnLabel = prefLang === "en" ? "View Details" : prefLang === "zh" ? "查看詳情" : "查看詳情 View";

    const viewDisplayText =
      prefLang === "en"
        ? `I want to view details for ${eventNameEn}`
        : prefLang === "zh"
        ? `我想查看 ${eventNameZh} 的資訊`
        : `我想查看 ${hasEnglish ? `${eventNameZh} / ${eventNameEn}` : eventNameZh} 的資訊 / I want to view details`;

    const summaryText =
      prefLang === "en"
        ? ev.summary_en || ev.summary || ""
        : prefLang === "zh"
        ? ev.summary || ""
        : hasEnglish
        ? `${ev.summary || ""}\n─────────────\n${ev.summary_en || ""}`
        : ev.summary || "";

    const dateDisplay = formatEventDate(ev.start_date, ev.end_date);
    const deadlineFormatted = formatTaipeiDate(ev.deadline, "YYYY/MM/DD");

    const bubble: Record<string, unknown> = {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: displayStatus,
                weight: "bold",
                color: tagColor,
                size: "sm",
                flex: 0,
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#f0f9ff",
                cornerRadius: "md",
                paddingStart: "sm",
                paddingEnd: "sm",
                paddingTop: "xs",
                paddingBottom: "xs",
                flex: 0,
                contents: [
                  {
                    type: "text",
                    text: regCountDisplay,
                    size: "xs",
                    color: "#0284c7",
                    weight: "bold",
                    flex: 0,
                  },
                ],
              },
            ],
          },
          {
            type: "text",
            text: eventName,
            weight: "bold",
            size: "xl",
            margin: "sm",
            wrap: true,
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: costLabel + costStr,
                size: "sm",
                color: "#666666",
                weight: "bold",
              },
              {
                type: "text",
                text: dateLabel,
                size: "sm",
                color: "#666666",
                margin: "sm",
              },
              {
                type: "text",
                text: dateDisplay,
                size: "sm",
                color: "#1DB446",
                weight: "bold",
              },
              {
                type: "text",
                text: deadlineLabel,
                size: "sm",
                color: "#666666",
                margin: "sm",
              },
              {
                type: "text",
                text: deadlineFormatted,
                size: "sm",
                color: "#E53935",
                weight: "bold",
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: summaryText,
            size: "sm",
            color: "#999999",
            margin: "md",
            wrap: true,
            maxLines: 3,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: viewBtnLabel,
              data: `action=view&eventId=${eventId}`,
              displayText: viewDisplayText,
            },
          },
        ],
      },
    };

    const imageUrl = (ev.cover_image_url || "").trim();
    if (imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
      bubble.hero = {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      };
    }

    bubbles.push(bubble);
  }

  return bubbles;
}

export function buildEventDetailFlex(
  ev: EventRecord,
  regCount: number,
  prefLang: PreferredLanguage
) {
  const eventNameZh = ev.title || "未命名活動";
  const eventNameEn = ev.title_en || eventNameZh;
  const hasEnglish = Boolean(ev.title_en || ev.summary_en || ev.itinerary_en);

  const eventName =
    prefLang === "en"
      ? eventNameEn
      : prefLang === "zh"
      ? eventNameZh
      : hasEnglish
      ? `${eventNameZh}\n${eventNameEn}`
      : ev.title;

  const isFuture = isEventFuture(ev.status);
  const isOpen = isEventOpen(ev.status, ev.deadline);
  const isExpired = isEventExpired(ev.deadline);

  const costStr =
    ev.fee > 0
      ? `$${ev.fee}`
      : prefLang === "en"
      ? "Free"
      : prefLang === "zh"
      ? "免費"
      : "免費 Free";

  const dateDisplay = formatEventDate(ev.start_date, ev.end_date);
  const deadlineFormatted = formatTaipeiDate(ev.deadline, "YYYY/MM/DD");

  const costLabel = prefLang === "en" ? "Cost: " : prefLang === "zh" ? "費用: " : "費用 Cost: ";
  const dateLabel = prefLang === "en" ? "Event Date: " : prefLang === "zh" ? "活動時間: " : "活動時間 Event Date: ";
  const deadlineLabel = prefLang === "en" ? "Sign Up Deadline: " : prefLang === "zh" ? "報名截止: " : "報名截止 Deadline: ";

  const titleTag = prefLang === "en" ? "【Title】" : prefLang === "zh" ? "【名稱】" : "【名稱 Title】";
  const summaryTag = prefLang === "en" ? "【Summary】" : prefLang === "zh" ? "【簡介】" : "【簡介 Summary】";
  const itineraryTag = prefLang === "en" ? "【Detailed Itinerary】" : prefLang === "zh" ? "【詳細行程】" : "【詳細行程 Detailed Itinerary】";

  const regCountStrZh = `已報名：${regCount} 人`;
  const regCountStrEn = `Registered: ${regCount}`;
  const regCountDisplay =
    prefLang === "en"
      ? regCountStrEn
      : prefLang === "zh"
      ? regCountStrZh
      : `${regCountStrZh} / ${regCountStrEn}`;

  const summaryZh = ev.summary || "尚無簡介";
  const summaryEn = ev.summary_en || ev.summary || "No summary";
  const summaryContent =
    prefLang === "en"
      ? summaryEn
      : prefLang === "zh"
      ? summaryZh
      : hasEnglish
      ? `${summaryZh}\n─────────────\n${summaryEn}`
      : summaryZh;

  const fullDescZh = ev.itinerary || "尚無詳細行程";
  const fullDescEn = ev.itinerary_en || ev.itinerary || "No detailed itinerary";
  const fullDescContent =
    prefLang === "en"
      ? fullDescEn
      : prefLang === "zh"
      ? fullDescZh
      : hasEnglish
      ? `${fullDescZh}\n─────────────\n${fullDescEn}`
      : fullDescZh;

  let buttonBox: Record<string, unknown>;
  if (isOpen) {
    const signupBtnLabel = prefLang === "en" ? "Sign Up" : prefLang === "zh" ? "一鍵報名" : "一鍵報名 Sign Up";
    const signupDisplayText =
      prefLang === "en"
        ? `Sign up for: ${eventNameEn}`
        : prefLang === "zh"
        ? `我要報名：${eventNameZh}`
        : `我要報名 Sign up for: ${hasEnglish ? eventNameEn : eventNameZh}`;

    buttonBox = {
      type: "button",
      style: "primary",
      color: "#1DB446",
      action: {
        type: "postback",
        label: signupBtnLabel,
        data: `action=signup&eventId=${ev.id}`,
        displayText: signupDisplayText,
      },
    };
  } else {
    const closedLabelZh = isFuture ? "即將開放" : isExpired ? "報名已截止" : "尚未開放";
    const closedLabelEn = isFuture ? "Coming Soon" : isExpired ? "Closed" : "Not Open";
    const closedLabel =
      prefLang === "en"
        ? closedLabelEn
        : prefLang === "zh"
        ? closedLabelZh
        : isFuture
        ? "即將開放 Coming Soon"
        : isExpired
        ? "報名已截止 Closed"
        : "尚未開放 Not Open";

    buttonBox = {
      type: "button",
      style: "secondary",
      color: "#CCCCCC",
      action: {
        type: "message",
        label: closedLabel,
        text: `${prefLang === "en" ? eventNameEn : eventNameZh} ${closedLabel}`,
      },
    };
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: titleTag,
              weight: "bold",
              size: "sm",
              color: "#1DB446",
              flex: 0,
            },
            {
              type: "box",
              layout: "horizontal",
              backgroundColor: "#f0f9ff",
              cornerRadius: "md",
              paddingStart: "sm",
              paddingEnd: "sm",
              paddingTop: "xs",
              paddingBottom: "xs",
              flex: 0,
              contents: [
                {
                  type: "text",
                  text: regCountDisplay,
                  size: "xs",
                  color: "#0284c7",
                  weight: "bold",
                  flex: 0,
                },
              ],
            },
          ],
        },
        {
          type: "text",
          text: eventName,
          weight: "bold",
          size: "lg",
          wrap: true,
          margin: "xs",
        },
        {
          type: "text",
          text: summaryTag,
          weight: "bold",
          size: "sm",
          color: "#1DB446",
          margin: "lg",
        },
        {
          type: "text",
          text: summaryContent,
          size: "sm",
          color: "#555555",
          wrap: true,
          margin: "xs",
        },
        {
          type: "text",
          text: itineraryTag,
          weight: "bold",
          size: "sm",
          color: "#1DB446",
          margin: "lg",
        },
        {
          type: "text",
          text: fullDescContent,
          size: "sm",
          color: "#555555",
          wrap: true,
          margin: "xs",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "xl",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: costLabel + costStr,
              size: "sm",
              color: "#666666",
              weight: "bold",
            },
            {
              type: "text",
              text: dateLabel + dateDisplay,
              size: "sm",
              color: "#1DB446",
              weight: "bold",
            },
            {
              type: "text",
              text: deadlineLabel + deadlineFormatted,
              size: "sm",
              color: "#E53935",
              weight: "bold",
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [buttonBox],
    },
  };

  const imageUrl = (ev.cover_image_url || "").trim();
  if (imageUrl.startsWith("http") && !imageUrl.includes("drive.google.com")) {
    bubble.hero = {
      type: "image",
      url: imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }

  return bubble;
}

export function buildMoreServicesFlex() {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "聯絡與支援 Support",
          weight: "bold",
          color: "#0367D3",
          size: "sm",
        },
        {
          type: "text",
          text: "幫助中心 Help Center",
          weight: "bold",
          size: "xl",
          margin: "md",
        },
        {
          type: "text",
          text: "聯絡社團幹部 Contact Officers",
          size: "xs",
          color: "#999999",
          margin: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "社員使用指南 Member Guide",
            text: "使用指南",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "小岳說明 AI Guide",
            text: "小岳說明 AI Guide",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "幹部是誰 Officers",
            text: "幹部是誰 Officers",
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "意見回饋 Feedback",
            text: "意見回饋 Feedback",
          },
        },
      ],
    },
  };
}

export function buildOfficerMenuFlex(
  officers: Array<{ name: string; role: string; responsibilities: string; photo_url?: string | null }>
) {
  const bubbles = [];
  for (const off of officers.slice(0, 10)) {
    const bubble: Record<string, unknown> = {
      type: "bubble",
      size: "micro",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: off.role || "幹部 Officer",
            weight: "bold",
            color: "#0367D3",
            size: "sm",
          },
          {
            type: "text",
            text: off.name,
            weight: "bold",
            size: "xl",
            margin: "sm",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "text",
            text: "負責業務 Responsibilities",
            size: "xxs",
            color: "#999999",
            margin: "md",
          },
          {
            type: "text",
            text: off.responsibilities || "協助社團各項事務與出隊帶領 Assist with club affairs",
            size: "xs",
            color: "#333333",
            wrap: true,
            margin: "xs",
          },
        ],
      },
    };

    if (off.photo_url && (off.photo_url.startsWith("http://") || off.photo_url.startsWith("https://"))) {
      bubble.hero = {
        type: "image",
        url: off.photo_url,
        size: "full",
        aspectRatio: "1:1",
        aspectMode: "cover",
      };
    }
    bubbles.push(bubble);
  }

  return bubbles;
}

export function buildAiGuideFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Yue AI Assistant Guide" : "小岳 (Yue) AI 客服使用指南";
  const subtitle = isEn ? "NTUST Hiking Club Smart Assistant" : "台科登山社智慧助理";
  const secTitle = isEn ? "How to Use in Chat" : "個人聊天室使用方式";
  const desc1 = isEn ? "• Start your question with \"Yue\" or \"小岳\"." : "• 請輸入「小岳」或「Yue」開頭加上問題即可。";
  const desc2 = isEn ? "• Examples: \"Yue How high is Yushan?\", \"Yue How to choose a sleeping bag?\"" : "• 例如：「小岳 玉山有多高？」、「Yue 登山睡袋怎麼挑選？」";
  const desc3 = isEn ? "• Note: Messages without the prefix will be handled directly by club officers." : "• 提醒：若未加上「小岳」或「Yue」，訊息將保留給幹部親自回覆。";
  const bottomTip = isEn ? "To join hikes, rent gear, or check your dashboard, please use the Rich Menu below." : "若需報名活動、租借裝備或查看個人訂單，歡迎直接點擊下方圖文選單。";

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
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
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
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: secTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: desc1,
              size: "xs",
              color: "#374151",
              wrap: true,
            },
            {
              type: "text",
              text: desc2,
              size: "xs",
              color: "#6B7280",
              wrap: true,
            },
            {
              type: "text",
              text: desc3,
              size: "xs",
              color: "#9CA3AF",
              wrap: true,
            },
          ],
        },
        {
          type: "separator",
        },
        {
          type: "text",
          text: bottomTip,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
      ],
    },
  };
}

export function buildMemberGuideFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Member Guide" : "台科登山社 社員使用指南";
  const subtitle = isEn ? "NTUST Hiking Club System Manual" : "官方帳號與系統操作指引";
  const navTitle = isEn ? "3 Navigation Methods" : "三大頁面切換途徑";
  const nav1 = isEn ? "1. Bottom Rich Menu: 6 main buttons in the LINE chat window." : "1. 底部圖文選單 (Rich Menu)：聊天室下方 6 大常駐按鈕。";
  const nav2 = isEn ? "2. Top-Right Profile Menu: Tap your avatar on any webpage to switch pages." : "2. 網頁頂部頭貼選單：點擊右上角 LINE 頭像即可快速切換。";
  const nav3 = isEn ? "3. In-Page Shortcuts: Quick jump to payment for pending dues, or submit hike reflections after trips." : "3. 頁面內捷徑：未繳費項目一鍵前往繳費，出隊完一鍵填寫心得。";

  const featTitle = isEn ? "6 Core Features" : "六大核心功能";
  const feat1 = isEn ? "• Profile: Complete mandatory fields before joining hikes or renting gear." : "• 個人資料：首次使用請務必補齊必填欄位。";
  const feat2 = isEn ? "• Events: Browse upcoming hikes and sign up online." : "• 最新活動：瀏覽活動詳情與登記報名。";
  const feat3 = isEn ? "• Gear Loan: 50% discount for club members." : "• 裝備租借：社員專屬租金 5 折優惠！";
  const feat4 = isEn ? "• Payment: Multi-item consolidated payment declaration with bank last 5 digits." : "• 繳費申報：多筆費用合併申報，填寫末五碼。";
  const feat5 = isEn ? "• Dashboard: Real-time track your signups, gear bookings, and pending fees." : "• 個人主頁：掌握活動審核、借裝進度與待繳費用。";
  const feat6 = isEn ? "• Reflections & Badges: Collect footprints and share your hiking reflections." : "• 成就與心得：累積出隊足跡並填寫回饋。";

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
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
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
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: navTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: nav1,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: nav2,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: nav3,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
          ],
        },
        {
          type: "separator",
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: featTitle,
              weight: "bold",
              size: "sm",
              color: "#047857",
            },
            {
              type: "text",
              text: feat1,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat2,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat3,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat4,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat5,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
            {
              type: "text",
              text: feat6,
              size: "xs",
              color: "#4B5563",
              wrap: true,
            },
          ],
        },
      ],
    },
  };
}

export function buildFeedbackFlex(prefLang: PreferredLanguage) {
  const isEn = prefLang === "en";
  const title = isEn ? "Feedback & Suggestions" : "意見回饋與建議";
  const subtitle = isEn ? "NTUST Hiking Club User Feedback" : "台科登山社使用者回饋";
  const desc1 = isEn
    ? "Whether you have suggestions for the club, event ideas, questions, or bug reports (screenshots supported), we would love to hear from you!"
    : "無論是想對社團說的話、活動建議、問題詢問，還是回報系統錯誤 (可附截圖)，都歡迎透過表單告訴我們！";
  const desc2 = isEn
    ? "After receiving your feedback, our club officers will review and follow up as soon as possible."
    : "收到您的回饋後，幹部會盡快查看並處理。";
  const btnLabel = isEn ? "Open Feedback Form" : "開啟回饋表單";
  const googleFormUrl = "https://forms.gle/bCT7fjVP3bSrReF96";

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
          text: title,
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
          wrap: true,
        },
        {
          type: "text",
          text: subtitle,
          size: "xs",
          color: "#A7F3D0",
          margin: "xs",
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
          text: desc1,
          size: "sm",
          color: "#374151",
          wrap: true,
        },
        {
          type: "text",
          text: desc2,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: {
            type: "uri",
            label: btnLabel,
            uri: googleFormUrl,
          },
        },
      ],
    },
  };
}

const FIELD_ZH_MAP: Record<string, string> = {
  "姓名": "姓名",
  "姓名 Name": "姓名",
  "name": "姓名",
  "性別": "性別",
  "性別 Gender": "性別",
  "gender": "性別",
  "身分證字號/居留證號": "身分證字號 / 居留證號",
  "身分證字號/居留證號 ID Card": "身分證字號 / 居留證號",
  "身分證/護照": "身分證字號 / 護照號碼",
  "id_card": "身分證字號 / 居留證號",
  "生日": "出生年月日",
  "生日 Birthday": "出生年月日",
  "birthday": "出生年月日",
  "聯絡電話": "聯絡電話",
  "聯絡電話 Phone": "聯絡電話",
  "phone": "聯絡電話",
  "系所": "就讀系所",
  "系所 Department": "就讀系所",
  "department": "就讀系所",
  "學號": "學校學號",
  "學號 Student ID": "學校學號",
  "student_id": "學校學號",
  "身分別": "身分別",
  "identity_status": "身分別",
  "現居地址": "現居通訊地址",
  "現居地址 Address": "現居通訊地址",
  "通訊地址": "現居通訊地址",
  "address": "現居通訊地址",
  "電子郵件": "電子郵件信箱",
  "電子郵件 Email": "電子郵件信箱",
  "email": "電子郵件信箱",
  "真實 LINE ID": "LINE ID",
  "line_id": "LINE ID",
  "緊急聯絡人姓名": "緊急聯絡人姓名",
  "緊急聯絡人姓名 Emergency Contact Name": "緊急聯絡人姓名",
  "emergency_contact_name": "緊急聯絡人姓名",
  "與緊急聯絡人關係": "與緊急聯絡人關係",
  "與緊急聯絡人關係 Relationship": "與緊急聯絡人關係",
  "emergency_contact_rel": "與緊急聯絡人關係",
  "緊急聯絡人電話": "緊急聯絡人電話",
  "緊急聯絡人電話 Emergency Phone": "緊急聯絡人電話",
  "emergency_contact_phone": "緊急聯絡人電話",
  "緊急聯絡人地址": "緊急聯絡人通訊地址",
  "緊急聯絡人地址 Emergency Address": "緊急聯絡人通訊地址",
  "緊急聯絡人現居地址": "緊急聯絡人通訊地址",
  "emergency_contact_address": "緊急聯絡人通訊地址",
  "爬山經歷": "爬山經歷",
  "爬山經歷 Outdoor Experience": "爬山經歷",
  "outdoor_experience": "爬山經歷",
  "體能自評": "體能狀況自評",
  "體能自評 Fitness Description": "體能狀況自評",
  "fitness_desc": "體能狀況自評",
  "體能證明": "體能證明相片",
  "體能證明照片": "體能證明相片",
  "體能證明照片 Proof Photos": "體能證明相片",
  "proof_urls": "體能證明相片",
};

const FIELD_EN_MAP: Record<string, string> = {
  "姓名": "Full Name",
  "姓名 Name": "Full Name",
  "name": "Full Name",
  "性別": "Gender",
  "性別 Gender": "Gender",
  "gender": "Gender",
  "身分證字號/居留證號": "National ID / ARC / Passport Number",
  "身分證字號/居留證號 ID Card": "National ID / ARC / Passport Number",
  "身分證/護照": "National ID / Passport Number",
  "id_card": "National ID / ARC / Passport Number",
  "生日": "Date of Birth",
  "生日 Birthday": "Date of Birth",
  "birthday": "Date of Birth",
  "聯絡電話": "Phone Number",
  "聯絡電話 Phone": "Phone Number",
  "phone": "Phone Number",
  "系所": "Department",
  "系所 Department": "Department",
  "department": "Department",
  "學號": "Student ID",
  "學號 Student ID": "Student ID",
  "student_id": "Student ID",
  "身分別": "Identity Status",
  "identity_status": "Identity Status",
  "現居地址": "Current Residential Address",
  "現居地址 Address": "Current Residential Address",
  "通訊地址": "Current Residential Address",
  "address": "Current Residential Address",
  "電子郵件": "Email Address",
  "電子郵件 Email": "Email Address",
  "email": "Email Address",
  "真實 LINE ID": "LINE ID",
  "line_id": "LINE ID",
  "緊急聯絡人姓名": "Emergency Contact Name",
  "緊急聯絡人姓名 Emergency Contact Name": "Emergency Contact Name",
  "emergency_contact_name": "Emergency Contact Name",
  "與緊急聯絡人關係": "Relationship with Emergency Contact",
  "與緊急聯絡人關係 Relationship": "Relationship with Emergency Contact",
  "emergency_contact_rel": "Relationship with Emergency Contact",
  "緊急聯絡人電話": "Emergency Contact Phone",
  "緊急聯絡人電話 Emergency Phone": "Emergency Contact Phone",
  "emergency_contact_phone": "Emergency Contact Phone",
  "緊急聯絡人地址": "Emergency Contact Address",
  "緊急聯絡人地址 Emergency Address": "Emergency Contact Address",
  "緊急聯絡人現居地址": "Emergency Contact Address",
  "emergency_contact_address": "Emergency Contact Address",
  "爬山經歷": "Hiking Experience",
  "爬山經歷 Outdoor Experience": "Hiking Experience",
  "outdoor_experience": "Hiking Experience",
  "體能自評": "Fitness Self-Assessment",
  "體能自評 Fitness Description": "Fitness Self-Assessment",
  "fitness_desc": "Fitness Self-Assessment",
  "體能證明": "Fitness Proof Photo",
  "體能證明照片": "Fitness Proof Photo",
  "體能證明照片 Proof Photos": "Fitness Proof Photo",
  "proof_urls": "Fitness Proof Photo",
};

export function buildMemberNotFoundFlex(liffUrl: string, prefLang?: PreferredLanguage) {
  const targetUrl = liffUrl || "https://liff.line.me/2009217429-AhPRqAHg";
  const bubbleZh = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#EA580C",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "報名失敗 / 需填寫資料", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "系統找不到您的社員資料！", weight: "bold", size: "md", color: "#0F172A", wrap: true },
        { type: "text", text: "請先點選單中的「填寫資料」完成註冊登記後再報名。\n（為了辦理入山平安保險與確保出隊安全）", size: "xs", color: "#475569", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#EA580C",
          height: "sm",
          action: { type: "uri", label: "前往填寫資料", uri: targetUrl },
        },
      ],
    },
  };

  const bubbleEn = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#EA580C",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "Registration Failed / Profile Required", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "Member Profile Not Found!", weight: "bold", size: "md", color: "#0F172A", wrap: true },
        { type: "text", text: "Please click 'Register' in the menu or tap the button below to complete your profile for mountain insurance and safety clearance.", size: "xs", color: "#475569", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#EA580C",
          height: "sm",
          action: { type: "uri", label: "Complete Profile Now", uri: targetUrl },
        },
      ],
    },
  };

  if (prefLang === "en") return bubbleEn;
  if (prefLang === "zh") return bubbleZh;
  return {
    type: "carousel",
    contents: [bubbleZh, bubbleEn],
  };
}

export function buildProfileIncompleteFlex(
  missingFields: string[],
  liffUrl: string,
  prefLang?: PreferredLanguage
) {
  const targetUrl = liffUrl || "https://liff.line.me/2009217429-AhPRqAHg";
  const missingZh = (missingFields || []).map(f => `• ${FIELD_ZH_MAP[f] || f.split(" ")[0] || f}`).join("\n");
  const missingEn = (missingFields || []).map(f => `• ${FIELD_EN_MAP[f] || f}`).join("\n");

  const bubbleZh = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#DC2626",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "報名失敗 / 資料未完整", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "您的個人資料尚不完整！", weight: "bold", size: "md", color: "#0F172A", wrap: true },
        { type: "text", text: "為了辦理平安保險與確保戶外活動安全，請先點擊下方按鈕補齊以下必填資訊：", size: "xs", color: "#475569", wrap: true },
        { type: "separator", margin: "sm" },
        { type: "text", text: missingZh || "• 必填資料未完整", size: "xs", color: "#DC2626", wrap: true, margin: "sm" },
        { type: "text", text: "完成資料更新後，再回來點擊一鍵報名。", size: "xxs", color: "#64748B", wrap: true, margin: "sm" },
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
          action: { type: "uri", label: "前往補齊資料", uri: targetUrl },
        },
      ],
    },
  };

  const bubbleEn = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#DC2626",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "Registration Failed / Incomplete Profile", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "Required Fields Missing", weight: "bold", size: "md", color: "#0F172A", wrap: true },
        { type: "text", text: "For insurance coverage and outdoor activity safety, please complete the following required fields:", size: "xs", color: "#475569", wrap: true },
        { type: "separator", margin: "sm" },
        { type: "text", text: missingEn || "• Incomplete Profile Fields", size: "xs", color: "#DC2626", wrap: true, margin: "sm" },
        { type: "text", text: "Once your profile is updated, return here to sign up with one click.", size: "xxs", color: "#64748B", wrap: true, margin: "sm" },
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
          action: { type: "uri", label: "Update Profile Now", uri: targetUrl },
        },
      ],
    },
  };

  return prefLang === "en" ? bubbleEn : bubbleZh;
}

export function buildProfileExpiredFlex(
  reason: string,
  liffUrl: string,
  prefLang?: PreferredLanguage
) {
  const targetUrl = liffUrl || "https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fdashboard";
  const isUnverified = reason.includes("未校驗") || reason.includes("unverified");
  const reasonZh = isUnverified
    ? "您的個人資料與體能紀錄尚未完成時效校驗（或查無最近更新紀錄）"
    : "您的個人資料與體能紀錄已超過 6 個月未更新";
  const reasonEn = isUnverified
    ? "Your profile and fitness records have an unverified update time or no recent records found"
    : "Your profile and fitness records have not been updated for over 6 months";

  const bubbleZh = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#D97706",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "報名提醒 / 經歷時效更新", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: `${reasonZh}！`, weight: "bold", size: "sm", color: "#D97706", wrap: true },
        { type: "text", text: "社團出團活動將依據您的「爬山經歷」與「體能狀況」進行審查與篩選。為了維護出隊安全並增加您的錄取機會，若近期有更豐富的登山紀錄或更佳的體能表現，請先前往更新個人資料後，再回到此處報名活動。", size: "xs", color: "#475569", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#D97706",
          height: "sm",
          action: { type: "uri", label: "前往更新資料", uri: targetUrl },
        },
      ],
    },
  };

  const bubbleEn = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#D97706",
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingStart: "16px",
      paddingEnd: "16px",
      contents: [
        { type: "text", text: "Registration Notice / Profile Update Required", color: "#FFFFFF", weight: "bold", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: `${reasonEn}!`, weight: "bold", size: "sm", color: "#D97706", wrap: true },
        { type: "text", text: "Club outings evaluate applications based on your hiking experience and fitness status. To ensure safety and boost your admission chances, please update your profile with your latest records before signing up!", size: "xs", color: "#475569", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#D97706",
          height: "sm",
          action: { type: "uri", label: "Update Profile Now", uri: targetUrl },
        },
      ],
    },
  };

  return prefLang === "en" ? bubbleEn : bubbleZh;
}

export function buildSignupSuccessFlex(
  params: {
    eventName: string;
    eventId: string;
    signupCode: string;
    name: string;
  },
  prefLang?: PreferredLanguage
) {
  const isEn = prefLang === "en";

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
            text: "Registration Submitted",
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
            text: `Dear ${params.name}, we have received your application.`,
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
                  { type: "text", text: "Event:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: params.eventName, size: "xs", color: "#0F172A", weight: "bold", flex: 7, wrap: true },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Event ID:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: params.eventId, size: "xs", color: "#0F172A", flex: 7 },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "Signup Code:", size: "xs", color: "#64748B", flex: 3 },
                  { type: "text", text: params.signupCode, size: "xs", color: "#059669", weight: "bold", flex: 7 },
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
                text: "【Important Reminder】",
                weight: "bold",
                size: "xs",
                color: "#0F172A",
              },
              {
                type: "text",
                text: "This stage is registration & review. Officers will evaluate qualifications, and admission status (Confirmed/Waitlisted) will be notified to you via this LINE account!",
                size: "xs",
                color: "#475569",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "【Fitness & Experience Reminder】",
                weight: "bold",
                size: "xs",
                color: "#0F172A",
              },
              {
                type: "text",
                text: "Admission is evaluated based on hiking experience and fitness. If you have newer hiking records or fitness proofs, remember to update them anytime on your Dashboard to boost your admission chances!",
                size: "xs",
                color: "#475569",
                wrap: true,
              },
            ],
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
          text: "報名登記已送出！",
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
          text: `${params.name}，我們收到您的報名資料囉～`,
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
                { type: "text", text: "活動：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: params.eventName, size: "xs", color: "#0F172A", weight: "bold", flex: 7, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "活動代號：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: params.eventId, size: "xs", color: "#0F172A", flex: 7 },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "報名專屬碼：", size: "xs", color: "#64748B", flex: 3 },
                { type: "text", text: params.signupCode, size: "xs", color: "#059669", weight: "bold", flex: 7 },
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
              text: "【重要提醒】",
              weight: "bold",
              size: "xs",
              color: "#0F172A",
            },
            {
              type: "text",
              text: "此階段為「報名登記與資格審核」，幹部將進行體能評估與篩選，最終錄取名單（正取/備取）將透過本帳號推播通知您！",
              size: "xs",
              color: "#475569",
              wrap: true,
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: "【體能與經歷更新說明】",
              weight: "bold",
              size: "xs",
              color: "#0F172A",
            },
            {
              type: "text",
              text: "社團出團會依據爬山經驗與體能進行評估，若有最新的登山紀錄或更佳體能證明，記得隨時至個人主頁更新資料，增加自己的錄取機會喔！",
              size: "xs",
              color: "#475569",
              wrap: true,
            },
          ],
        },
      ],
    },
  };
}

export function buildLoanStatusUpdatedFlex(
  params: {
    borrowerName: string;
    loanId: string;
    newStatus: string;
    pickupDate: string;
    returnDate: string;
    itemsSummary?: Array<{ name?: string; equipment_id?: string; quantity?: number }> | string;
  },
  prefLang?: PreferredLanguage
) {
  const isEn = prefLang === "en";

  let itemsTextZh = "";
  let itemsTextEn = "";
  if (Array.isArray(params.itemsSummary)) {
    itemsTextZh = params.itemsSummary
      .map(it => `• ${it.name || it.equipment_id || "裝備"} x ${it.quantity || 1}`)
      .join("\n");
    itemsTextEn = params.itemsSummary
      .map(it => `• ${it.name || it.equipment_id || "Equipment"} x ${it.quantity || 1}`)
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

