import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('87. 電腦版幹部工作站模組擴充、活動管理 LINE 風格重構與清新明亮介面驗證 (Web Admin Loans & Redesign)', () => {
  const appPath = path.resolve('src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  const layoutPath = path.resolve('src/pages/web-admin/WebAdminLayout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  const loansPath = path.resolve('src/pages/web-admin/WebAdminLoans.tsx');
  const loansContent = fs.readFileSync(loansPath, 'utf8');

  const rosterPath = path.resolve('src/pages/web-admin/WebAdminRoster.tsx');
  const rosterContent = fs.readFileSync(rosterPath, 'utf8');

  const eventsPath = path.resolve('src/pages/web-admin/WebAdminEvents.tsx');
  const eventsContent = fs.readFileSync(eventsPath, 'utf8');

  const membersPath = path.resolve('src/pages/web-admin/WebAdminMembers.tsx');
  const membersContent = fs.readFileSync(membersPath, 'utf8');

  const cssPath = path.resolve('src/pages/web-admin/webAdmin.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  it('應驗證 App.tsx 正確註冊 6 大電腦工作站路由與延遲載入 (Lazy Loading)', () => {
    assert.ok(
      appContent.includes('const WebAdminLoans = lazy('),
      'App.tsx 必須延遲載入 WebAdminLoans'
    );
    assert.ok(
      appContent.includes('const WebAdminRoster = lazy('),
      'App.tsx 必須延遲載入 WebAdminRoster'
    );
    assert.ok(
      appContent.includes('<Route path="events" element={<WebAdminEvents />} />'),
      '必須包含 /admin-web/events 路由'
    );
    assert.ok(
      appContent.includes('<Route path="roster" element={<WebAdminRoster />} />'),
      '必須包含 /admin-web/roster 路由'
    );
    assert.ok(
      appContent.includes('<Route path="loans" element={<WebAdminLoans />} />'),
      '必須包含 /admin-web/loans 路由'
    );
    assert.ok(
      appContent.includes('<Route path="members" element={<WebAdminMembers />} />'),
      '必須包含 /admin-web/members 路由'
    );
    assert.ok(
      appContent.includes('<Route path="finance" element={<WebAdminFinance />} />'),
      '必須包含 /admin-web/finance 路由'
    );
    assert.ok(
      appContent.includes('<Route path="inventory" element={<WebAdminInventory />} />'),
      '必須包含 /admin-web/inventory 路由'
    );
  });

  it('應驗證 WebAdminLayout.tsx 頂部導覽列包含 6 個獨立管理頁籤且活動頁面已更名為「活動管理」', () => {
    assert.ok(layoutContent.includes('to="/admin-web/events"'), '導覽列必須包含活動管理連結');
    assert.ok(layoutContent.includes('<span>活動管理</span>'), '導覽列標籤必須更名為「活動管理」');
    assert.ok(layoutContent.includes('to="/admin-web/roster"'), '導覽列必須包含名冊審核工作站');
    assert.ok(layoutContent.includes('to="/admin-web/loans"'), '導覽列必須包含裝備借用管理');
    assert.ok(layoutContent.includes('to="/admin-web/inventory"'), '導覽列必須包含裝備庫存管控');
    assert.ok(layoutContent.includes('to="/admin-web/members"'), '導覽列必須包含全社社員名冊');
    assert.ok(layoutContent.includes('to="/admin-web/finance"'), '導覽列必須包含財務對帳核銷');
  });

  it('應驗證 WebAdminEvents.tsx 具備精確狀態篩選與多維度排序機制', () => {
    assert.ok(eventsContent.includes('getComputedEventStatus'), '必須具備狀態計算函式以對齊資料庫狀態與截止日');
    assert.ok(eventsContent.includes('isDeadlinePassed'), '必須具備截止日期逾期檢查');
    assert.ok(eventsContent.includes('<option value="開放">開放中'), '篩選器必須具備開放中選項');
    assert.ok(eventsContent.includes('<option value="未來開放">未來開放'), '篩選器必須具備未來開放選項');
    assert.ok(eventsContent.includes('<option value="已截止">已截止'), '篩選器必須具備已截止選項');
    assert.ok(eventsContent.includes('<option value="關閉">已關閉'), '篩選器必須具備已關閉選項');
    assert.ok(eventsContent.includes('startDateDesc'), '必須具備出隊日期由新到舊排序選項');
    assert.ok(eventsContent.includes('deadlineAsc'), '必須具備截止日期即將截止優先排序選項');
  });

  it('應驗證 WebAdminEvents.tsx 活動卡片採用 LINE 風格頂部大圖與指定排版結構', () => {
    assert.ok(eventsContent.includes('wa-event-card'), '活動卡片必須使用專屬 wa-event-card 容器');
    assert.ok(eventsContent.includes('wa-event-card-cover'), '卡片頂部必須包含全寬封面圖容器');
    assert.ok(eventsContent.includes('wa-event-badge-id'), '圖片左上角必須顯示活動代號徽章');
    assert.ok(eventsContent.includes('wa-event-badge-status'), '圖片右上角必須顯示報名狀態徽章');
    assert.ok(eventsContent.includes('・${computedStatus}'), '狀態徽章必須以 數字・狀態 格式顯示 (如 8・開放)');
    assert.ok(eventsContent.includes('wa-event-card-title'), '卡片必須具備標題樣式');
    assert.ok(eventsContent.includes('wa-event-card-summary'), '簡介必須支援最多三行截斷');
    assert.ok(eventsContent.includes('活動日期：'), '必須包含活動日期欄位標籤');
    assert.ok(eventsContent.includes('截止日期：'), '必須包含截止日期欄位標籤');
    assert.ok(eventsContent.includes('預計費用：'), '必須包含預計費用欄位標籤');
    assert.ok(eventsContent.includes('wa-event-card-footer'), '卡片底部必須以 wa-event-card-footer 容器錨定置底');
    assert.ok(eventsContent.includes('編輯活動'), '必須包含編輯活動操作按鈕');
    assert.ok(eventsContent.includes('報名名冊'), '必須包含報名名冊操作按鈕');
    assert.ok(!eventsContent.includes('applicant_count 筆'), '卡片右上角不應再顯示人數統計');
  });

  it('應驗證 WebAdminEvents.tsx 實作置中雙欄中英文編輯彈窗與圖片雙軌設定', () => {
    assert.ok(eventsContent.includes('wa-modal-backdrop'), '必須使用置中彈窗遮罩');
    assert.ok(eventsContent.includes('wa-modal-container'), '必須使用置中彈窗主體容器');
    assert.ok(eventsContent.includes('wa-bilingual-grid'), '必須具備左右雙欄中英文對照容器');
    assert.ok(eventsContent.includes('handleImageChange'), '必須支援選取本機圖片與預覽');
    assert.ok(eventsContent.includes('cover_image_url'), '必須支援直接輸入圖片網址');
    assert.ok(eventsContent.includes('出隊結束日期 *'), '出隊結束日期必須為必填欄位');
    assert.ok(eventsContent.includes('1400'), '中英文簡介與行程合計字數必須校驗 LINE 卡片 1400 上限');
  });

  it('應驗證 WebAdminLoans.tsx 支援卡片網格、右側抽屜與狀態變更連動庫存', () => {
    assert.ok(loansContent.includes('wa-card-grid'), '借用清單必須使用卡片網格樣式');
    assert.ok(loansContent.includes('wa-drawer-panel'), '借用詳情必須使用右側滑出抽屜');
    assert.ok(loansContent.includes('handleSaveStatus'), '必須具備狀態變更處理函式');
    assert.ok(loansContent.includes('updateLoanStatusInSupabase'), '必須調用 updateLoanStatusInSupabase 處理自動歸還入庫庫存回補');
    assert.ok(
      loansContent.includes("logWebAuditAction("),
      '借用操作必須寫入稽核紀錄'
    );
  });

  it('應驗證 WebAdminRoster.tsx 支援 URL 參數、狀態切換與 TSV 複製功能', () => {
    assert.ok(rosterContent.includes("searchParams.get('eventId')"), '必須支援依 URL eventId 篩選');
    assert.ok(rosterContent.includes('handleStatusChange'), '必須支援名單單筆狀態變更');
    assert.ok(rosterContent.includes('handleBatchStatus'), '必須支援批次審核操作');
    assert.ok(rosterContent.includes('handleCopyTSV'), '必須支援 TSV 匯出至試算表功能');
  });

  it('應驗證 WebAdminMembers.tsx 具備變更 Diff 比對確認彈窗防呆機制', () => {
    assert.ok(membersContent.includes('wa-diff-modal'), '社員資料編輯儲存時必須跳出 Diff 比對視窗');
    assert.ok(membersContent.includes('wa-diff-table'), 'Diff 視窗必須使用表格呈現新舊值對照');
    assert.ok(membersContent.includes('handleTriggerDiffCheck'), '儲存前必須先比對差異');
    assert.ok(membersContent.includes('handleConfirmSaveToSupabase'), '確認無誤後才寫入 Supabase members');
  });

  it('應驗證 webAdmin.css 定義清新明亮 Light Clean Notion / Linear 品牌色與彈窗類別', () => {
    assert.ok(cssContent.includes('--wa-bg: #f8fafc;'), '必須定義明亮背景色彩變數');
    assert.ok(cssContent.includes('--wa-surface: #ffffff;'), '必須定義純白卡片底色變數');
    assert.ok(cssContent.includes('--wa-primary: #059669;'), '必須定義台科登山社綠色品牌主色');
    assert.ok(cssContent.includes('.wa-event-card'), '必須具備活動卡片樣式');
    assert.ok(cssContent.includes('.wa-modal-backdrop'), '必須具備置中彈窗遮罩樣式');
    assert.ok(cssContent.includes('.wa-modal-container'), '必須具備置中彈窗面板樣式');
    assert.ok(cssContent.includes('.wa-bilingual-grid'), '必須具備中英文雙欄樣式');
  });

  it('應驗證全體 Web Admin 元件與樣式檔案嚴格恪守零 Emoji 規範', () => {
    const adminDir = path.resolve('src/pages/web-admin');
    const files = fs.readdirSync(adminDir);
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const file of files) {
      const filePath = path.join(adminDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.strictEqual(
        emojiRegex.test(content),
        false,
        `檔案 ${file} 含有違規 Emoji 字元`
      );
    }
  });
});
