export interface ImportCandidate {
  line_user_id: string;
  name?: string | null;
  line_id?: string | null;
  is_official_member?: boolean;
  status?: string;
  payment_status?: string;
  notes?: string | null;
  phone?: string | null;
  student_id?: string | null;
  department?: string | null;
  id_card?: string | null;
  emergency_contact_name?: string | null;
  is_officer?: boolean | null;
  officer_role?: string | null;
}

export interface ExistingSignupMinimal {
  id: string;
  line_user_id: string;
  status: string;
  payment_status?: string;
}

export interface PartitionedCandidates<T extends ImportCandidate = ImportCandidate> {
  conflicts: T[];
  reactivates: Array<T & { existingSignupId: string }>;
  inserts: T[];
}

/**
 * 產生符合活動報名標準格式之唯一序號 (S 開頭)
 */
export function generateSignupId(): string {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `S${timestampPart}${randomPart}`;
}

/**
 * 檢查社員出隊必要個資是否完整 (身分證字號與緊急聯絡人)
 */
export function checkProfileCompleteness(member: { id_card?: string | null; emergency_contact_name?: string | null } | null | undefined): boolean {
  if (!member) return false;
  const hasIdCard = typeof member.id_card === 'string' && member.id_card.trim().length > 0;
  const hasEmergencyContact = typeof member.emergency_contact_name === 'string' && member.emergency_contact_name.trim().length > 0;
  return hasIdCard && hasEmergencyContact;
}

/**
 * 將匯入名冊與目標活動既有名冊比對，分流為：
 * 1. conflicts: 目標活動已有有效報名紀錄 (非取消狀態)，不可重複加入
 * 2. reactivates: 目標活動已有紀錄但為「已取消 Cancelled」，採 UPDATE 重啟
 * 3. inserts: 目標活動尚無此人員紀錄，採 INSERT 新增
 */
export function partitionImportCandidates<T extends ImportCandidate>(
  candidates: T[],
  existingTargetSignups: ExistingSignupMinimal[]
): PartitionedCandidates<T> {
  const existingMap = new Map<string, ExistingSignupMinimal>();
  for (const es of existingTargetSignups) {
    if (es.line_user_id) {
      existingMap.set(es.line_user_id, es);
    }
  }

  const conflicts: T[] = [];
  const reactivates: Array<T & { existingSignupId: string }> = [];
  const inserts: T[] = [];

  for (const candidate of candidates) {
    const existing = existingMap.get(candidate.line_user_id);
    if (!existing) {
      inserts.push(candidate);
    } else {
      const isCancelled = existing.status.includes('取消') || existing.status.toLowerCase().includes('cancelled');
      if (isCancelled) {
        reactivates.push({
          ...candidate,
          existingSignupId: existing.id,
        });
      } else {
        conflicts.push(candidate);
      }
    }
  }

  return { conflicts, reactivates, inserts };
}

/**
 * 合成導入後的備註字串，自動加入來源活動標籤而不覆蓋原有自訂備註
 */
export function buildImportNotes(
  originalNotes?: string | null,
  sourceEventTitle?: string | null,
  customNotes?: string | null
): string {
  const parts: string[] = [];

  if (sourceEventTitle && sourceEventTitle.trim().length > 0) {
    parts.push(`【自${sourceEventTitle.trim()}轉入】`);
  }

  if (originalNotes && originalNotes.trim().length > 0) {
    parts.push(originalNotes.trim());
  }

  if (customNotes && customNotes.trim().length > 0) {
    parts.push(customNotes.trim());
  }

  return parts.join(' ').trim();
}
