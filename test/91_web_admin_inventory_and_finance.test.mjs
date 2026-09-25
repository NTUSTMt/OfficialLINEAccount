import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('91. 裝備庫存與財務對帳頁面重構與修復驗證 (Inventory & Finance Redesign)', () => {
  const rootDir = process.cwd();
  const layoutPath = path.join(rootDir, 'src/pages/web-admin/WebAdminLayout.tsx');
  const inventoryPath = path.join(rootDir, 'src/pages/web-admin/WebAdminInventory.tsx');
  const financePath = path.join(rootDir, 'src/pages/web-admin/WebAdminFinance.tsx');
  const cssPath = path.join(rootDir, 'src/pages/web-admin/webAdmin.css');
  const migrationPath = path.join(rootDir, 'supabase/migrations/20260925_cleanup_equipment_prices_and_update_loan_rpc.sql');

  const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
  const inventoryContent = fs.readFileSync(inventoryPath, 'utf-8');
  const financeContent = fs.readFileSync(financePath, 'utf-8');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

  it('1. 驗證 WebAdminLayout.tsx 導覽項目更名為「裝備庫存」與「財務對帳」', () => {
    assert.ok(
      layoutContent.includes('<span>裝備庫存</span>'),
      '導覽項目必須更名為「裝備庫存」'
    );
    assert.ok(
      !layoutContent.includes('<span>裝備庫存管控</span>'),
      '導覽項目不應再包含舊名稱「裝備庫存管控」'
    );
    assert.ok(
      layoutContent.includes('<span>財務對帳</span>'),
      '導覽項目必須更名為「財務對帳」'
    );
    assert.ok(
      !layoutContent.includes('<span>財務對帳核銷</span>'),
      '導覽項目不應再包含舊名稱「財務對帳核銷」'
    );
  });

  it('2. 驗證 WebAdminInventory.tsx 工具列移除橫條文字，重整改為純圖示，右側新增「新增裝備」按鈕', () => {
    // 移除橫條文字
    assert.ok(
      !inventoryContent.includes('裝備品項與庫存'),
      '工具列中不應再包含「裝備品項與庫存」橫條文字'
    );
    // 重整按鈕為純圖示
    assert.ok(
      inventoryContent.includes('aria-label="重新整理裝備清單"'),
      '重整按鈕必須具備無障礙標籤 aria-label'
    );
    assert.ok(
      !inventoryContent.includes('<span>重新整理</span>'),
      '重整按鈕不應再顯示「重新整理」文字，必須為純圖示'
    );
    // 新增裝備按鈕
    assert.ok(
      inventoryContent.includes('新增裝備'),
      '工具列右側必須具備「新增裝備」按鈕'
    );
    assert.ok(
      inventoryContent.includes('handleOpenAddDrawer'),
      '點擊新增裝備必須觸發 handleOpenAddDrawer'
    );
  });

  it('3. 驗證裝備表格欄位：編號、分類下拉選單、目前可借修改、基礎價純數字無NT$、無規格說明、備註展開與操作鉛筆按鈕', () => {
    // 裝備編號更名為「編號」
    assert.ok(
      inventoryContent.includes('<th>編號</th>'),
      '表頭必須為「編號」'
    );
    assert.ok(
      !inventoryContent.includes('<th>裝備編號</th>'),
      '表頭不應再出現「裝備編號」'
    );

    // 系統分類下拉選單
    assert.ok(
      inventoryContent.includes('wa-table-select'),
      '表格分類必須使用 wa-table-select 渲染下拉選單'
    );
    assert.ok(
      inventoryContent.includes('handleCategoryChange'),
      '必須具備 handleCategoryChange 即時更新分類'
    );

    // 目前可借修改
    assert.ok(
      inventoryContent.includes('handleAdjustAvailableQty'),
      '必須具備 handleAdjustAvailableQty 修改目前可借數量'
    );

    // 基礎價 (2天) 與無 NT$
    assert.ok(
      inventoryContent.includes('<th>基礎價 (2天)</th>'),
      '表頭必須具備「基礎價 (2天)」'
    );
    assert.ok(
      !inventoryContent.includes('<th>社員價 (2天)</th>') && !inventoryContent.includes('<th>非社員價 (2天)</th>'),
      '表格中不應再出現「社員價 (2天)」或「非社員價 (2天)」'
    );
    assert.ok(
      !inventoryContent.includes('NT$'),
      '價格欄位不應再顯示「NT$」前綴，直接用數字'
    );

    // 規格說明移除，保留備註自適應欄高
    assert.ok(
      !inventoryContent.includes('<th>規格說明</th>'),
      '表頭不應再出現「規格說明」'
    );
    assert.ok(
      inventoryContent.includes('wa-table-note-cell'),
      '備註欄必須使用 wa-table-note-cell 支援自適應高度'
    );
    assert.ok(
      inventoryContent.includes('expandedNotesId'),
      '必須具備 expandedNotesId 控制備註欄高展開'
    );

    // 最右側鉛筆按鈕
    assert.ok(
      inventoryContent.includes('Pencil'),
      '表格最右側操作欄必須包含鉛筆圖示'
    );
    assert.ok(
      inventoryContent.includes('handleOpenEditDrawer'),
      '點擊鉛筆圖示必須觸發 handleOpenEditDrawer'
    );
  });

  it('4. 驗證側邊抽屜比照手機版相片輪播上傳、新增/編輯邏輯且文字純靠左', () => {
    assert.ok(
      inventoryContent.includes('wa-drawer-panel'),
      '必須使用懸浮圓角側邊抽屜 wa-drawer-panel'
    );
    assert.ok(
      inventoryContent.includes('wa-inventory-carousel-box'),
      '必須具備 1:1 正方形相片輪播容器 wa-inventory-carousel-box'
    );
    assert.ok(
      inventoryContent.includes('handlePhotoUpload'),
      '必須支援相片上傳處理 handlePhotoUpload'
    );
    assert.ok(
      inventoryContent.includes('handleRemovePhoto'),
      '必須支援相片刪除 handleRemovePhoto'
    );
    assert.ok(
      inventoryContent.includes('textAlign: \'left\''),
      '抽屜表單文字必須設定為純靠左對齊'
    );
  });

  it('5. 驗證 WebAdminFinance.tsx 頁面修復：調用 fetchFinanceItemsFromSupabase 且預設狀態為 ALL', () => {
    assert.ok(
      financeContent.includes('fetchFinanceItemsFromSupabase'),
      '必須調用 fetchFinanceItemsFromSupabase 整合所有款項'
    );
    assert.ok(
      financeContent.includes('statusFilter, setStatusFilter] = useState<\'ALL\' | \'PENDING\' | \'CONFIRMED\'>(\'ALL\')'),
      '預設 statusFilter 必須為 ALL 以杜絕空白問題'
    );
    assert.ok(
      financeContent.includes('bank_last5'),
      '財務表格必須正確讀取 bank_last5 欄位'
    );
    assert.ok(
      !financeContent.includes('財務對帳與核銷'),
      '工具列中不應再包含「財務對帳與核銷」大字橫條'
    );
    assert.ok(
      financeContent.includes('aria-label="重新整理財務款項清單"'),
      '財務重新整理按鈕必須為純圖示並具備 aria-label'
    );
  });

  it('6. 驗證資料庫遷移檔正確清理 member_price_per_day 與 non_member_price_per_day 欄位', () => {
    assert.ok(
      migrationContent.includes('ALTER TABLE equipments DROP COLUMN IF EXISTS member_price_per_day;'),
      '遷移檔必須包含刪除 member_price_per_day 語法'
    );
    assert.ok(
      migrationContent.includes('ALTER TABLE equipments DROP COLUMN IF EXISTS non_member_price_per_day;'),
      '遷移檔必須包含刪除 non_member_price_per_day 語法'
    );
    assert.ok(
      migrationContent.includes('COALESCE(price_2day, 0) AS p2'),
      'submit_equipment_loan_rpc 必須改為以 price_2day 為主'
    );
  });

  it('7. 驗證所有修改檔案嚴格遵守零 Emoji 規範', () => {
    const files = [layoutPath, inventoryPath, financePath, cssPath, migrationPath];
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(
        emojiRegex.test(content),
        false,
        `檔案 ${path.basename(filePath)} 含有違規 Emoji 字元`
      );
    }
  });
});
