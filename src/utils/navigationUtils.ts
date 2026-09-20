import type { NavigateFunction } from 'react-router-dom';

/**
 * 智慧歷程返回導航：
 * 若瀏覽器有上一頁歷史（window.history.state.idx > 0），調用 navigate(-1) 精準回到來源頁面；
 * 若為直接開啟或重新整理無歷史紀錄，則平滑退回 fallbackPath，避免跳出應用或造成空白。
 */
export function safeNavigateBack(navigate: NavigateFunction, fallbackPath: string = '/admin') {
  if (
    typeof window !== 'undefined' &&
    window.history.state &&
    typeof window.history.state.idx === 'number' &&
    window.history.state.idx > 0
  ) {
    navigate(-1);
  } else {
    navigate(fallbackPath, { replace: true });
  }
}
