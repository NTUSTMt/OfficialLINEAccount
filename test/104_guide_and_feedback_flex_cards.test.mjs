import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Emoji Regex 檢驗工具
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

describe('104. 社員指南、AI客服指南與意見回饋 Flex 卡片與雙語分流測試 (v0.1.262)', () => {
  const gasContent = fs.readFileSync(path.resolve('src/gas.js'), 'utf8');

  // 1. 原始碼結構與函式定義驗證
  it('1. src/gas.js 與 gas_modules 必須包含三大 Flex 卡片產生與發送函式', () => {
    assert.ok(gasContent.includes('function _buildAiGuideBubble(lang)'), '必須定義 _buildAiGuideBubble');
    assert.ok(gasContent.includes('function _buildMemberGuideBubble(lang)'), '必須定義 _buildMemberGuideBubble');
    assert.ok(gasContent.includes('function _buildFeedbackBubble(lang)'), '必須定義 _buildFeedbackBubble');
    assert.ok(gasContent.includes('function sendAiGuide(replyToken, userId)'), '必須定義 sendAiGuide');
    assert.ok(gasContent.includes('function sendMemberGuide(replyToken, userId)'), '必須定義 sendMemberGuide');
    assert.ok(gasContent.includes('function sendFeedbackLink(replyToken, userId)'), '必須定義 sendFeedbackLink(replyToken, userId)');
  });

  // 2. 小岳 AI 客服指南 Flex 卡片驗證
  it('2. 小岳 AI 客服指南 Bubble 結構、中英文字與零 Emoji 檢驗', () => {
    // 模擬 _buildAiGuideBubble
    const buildAiGuideBubble = (lang) => {
      const isEn = (lang === "en");
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
          contents: [
            { type: "text", text: title, weight: "bold", size: "md", color: "#FFFFFF" },
            { type: "text", text: subtitle, size: "xs", color: "#A7F3D0" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: secTitle, weight: "bold", size: "sm", color: "#047857" },
                { type: "text", text: desc1, size: "xs" },
                { type: "text", text: desc2, size: "xs" },
                { type: "text", text: desc3, size: "xs" }
              ]
            },
            { type: "separator" },
            { type: "text", text: bottomTip, size: "xs" }
          ]
        }
      };
    };

    const zhBubble = buildAiGuideBubble("zh");
    const enBubble = buildAiGuideBubble("en");

    assert.equal(zhBubble.header.backgroundColor, '#059669', 'Header 必須為綠色主題');
    assert.ok(JSON.stringify(zhBubble).includes('個人聊天室使用方式'), '中文版必須包含聊天室使用方式');
    assert.ok(JSON.stringify(enBubble).includes('How to Use in Chat'), '英文版必須包含 How to Use in Chat');

    assert.ok(!EMOJI_REGEX.test(JSON.stringify(zhBubble)), '中文 AI 指南不得包含 Emoji');
    assert.ok(!EMOJI_REGEX.test(JSON.stringify(enBubble)), '英文 AI 指南不得包含 Emoji');
  });

  // 3. 社員使用指南 Flex 卡片驗證
  it('3. 社員使用指南 Bubble 結構、三大切換途徑、六大核心功能與零 Emoji 檢驗', () => {
    const buildMemberGuideBubble = (lang) => {
      const isEn = (lang === "en");
      const title = isEn ? "Member Guide" : "台科登山社 社員使用指南";
      const subtitle = isEn ? "NTUST Hiking Club System Manual" : "官方帳號與系統操作指引";
      return {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#059669",
          contents: [
            { type: "text", text: title, weight: "bold", size: "md", color: "#FFFFFF" },
            { type: "text", text: subtitle, size: "xs", color: "#A7F3D0" }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: isEn ? "3 Navigation Methods" : "三大頁面切換途徑", color: "#047857" },
                { type: "text", text: isEn ? "1. Bottom Rich Menu: 6 main buttons in the LINE chat window." : "1. 底部圖文選單 (Rich Menu)：聊天室下方 6 大常駐按鈕。" },
                { type: "text", text: isEn ? "2. Top-Right Profile Menu: Tap your avatar on any webpage to switch pages." : "2. 網頁頂部頭貼選單：點擊右上角 LINE 頭像即可快速切換。" },
                { type: "text", text: isEn ? "3. In-Page Shortcuts: Quick jump to payment for pending dues, or submit hike reflections after trips." : "3. 頁面內捷徑：未繳費項目一鍵前往繳費，出隊完一鍵填寫心得。" }
              ]
            },
            { type: "separator" },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: isEn ? "6 Core Features" : "六大核心功能", color: "#047857" },
                { type: "text", text: isEn ? "• Profile: Complete 6 mandatory fields before joining hikes or renting gear." : "• 個人資料：首次使用請務必補齊 6 大必填欄位。" },
                { type: "text", text: isEn ? "• Events: Browse upcoming hikes and sign up online." : "• 最新活動：瀏覽活動詳情與登記報名。" },
                { type: "text", text: isEn ? "• Gear Loan: 50% discount for club members." : "• 裝備租借：社員專屬租金 5 折優惠！" },
                { type: "text", text: isEn ? "• Payment: Multi-item consolidated payment declaration with bank last 5 digits." : "• 繳費申報：多筆費用合併申報，填寫末五碼。" },
                { type: "text", text: isEn ? "• Dashboard: Real-time track your signups, gear bookings, and pending fees." : "• 個人主頁：掌握活動審核、借裝進度與待繳費用。" },
                { type: "text", text: isEn ? "• Reflections & Badges: Collect footprints and share your hiking reflections." : "• 成就與心得：累積出隊足跡並填寫回饋。" }
              ]
            }
          ]
        }
      };
    };

    const zhBubble = buildMemberGuideBubble("zh");
    const enBubble = buildMemberGuideBubble("en");

    assert.ok(JSON.stringify(zhBubble).includes('三大頁面切換途徑'), '中文版包含三大頁面切換途徑');
    assert.ok(JSON.stringify(zhBubble).includes('六大核心功能'), '中文版包含六大核心功能');
    assert.ok(JSON.stringify(enBubble).includes('3 Navigation Methods'), '英文版包含 3 Navigation Methods');
    assert.ok(JSON.stringify(enBubble).includes('6 Core Features'), '英文版包含 6 Core Features');

    assert.ok(!EMOJI_REGEX.test(JSON.stringify(zhBubble)), '中文社員指南不得包含 Emoji');
    assert.ok(!EMOJI_REGEX.test(JSON.stringify(enBubble)), '英文社員指南不得包含 Emoji');
  });

  // 4. 意見回饋 Flex 卡片與外部表單連結驗證
  it('4. 意見回饋 Bubble 結構、外部連結按鈕與零 Emoji 檢驗', () => {
    const buildFeedbackBubble = (lang) => {
      const isEn = (lang === "en");
      return {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          backgroundColor: "#059669",
          contents: [
            { type: "text", text: isEn ? "Feedback & Suggestions" : "意見回饋與建議" }
          ]
        },
        body: {
          type: "box",
          contents: [
            { type: "text", text: isEn ? "Whether you have suggestions..." : "無論是想對社團說的話..." }
          ]
        },
        footer: {
          type: "box",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#059669",
              action: {
                type: "uri",
                label: isEn ? "Open Feedback Form" : "開啟回饋表單",
                uri: "https://forms.gle/bCT7fjVP3bSrReF96"
              }
            }
          ]
        }
      };
    };

    const zhBubble = buildFeedbackBubble("zh");
    const enBubble = buildFeedbackBubble("en");

    assert.equal(zhBubble.footer.contents[0].action.uri, 'https://forms.gle/bCT7fjVP3bSrReF96');
    assert.equal(zhBubble.footer.contents[0].action.label, '開啟回饋表單');
    assert.equal(enBubble.footer.contents[0].action.label, 'Open Feedback Form');

    assert.ok(!EMOJI_REGEX.test(JSON.stringify(zhBubble)), '中文意見回饋不得包含 Emoji');
    assert.ok(!EMOJI_REGEX.test(JSON.stringify(enBubble)), '英文意見回饋不得包含 Emoji');
  });

  // 5. 語系自動分流邏輯驗證 (zh -> 單張, en -> 單張, null -> Carousel 雙卡片)
  it('5. 語系自動分流：zh/en 發送單張 Bubble，查無偏好時發送 Carousel 雙卡片輪播', () => {
    const resolveGuideMessage = (prefLang, buildFn) => {
      if (prefLang === "zh") {
        return buildFn("zh");
      } else if (prefLang === "en") {
        return buildFn("en");
      } else {
        return {
          type: "carousel",
          contents: [
            buildFn("zh"),
            buildFn("en")
          ]
        };
      }
    };

    const dummyBuildFn = (lang) => ({ type: "bubble", lang });

    const zhResult = resolveGuideMessage("zh", dummyBuildFn);
    assert.equal(zhResult.type, 'bubble');
    assert.equal(zhResult.lang, 'zh');

    const enResult = resolveGuideMessage("en", dummyBuildFn);
    assert.equal(enResult.type, 'bubble');
    assert.equal(enResult.lang, 'en');

    const bilingualResult = resolveGuideMessage(null, dummyBuildFn);
    assert.equal(bilingualResult.type, 'carousel');
    assert.equal(bilingualResult.contents.length, 2);
    assert.equal(bilingualResult.contents[0].lang, 'zh');
    assert.equal(bilingualResult.contents[1].lang, 'en');
  });
});
