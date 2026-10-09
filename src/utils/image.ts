/**
 * 安全圖片驗證、網址淨化與 Google Drive 高速縮圖轉換工具庫 (Image Security & CDN Utils)
 */

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// 允許之安全圖片 MIME 型態白名單 (嚴格排除包含腳本風險之 image/svg+xml)
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

// 嚴格禁止之上傳副檔名黑名單
const FORBIDDEN_EXTENSIONS = [
  '.svg',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.php',
  '.sh',
  '.exe',
  '.bat',
  '.vbs',
  '.xml',
  '.cgi',
  '.jar',
];

/**
 * 嚴格檢驗前端上傳之圖片檔案 (防禦惡意副檔名、偽造 MIME 與超大檔案)
 */
export function validateImageUploadFile(file: File, maxSizeBytes = 10 * 1024 * 1024): FileValidationResult {
  if (!file) {
    return { valid: false, error: '未選取任何檔案' };
  }

  // 1. 檔案大小檢驗
  if (file.size > maxSizeBytes) {
    const sizeMb = Math.round(maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `檔案大小超出限制 (單檔最大 ${sizeMb}MB)` };
  }

  const fileNameLower = (file.name || '').toLowerCase().trim();

  // 2. 副檔名安全檢驗
  for (const ext of FORBIDDEN_EXTENSIONS) {
    if (fileNameLower.endsWith(ext)) {
      return { valid: false, error: `不支援或禁止上傳此副檔名檔案 (${ext})，僅允許 JPG、PNG、WEBP、HEIC 圖片格式` };
    }
  }

  // 3. MIME Type 白名單檢驗
  const mimeLower = (file.type || '').toLowerCase().trim();
  if (mimeLower && !ALLOWED_IMAGE_MIME_TYPES.has(mimeLower)) {
    return { valid: false, error: `不支援的檔案格式 (${mimeLower || '未知'})，請上傳合法的圖片檔案` };
  }

  return { valid: true };
}

/**
 * 淨化外部超連結與圖片 URL，防範 javascript:、data:text/html 等 XSS 攻擊
 */
export function sanitizeUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // 檢查是否為合法協議 (https, http, tel, mailto, line)
  const isSafeProtocol = /^(https?:\/\/|tel:|mailto:|line:\/\/)/i.test(trimmed);
  if (!isSafeProtocol) {
    console.warn('[Security] 阻擋不安全之 URL 協議:', trimmed.slice(0, 30));
    return undefined;
  }

  // 嚴格攔截危險特徵字串
  const isDangerous = /^(javascript:|vbscript:|data:text\/html|data:application\/)/i.test(trimmed);
  if (isDangerous) {
    console.warn('[Security] 阻擋危險之 XSS URL 特徵:', trimmed.slice(0, 30));
    return undefined;
  }

  return trimmed;
}

/**
 * 轉換 Google Drive 分享連結或預設連結為 Google 高速縮圖 CDN 網址
 * 使用 lh3.googleusercontent.com/d/{FILE_ID}=w{SIZE} 官方縮圖伺服器，
 * 可避免 docs.google.com/uc?export=view 的 403 限流與病毒掃描下載警告。
 * 
 * 若傳入非 Google Drive 之一般圖片網址 (如 Imgur, GitHub 等)，則原樣回傳。
 */
export function getDirectImageUrl(url: string | undefined, size: number | string = 2048): string | undefined {
  if (!url) return undefined;
  // 若傳入逗號、分號或換行分隔的多個網址，取第一個有效網址
  const rawUrl = url.split(/[\n,，;\s]+/).map(u => u.trim()).find(u => u.startsWith('http')) || url.trim();
  const safeUrl = sanitizeUrl(rawUrl);
  if (!safeUrl || !safeUrl.startsWith('http')) return undefined;
  
  const sizeSuffix = typeof size === 'string' && size.startsWith('s')
    ? `=${size}`
    : (size === 0 || size === '0' || size === 's0' ? '=s0' : `=w${size}`);

  // 匹配 Google Drive 格式：
  // 1. https://drive.google.com/file/d/{FILE_ID}/view...
  // 2. https://drive.google.com/open?id={FILE_ID}
  // 3. https://docs.google.com/uc?export=view&id={FILE_ID}
  // 4. https://drive.google.com/uc?id={FILE_ID}
  const driveRegex = /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:[^&]*&)?id=)([^/&?]+)/;
  const match = safeUrl.match(driveRegex);
  
  if (match && match[1]) {
    const fileId = match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}${sizeSuffix}`;
  }

  // 5. 若已是 lh3.googleusercontent.com/d/{FILE_ID} 格式，替換或指定縮圖尺寸
  const lh3Regex = /(?:https?:\/\/)?lh\d?\.googleusercontent\.com\/d\/([^/=?]+)(?:=.*)?/;
  const lh3Match = safeUrl.match(lh3Regex);
  if (lh3Match && lh3Match[1]) {
    const fileId = lh3Match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}${sizeSuffix}`;
  }
  
  return safeUrl;
}
