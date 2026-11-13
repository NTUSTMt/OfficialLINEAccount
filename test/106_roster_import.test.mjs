import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('106. 活動報名名冊跨活動與社員名冊導入邏輯測試', async () => {
  const utilsModulePath = path.resolve('src/utils/rosterImportUtils.ts');
  const modalComponentPath = path.resolve('src/components/admin/RosterImportModal.tsx');
  const rosterPagePath = path.resolve('src/pages/web-admin/WebAdminRoster.tsx');

  it('1. 檔案與模組應存在且無 Emoji', () => {
    assert.ok(fs.existsSync(utilsModulePath), 'rosterImportUtils.ts 檔案應存在');
    assert.ok(fs.existsSync(modalComponentPath), 'RosterImportModal.tsx 檔案應存在');
    assert.ok(fs.existsSync(rosterPagePath), 'WebAdminRoster.tsx 檔案應存在');

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const utilsContent = fs.readFileSync(utilsModulePath, 'utf-8');
    assert.ok(!emojiRegex.test(utilsContent), 'rosterImportUtils.ts 嚴禁包含任何 Emoji');

    const modalContent = fs.readFileSync(modalComponentPath, 'utf-8');
    assert.ok(!emojiRegex.test(modalContent), 'RosterImportModal.tsx 嚴禁包含任何 Emoji');

    const rosterContent = fs.readFileSync(rosterPagePath, 'utf-8');
    assert.ok(!emojiRegex.test(rosterContent), 'WebAdminRoster.tsx 嚴禁包含任何 Emoji');
  });

  it('2. 序號生成器 generateSignupId 必須以 S 開頭且格式相容', async () => {
    const { generateSignupId } = await import('../src/utils/rosterImportUtils.ts');
    const id1 = generateSignupId();
    const id2 = generateSignupId();
    assert.ok(typeof id1 === 'string' && id1.startsWith('S'), '序號必須為 S 開頭之字串');
    assert.ok(id1.length >= 8, '序號長度必須足夠長防止衝突');
    assert.notStrictEqual(id1, id2, '連續呼叫序號生成器不得重複');
  });

  it('3. 名單分流器 partitionImportCandidates 精確判定 conflict、reactivate 與 insert', async () => {
    const { partitionImportCandidates } = await import('../src/utils/rosterImportUtils.ts');

    const existingSignups = [
      { id: 'S_001', line_user_id: 'U_ACTIVE_1', status: '正取 Confirmed', payment_status: '已繳費 Paid' },
      { id: 'S_002', line_user_id: 'U_ACTIVE_2', status: '審核中 Checking', payment_status: '未繳費 Unpaid' },
      { id: 'S_003', line_user_id: 'U_CANCELLED_1', status: '已取消 Cancelled', payment_status: '未繳費 Unpaid' },
    ];

    const candidates = [
      { line_user_id: 'U_ACTIVE_1', name: '王大明' },
      { line_user_id: 'U_CANCELLED_1', name: '李小美' },
      { line_user_id: 'U_NEW_1', name: '張小華' },
    ];

    const result = partitionImportCandidates(candidates, existingSignups);

    // conflict (有效報名者，禁止再次匯入)
    assert.strictEqual(result.conflicts.length, 1);
    assert.strictEqual(result.conflicts[0].line_user_id, 'U_ACTIVE_1');

    // reactivate (曾在目標活動取消者，採 UPDATE 重啟)
    assert.strictEqual(result.reactivates.length, 1);
    assert.strictEqual(result.reactivates[0].line_user_id, 'U_CANCELLED_1');
    assert.strictEqual(result.reactivates[0].existingSignupId, 'S_003');

    // insert (目標活動尚未有任何紀錄者，採 INSERT 新增)
    assert.strictEqual(result.inserts.length, 1);
    assert.strictEqual(result.inserts[0].line_user_id, 'U_NEW_1');
  });

  it('4. 備註合成器 buildImportNotes 與出隊個資完整度檢查 checkProfileCompleteness', async () => {
    const { buildImportNotes, checkProfileCompleteness } = await import('../src/utils/rosterImportUtils.ts');

    // 備註合成
    const note1 = buildImportNotes('原隊員備註', '奇萊南華', '幹部隨隊');
    assert.ok(note1.includes('【自奇萊南華轉入】'));
    assert.ok(note1.includes('原隊員備註'));
    assert.ok(note1.includes('幹部隨隊'));

    const note2 = buildImportNotes('', '', '口頭報名');
    assert.strictEqual(note2, '口頭報名');

    // 個資完整度
    assert.strictEqual(checkProfileCompleteness({ id_card: 'A123456789', emergency_contact_name: '媽媽' }), true);
    assert.strictEqual(checkProfileCompleteness({ id_card: '', emergency_contact_name: '媽媽' }), false);
    assert.strictEqual(checkProfileCompleteness({ id_card: 'A123456789', emergency_contact_name: null }), false);
    assert.strictEqual(checkProfileCompleteness(null), false);
  });

  it('5. RosterImportModal 元件結構與功能約束檢驗', () => {
    const modalContent = fs.readFileSync(modalComponentPath, 'utf-8');

    // 驗證雙分頁切換支援與 Safari 膠囊分頁結構
    assert.ok(modalContent.includes("'from_event'"), '應具備從活動複製分頁');
    assert.ok(modalContent.includes("'from_members'"), '應具備從社員名冊新增分頁');
    assert.ok(modalContent.includes('wa-segmented-tabs'), '必須採用 wa-segmented-tabs 膠囊分頁樣式');
    assert.ok(modalContent.includes('wa-segmented-tab'), '必須包含 wa-segmented-tab 子頁籤');

    // 驗證分流調用與防重處理
    assert.ok(modalContent.includes('partitionImportCandidates'), '必須調用分流器處理防重與重啟');
    assert.ok(modalContent.includes('BATCH_IMPORT_SIGNUPS'), '必須記錄 BATCH_IMPORT_SIGNUPS 操作稽核');

    // 驗證白底勾選框與無陰影主要按鈕類別
    assert.ok(modalContent.includes('wa-modal-checkbox'), '勾選框必須套用 wa-modal-checkbox 白底樣式');
    assert.ok(modalContent.includes('wa-modal-btn-primary'), '送出按鈕必須套用 wa-modal-btn-primary 樣式');
    assert.ok(modalContent.includes('wa-modal-close-btn'), '關閉按鈕必須套用 wa-modal-close-btn 樣式');
    assert.ok(modalContent.includes('stopPropagation'), '勾選框事件必須包含 stopPropagation 防重複觸發');

    // 驗證防衝突提示與重啟取消紀錄
    assert.ok(modalContent.includes('已在此名冊中'), '已有紀錄者必須提示已在名冊中');
    assert.ok(modalContent.includes('重啟報名 (曾取消)'), '曾取消者必須提示重啟');
    assert.ok(modalContent.includes('個資待補齊'), '個資不完整者需有提示');
  });

  it('6. WebAdminRoster 介面按鈕與彈窗掛載檢驗', () => {
    const rosterContent = fs.readFileSync(rosterPagePath, 'utf-8');

    assert.ok(rosterContent.includes('RosterImportModal'), 'WebAdminRoster 必須匯入 RosterImportModal');
    assert.ok(rosterContent.includes('isImportModalOpen'), 'WebAdminRoster 必須維護 isImportModalOpen 狀態');
    assert.ok(rosterContent.includes('新增/導入人員'), '工具列必須提供「新增/導入人員」按鈕');
  });
});
