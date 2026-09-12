/**
 * 全域狀態正規化與徽章樣式工具 (Status Normalization & Badge Helpers)
 */

export interface StatusStyle {
  bg: string;
  text: string;
  label: string;
  border?: string;
}

/**
 * 活動審核狀態字串標準化
 */
export function normalizeActivityStatus(status: string | undefined): string {
  if (!status) return '審核中 Checking';
  const s = String(status).trim();
  if (s.includes('已繳費') || s.includes('Paid')) return '正取（已繳費）Confirmed(Paid)';
  if (s.includes('正取') || s.includes('Confirmed')) return '正取 Confirmed';
  if (s.includes('有意願') || s.toLowerCase().includes('interested')) return '備取（有意願）Waitlisted (Interested)';
  if (s.includes('備取') || s.includes('Waitlisted')) return '備取 Waitlisted';
  if (s.includes('已取消') || s.includes('Cancelled')) return '已取消 Cancelled';
  if (s.includes('審核中') || s.includes('Checking')) return '審核中 Checking';
  return s;
}

/**
 * 取得活動審核狀態之樣式設定
 */
export function getActivityStatusStyle(status: string | undefined): StatusStyle {
  const normalized = normalizeActivityStatus(status);

  if (normalized === '正取（已繳費）Confirmed(Paid)') {
    return { bg: '#065f46', text: '#ffffff', label: '正取 (已繳費)' };
  }
  if (normalized === '正取 Confirmed') {
    return { bg: '#dcfce7', text: '#166534', label: '正取' };
  }
  if (normalized === '備取（有意願）Waitlisted (Interested)') {
    return { bg: '#fef3c7', text: '#b45309', label: '備取 (有意願)', border: '1px solid #f59e0b' };
  }
  if (normalized === '備取 Waitlisted') {
    return { bg: '#fef3c7', text: '#92400e', label: '備取' };
  }
  if (normalized === '已取消 Cancelled') {
    return { bg: '#f1f5f9', text: '#64748b', label: '已取消' };
  }
  return { bg: '#e0f2fe', text: '#0369a1', label: '審核中' };
}

/**
 * 裝備預約狀態正規化
 */
export function getEquipmentStatusText(status: string | undefined): string {
  if (!status) return '待領取';
  const s = String(status);
  if (s.includes('已取消 (待退款)')) return '已取消 (待退款)';
  if (s.includes('待領取')) return '待領取';
  if (s.includes('借出中')) return '借出中';
  if (s.includes('已歸還')) return '已歸還';
  if (s.includes('逾期')) return '已逾期';
  if (s.includes('已取消')) return '已取消';
  return s;
}

/**
 * 繳費對帳歷史紀錄狀態樣式
 */
export function getPaymentStatusStyle(status: string | undefined): StatusStyle {
  if (!status) return { bg: '#f1f5f9', text: '#64748b', label: '未知' };
  const s = String(status);
  const isPending = s.includes('待確認') || s.includes('待核對') || s.includes('Checking') || s.includes('審核中');
  const isConfirmed = !isPending && (s.includes('已確認無誤') || s.includes('已確認') || s.includes('已繳費') || s.includes('已核對') || s.includes('Confirmed') || s.includes('Paid'));

  if (isConfirmed) {
    return { bg: '#ecfdf5', text: '#059669', label: '已確認無誤 Confirmed' };
  }
  if (isPending) {
    return { bg: '#fffbeb', text: '#d97706', label: '待幹部確認 Checking' };
  }
  return { bg: '#f1f5f9', text: '#64748b', label: s };
}
