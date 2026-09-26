/**
 * 輔助函式：將 Google Drive 檔案連結轉換為可直接在網頁顯示的縮圖網址
 */
export const getDriveThumbnail = (url?: string | null): string => {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com')) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }
  return url;
};
