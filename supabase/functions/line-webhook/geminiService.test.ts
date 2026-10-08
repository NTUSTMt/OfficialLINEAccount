import { assertEquals } from "std/assert/mod.ts";
import { stripMarkdown } from "./geminiService.ts";

Deno.test("geminiService: stripMarkdown removes asterisks, code blocks and links", () => {
  const raw = "**粗體** 與 *斜體*，還有 `程式碼` 以及 [連結文字](https://example.com)";
  const stripped = stripMarkdown(raw);
  assertEquals(stripped, "粗體 與 斜體，還有 程式碼 以及 連結文字 (https://example.com)");
});

Deno.test("geminiService: stripMarkdown removes headers and tildes", () => {
  const raw = "### 標題三\n~~刪除線~~";
  const stripped = stripMarkdown(raw);
  assertEquals(stripped, "標題三\n刪除線");
});
