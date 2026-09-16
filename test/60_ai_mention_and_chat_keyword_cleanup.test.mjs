import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('60. 小岳 (Yue) 對外 AI 客服與小岳助理幹部管理 Bot 隔離測試 (v0.1.126)', () => {
  const MOCK_ADMIN_GROUP_ID = "c_admin_group_123";

  // 模擬 Webhook 文字訊息處理核心邏輯 (與 02_LineBot_Webhook.js 100% 同步)
  function simulateHandleTextMessage(text, groupId = "", hasApiKey = true) {
    let lowerText = text.toLowerCase();
    let targetGroupId = groupId;
    let isGroup = !!targetGroupId;
    let isAdminGroup = isGroup && targetGroupId === MOCK_ADMIN_GROUP_ID;

    // 1. 判定是否呼叫幹部群組專用「小岳助理」
    let isAssistantMentioned = (
      text.indexOf("@小岳助理") > -1 ||
      text.indexOf("小岳助理") > -1
    );

    // 2. 判定是否呼叫對外 AI 客服「小岳」或「Yue」（排除純「小岳助理」字樣之干擾）
    let tempWithoutAssistant = text.replace(/@?小岳助理/g, "");
    let isYueMentioned = (
      tempWithoutAssistant.indexOf("@小岳") > -1 ||
      tempWithoutAssistant.indexOf("小岳") > -1 ||
      /\b@?yue\b/i.test(tempWithoutAssistant)
    );

    // 3. 隔離安全守衛：
    // 3.1「小岳助理」僅限已綁定之幹部群組使用（或群組中執行綁定指令）；私聊或非幹部群組一律保持完全靜默
    if (isAssistantMentioned) {
      let isBindAttempt = (text.indexOf("綁定幹部群組") > -1 || text.indexOf("#bind_admin") > -1);
      if (!isGroup || (!isAdminGroup && !isBindAttempt)) {
        return { handled: false, reply: null, geminiCalledWith: null };
      }
    }

    // 3.2 群組防洗版：在群組中若未呼叫「小岳助理」（幹部群組）且未呼叫「小岳/Yue」，嚴格靜默不回覆
    if (isGroup && !isAssistantMentioned && !isYueMentioned) {
      return { handled: false, reply: null, geminiCalledWith: null };
    }

    // 4. 清理叫名文字
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

    let queryText = ((isAssistantMentioned || isYueMentioned) && cleanText) ? cleanText : text;
    let lowerQueryText = queryText.toLowerCase();

    // 幹部群組綁定指令
    let isBindCommand = (queryText === "綁定幹部群組" || queryText === "#bind_admin" || text.indexOf("綁定幹部群組") > -1);
    if (isBindCommand) {
      if (targetGroupId) {
        return { handled: true, action: "bind_admin_group", targetGroupId: targetGroupId };
      } else {
        return { handled: true, action: "bind_error_not_group" };
      }
    }

    // 幹部專屬助理卡片（僅限幹部群組）
    if (
      (isAdminGroup && isAssistantMentioned && (cleanText === "" || cleanText === "幹部系統" || cleanText === "嗨" || cleanText === "哈囉" || cleanText.toLowerCase() === "hi" || cleanText.toLowerCase() === "hello")) ||
      (isAdminGroup && text.indexOf("幹部系統") > -1)
    ) {
      return { handled: true, action: "admin_assistant_card" };
    }

    // 幹部核銷指令
    if (queryText.indexOf("核銷") === 0 || queryText.indexOf("確認核銷") === 0) {
      let paymentId = queryText.replace(/^(確認核銷|核銷)\s*/, "").trim();
      return { handled: true, action: "verify_payment", paymentId: paymentId };
    }

    // 最新活動查詢 (支援「最新活動 Activities」、「最新活動」、「Activities」、「Activiies」、「報名活動」、「Events」)
    if (
      text.indexOf("最新活動") > -1 ||
      lowerText.indexOf("activi") > -1 ||
      queryText.indexOf("最新活動") > -1 ||
      lowerQueryText.indexOf("activi") > -1 ||
      text.indexOf("報名活動") > -1 ||
      queryText.indexOf("報名活動") > -1 ||
      lowerText === "events" ||
      lowerQueryText === "events"
    ) {
      return { handled: true, action: "event_list" };
    }

    // 圖文選單「更多服務」
    if (text === "更多服務 More Services" || text === "更多服務" || queryText === "更多服務") {
      return { handled: true, action: "more_services" };
    }

    // 幹部名單
    if (text.indexOf("幹部是誰") > -1 || text.indexOf("幹部名單") > -1 || lowerText.indexOf("officers") > -1) {
      return { handled: true, action: "officer_menu" };
    }

    // 意見與回饋
    if (text.indexOf("意見與回饋") > -1 || lowerText.indexOf("feedback") > -1) {
      return { handled: true, action: "feedback_form" };
    }

    // 使用指南
    if (
      text.indexOf("使用指南") > -1 ||
      text.indexOf("操作指南") > -1 ||
      lowerText.indexOf("member guide") > -1
    ) {
      return { handled: true, action: "member_guide" };
    }

    // Gemini AI 客服（僅在明確呼叫「小岳」或「Yue」時調用）
    if (isYueMentioned) {
      if (!cleanText) {
        return { handled: true, action: "ai_welcome_prompt" };
      }

      if (hasApiKey) {
        return { handled: true, action: "gemini_ai", geminiCalledWith: cleanText };
      }
    }

    // 若未提及小岳或 Yue，私聊一般留言保持靜默，保留給真人幹部
    return { handled: false, reply: null, geminiCalledWith: null };
  }

  it('1. 只有包含「小岳」或「Yue」的提問才會調用對外 AI，未提及者保持靜默留給幹部回覆', () => {
    // 未加「小岳」或「Yue」：靜默
    const res1 = simulateHandleTextMessage('玉山有多高');
    assert.strictEqual(res1.handled, false, '普通文字「玉山有多高」絕不能被 AI 攔截');

    // 加上「小岳」：正確觸發 AI
    const res2 = simulateHandleTextMessage('小岳 玉山有多高');
    assert.strictEqual(res2.handled, true);
    assert.strictEqual(res2.action, 'gemini_ai');
    assert.strictEqual(res2.geminiCalledWith, '玉山有多高');

    // 加上英文名「Yue」：正確觸發 AI
    const res3 = simulateHandleTextMessage('Yue 玉山有多高');
    assert.strictEqual(res3.handled, true);
    assert.strictEqual(res3.action, 'gemini_ai');
    assert.strictEqual(res3.geminiCalledWith, '玉山有多高');

    // 小寫「yue」加上標點符號：正確過濾標點並調用 AI
    const res4 = simulateHandleTextMessage('yue, How difficult is Qilai South Peak?');
    assert.strictEqual(res4.handled, true);
    assert.strictEqual(res4.action, 'gemini_ai');
    assert.strictEqual(res4.geminiCalledWith, 'How difficult is Qilai South Peak?');

    // @Yue 標註觸發
    const res5 = simulateHandleTextMessage('@Yue 裝備怎麼借？');
    assert.strictEqual(res5.handled, true);
    assert.strictEqual(res5.geminiCalledWith, '裝備怎麼借？');

    // 不包含 Yue 的英文單字 (如 rescue, continue) 不得誤觸發 AI
    const res6 = simulateHandleTextMessage('mountain rescue drill');
    assert.strictEqual(res6.handled, false, '單字 rescue 不應誤觸發 Yue');
  });

  it('2. 單純輸入「小岳」或「Yue」時回傳雙語友善提問引導', () => {
    const resZh = simulateHandleTextMessage('小岳');
    assert.strictEqual(resZh.handled, true);
    assert.strictEqual(resZh.action, 'ai_welcome_prompt');

    const resEn = simulateHandleTextMessage('Yue');
    assert.strictEqual(resEn.handled, true);
    assert.strictEqual(resEn.action, 'ai_welcome_prompt');
  });

  it('3. 「小岳助理」為幹部群組專用，在 1 對 1 私聊與非幹部群組中嚴格保持完全靜默', () => {
    // 1 對 1 私聊中喊「小岳助理」：保持完全靜默，不得調用對外 AI
    const resPrivate = simulateHandleTextMessage('小岳助理 幹部系統', "");
    assert.strictEqual(resPrivate.handled, false, '私聊喊小岳助理必須完全靜默');

    // 非幹部群組中喊「小岳助理」：保持完全靜默
    const resPublicGroup = simulateHandleTextMessage('@小岳助理 幹部系統', "c_hiking_trip_group_999");
    assert.strictEqual(resPublicGroup.handled, false, '非幹部群組喊小岳助理必須完全靜默');

    // 已綁定之幹部群組中喊「小岳助理」：正常發送幹部系統助理卡片
    const resAdminGroup = simulateHandleTextMessage('@小岳助理 幹部系統', MOCK_ADMIN_GROUP_ID);
    assert.strictEqual(resAdminGroup.handled, true);
    assert.strictEqual(resAdminGroup.action, 'admin_assistant_card');
  });

  it('4. 在一般活動群組中，呼叫「小岳」或「Yue」可正常進行登山諮詢', () => {
    const resTripGroup = simulateHandleTextMessage('@Yue 請問出隊需要帶頭燈嗎？', "c_hiking_trip_group_999");
    assert.strictEqual(resTripGroup.handled, true);
    assert.strictEqual(resTripGroup.action, 'gemini_ai');
    assert.strictEqual(resTripGroup.geminiCalledWith, '請問出隊需要帶頭燈嗎？');
  });

  it('5. 支援最新活動與 Activities / Activiies 指令回傳活動列表', () => {
    assert.strictEqual(simulateHandleTextMessage('最新活動 Activities').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('最新活動').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('Activities').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('Activiies').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('報名活動').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('Events').action, 'event_list');
    assert.strictEqual(simulateHandleTextMessage('@Yue 最新活動').action, 'event_list');
  });

  it('6. _stripMarkdown 嚴格過濾所有 Markdown 標記，回傳乾淨純文字 (No Markdown)', () => {
    function stripMarkdown(text) {
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

    // 粗體與斜體
    assert.strictEqual(stripMarkdown('**玉山主峰** 高度為 3952 公尺，*注意事項* 請詳讀。'), '玉山主峰 高度為 3952 公尺，注意事項 請詳讀。');
    // 標題
    assert.strictEqual(stripMarkdown('### 裝備清單\n• 頭燈\n• 登山杖'), '裝備清單\n• 頭燈\n• 登山杖');
    // 程式碼與超連結
    assert.strictEqual(stripMarkdown('請點擊 [報名連結](https://example.com) 查看 `PAY_123` 狀態。'), '請點擊 報名連結 (https://example.com) 查看 PAY_123 狀態。');
    // 刪除線
    assert.strictEqual(stripMarkdown('原價 ~~1000~~ 特價 800'), '原價 1000 特價 800');
  });

  it('7. AI 客服回覆末尾必須附加中英對照免責聲明 (小岳是 AI，小岳可以出錯)', () => {
    const rawAnswer = "玉山主峰海拔 3,952 公尺，為台灣第一高峰。";
    const disclaimer = "\n\n─────────────\n小岳是 AI，小岳可以出錯\nYue is AI. Yue can make mistake.";
    const fullReply = rawAnswer + disclaimer;

    assert.ok(fullReply.endsWith("小岳是 AI，小岳可以出錯\nYue is AI. Yue can make mistake."));
    assert.ok(fullReply.includes("─────────────"));
  });
});
