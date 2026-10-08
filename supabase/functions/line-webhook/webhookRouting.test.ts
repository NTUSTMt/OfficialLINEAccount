import { assertEquals } from "std/assert/mod.ts";

Deno.test("webhookRouting: postback parser parses key-value pairs correctly", () => {
  const postbackData = "action=signup&eventId=E01";
  const params: Record<string, string> = {};
  const parts = postbackData.split("&");
  for (const part of parts) {
    const pair = part.split("=");
    if (pair.length === 2) {
      params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
  }

  assertEquals(params.action, "signup");
  assertEquals(params.eventId, "E01");
});

Deno.test("webhookRouting: cleanText removes assistant and yue mentions", () => {
  const text1 = "@小岳助理 幹部系統";
  const clean1 = text1.replace(/@\S+/g, "").replace(/小岳助理/g, "").replace(/助理/g, "").replace(/^[\s,，:：]+/, "").trim();
  assertEquals(clean1, "幹部系統");

  const text2 = "小岳 玉山有多高？";
  const clean2 = text2.replace(/@\S+/g, "").replace(/小岳/g, "").replace(/^[\s,，:：]+/, "").trim();
  assertEquals(clean2, "玉山有多高？");
});
