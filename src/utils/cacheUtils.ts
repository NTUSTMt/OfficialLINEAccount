/**
 * 前端輕量快取輔助模組 (SessionStorage Cache Helper)
 * 支援 TTL (Time-To-Live) 過期管理與例外安全防護
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryFallbackCache: Record<string, CacheEntry<any>> = {};

/**
 * 取得指定鍵值的快取資料
 * @param key 快取鍵名
 * @returns 若存在且未過期則回傳資料，否則回傳 null
 */
export function getCache<T>(key: string): T | null {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (entry.expiresAt && entry.expiresAt > now) {
        return entry.data;
      }
      // 已過期則清除
      sessionStorage.removeItem(key);
    }
  } catch (e) {
    // 若 sessionStorage 無法使用（如受限瀏覽器環境），使用記憶體快取作為備援
    const memEntry = memoryFallbackCache[key];
    if (memEntry && memEntry.expiresAt > now) {
      return memEntry.data as T;
    }
  }
  return null;
}

/**
 * 儲存資料至快取
 * @param key 快取鍵名
 * @param data 欲快取之資料
 * @param ttlSeconds 存活時間（秒），預設 300 秒 (5分鐘)
 */
export function setCache<T>(key: string, data: T, ttlSeconds: number = 300): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const entry: CacheEntry<T> = { data, expiresAt };
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // 記憶體備援
    memoryFallbackCache[key] = entry;
  }
}

/**
 * 移除指定鍵值之快取
 */
export function removeCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    // 忽略例外
  }
  delete memoryFallbackCache[key];
}

/**
 * 清除所有快取或指定前綴之快取
 */
export function clearCache(prefix?: string): void {
  try {
    if (!prefix) {
      sessionStorage.clear();
      Object.keys(memoryFallbackCache).forEach(k => delete memoryFallbackCache[k]);
      return;
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
    Object.keys(memoryFallbackCache).forEach(k => {
      if (k.startsWith(prefix)) delete memoryFallbackCache[k];
    });
  } catch (e) {
    // 忽略例外
  }
}
