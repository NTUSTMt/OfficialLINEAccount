import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('95. 社團幹部意願限制與社員系統使用導覽 (Officer Intent Constraint & Member Guide)', () => {
  const rootDir = process.cwd();
  const registerPath = path.join(rootDir, 'src/pages/Register.tsx');
  const appPath = path.join(rootDir, 'src/App.tsx');
  const guideModalPath = path.join(rootDir, 'src/components/common/SystemGuideModal.tsx');
  const zhPath = path.join(rootDir, 'src/locales/zh.json');
  const enPath = path.join(rootDir, 'src/locales/en.json');

  const registerContent = fs.readFileSync(registerPath, 'utf-8');
  const appContent = fs.readFileSync(appPath, 'utf-8');
  const guideModalContent = fs.readFileSync(guideModalPath, 'utf-8');
  const zhContent = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  it('1. 驗證 Register.tsx 幹部意願僅限臺科大在校學生顯示並勾選', () => {
    assert.ok(
      registerContent.includes("formData.identityStatus === '臺科大在校學生'"),
      '第四步必須依據 identityStatus 是否為臺科大在校學生決定是否呈現幹部意願區塊'
    );
    assert.ok(
      registerContent.includes("intendOfficer: val === '臺科大在校學生' ? prev.intendOfficer : ''"),
      '身分切換為非在校生時必須自動清空 intendOfficer'
    );
  });

  it('2. 驗證 Register.tsx 初次進入自動彈出系統導覽機制', () => {
    assert.ok(
      registerContent.includes('SystemGuideModal'),
      'Register.tsx 必須引入並渲染 SystemGuideModal'
    );
    assert.ok(
      registerContent.includes("localStorage.getItem('has_seen_member_system_guide')"),
      '首次進入必須檢查 localStorage 是否有看過導覽'
    );
    assert.ok(
      registerContent.includes('isGuideOpen'),
      '必須具備 isGuideOpen 狀態控制導覽燈箱開啟'
    );
  });

  it('3. 驗證 SystemGuideModal 4 步驟導覽結構與大頭貼切換重點', () => {
    assert.ok(
      guideModalContent.includes('guide.step1'),
      '導覽必須包含步驟一（個資用途與保險）'
    );
    assert.ok(
      guideModalContent.includes('guide.step2'),
      '導覽必須包含步驟二（大頭貼快速切換分頁）'
    );
    assert.ok(
      guideModalContent.includes('guide.step3'),
      '導覽必須包含步驟三（最新活動與借裝5折）'
    );
    assert.ok(
      guideModalContent.includes('guide.step4'),
      '導覽必須包含步驟四（繳費申報末五碼）'
    );
    assert.ok(
      guideModalContent.includes("localStorage.setItem('has_seen_member_system_guide', 'true')"),
      '關閉或完成導覽時必須標記已看過'
    );
    assert.ok(
      guideModalContent.includes('currentStep'),
      '必須具備分頁卡片切換步驟狀態'
    );
  });

  it('4. 驗證 App.tsx 大頭貼下拉選單常駐「使用指南」選項', () => {
    assert.ok(
      appContent.includes("t('nav.menuGuide', '使用指南')"),
      '大頭貼下拉選單必須具備使用指南項目'
    );
    assert.ok(
      appContent.includes('BookOpen'),
      '使用指南選項需搭配書本圖示'
    );
    assert.ok(
      appContent.includes('SystemGuideModal'),
      'App.tsx GlobalHeader 必須掛載 SystemGuideModal 供全站隨時開啟'
    );
  });

  it('5. 驗證中英文多國語系中 guide 與 menuGuide 定義完整性', () => {
    assert.strictEqual(zhContent.nav.menuGuide, '使用指南');
    assert.strictEqual(enContent.nav.menuGuide, 'User Guide');

    assert.ok(zhContent.guide, 'zh.json 必須包含 guide 命名空間');
    assert.ok(enContent.guide, 'en.json 必須包含 guide 命名空間');

    assert.ok(zhContent.guide.step2.desc.includes('LINE 大頭貼'), '中文步驟二需特別提及 LINE 大頭貼切換');
    assert.ok(enContent.guide.step2.desc.includes('Avatar'), '英文步驟二需特別提及 LINE Avatar 切換');
    assert.strictEqual(zhContent.guide.start, '開始填寫');
    assert.strictEqual(enContent.guide.start, 'Get Started');
  });

  it('6. 驗證全專案新增/修改之相關程式碼全篇零 Emoji', () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(guideModalContent), false, 'SystemGuideModal.tsx 不得含有 Emoji');
    assert.strictEqual(emojiRegex.test(JSON.stringify(zhContent.guide)), false, 'zh.json guide 不得含有 Emoji');
    assert.strictEqual(emojiRegex.test(JSON.stringify(enContent.guide)), false, 'en.json guide 不得含有 Emoji');
  });
});
