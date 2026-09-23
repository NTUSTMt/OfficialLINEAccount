import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Bilingual Events and Preferred Language Tests', () => {
  const rootDir = process.cwd();

  describe('1. Admin Event Form and Bilingual Tabs', () => {
    it('should verify AdminEventForm supports bilingual tab switching and draft saving', () => {
      const formContent = fs.readFileSync(
        path.join(rootDir, 'src/components/admin/AdminEventForm.tsx'),
        'utf8'
      );

      // 驗證存在 activeLangTab 分頁切換狀態
      assert.ok(formContent.includes('activeLangTab'), 'AdminEventForm should have activeLangTab');
      assert.ok(formContent.includes('setActiveLangTab'), 'AdminEventForm should handle lang tab changes via setActiveLangTab');

      // 驗證英文欄位
      assert.ok(formContent.includes('nameEn'), 'AdminEventForm should include nameEn field');
      assert.ok(formContent.includes('shortDescEn'), 'AdminEventForm should include shortDescEn field');
      assert.ok(formContent.includes('fullDescEn'), 'AdminEventForm should include fullDescEn field');

      // 驗證雙按鈕：暫存活動與確認發布
      assert.ok(formContent.includes('onSaveDraft'), 'AdminEventForm should have onSaveDraft prop');
      assert.ok(formContent.includes('saveDraft'), 'AdminEventForm should have draft button translation');
      assert.ok(formContent.includes('confirmPublish'), 'AdminEventForm should have publish button translation');

      // 驗證即時預覽雙語連動
      assert.ok(
        formContent.includes("activeLangTab === 'en'"),
        'AdminEventForm preview should switch with activeLangTab'
      );
    });

    it('should verify AdminEvents page implements strict bilingual publishing validation and draft saving', () => {
      const pageContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/AdminEvents.tsx'),
        'utf8'
      );

      // 驗證已移除頂部「發布新活動」文字，換成中英切換 segmented control
      assert.ok(
        pageContent.includes('handleSaveDraft'),
        'AdminEvents should implement handleSaveDraft'
      );

      // 驗證發布驗證時同時嚴格檢查中英文欄位
      assert.ok(
        pageContent.includes('missingZh'),
        'AdminEvents should validate Chinese required fields'
      );
      assert.ok(
        pageContent.includes('missingEn'),
        'AdminEvents should validate English required fields'
      );
      assert.ok(
        pageContent.includes('nameEn.trim()'),
        'AdminEvents should check nameEn in publish validation'
      );
      assert.ok(
        pageContent.includes('shortDescEn.trim()'),
        'AdminEvents should check shortDescEn in publish validation'
      );
      assert.ok(
        pageContent.includes('fullDescEn.trim()'),
        'AdminEvents should check fullDescEn in publish validation'
      );

      // 驗證缺漏時自動跳轉分頁聚焦未填欄位
      assert.ok(
        pageContent.includes("setActiveLangTab('zh')") && pageContent.includes("setActiveLangTab('en')"),
        'AdminEvents should automatically switch tab to missing language'
      );
    });

    it('should verify AdminEventCard and AdminHistoryEventCard display bilingual names', () => {
      const cardContent = fs.readFileSync(
        path.join(rootDir, 'src/components/admin/AdminEventCard.tsx'),
        'utf8'
      );
      assert.ok(
        cardContent.includes('{evt.name}{evt.nameEn ? ` / ${evt.nameEn}` : \'\'}'),
        'AdminEventCard should display bilingual title'
      );

      const historyCardContent = fs.readFileSync(
        path.join(rootDir, 'src/components/admin/AdminHistoryEventCard.tsx'),
        'utf8'
      );
      assert.ok(
        historyCardContent.includes('{evt.name}{evt.nameEn ? ` / ${evt.nameEn}` : \'\'}'),
        'AdminHistoryEventCard should display bilingual title'
      );
    });
  });

  describe('2. Member Preferred Language in Registration and Profile', () => {
    it('should verify Register.tsx includes preferredLanguage in Step 1 with zh and en options', () => {
      const registerContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/Register.tsx'),
        'utf8'
      );

      // 驗證 Step 1 包含 preferredLanguage 下拉選單
      assert.ok(
        registerContent.includes('name="preferredLanguage"'),
        'Register.tsx should have preferredLanguage select input'
      );
      assert.ok(
        registerContent.includes('value="zh"') && registerContent.includes('value="en"'),
        'Register.tsx preferredLanguage select should only have zh and en options'
      );

      // 驗證驗證規則 (Step 1 必填)
      assert.ok(
        registerContent.includes('formData.preferredLanguage'),
        'Register.tsx should check preferredLanguage validity'
      );

      // 驗證儲存成功後自動切換 i18n 語系並持久化
      assert.ok(
        registerContent.includes('i18n.changeLanguage'),
        'Register.tsx should change language upon successful save'
      );
      assert.ok(
        registerContent.includes("localStorage.setItem('i18nextLng'"),
        'Register.tsx should persist i18nextLng to localStorage'
      );
    });

    it('should verify MemberDetailEdit and MemberProfileModal support preferred_language', () => {
      const editContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/MemberDetailEdit.tsx'),
        'utf8'
      );
      assert.ok(
        editContent.includes("preferred_language: '偏好語言 (Preferred Language)'"),
        'MemberDetailEdit should have preferred_language label'
      );
      assert.ok(
        editContent.includes("handleFieldChange('preferred_language'"),
        'MemberDetailEdit should handle preferred_language changes'
      );

      const modalContent = fs.readFileSync(
        path.join(rootDir, 'src/components/admin/MemberProfileModal.tsx'),
        'utf8'
      );
      assert.ok(
        modalContent.includes('preferredLang'),
        'MemberProfileModal should extract preferredLang'
      );
      assert.ok(
        modalContent.includes('偏好語言：'),
        'MemberProfileModal should display preferred language'
      );
    });
  });

  describe('3. Supabase Integration and GAS push notifications', () => {
    it('should verify supabaseClient.ts maps bilingual fields for events and preferredLanguage for members', () => {
      const sbContent = fs.readFileSync(
        path.join(rootDir, 'src/utils/supabaseClient.ts'),
        'utf8'
      );

      // 活動查詢映射
      assert.ok(sbContent.includes('nameEn: row.title_en'), 'supabaseClient should map title_en to nameEn');
      assert.ok(sbContent.includes('shortDescEn: row.summary_en'), 'supabaseClient should map summary_en to shortDescEn');
      assert.ok(sbContent.includes('fullDescEn: row.itinerary_en'), 'supabaseClient should map itinerary_en to fullDescEn');

      // 活動儲存映射 (傳遞 nameEn, shortDescEn, fullDescEn 至 save_admin_event_rpc)
      assert.ok(sbContent.includes('nameEn?: string;'), 'supabaseClient should support nameEn in saveEventToSupabase');
      assert.ok(sbContent.includes('shortDescEn?: string;'), 'supabaseClient should support shortDescEn in saveEventToSupabase');
      assert.ok(sbContent.includes('fullDescEn?: string;'), 'supabaseClient should support fullDescEn in saveEventToSupabase');
      assert.ok(sbContent.includes("rpc('save_admin_event_rpc'"), 'supabaseClient should call save_admin_event_rpc');

      // 社員個人資料映射
      assert.ok(
        sbContent.includes('preferredLanguage: data.preferred_language'),
        'supabaseClient should fetch preferred_language'
      );
      assert.ok(
        sbContent.includes('preferred_language: formData.preferredLanguage'),
        'supabaseClient should save preferred_language'
      );
    });

    it('should verify gas.js supports bilingual event fields and respects user preferredLanguage in LINE messages', () => {
      const gasContent = fs.readFileSync(
        path.join(rootDir, 'src/gas.js'),
        'utf8'
      );

      // 活動儲存與 Supabase 同步
      assert.ok(gasContent.includes('title_en: eventData.nameEn'), 'gas.js should pass title_en to Supabase');
      assert.ok(gasContent.includes('summary_en: eventData.shortDescEn'), 'gas.js should pass summary_en to Supabase');
      assert.ok(gasContent.includes('itinerary_en: eventData.fullDescEn'), 'gas.js should pass itinerary_en to Supabase');

      // LINE 推播訊息語言適配
      assert.ok(
        gasContent.includes('prefLang === "en"') && gasContent.includes('prefLang === "zh"'),
        'gas.js should respect user preferred language for push notifications'
      );

      // GAS 幹部活動管理清單備援包含雙語欄位
      assert.ok(gasContent.includes('nameEn: e.title_en || ""'), 'gas.js _handleGetAdminEvents should map nameEn');
      assert.ok(gasContent.includes('shortDescEn: e.summary_en || ""'), 'gas.js _handleGetAdminEvents should map shortDescEn');
      assert.ok(gasContent.includes('fullDescEn: e.itinerary_en || ""'), 'gas.js _handleGetAdminEvents should map fullDescEn');
    });

    it('should verify get_admin_events_rpc in SQL migration includes bilingual fields', () => {
      const sqlContent = fs.readFileSync(
        path.join(rootDir, 'supabase/fix_admin_events_rpc_bilingual.sql'),
        'utf8'
      );

      assert.ok(sqlContent.includes("'nameEn', COALESCE(e.title_en, '')"), 'get_admin_events_rpc should return nameEn');
      assert.ok(sqlContent.includes("'shortDescEn', COALESCE(e.summary_en, '')"), 'get_admin_events_rpc should return shortDescEn');
      assert.ok(sqlContent.includes("'fullDescEn', COALESCE(e.itinerary_en, '')"), 'get_admin_events_rpc should return fullDescEn');
      assert.ok(sqlContent.includes('e.title_en'), 'GROUP BY should include e.title_en');
      assert.ok(sqlContent.includes('e.summary_en'), 'GROUP BY should include e.summary_en');
      assert.ok(sqlContent.includes('e.itinerary_en'), 'GROUP BY should include e.itinerary_en');
    });
  });
});
