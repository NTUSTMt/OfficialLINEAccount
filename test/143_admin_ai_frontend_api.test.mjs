import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('143. 幹部 AI 輔助前端 API 通訊層與型別定義驗證', () => {
  const rootDir = process.cwd();
  const typesPath = path.join(rootDir, 'src/types/admin.ts');
  const apiPath = path.join(rootDir, 'src/utils/api.ts');

  const typesCode = fs.readFileSync(typesPath, 'utf8');
  const apiCode = fs.readFileSync(apiPath, 'utf8');

  it('1. src/types/admin.ts 必須匯出 AI 評估與雙語翻譯之型別定義', () => {
    assert.ok(typesCode.includes('export interface ApplicantEvaluation'), '必須定義 ApplicantEvaluation');
    assert.ok(typesCode.includes('export interface ApplicantEvaluationResult'), '必須定義 ApplicantEvaluationResult');
    assert.ok(typesCode.includes('export interface EventTranslationInput'), '必須定義 EventTranslationInput');
    assert.ok(typesCode.includes('export interface EventTranslationResult'), '必須定義 EventTranslationResult');
  });

  it('2. src/utils/api.ts 必須落實前端個資剝除與大名單分批處理', () => {
    assert.ok(apiCode.includes('evaluateApplicantsViaAi'), '必須定義 evaluateApplicantsViaAi 函式');
    assert.ok(apiCode.includes('translateEventViaAi'), '必須定義 translateEventViaAi 函式');
    assert.ok(apiCode.includes('BATCH_SIZE = 25'), '必須具備 25 人一組之分批處理常數');

    // 驗證前端白名單剔除個資邏輯
    const sanitizeMatch = apiCode.match(/const sanitized = rawApplicants\.map[\s\S]*?return \{([\s\S]*?)\};/);
    assert.ok(sanitizeMatch, 'evaluateApplicantsViaAi 必須進行嚴格個資過濾');
    const returnedFields = sanitizeMatch[1];
    assert.strictEqual(returnedFields.includes('name:'), false, '不可帶有姓名欄位');
    assert.strictEqual(returnedFields.includes('phone:'), false, '不可帶有電話欄位');
    assert.strictEqual(returnedFields.includes('email:'), false, '不可帶有電子郵件欄位');
    assert.strictEqual(returnedFields.includes('student_id:'), false, '不可帶有學號欄位');
    assert.strictEqual(returnedFields.includes('line_id:'), false, '不可帶有 line_id 欄位');
    assert.strictEqual(returnedFields.includes('id_card:'), false, '不可帶有身分證欄位');
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(apiCode), false, 'src/utils/api.ts 代碼不得包含 Emoji');
    assert.strictEqual(emojiRegex.test(typesCode), false, 'src/types/admin.ts 代碼不得包含 Emoji');
  });
});
