import { assertEquals } from "std/assert/mod.ts";
import { buildMoreServicesFlex, buildFeedbackFlex, buildAiGuideFlex, buildMemberGuideFlex } from "./flexTemplates.ts";

Deno.test("flexTemplates: buildMoreServicesFlex generates 4 buttons", () => {
  const flex = buildMoreServicesFlex();
  assertEquals(flex.type, "bubble");
  assertEquals(flex.footer.contents.length, 4);
});

Deno.test("flexTemplates: buildFeedbackFlex outputs correct URL", () => {
  const flex = buildFeedbackFlex("zh");
  const buttonAction = flex.footer.contents[0].action;
  assertEquals(buttonAction.uri, "https://forms.gle/bCT7fjVP3bSrReF96");
});

Deno.test("flexTemplates: buildAiGuideFlex outputs correct language headers", () => {
  const flexZh = buildAiGuideFlex("zh");
  const flexEn = buildAiGuideFlex("en");

  assertEquals(flexZh.header.contents[0].text, "小岳 (Yue) AI 客服使用指南");
  assertEquals(flexEn.header.contents[0].text, "Yue AI Assistant Guide");
});

Deno.test("flexTemplates: buildMemberGuideFlex outputs 6 features and 3 navigations", () => {
  const flexZh = buildMemberGuideFlex("zh");
  assertEquals(flexZh.header.contents[0].text, "台科登山社 社員使用指南");
});
