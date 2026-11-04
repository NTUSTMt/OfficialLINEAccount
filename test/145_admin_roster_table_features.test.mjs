import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('145. 名單管理表格進階功能驗證 (AI評估排序、雙向欄位上色、原地編輯)', () => {
  const rootDir = process.cwd();
  const rosterPath = path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx');
  const rosterCode = fs.readFileSync(rosterPath, 'utf8');

  it('1. WebAdminRoster.tsx 必須具備 6 色主題規格且不含「選擇顏色：」字樣', () => {
    assert.ok(rosterCode.includes('TABLE_COLOR_THEMES'), '必須定義 TABLE_COLOR_THEMES');
    assert.ok(rosterCode.includes("key: 'blue'"), '包含藍色主題');
    assert.ok(rosterCode.includes("key: 'green'"), '包含綠色主題');
    assert.ok(rosterCode.includes("key: 'yellow'"), '包含黃色主題');
    assert.ok(rosterCode.includes("key: 'orange'"), '包含橘色主題');
    assert.ok(rosterCode.includes("key: 'purple'"), '包含紫色主題');
    assert.ok(rosterCode.includes("key: 'gray'"), '包含灰色/重設主題');
    assert.strictEqual(rosterCode.includes('選擇顏色：'), false, '不得顯示「選擇顏色：」五個字，直接以圓圈展示顏色');
  });

  it('2. 必須具備雙向 (縱向欄與橫向列) 選色與清除機制', () => {
    assert.ok(rosterCode.includes('columnColors'), '必須具備直欄顏色狀態 columnColors');
    assert.ok(rosterCode.includes('rowColors'), '必須具備橫列顏色狀態 rowColors');
    assert.ok(rosterCode.includes('colorPickerColKey'), '具備欄位選色彈窗觸發狀態');
    assert.ok(rosterCode.includes('colorPickerRowId'), '具備橫列選色彈窗觸發狀態');
    assert.ok(rosterCode.includes('setColumnColors'), '必須具備更新直欄顏色邏輯');
    assert.ok(rosterCode.includes('setRowColors'), '必須具備更新橫列顏色邏輯');
  });

  it('3. 必須具備 AI 體能與經驗評估與排序功能', () => {
    assert.ok(rosterCode.includes('evaluateApplicantsViaAi'), '必須呼叫 evaluateApplicantsViaAi 進行 AI 評估');
    assert.ok(rosterCode.includes('wa_roster_ai_evaluations_v1_'), '必須在 localStorage 快取評估結果');
    assert.ok(rosterCode.includes('handleTriggerAiEvaluation'), '具備 AI 評估觸發函式');
    assert.ok(rosterCode.includes('AI 體能評估排序'), '工具列必須提供 AI 體能評估排序 按鈕');
    assert.ok(rosterCode.includes('aiSorted'), '必須具備依 AI 分數排序狀態 aiSorted');
    assert.ok(rosterCode.includes('ai_score'), '欄位清單包含 ai_score');
    assert.ok(rosterCode.includes('ai_reasoning'), '欄位清單包含 ai_reasoning');
  });

  it('4. 原地直接編輯功能必須完整保留且靜默儲存', () => {
    assert.ok(rosterCode.includes('handleSaveNotes'), '具備備註即時儲存函式 handleSaveNotes');
    assert.ok(rosterCode.includes('handleStatusChange'), '具備狀態更新函式 handleStatusChange');
    assert.ok(rosterCode.includes('onBlur={() => handleSaveNotes'), '備註失焦時自動儲存');
    assert.ok(rosterCode.includes('if (e.key === \'Enter\') handleSaveNotes(s.id, editingNotesText)'), '按下 Enter 時自動儲存');
  });

  it('5. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(rosterCode), false, 'WebAdminRoster.tsx 代碼不得包含 Emoji');
  });
});
