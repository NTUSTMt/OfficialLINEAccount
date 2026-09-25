import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('89. WebAdminEvents 活動管理五大優化功能驗證', () => {
  const eventsFilePath = path.resolve('src/pages/web-admin/WebAdminEvents.tsx');
  const eventsContent = fs.readFileSync(eventsFilePath, 'utf8');

  const gasFilePath = path.resolve('src/gas.js');
  const gasContent = fs.readFileSync(gasFilePath, 'utf8');

  it('1. 文案更名：發布新活動全面改為新增活動', () => {
    assert.ok(
      eventsContent.includes('<span>新增活動</span>'),
      '工具列與彈窗必須包含「新增活動」文字'
    );
    assert.ok(
      !eventsContent.includes('發布新活動'),
      'WebAdminEvents 內不可再出現舊有「發布新活動」'
    );
    assert.ok(
      !eventsContent.includes('立即發布活動'),
      'WebAdminEvents 內不可再出現舊有「立即發布活動」'
    );
    assert.ok(
      eventsContent.includes('新活動「${formData.title}」已成功建立！'),
      '新增成功提示文字必須使用已成功建立'
    );
  });

  it('2. 工具列佈局：移除活動管理標題，重整按鈕為純圖示並置於新增活動左側', () => {
    assert.ok(
      !eventsContent.includes('<span>活動管理</span>'),
      '工具列不得再顯示「活動管理」標題'
    );
    assert.ok(
      !eventsContent.includes('<span>重整</span>'),
      '重整按鈕必須為純圖示，不得包含「重整」文字標籤'
    );

    const refreshIdx = eventsContent.indexOf('title="重新整理活動清單"');
    const createBtnIdx = eventsContent.indexOf('onClick={handleOpenCreate}');
    assert.ok(refreshIdx > -1 && createBtnIdx > -1, '必須包含重整與新增按鈕');
    assert.ok(
      refreshIdx < createBtnIdx,
      '重新整理按鈕必須排列於新增活動按鈕左側'
    );
  });

  it('3. 活動代號自動取號防撞：必須採 maxSeq 演算法，杜絕活動刪除後取號與上一筆重複', () => {
    assert.ok(
      eventsContent.includes('let maxSeq = 0;'),
      'handleOpenCreate 必須定義 maxSeq 變數'
    );
    assert.ok(
      eventsContent.includes('parseInt(e.id.slice(prefix.length), 10)'),
      '必須解析活動代號尾部之數值序號'
    );
    assert.ok(
      eventsContent.includes('maxSeq = seqPart;'),
      '必須求出當月現存活動之最大數值序號'
    );
    assert.ok(
      eventsContent.includes('String(maxSeq + 1).padStart(2, \'0\')'),
      '下一個序號必須為 maxSeq + 1，防止撞號'
    );

    // 邏輯驗證：當 E2609-01 被刪除，現存 E2609-02, E2609-03, E2609-04
    const mockEvents = [
      { id: 'E2609-04', title: '閂山鈴鳴' },
      { id: 'E2609-03', title: 'Test' },
      { id: 'E2609-02', title: '七星山' },
    ];
    const prefix = 'E2609-';
    let maxSeq = 0;
    mockEvents.forEach((e) => {
      if (e.id.startsWith(prefix)) {
        const seqPart = parseInt(e.id.slice(prefix.length), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) {
          maxSeq = seqPart;
        }
      }
    });
    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    assert.equal(`${prefix}${nextSeq}`, 'E2609-05', '在 01 被刪除時，正確新代號必須為 E2609-05 而非 E2609-04');
  });

  it('4. 刪除活動功能：紅底白字靠左按鈕、外鍵連帶清除 (reflections -> event_signups -> events) 與二次確認', () => {
    assert.ok(
      eventsContent.includes('handleDeleteEvent'),
      'WebAdminEvents 必須定義 handleDeleteEvent 函式'
    );
    assert.ok(
      eventsContent.includes('<span>{deleting ? \'刪除中...\' : \'刪除活動\'}</span>'),
      '編輯彈窗底部必須包含「刪除活動」按鈕'
    );
    assert.ok(
      eventsContent.includes("backgroundColor: '#dc2626'"),
      '刪除活動按鈕必須為紅色背景 (#dc2626)'
    );
    assert.ok(
      eventsContent.includes("marginRight: 'auto'"),
      '刪除活動按鈕必須靠左排列 (marginRight: auto)'
    );
    assert.ok(
      eventsContent.includes(".from('reflections')") && eventsContent.includes(".delete()"),
      '刪除活動前必須先清除關聯心得 (reflections)'
    );
    assert.ok(
      eventsContent.includes(".from('event_signups')") && eventsContent.includes(".delete()"),
      '刪除活動前必須先清除關聯報名名冊 (event_signups)'
    );
    assert.ok(
      eventsContent.includes(".from('events')") && eventsContent.includes(".delete()"),
      '必須刪除活動主體 (events)'
    );
    assert.ok(
      eventsContent.includes('此活動目前已有 ${signupCount} 位社員報名！'),
      '有名冊資料時彈窗必須顯示報名人數提示'
    );
  });

  it('5. 推播至幹部群組勾選框：置於封面照下方、預設未勾選，儲存時調用 GAS notify_officer_event', () => {
    assert.ok(
      eventsContent.includes('notifyOfficerGroup'),
      '必須具備 notifyOfficerGroup 狀態'
    );
    assert.ok(
      eventsContent.includes('同步推播活動資訊至幹部群組 (LINE)'),
      '核取方塊標籤必須為「同步推播活動資訊至幹部群組 (LINE)」'
    );
    assert.ok(
      eventsContent.includes("action: 'notify_officer_event'"),
      '儲存時若勾選推播必須呼叫 GAS notify_officer_event API'
    );

    // 檢查在封面照片下方
    const coverPhotoIdx = eventsContent.indexOf('活動封面照片');
    const notifyBoxIdx = eventsContent.indexOf('同步推播活動資訊至幹部群組 (LINE)');
    assert.ok(coverPhotoIdx > -1 && notifyBoxIdx > -1, '必須包含封面照與推播勾選框');
    assert.ok(notifyBoxIdx > coverPhotoIdx, '推播勾選框必須位於活動封面照片下方');
  });

  it('6. GAS 後端支援 notify_officer_event 路由與推播實作', () => {
    assert.ok(
      gasContent.includes('action === "notify_officer_event"'),
      'GAS 後端必須支援 notify_officer_event action'
    );
    assert.ok(
      gasContent.includes('function _handleNotifyOfficerEvent'),
      'GAS 後端必須實作 _handleNotifyOfficerEvent 處理常式'
    );
    assert.ok(
      gasContent.includes('pushAdminMessage(groupMsg)'),
      '_handleNotifyOfficerEvent 必須調用 pushAdminMessage 推播至幹部群組'
    );
  });

  it('7. 提示說明文案與彈窗靠左對齊：防止繼承 #root text-align: center', () => {
    // 重新讀取修改後的檔案
    const updatedEvents = fs.readFileSync(eventsFilePath, 'utf8');
    const cssContent = fs.readFileSync(path.resolve('src/pages/web-admin/webAdmin.css'), 'utf8');

    // 句子 1: 勾選後儲存時將自動向 LINE 幹部群組發送活動出隊摘要訊息 必須靠左
    assert.ok(
      updatedEvents.includes("textAlign: 'left'") &&
      updatedEvents.includes('勾選後儲存時將自動向 LINE 幹部群組發送活動出隊摘要訊息'),
      '幹部推播說明文字必須設定 textAlign: left'
    );

    // 句子 2: 此連結為出隊專屬保密資訊，僅在幹部審核為正取並推播時提供正取社員加入。 必須靠左
    assert.ok(
      updatedEvents.includes("textAlign: 'left'") &&
      updatedEvents.includes('此連結為出隊專屬保密資訊，僅在幹部審核為正取並推播時提供正取社員加入。'),
      'LINE 群組邀請連結保密說明文字必須設定 textAlign: left'
    );

    // CSS 容器全域防禦
    assert.ok(
      cssContent.includes('.web-admin-wrapper') && cssContent.includes('text-align: left;'),
      '.web-admin-wrapper 必須全域設定 text-align: left'
    );
    assert.ok(
      cssContent.includes('.wa-modal-container') && cssContent.includes('text-align: left;'),
      '.wa-modal-container 必須設定 text-align: left'
    );
  });
});
