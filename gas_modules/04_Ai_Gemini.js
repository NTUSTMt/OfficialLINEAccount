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
    // 100% 直通 Supabase events (SSOT)，杜絕試算表依賴
    if (typeof _supabaseGet === "function") {
      var sbEvents = _supabaseGet("events", { status: "eq.開放", select: "title,fee,start_date,summary,itinerary" });
      if (Array.isArray(sbEvents) && sbEvents.length > 0) {
        return sbEvents.map(function(ev) {
          var title = ev.title || "";
          var fee = ev.fee || 0;
          var start = ev.start_date || "";
          var desc = ev.summary || "";
          return "• " + title + " (開始日：" + start + "，費用：$" + fee + ")：" + desc;
        }).join("\n");
      }
    }
    return "目前無開放報名中的活動資料。";
  } catch (e) {
    console.error("[_fetchOpenEventsContext] 直查 Supabase 失敗:", e);
    return "無法讀取活動清單：" + (e.message || e);
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

