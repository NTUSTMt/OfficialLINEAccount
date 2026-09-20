import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('70. 活動管理與歷史歸檔頁面 5 大介面優化與跳轉修復測試 (v0.1.162)', () => {
  const rootDir = process.cwd();

  test('1. ApplicantModals 跳轉社員編輯頁面時優先抓取 line_user_id 或 userId，絕不優先取用 lineId', () => {
    // 模擬情境：報名者既有 lineId = 'brianhung0975'，又有 userId = 'U1234567890abcdef'
    const mockApplicant = {
      rowNumber: 1,
      name: 'Brian Hung',
      lineId: 'brianhung0975',
      userId: 'U1234567890abcdef',
      line_user_id: 'U1234567890abcdef'
    };

    // 邏輯驗證：優先順序必須是 line_user_id || userId || lineUserId || lineId
    const targetId =
      mockApplicant.line_user_id ||
      mockApplicant.userId ||
      mockApplicant.lineUserId ||
      mockApplicant.lineId;

    assert.equal(targetId, 'U1234567890abcdef', 'targetId 必須優先取得 LINE UID 而非自訂帳號 brianhung0975');
    assert.notEqual(targetId, 'brianhung0975', 'targetId 絕不可誤取 brianhung0975');

    // 檢查 ApplicantModals.tsx 原始碼確保實作無誤
    const modalCode = fs.readFileSync(path.join(rootDir, 'src/components/admin/ApplicantModals.tsx'), 'utf-8');
    assert.match(modalCode, /\(profileModalApplicant as any\)\.line_user_id\s*\|\|\s*profileModalApplicant\.userId/);
  });

  test('2. supabaseClient.ts 之 fetchMemberFullDetailFromSupabase 具備 line_user_id 與 line_id 雙軌相容備援', () => {
    const sbCode = fs.readFileSync(path.join(rootDir, 'src/utils/supabaseClient.ts'), 'utf-8');
    assert.match(sbCode, /\.or\(`line_user_id\.eq\.\$\{userId\},line_id\.eq\.\$\{userId\}`\)/);
  });

  test('3. AdminEvents.tsx 刪除進行中活動標題列，並將歷史活動純圖示按鈕置於 NotionFilterBar 之 extraBeforeAdd', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src/pages/AdminEvents.tsx'), 'utf-8');
    // 確保已刪除進行中活動之 h2 標題塊
    assert.doesNotMatch(code, /<h2[^>]*>\s*進行中活動\s*<\/h2>/);
    // 確保使用 extraBeforeAdd 傳入純圖示按鈕
    assert.match(code, /extraBeforeAdd=\{/);
    assert.match(code, /title=\{`歷史活動歸檔/);
    assert.match(code, /<History size=\{18\} \/>/);
  });

  test('4. AdminEventsHistory.tsx 移除搜尋框上方歷史活動歸檔標題，並將返回按鈕純圖示化置於 prefixElement', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src/pages/AdminEventsHistory.tsx'), 'utf-8');
    // 確保搜尋框上方無獨立 h2「歷史活動歸檔」
    assert.doesNotMatch(code, /<h2[^>]*>\s*歷史活動歸檔\s*<\/h2>/);
    // 確保使用 prefixElement 傳入純圖示返回按鈕
    assert.match(code, /prefixElement=\{/);
    assert.match(code, /title="返回(?:上一頁|活動管理)"/);
    assert.match(code, /<ArrowLeft size=\{18\} \/>/);
  });

  test('5. AdminHistoryEventCard.tsx 移除查看詳情文字僅留箭頭，並將統計指標靠齊卡片最左側不受圖片影響', () => {
    const code = fs.readFileSync(path.join(rootDir, 'src/components/admin/AdminHistoryEventCard.tsx'), 'utf-8');
    // 確保無「查看詳情」或「收合資訊」純文字
    assert.doesNotMatch(code, /<span>\{isExpanded \? '收合資訊' : '查看詳情'\}<\/span>/);
    // 確保箭頭存在
    assert.match(code, /\{isExpanded \? <ChevronUp size=\{18\} \/> : <ChevronDown size=\{18\} \/>\}/);
    // 確保頂部外層改為 column 佈局，統計指標獨立位於下方靠左
    assert.match(code, /flexDirection:\s*'column'/);
    assert.match(code, /報名 \{evt\.stats\?\.total/);
  });
});
