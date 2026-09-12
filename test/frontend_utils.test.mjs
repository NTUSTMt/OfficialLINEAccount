import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ----------------------------------------------------
// 1. 模擬 src/utils/image.ts 中的 getDirectImageUrl 核心邏輯
// ----------------------------------------------------
function getDirectImageUrl(url, size = 1000) {
  if (!url) return undefined;
  const rawUrl = url.split(/[\n,，;\s]+/).map(u => u.trim()).find(u => u.startsWith('http')) || url.trim();
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl || !cleanUrl.startsWith('http')) return undefined;
  
  const driveRegex = /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:[^&]*&)?id=)([^/&?]+)/;
  const match = cleanUrl.match(driveRegex);
  
  if (match && match[1]) {
    const fileId = match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
  }

  const lh3Regex = /(?:https?:\/\/)?lh\d?\.googleusercontent\.com\/d\/([^/=?]+)(?:=.*)?/;
  const lh3Match = cleanUrl.match(lh3Regex);
  if (lh3Match && lh3Match[1]) {
    const fileId = lh3Match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
  }
  
  return cleanUrl;
}

// ----------------------------------------------------
// 2. 模擬快取輔助模組 (SessionStorage Cache Helper)
// ----------------------------------------------------
class MockCacheManager {
  constructor() {
    this.memoryFallbackCache = {};
    this.storage = {};
  }

  getCache(key) {
    const now = Date.now();
    const raw = this.storage[key];
    if (raw) {
      const entry = JSON.parse(raw);
      if (entry.expiresAt && entry.expiresAt > now) {
        return entry.data;
      }
      delete this.storage[key];
    }
    const memEntry = this.memoryFallbackCache[key];
    if (memEntry && memEntry.expiresAt > now) {
      return memEntry.data;
    }
    return null;
  }

  setCache(key, data, ttlSeconds = 300) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const entry = { data, expiresAt };
    this.storage[key] = JSON.stringify(entry);
    this.memoryFallbackCache[key] = entry;
  }

  removeCache(key) {
    delete this.storage[key];
    delete this.memoryFallbackCache[key];
  }

  clearCache(prefix) {
    if (!prefix) {
      this.storage = {};
      this.memoryFallbackCache = {};
      return;
    }
    Object.keys(this.storage).forEach(k => {
      if (k.startsWith(prefix)) delete this.storage[k];
    });
    Object.keys(this.memoryFallbackCache).forEach(k => {
      if (k.startsWith(prefix)) delete this.memoryFallbackCache[k];
    });
  }
}

// ----------------------------------------------------
// 3. 模擬狀態正規化模組 (Status Normalization & Badges)
// ----------------------------------------------------
function normalizeActivityStatus(status) {
  if (!status) return '審核中 Checking';
  const s = String(status).trim();
  if (s.includes('已繳費') || s.includes('Paid')) return '正取（已繳費）Confirmed(Paid)';
  if (s.includes('正取') || s.includes('Confirmed')) return '正取 Confirmed';
  if (s.includes('有意願') || s.toLowerCase().includes('interested')) return '備取（有意願）Waitlisted (Interested)';
  if (s.includes('備取') || s.includes('Waitlisted')) return '備取 Waitlisted';
  if (s.includes('已取消') || s.includes('Cancelled')) return '已取消 Cancelled';
  return s;
}

function calculatePaymentTotals({ selectedIds, unpaidList }) {
  const hasMembership = selectedIds.includes('fee_membership');
  let subtotal = 0;
  let totalDiscount = 0;

  // 社費
  unpaidList.membership.forEach(item => {
    if (selectedIds.includes(item.id)) {
      subtotal += item.amount;
    }
  });

  // 活動
  unpaidList.activities.forEach(item => {
    if (selectedIds.includes(item.id)) {
      subtotal += item.amount;
    }
  });

  // 裝備（若勾選社費且用途為個人借用，享 5 折優惠）
  unpaidList.equipments.forEach(item => {
    if (selectedIds.includes(item.id)) {
      const isPersonal = item.purpose && item.purpose.includes('個人');
      const isAlreadyMember = item.isMember === true || item.isMember === '是';
      const shouldDiscount = hasMembership && isPersonal && !isAlreadyMember;
      
      const originalAmount = item.amount;
      const finalAmount = shouldDiscount ? Math.round(originalAmount * 0.5) : originalAmount;
      const discount = originalAmount - finalAmount;

      subtotal += finalAmount;
      totalDiscount += discount;
    }
  });

  return {
    totalAmount: subtotal,
    totalDiscount,
    hasMembership,
    itemCount: selectedIds.length
  };
}

// ====================================================
// 測試集合
// ====================================================

