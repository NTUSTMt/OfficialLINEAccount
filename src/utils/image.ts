/**
 * 轉換 Google Drive 分享連結或預設連結為 Google 高速縮圖 CDN 網址
 * 使用 lh3.googleusercontent.com/d/{FILE_ID}=w{SIZE} 官方縮圖伺服器，
 * 可避免 docs.google.com/uc?export=view 的 403 限流與病毒掃描下載警告。
 * 
 * 若傳入非 Google Drive 之一般圖片網址 (如 Imgur, GitHub 等)，則原樣回傳。
 */
export function getDirectImageUrl(url: string | undefined, size: number = 1000): string | undefined {
  if (!url) return undefined;
  // 若傳入逗號、分號或換行分隔的多個網址，取第一個有效網址
  const rawUrl = url.split(/[\n,，;\s]+/).map(u => u.trim()).find(u => u.startsWith('http')) || url.trim();
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl || !cleanUrl.startsWith('http')) return undefined;
  
  // 匹配 Google Drive 格式：
  // 1. https://drive.google.com/file/d/{FILE_ID}/view...
  // 2. https://drive.google.com/open?id={FILE_ID}
  // 3. https://docs.google.com/uc?export=view&id={FILE_ID}
  // 4. https://drive.google.com/uc?id={FILE_ID}
  const driveRegex = /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:[^&]*&)?id=)([^/&?]+)/;
  const match = cleanUrl.match(driveRegex);
  
  if (match && match[1]) {
    const fileId = match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
  }

  // 5. 若已是 lh3.googleusercontent.com/d/{FILE_ID} 格式，替換或指定縮圖尺寸
  const lh3Regex = /(?:https?:\/\/)?lh\d?\.googleusercontent\.com\/d\/([^/=?]+)(?:=.*)?/;
  const lh3Match = cleanUrl.match(lh3Regex);
  if (lh3Match && lh3Match[1]) {
    const fileId = lh3Match[1];
    return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
  }
  
  return cleanUrl;
}
