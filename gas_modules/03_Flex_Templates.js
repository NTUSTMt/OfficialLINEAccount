// ==============================================================================
// 🎨 野境戶外系統 GAS 模組 3：LINE Flex Message 樣板產生器 (03_Flex_Templates.js)
// ==============================================================================

/**
 * 產生最新開放活動輪播卡片
 */
function _buildLatestEventsFlex() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Events");
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  var headers = data[0];
  var idIdx = _fi(headers, "活動編號") > -1 ? _fi(headers, "活動編號") : 0;
  var nameIdx = _fi(headers, "活動名稱") > -1 ? _fi(headers, "活動名稱") : 1;
  var feeIdx = _fi(headers, "費用") > -1 ? _fi(headers, "費用") : 2;
  var startIdx = _fi(headers, "開始日期") > -1 ? _fi(headers, "開始日期") : 3;
  var endIdx = _fi(headers, "結束日期") > -1 ? _fi(headers, "結束日期") : 4;
  var dlIdx = _fi(headers, "報名截止") > -1 ? _fi(headers, "報名截止") : 5;
  var stIdx = _fi(headers, "報名狀態") > -1 ? _fi(headers, "報名狀態") : 6;
  var descIdx = _fi(headers, "簡介") > -1 ? _fi(headers, "簡介") : 7;
  var imgIdx = _fi(headers, "封面圖") > -1 ? _fi(headers, "封面圖") : 9;

  var bubbles = [];
  var count = 0;

  for (var i = 1; i < data.length && count < 10; i++) {
    var row = data[i];
    var status = String(row[stIdx] || "").trim();
    if (status !== "開放" && status !== "Open") continue;

    var eventId = String(row[idIdx] || "");
    var title = String(row[nameIdx] || "未命名活動");
    var fee = row[feeIdx] ? "$" + row[feeIdx] : "免費";
    var start = row[startIdx] ? String(row[startIdx]).split("T")[0] : "";
    var deadline = row[dlIdx] ? String(row[dlIdx]).split("T")[0] : "";
    var desc = String(row[descIdx] || "歡迎報名參加！");
    if (desc.length > 50) desc = desc.substring(0, 48) + "...";
    var coverImg = String(row[imgIdx] || "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80");

    var bubble = {
      type: "bubble",
      hero: {
        type: "image",
        url: coverImg,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: title, weight: "bold", size: "lg", wrap: true },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  { type: "text", text: "日期", color: "#aaaaaa", size: "sm", flex: 2 },
                  { type: "text", text: start, wrap: true, color: "#666666", size: "sm", flex: 5 }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  { type: "text", text: "費用", color: "#aaaaaa", size: "sm", flex: 2 },
                  { type: "text", text: fee, wrap: true, color: "#10b981", weight: "bold", size: "sm", flex: 5 }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  { type: "text", text: "截止", color: "#aaaaaa", size: "sm", flex: 2 },
                  { type: "text", text: deadline, wrap: true, color: "#ef4444", size: "sm", flex: 5 }
                ]
              }
            ]
          },
          { type: "text", text: desc, margin: "md", size: "xs", color: "#888888", wrap: true }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#10b981",
            height: "sm",
            action: {
              type: "uri",
              label: "線上報名 (LIFF)",
              uri: "https://liff.line.me/" + LIFF_CHANNEL_ID + "?action=events"
            }
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "詳細資訊",
              data: "action=view_event_detail&eventId=" + encodeURIComponent(eventId)
            }
          }
        ]
      }
    };
    bubbles.push(bubble);
    count++;
  }

  if (bubbles.length === 0) return null;
  return { type: "carousel", contents: bubbles };
}

/**
 * 產生單一活動詳細內容卡片
 */
function _buildSingleEventDetailFlex(eventId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Events");
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = _fi(headers, "活動編號") > -1 ? _fi(headers, "活動編號") : 0;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]).trim() === String(eventId).trim()) {
      var row = data[i];
      var title = row[_fi(headers, "活動名稱")] || "未命名活動";
      var summary = row[_fi(headers, "簡介")] || "無簡介";
      var itinerary = row[_fi(headers, "詳細行程")] || "無詳細行程";
      var fee = row[_fi(headers, "費用")] ? "$" + row[_fi(headers, "費用")] : "免費";

      return {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: title, weight: "bold", size: "xl", wrap: true },
            { type: "text", text: "費用預估：" + fee, color: "#10b981", weight: "bold", margin: "md" },
            { type: "separator", margin: "md" },
            { type: "text", text: "【活動特色與簡介】", weight: "bold", size: "sm", margin: "md" },
            { type: "text", text: summary, wrap: true, size: "sm", color: "#555555", margin: "xs" },
            { type: "separator", margin: "md" },
            { type: "text", text: "【預定詳細行程】", weight: "bold", size: "sm", margin: "md" },
            { type: "text", text: itinerary, wrap: true, size: "xs", color: "#666666", margin: "xs" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#10b981",
              action: {
                type: "uri",
                label: "前往報名",
                uri: "https://liff.line.me/" + LIFF_CHANNEL_ID + "?action=events"
              }
            }
          ]
        }
      };
    }
  }
  return null;
}

/**
 * 產生幹部團隊名冊卡片
 */
function _buildOfficersFlex() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Officers");
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  var bubbles = [];
  for (var i = 1; i < data.length && i <= 8; i++) {
    var name = data[i][0] || "幹部";
    var role = data[i][1] || "幹部";
    var contact = data[i][2] || "無特殊聯絡資訊";

    bubbles.push({
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: role, weight: "bold", size: "sm", color: "#10b981" },
          { type: "text", text: name, weight: "bold", size: "lg", margin: "xs" },
          { type: "text", text: contact, size: "xs", color: "#888888", margin: "sm", wrap: true }
        ]
      }
    });
  }

  return bubbles.length > 0 ? { type: "carousel", contents: bubbles } : null;
}

/**
 * 產生更多服務選單卡片
 */
function _buildMoreServicesFlex() {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "野境戶外：服務大廳", weight: "bold", size: "xl", color: "#1e293b" },
        { type: "text", text: "請選擇您需要使用的社團系統服務：", size: "sm", color: "#64748b", margin: "sm" },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#3b82f6",
              height: "sm",
              action: { type: "uri", label: "🎒 裝備租借商城", uri: "https://liff.line.me/" + LIFF_CHANNEL_ID + "?action=borrow" }
            },
            {
              type: "button",
              style: "primary",
              color: "#10b981",
              height: "sm",
              action: { type: "uri", label: "💳 待繳費用與對帳申報", uri: "https://liff.line.me/" + LIFF_CHANNEL_ID + "?action=payment" }
            },
            {
              type: "button",
              style: "primary",
              color: "#8b5cf6",
              height: "sm",
              action: { type: "uri", label: "👤 個人主頁與出隊成就", uri: "https://liff.line.me/" + LIFF_CHANNEL_ID + "?action=dashboard" }
            }
          ]
        }
      ]
    }
  };
}