describe('前端工具函式與純邏輯自動化測試 (Frontend Utils Test Suite)', () => {
  describe('1. 圖片 CDN URL 解析 (getDirectImageUrl)', () => {
    it('能正確解析 drive.google.com/file/d/FILE_ID/view 格式', () => {
      const input = 'https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing';
      const output = getDirectImageUrl(input, 800);
      assert.equal(output, 'https://lh3.googleusercontent.com/d/1a2b3c4d5e=w800');
    });

    it('能正確解析 docs.google.com/uc?export=view&id=FILE_ID 格式', () => {
      const input = 'https://docs.google.com/uc?export=view&id=1x2y3z4w';
      const output = getDirectImageUrl(input);
      assert.equal(output, 'https://lh3.googleusercontent.com/d/1x2y3z4w=w1000');
    });

    it('若已是 lh3.googleusercontent.com/d/FILE_ID=w400，動態更新其尺寸參數', () => {
      const input = 'https://lh3.googleusercontent.com/d/1SampleFileId=w400';
      const output = getDirectImageUrl(input, 1200);
      assert.equal(output, 'https://lh3.googleusercontent.com/d/1SampleFileId=w1200');
    });

    it('多個 URL 逗號分隔時，取第一個合法網址進行解析', () => {
      const input = 'https://drive.google.com/file/d/firstId/view, https://drive.google.com/file/d/secondId/view';
      const output = getDirectImageUrl(input);
      assert.equal(output, 'https://lh3.googleusercontent.com/d/firstId=w1000');
    });

    it('非 Google 外部圖片（如 Imgur, Cloudinary 等）應原樣保留', () => {
      const input = 'https://i.imgur.com/example.png';
      assert.equal(getDirectImageUrl(input), 'https://i.imgur.com/example.png');
    });

    it('空字串或無效值回傳 undefined', () => {
      assert.equal(getDirectImageUrl(''), undefined);
      assert.equal(getDirectImageUrl(undefined), undefined);
      assert.equal(getDirectImageUrl('not-a-valid-url'), undefined);
    });
  });

  describe('2. 快取安全與 TTL 控制 (MockCacheManager)', () => {
    it('存入快取後能立即讀出', () => {
      const cache = new MockCacheManager();
      cache.setCache('user_pref', { theme: 'dark' }, 60);
      const val = cache.getCache('user_pref');
      assert.deepEqual(val, { theme: 'dark' });
    });

    it('已過期之快取自動清除並回傳 null', () => {
      const cache = new MockCacheManager();
      // TTL 負數表示立即過期
      cache.setCache('expired_key', 'some_val', -1);
      const val = cache.getCache('expired_key');
      assert.equal(val, null);
    });

    it('支援前綴快取清除 (clearCache with prefix)', () => {
      const cache = new MockCacheManager();
      cache.setCache('officer_status_user1', true, 60);
      cache.setCache('officer_status_user2', false, 60);
      cache.setCache('other_data', 123, 60);

      cache.clearCache('officer_status_');
      assert.equal(cache.getCache('officer_status_user1'), null);
      assert.equal(cache.getCache('officer_status_user2'), null);
      assert.equal(cache.getCache('other_data'), 123);
    });
  });

  describe('3. 報名與活動狀態標準化 (normalizeActivityStatus)', () => {
    it('正規化「已繳費」相關字串為全形括號「正取（已繳費）Confirmed(Paid)」', () => {
      assert.equal(normalizeActivityStatus('正取 (已繳費)'), '正取（已繳費）Confirmed(Paid)');
      assert.equal(normalizeActivityStatus('正取（已繳費）Confirmed(Paid)'), '正取（已繳費）Confirmed(Paid)');
      assert.equal(normalizeActivityStatus('Confirmed (Paid)'), '正取（已繳費）Confirmed(Paid)');
    });

    it('正規化「備取意願」相關字串為全形括號「備取（有意願）Waitlisted (Interested)」', () => {
      assert.equal(normalizeActivityStatus('備取 (有意願)'), '備取（有意願）Waitlisted (Interested)');
      assert.equal(normalizeActivityStatus('Waitlisted (Interested)'), '備取（有意願）Waitlisted (Interested)');
    });

    it('標準正取、備取與已取消正確映射', () => {
      assert.equal(normalizeActivityStatus('正取 Confirmed'), '正取 Confirmed');
      assert.equal(normalizeActivityStatus('正取'), '正取 Confirmed');
      assert.equal(normalizeActivityStatus('備取 Waitlisted'), '備取 Waitlisted');
      assert.equal(normalizeActivityStatus('已取消 Cancelled'), '已取消 Cancelled');
    });
  });

  describe('4. 繳費結帳與社員5折動態試算 (calculatePaymentTotals)', () => {
    const mockUnpaid = {
      membership: [{ id: 'fee_membership', name: '學期社費', amount: 200 }],
      activities: [{ id: 'act_01', name: '雪山初階攀登', amount: 1500 }],
      equipments: [
        { id: 'eq_01', name: '雙人帳篷', amount: 220, purpose: '個人活動租借', isMember: false },
        { id: 'eq_02', name: '公用高山瓦斯爐', amount: 100, purpose: '社團官方出隊', isMember: false },
        { id: 'eq_03', name: '岩盔', amount: 80, purpose: '個人自主訓練', isMember: true } // 已是社員不重複打折
      ]
    };

    it('未勾選社費時，個人借裝依原價計算，無折扣', () => {
      const selectedIds = ['act_01', 'eq_01'];
      const result = calculatePaymentTotals({ selectedIds, unpaidList: mockUnpaid });
      assert.equal(result.totalAmount, 1720); // 1500 + 220
      assert.equal(result.totalDiscount, 0);
      assert.equal(result.hasMembership, false);
    });

    it('同時勾選社費與非社員之個人借裝時，個人借裝享 5 折折抵', () => {
      const selectedIds = ['fee_membership', 'act_01', 'eq_01'];
      const result = calculatePaymentTotals({ selectedIds, unpaidList: mockUnpaid });
      // 帳篷原價 220 -> 5折 110, 折扣 110
      // 總額 = 社費 200 + 活動 1500 + 帳篷 110 = 1810
      assert.equal(result.totalAmount, 1810);
      assert.equal(result.totalDiscount, 110);
      assert.equal(result.hasMembership, true);
    });

    it('社團出隊借裝或既有社員個人借裝，不觸發重複 5 折優惠', () => {
      const selectedIds = ['fee_membership', 'eq_02', 'eq_03'];
      const result = calculatePaymentTotals({ selectedIds, unpaidList: mockUnpaid });
      // eq_02: 出隊 -> 100 (不打折)
      // eq_03: 已是社員 -> 80 (不重複折抵)
      // 總額 = 社費 200 + 100 + 80 = 380
      assert.equal(result.totalAmount, 380);
      assert.equal(result.totalDiscount, 0);
    });
  });

  describe('5. 租借日期合法性判定與活動字數限制規則', () => {
    function isInvalidDateRange(pickupDate, returnDate) {
      return Boolean(pickupDate && returnDate && returnDate < pickupDate);
    }

    it('歸還日期早於領取日期判定為不合法 (true)', () => {
      assert.equal(isInvalidDateRange('2026-09-12', '2026-09-10'), true);
      assert.equal(isInvalidDateRange('2026-09-15', '2026-09-14'), true);
    });

    it('歸還日期晚於或等於領取日期判定為合法 (false)', () => {
      assert.equal(isInvalidDateRange('2026-09-10', '2026-09-12'), false);
      assert.equal(isInvalidDateRange('2026-09-12', '2026-09-12'), false);
      assert.equal(isInvalidDateRange('', '2026-09-12'), false);
      assert.equal(isInvalidDateRange('2026-09-10', ''), false);
    });

    it('活動編輯字數限制：簡介 1000、詳細 700、總計 1400', () => {
      const SHORT_DESC_LIMIT = 1000;
      const FULL_DESC_LIMIT = 700;
      const TOTAL_DESC_LIMIT = 1400;

      function checkDescLimits(shortDesc, fullDesc) {
        const shortCount = (shortDesc || '').length;
        const fullCount = (fullDesc || '').length;
        const totalCount = shortCount + fullCount;

        const isShortOver = shortCount > SHORT_DESC_LIMIT;
        const isFullOver = fullCount > FULL_DESC_LIMIT;
        const isTotalOver = totalCount > TOTAL_DESC_LIMIT;

        // 送出阻擋條件：總字數不超過 1400
        const isBlocked = isTotalOver;

        return { shortCount, fullCount, totalCount, isShortOver, isFullOver, isTotalOver, isBlocked };
      }

      // 案例 1: 簡介 850 字、詳細 500 字，總計 1350 字 <= 1400 -> 可送出
      const c1 = checkDescLimits('A'.repeat(850), 'B'.repeat(500));
      assert.equal(c1.totalCount, 1350);
      assert.equal(c1.isShortOver, false);
      assert.equal(c1.isFullOver, false);
      assert.equal(c1.isBlocked, false);

      // 案例 2: 簡介 950 字、詳細 650 字，總計 1600 字 > 1400 -> 阻擋不可送出
      const c2 = checkDescLimits('A'.repeat(950), 'B'.repeat(650));
      assert.equal(c2.totalCount, 1600);
      assert.equal(c2.isTotalOver, true);
      assert.equal(c2.isBlocked, true);

      // 案例 3: 簡介 1000 字、詳細 400 字，總計 1400 字剛好滿額 -> 可送出
      const c3 = checkDescLimits('A'.repeat(1000), 'B'.repeat(400));
      assert.equal(c3.totalCount, 1400);
      assert.equal(c3.isBlocked, false);
    });
  });
});

