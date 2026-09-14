// ==============================================================================
// 🧠 台科登山社社團系統 GAS 模組 4：Gemini AI 智慧客服與知識庫 (04_Ai_Gemini.js)
// ==============================================================================

/**
 * 處理 Gemini AI 問答核心
 */
function _handleGeminiChat(userId, userQuery) {
  if (!GEMINI_API_KEY) return null;

  try {
    // 1. 取得 Docs 知識庫與開放活動摘要
    var knowledgeBase = _fetchDocsKnowledgeBase();
    var eventsContext = _fetchOpenEventsContext();

    var systemInstruction = "你是一位熱情、專業的「台科登山社社團系統社」AI 智慧客服嚮導。\n" +
      "請根據以下社團規章、活動與知識庫回答使用者的問題。若資訊不足，請禮貌引導向幹部洽詢。\n\n" +
      "【當前開放活動資訊】：\n" + eventsContext + "\n\n" +
      "【社團知識庫規章】：\n" + knowledgeBase + "\n";

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
    var payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemInstruction },
            { text: "使用者提問：" + userQuery }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600
      }
    };

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text;
      }
    } else {
      console.warn("Gemini API 回應異常 (HTTP " + res.getResponseCode() + "):", res.getContentText());
    }
  } catch (err) {
    console.error("Gemini AI 客服執行失敗:", err);
  }
  return null;
}

/**
 * 讀取開放活動摘要作為 AI 上下文
 */
function _fetchOpenEventsContext() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Events");
    if (!sheet) return "目前無活動資料。";

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var summaryArr = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[_fi(headers, "報名狀態")] || "").trim();
      if (status === "開放" || status === "Open") {
        var title = row[_fi(headers, "活動名稱")] || "";
        var fee = row[_fi(headers, "費用")] || 0;
        var start = row[_fi(headers, "開始日期")] || "";
        var desc = row[_fi(headers, "簡介")] || "";
        summaryArr.push("• " + title + " (開始日：" + start + "，費用：$" + fee + ")：" + desc);
      }
    }
    return summaryArr.join("\n");
  } catch (e) {
    return "無法讀取活動清單。";
  }
}

/**
 * 讀取 Google Docs 雲端大腦知識庫
 * 1. 優先掃描 KNOWLEDGE_FOLDER_ID 資料夾內所有 Docs/TXT 檔案
 * 2. 次之讀取 KNOWLEDGE_DOC_ID
 * 3. 預設回退歷史社團規章專屬文件 1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI
 */
function _fetchDocsKnowledgeBase() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("docs_kb_text");
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("KNOWLEDGE_FOLDER_ID");
  var docId = props.getProperty("KNOWLEDGE_DOC_ID") || "1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI";
  var allKnowledge = "";

  try {
    if (folderId && typeof DriveApp !== "undefined") {
      try {
        var folder = DriveApp.getFolderById(folderId);
        var files = folder.getFiles();
        while (files.hasNext()) {
          var file = files.next();
          var mimeType = file.getMimeType();
          if (mimeType === MimeType.GOOGLE_DOCS && typeof DocumentApp !== "undefined") {
            var doc = DocumentApp.openById(file.getId());
            allKnowledge += "【規章文件：" + file.getName() + "】\n" + doc.getBody().getText() + "\n\n";
          } else if (mimeType === MimeType.PLAIN_TEXT) {
            allKnowledge += "【規章文件：" + file.getName() + "】\n" + file.getAs("text/plain").getDataAsString() + "\n\n";
          }
        }
      } catch (folderErr) {
        console.warn("讀取 KNOWLEDGE_FOLDER_ID 異常，嘗試讀取單一文件:", folderErr);
      }
    }

    if (!allKnowledge && docId && typeof DocumentApp !== "undefined") {
      try {
        var singleDoc = DocumentApp.openById(docId);
        allKnowledge = singleDoc.getBody().getText();
      } catch (docErr) {
        console.warn("讀取單一 Docs 知識庫失敗:", docErr);
      }
    }

    if (allKnowledge) {
      if (allKnowledge.length > 15000) {
        allKnowledge = allKnowledge.substring(0, 15000);
      }
      try { cache.put("docs_kb_text", allKnowledge, 1800); } catch (cErr) {}
      return allKnowledge;
    }
  } catch (e) {
    console.warn("讀取知識庫整體例外:", e);
  }

  return "社團裝備租借依社籍收費，出隊請遵守領隊指導。";
}

