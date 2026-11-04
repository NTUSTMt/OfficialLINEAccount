import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('142. 幹部 AI 輔助功能（體能經驗去識別化排序與雙語翻譯）後端驗證', () => {
  const rootDir = process.cwd();
  const aiServicePath = path.join(rootDir, 'supabase/functions/notify-dispatcher/aiService.ts');
  const dispatcherIndexPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');

  const aiServiceCode = fs.readFileSync(aiServicePath, 'utf8');
  const dispatcherIndexCode = fs.readFileSync(dispatcherIndexPath, 'utf8');

  it('1. aiService.ts 必須具備去識別化過濾器並嚴密剔除個資', () => {
    assert.ok(aiServiceCode.includes('function sanitizeApplicants'), '必須定義 sanitizeApplicants 函式');
    assert.ok(aiServiceCode.includes('anonymousId'), '必須保留虛擬代號 anonymousId');
    assert.ok(aiServiceCode.includes('outdoor_experience'), '必須保留登山經驗 outdoor_experience');
    assert.ok(aiServiceCode.includes('fitness_desc'), '必須保留體能自述 fitness_desc');
    assert.ok(aiServiceCode.includes('medical_history'), '必須保留去識別化病史 medical_history');

    // 驗證 sanitizeApplicants 實作
    const sanitizeMatch = aiServiceCode.match(/return rawApplicants\.map[\s\S]*?return \{([\s\S]*?)\};/);
    assert.ok(sanitizeMatch, '必須對 applicants 進行欄位白名單篩選');
    const returnedFields = sanitizeMatch[1];
    assert.strictEqual(returnedFields.includes('name'), false, '不可回傳姓名 name');
    assert.strictEqual(returnedFields.includes('phone'), false, '不可回傳電話 phone');
    assert.strictEqual(returnedFields.includes('email'), false, '不可回傳電子郵件 email');
    assert.strictEqual(returnedFields.includes('student_id'), false, '不可回傳學號 student_id');
    assert.strictEqual(returnedFields.includes('id_card'), false, '不可回傳身分證 id_card');
    assert.strictEqual(returnedFields.includes('line_id'), false, '不可回傳 line_id');
  });

  it('2. aiService.ts 活動翻譯必須強制約束總字數不超過 1400 字元', () => {
    assert.ok(aiServiceCode.includes('totalLen > 1400'), '必須具備總字數超過 1400 字元之防護檢查');
    assert.ok(aiServiceCode.includes('title_en'), '必須產出 title_en');
    assert.ok(aiServiceCode.includes('summary_en'), '必須產出 summary_en');
    assert.ok(aiServiceCode.includes('itinerary_en'), '必須產出 itinerary_en');
    assert.ok(aiServiceCode.includes('Day X: HH:MM'), '提示詞需指示逐日行程格式規範');
  });

  it('3. notify-dispatcher/index.ts 必須安全路由 AI action 並實施幹部權限檢查', () => {
    assert.ok(dispatcherIndexCode.includes('case "ai_evaluate_applicants":'), '必須支援 ai_evaluate_applicants action');
    assert.ok(dispatcherIndexCode.includes('case "ai_translate_event":'), '必須支援 ai_translate_event action');
    assert.ok(dispatcherIndexCode.includes('handleAiEvaluateApplicants'), '必須定義 handleAiEvaluateApplicants');
    assert.ok(dispatcherIndexCode.includes('handleAiTranslateEvent'), '必須定義 handleAiTranslateEvent');

    // 權限檢查
    const evalHandlerMatch = dispatcherIndexCode.match(/async function handleAiEvaluateApplicants[\s\S]*?\{([\s\S]*?)\n\}/);
    assert.ok(evalHandlerMatch, 'handleAiEvaluateApplicants 必須定義');
    assert.ok(evalHandlerMatch[1].includes('isUserOfficer'), 'AI 評估必須驗證幹部身分');

    const transHandlerMatch = dispatcherIndexCode.match(/async function handleAiTranslateEvent[\s\S]*?\{([\s\S]*?)\n\}/);
    assert.ok(transHandlerMatch, 'handleAiTranslateEvent 必須定義');
    assert.ok(transHandlerMatch[1].includes('isUserOfficer'), 'AI 翻譯必須驗證幹部身分');
  });

  it('4. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(aiServiceCode), false, 'aiService.ts 代碼不得包含 Emoji');
  });
});
