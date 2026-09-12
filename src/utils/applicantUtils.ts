import liff from '@line/liff';

export const openExternalUrl = (url: string) => {
  try {
    if (liff.isInClient()) {
      liff.openWindow({ url, external: true });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export const parseProofUrls = (rawProof?: string): string[] => {
  if (!rawProof) return [];
  return rawProof
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      if (item.startsWith('http://') || item.startsWith('https://')) {
        return item;
      }
      if (/^[a-zA-Z0-9_-]{25,}$/.test(item)) {
        return `https://drive.google.com/file/d/${item}/view`;
      }
      return '';
    })
    .filter((url) => url !== '');
};
