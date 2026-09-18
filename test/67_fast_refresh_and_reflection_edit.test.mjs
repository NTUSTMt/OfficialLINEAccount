import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Fast Refresh and Reflection Edit Tests', () => {
  const rootDir = process.cwd();

  it('should ensure AdminEvents prioritizes Supabase on reload and has sync success toast', () => {
    const adminEventsContent = fs.readFileSync(path.join(rootDir, 'src/pages/AdminEvents.tsx'), 'utf8');

    // 驗證即使 forceRefresh 為 true，也是優先嘗試 Supabase
    assert.ok(adminEventsContent.includes('fetchAdminEventsFromSupabase(userId)'), 'AdminEvents should call fetchAdminEventsFromSupabase on refresh');
    assert.ok(adminEventsContent.includes('fetchAdminEventSignupsFromSupabase'), 'AdminEvents should call fetchAdminEventSignupsFromSupabase on refresh');
    // 驗證 Toast 提示
    assert.ok(adminEventsContent.includes('toastMessage'), 'AdminEvents should define toastMessage state');
    assert.ok(adminEventsContent.includes('已同步最新資料！'), 'AdminEvents should display "已同步最新資料！" banner');
  });

  it('should ensure AdminFinance, AdminMembers, AdminLoans, AdminInventory, MemberRecords show sync success toast on refresh', () => {
    const financeContent = fs.readFileSync(path.join(rootDir, 'src/pages/AdminFinance.tsx'), 'utf8');
    assert.ok(financeContent.includes('已同步最新資料！'), 'AdminFinance should show success Toast on refresh');

    const membersContent = fs.readFileSync(path.join(rootDir, 'src/pages/AdminMembers.tsx'), 'utf8');
    assert.ok(membersContent.includes('已同步最新資料！'), 'AdminMembers should show success Toast on refresh');

    const loansContent = fs.readFileSync(path.join(rootDir, 'src/pages/AdminLoans.tsx'), 'utf8');
    assert.ok(loansContent.includes('已同步最新資料！'), 'AdminLoans should show success Toast on refresh');

    const inventoryContent = fs.readFileSync(path.join(rootDir, 'src/pages/AdminInventory.tsx'), 'utf8');
    assert.ok(inventoryContent.includes('已同步最新資料！'), 'AdminInventory should show success Toast on refresh');

    const recordsContent = fs.readFileSync(path.join(rootDir, 'src/pages/MemberRecords.tsx'), 'utf8');
    assert.ok(recordsContent.includes('已同步最新資料！'), 'MemberRecords should show success Toast on refresh');
  });

  it('should ensure Achievements supports reflection editing, photo deletion, and no notification on update', () => {
    const achievementsContent = fs.readFileSync(path.join(rootDir, 'src/pages/Achievements.tsx'), 'utf8');

    // 驗證 states
    assert.ok(achievementsContent.includes('const [isEditing, setIsEditing] = useState(false);'), 'Should have isEditing state');
    assert.ok(achievementsContent.includes('const [existingPhotos, setExistingPhotos] = useState<string[]>([]);'), 'Should have existingPhotos state');

    // 驗證編輯按鈕與取消編輯
    assert.ok(achievementsContent.includes('setIsEditing(true)'), 'Should allow unlocking edit mode');
    assert.ok(achievementsContent.includes('handleCancelEdit'), 'Should have handleCancelEdit method');

    // 驗證既有照片刪除與上限計算
    assert.ok(achievementsContent.includes('setExistingPhotos(prev => prev.filter((_, i) => i !== idx))'), 'Should allow removing individual existing photos');
    assert.ok(achievementsContent.includes('5 - existingPhotos.length - photoFiles.length'), 'Should compute remaining photo quota dynamically');

    // 驗證更新送出不重複發送 LINE 推播
    assert.ok(achievementsContent.includes('if (!isEditing) {'), 'Should only send notify_reflection_submitted when not editing');
    assert.ok(achievementsContent.includes('action: \'notify_reflection_submitted\''), 'Should contain notify_reflection_submitted call');

    // 驗證回饋提示
    assert.ok(achievementsContent.includes('t(\'achievements.alert.updateSuccess\')'), 'Should alert updateSuccess when updating');
    assert.ok(achievementsContent.includes('t(\'achievements.modal.saveEditBtn\')'), 'Should render saveEditBtn on edit mode');
  });

  it('should verify i18n keys for reflection edit exist in zh.json and en.json', () => {
    const zh = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/locales/zh.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/locales/en.json'), 'utf8'));

    assert.ok(zh.achievements.modal.editTitle, 'zh should have editTitle');
    assert.ok(zh.achievements.modal.editBtn, 'zh should have editBtn');
    assert.ok(zh.achievements.modal.cancelEditBtn, 'zh should have cancelEditBtn');
    assert.ok(zh.achievements.modal.saveEditBtn, 'zh should have saveEditBtn');
    assert.ok(zh.achievements.alert.updateSuccess, 'zh should have updateSuccess');

    assert.ok(en.achievements.modal.editTitle, 'en should have editTitle');
    assert.ok(en.achievements.modal.editBtn, 'en should have editBtn');
    assert.ok(en.achievements.modal.cancelEditBtn, 'en should have cancelEditBtn');
    assert.ok(en.achievements.modal.saveEditBtn, 'en should have saveEditBtn');
    assert.ok(en.achievements.alert.updateSuccess, 'en should have updateSuccess');
  });
});
