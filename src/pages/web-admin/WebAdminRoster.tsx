import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Search,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Pin,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  GripVertical,
  Send,
  FolderPlus,
  FileSpreadsheet,
  User,
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import { GAS_API_URL } from '../../constants/api';
import { MemberProfileModal } from '../../components/admin/MemberProfileModal';
import { MemberEditDrawer } from '../../components/admin/MemberEditDrawer';
import './webAdmin.css';

interface EventItem {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
  spreadsheet_url?: string;
  spreadsheet_id?: string;
  drive_folder_url?: string;
  line_group_url?: string;
}

interface MemberInfo {
  name?: string;
  gender?: string;
  line_id?: string;
  email?: string;
  department?: string;
  student_id?: string;
  identity_status?: string;
  phone?: string;
  address?: string;
  birthday?: string;
  id_card?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_address?: string;
  emergency_contact_rel?: string;
  medical_history?: string;
  outdoor_experience?: string;
  fitness_desc?: string;
  proof_urls?: any;
  join_membership_intent?: string;
  is_official_member?: boolean;
  officer_intent?: string;
  want_to_say?: string;
}

interface SignupRow {
  id: string;
  event_id: string;
  line_user_id: string;
  name?: string;
  line_id?: string;
  status: string;
  payment_status: string;
  notification_status?: string;
  notes?: string;
  created_at: string;
  members?: MemberInfo | null;
}

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  getValue: (row: SignupRow) => any;
  formatText: (row: SignupRow) => string;
}

const STATUS_OPTIONS = [
  { value: '正取 Confirmed', label: '正取 Confirmed' },
  { value: '正取（已繳費）Confirmed (Paid)', label: '正取（已繳費）Confirmed (Paid)' },
  { value: '備取 Waitlisted', label: '備取 Waitlisted' },
  { value: '備取（有意願）Waitlisted (Interested)', label: '備取（有意願）Waitlisted (Interested)' },
  { value: '審核中 Checking', label: '審核中 Checking' },
  { value: '已取消 Cancelled', label: '已取消 Cancelled' },
];

function normalizeStatus(raw: string | undefined): string {
  if (!raw) return '審核中 Checking';
  const str = String(raw).trim();
  if (str.includes('已繳費')) return '正取（已繳費）Confirmed (Paid)';
  if (str.includes('正取')) return '正取 Confirmed';
  if (str.includes('有意願')) return '備取（有意願）Waitlisted (Interested)';
  if (str.includes('備取')) return '備取 Waitlisted';
  if (str.includes('取消') || str.includes('未錄取')) return '已取消 Cancelled';
  if (str.includes('審核')) return '審核中 Checking';
  return str;
}

const ALL_COLUMNS: ColumnDef[] = [

  {
    key: 'name',
    label: '姓名',
    defaultWidth: 95,
    getValue: (r) => r.members?.name || r.name || '',
    formatText: (r) => r.members?.name || r.name || '-',
  },
  {
    key: 'gender',
    label: '性別',
    defaultWidth: 70,
    getValue: (r) => r.members?.gender || '',
    formatText: (r) => r.members?.gender || '-',
  },
  {
    key: 'line_id',
    label: 'LINE ID',
    defaultWidth: 105,
    getValue: (r) => r.line_id || r.members?.line_id || '',
    formatText: (r) => r.line_id || r.members?.line_id || '-',
  },
  {
    key: 'email',
    label: '聯絡信箱',
    defaultWidth: 170,
    getValue: (r) => r.members?.email || '',
    formatText: (r) => r.members?.email || '-',
  },
  {
    key: 'department',
    label: '系所',
    defaultWidth: 110,
    getValue: (r) => r.members?.department || '',
    formatText: (r) => r.members?.department || '-',
  },
  {
    key: 'student_id',
    label: '學號',
    defaultWidth: 100,
    getValue: (r) => r.members?.student_id || '',
    formatText: (r) => r.members?.student_id || '-',
  },
  {
    key: 'identity_status',
    label: '身分',
    defaultWidth: 110,
    getValue: (r) => r.members?.identity_status || '',
    formatText: (r) => r.members?.identity_status || '-',
  },
  {
    key: 'phone',
    label: '聯絡電話',
    defaultWidth: 115,
    getValue: (r) => r.members?.phone || '',
    formatText: (r) => r.members?.phone || '-',
  },
  {
    key: 'address',
    label: '聯絡地址',
    defaultWidth: 160,
    getValue: (r) => r.members?.address || '',
    formatText: (r) => r.members?.address || '-',
  },
  {
    key: 'birthday',
    label: '生日',
    defaultWidth: 105,
    getValue: (r) => (r.members?.birthday ? r.members.birthday.split('T')[0] : ''),
    formatText: (r) => (r.members?.birthday ? r.members.birthday.split('T')[0] : '-'),
  },
  {
    key: 'id_card',
    label: '證件號碼',
    defaultWidth: 115,
    getValue: (r) => r.members?.id_card || '',
    formatText: (r) => r.members?.id_card || '-',
  },
  {
    key: 'emergency_contact_name',
    label: '緊急聯絡人姓名',
    defaultWidth: 120,
    getValue: (r) => r.members?.emergency_contact_name || '',
    formatText: (r) => r.members?.emergency_contact_name || '-',
  },
  {
    key: 'emergency_contact_phone',
    label: '緊急聯絡人電話',
    defaultWidth: 125,
    getValue: (r) => r.members?.emergency_contact_phone || '',
    formatText: (r) => r.members?.emergency_contact_phone || '-',
  },
  {
    key: 'emergency_contact_address',
    label: '緊急聯絡人聯絡地址',
    defaultWidth: 160,
    getValue: (r) => r.members?.emergency_contact_address || '',
    formatText: (r) => r.members?.emergency_contact_address || '-',
  },
  {
    key: 'emergency_contact_rel',
    label: '緊急聯絡人關係',
    defaultWidth: 110,
    getValue: (r) => r.members?.emergency_contact_rel || '',
    formatText: (r) => r.members?.emergency_contact_rel || '-',
  },
  {
    key: 'medical_history',
    label: '個人特殊病史',
    defaultWidth: 150,
    getValue: (r) => r.members?.medical_history || '',
    formatText: (r) => r.members?.medical_history || '-',
  },
  {
    key: 'outdoor_experience',
    label: '爬山經驗',
    defaultWidth: 160,
    getValue: (r) => r.members?.outdoor_experience || '',
    formatText: (r) => r.members?.outdoor_experience || '-',
  },
  {
    key: 'fitness_desc',
    label: '體能測驗',
    defaultWidth: 140,
    getValue: (r) => r.members?.fitness_desc || '',
    formatText: (r) => r.members?.fitness_desc || '-',
  },
  {
    key: 'proof_urls',
    label: '體能證明',
    defaultWidth: 110,
    getValue: (r) => {
      const urls = r.members?.proof_urls;
      if (Array.isArray(urls)) return urls.join('; ');
      return urls ? String(urls) : '';
    },
    formatText: (r) => {
      const urls = r.members?.proof_urls;
      if (Array.isArray(urls) && urls.length > 0) return `共 ${urls.length} 張相片`;
      return urls ? String(urls) : '-';
    },
  },
  {
    key: 'join_membership_intent',
    label: '加入社員意願',
    defaultWidth: 110,
    getValue: (r) => r.members?.join_membership_intent || '',
    formatText: (r) => r.members?.join_membership_intent || '-',
  },
  {
    key: 'is_official_member',
    label: '是否為社員',
    defaultWidth: 95,
    getValue: (r) => (r.members?.is_official_member ? '正式社員' : '非社員'),
    formatText: (r) => (r.members?.is_official_member ? '正式社員' : '非社員'),
  },
  {
    key: 'officer_intent',
    label: '擔任幹部意願',
    defaultWidth: 110,
    getValue: (r) => r.members?.officer_intent || '',
    formatText: (r) => r.members?.officer_intent || '-',
  },
  {
    key: 'status',
    label: '審核結果',
    defaultWidth: 160,
    getValue: (r) => normalizeStatus(r.status),
    formatText: (r) => normalizeStatus(r.status),
  },
  {
    key: 'notification_status',
    label: '通知狀態',
    defaultWidth: 95,
    getValue: (r) => r.notification_status || '未發送',
    formatText: (r) => r.notification_status || '未發送',
  },
  {
    key: 'payment_status',
    label: '繳費狀態',
    defaultWidth: 105,
    getValue: (r) => r.payment_status || '未繳費 Unpaid',
    formatText: (r) => r.payment_status || '未繳費 Unpaid',
  },
  {
    key: 'notes',
    label: '幹部備註',
    defaultWidth: 150,
    getValue: (r) => r.notes || '',
    formatText: (r) => r.notes || '-',
  },
  {
    key: 'want_to_say',
    label: '想說的話',
    defaultWidth: 140,
    getValue: (r) => r.members?.want_to_say || '',
    formatText: (r) => r.members?.want_to_say || '-',
  },
];

const STORAGE_KEY = 'wa_roster_table_prefs_v1';

export const WebAdminRoster: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(searchParams.get('eventId') || '');
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 搜尋與篩選
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 批次選擇
  const [selectedSignupIds, setSelectedSignupIds] = useState<Set<string>>(new Set());
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 幹部備註行內編輯狀態
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesText, setEditingNotesText] = useState<string>('');

  // 拖曳排序狀態 (列與欄)
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  // 試算表同步與推播通知狀態
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);

  // 個資檢視彈窗與編輯抽屜狀態
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [profileModalMember, setProfileModalMember] = useState<any | null>(null);
  const [editDrawerUserId, setEditDrawerUserId] = useState<string | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // 儲存格原地展開與列高自訂狀態
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const toggleCellExpand = (cellKey: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  };

  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rowHeights && typeof parsed.rowHeights === 'object') {
          return parsed.rowHeights;
        }
      }
    } catch {}
    return {};
  });

  const rowResizingRef = useRef<{ rowId: string; startY: number; startHeight: number } | null>(null);

  const startRowResizing = (rowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentHeight = rowHeights[rowId] || 38;
    rowResizingRef.current = { rowId, startY: e.clientY, startHeight: currentHeight };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!rowResizingRef.current) return;
      const deltaY = moveEvent.clientY - rowResizingRef.current.startY;
      const newHeight = Math.max(38, rowResizingRef.current.startHeight + deltaY);
      setRowHeights((prev) => ({ ...prev, [rowResizingRef.current!.rowId]: newHeight }));
    };

    const handleMouseUp = () => {
      rowResizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const [showHiddenMenu, setShowHiddenMenu] = useState(false);
  const hiddenMenuRef = useRef<HTMLDivElement>(null);

  // 表格客製化狀態（從 localStorage 讀取）
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.columnOrder) && parsed.columnOrder.length > 0) {
          const validKeys = new Set(ALL_COLUMNS.map((c) => c.key));
          const filtered = parsed.columnOrder.filter((k: string) => validKeys.has(k));
          ALL_COLUMNS.forEach((c) => {
            if (!filtered.includes(c.key)) filtered.push(c.key);
          });
          return filtered;
        }
      }
    } catch {
      // 忽略錯誤
    }
    return ALL_COLUMNS.map((c) => c.key);
  });

  const [pinnedColumns, setPinnedColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.pinnedColumns)) return parsed.pinnedColumns;
      }
    } catch {
      // 忽略錯誤
    }
    return [];
  });

  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hiddenColumns)) return parsed.hiddenColumns;
      }
    } catch {
      // 忽略錯誤
    }
    return [];
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
          return parsed.columnWidths;
        }
      }
    } catch {
      // 忽略錯誤
    }
    const defWidths: Record<string, number> = {};
    ALL_COLUMNS.forEach((c) => {
      defWidths[c.key] = c.defaultWidth;
    });
    return defWidths;
  });

  // 列級排序與自訂狀態
  const [pinnedRowIds, setPinnedRowIds] = useState<Set<string>>(new Set());
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
  const [customRowOrder, setCustomRowOrder] = useState<string[]>([]);

  // 儲存表格狀態至 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          columnOrder,
          pinnedColumns,
          hiddenColumns,
          columnWidths,
          rowHeights,
        })
      );
    } catch {
      // 忽略儲存錯誤
    }
  }, [columnOrder, pinnedColumns, hiddenColumns, columnWidths, rowHeights]);

  // 關閉下拉面板點擊事件
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (hiddenMenuRef.current && !hiddenMenuRef.current.contains(e.target as Node)) {
        setShowHiddenMenu(false);
      }
    };
    if (showHiddenMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showHiddenMenu]);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 載入所有活動列表
  const loadEvents = async () => {
    setLoadingEvents(true);
    setErrorMsg(null);
    try {
      const { data, error } = await client
        .from('events')
        .select('id, title, start_date, end_date, status, spreadsheet_url, spreadsheet_id, drive_folder_url, line_group_url')
        .order('start_date', { ascending: false });

      if (error) {
        throw new Error(`[讀取活動列表失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      const list = (data || []) as EventItem[];
      setEvents(list);

      const paramEventId = searchParams.get('eventId');
      if (paramEventId && list.some((e) => e.id === paramEventId)) {
        setSelectedEventId(paramEventId);
      } else if (list.length > 0 && !selectedEventId) {
        setSelectedEventId(list[0].id);
      }
    } catch (err: any) {
      console.error('[WebAdminRoster] loadEvents error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [client]);

  // 載入活動報名名冊（含完整 27 欄位資訊）
  const loadSignups = async (eventId: string) => {
    if (!eventId) return;
    setLoadingSignups(true);
    setErrorMsg(null);
    setSelectedSignupIds(new Set());
    setCustomRowOrder([]);

    try {
      const { data, error } = await client
        .from('event_signups')
        .select(`
          id,
          event_id,
          line_user_id,
          name,
          line_id,
          status,
          payment_status,
          notification_status,
          notes,
          created_at,
          members:line_user_id (
            name,
            gender,
            nationality,
            line_id,
            email,
            department,
            student_id,
            identity_status,
            phone,
            address,
            birthday,
            id_card,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_address,
            emergency_contact_rel,
            medical_history,
            outdoor_experience,
            fitness_desc,
            proof_urls,
            join_membership_intent,
            is_official_member,
            officer_intent,
            want_to_say
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`[讀取報名名冊失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      const list = (data || []) as SignupRow[];
      setSignups(list);
      setCustomRowOrder(list.map((s) => s.id));
    } catch (err: any) {
      console.error('[WebAdminRoster] loadSignups error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingSignups(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      setSearchParams({ eventId: selectedEventId });
      loadSignups(selectedEventId);
    }
  }, [selectedEventId]);

  // 單筆修改審核狀態
  const handleStatusChange = async (signupId: string, newStatus: string) => {
    setUpdatingId(signupId);
    setErrorMsg(null);

    try {
      const targetSignup = signups.find((s) => s.id === signupId);
      const { error } = await client
        .from('event_signups')
        .update({ status: newStatus })
        .eq('id', signupId);

      if (error) {
        throw new Error(`[更新審核狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setSignups((prev) =>
        prev.map((s) => (s.id === signupId ? { ...s, status: newStatus } : s))
      );

      await logWebAuditAction(
        client,
        session.userId,
        'UPDATE_SIGNUP_STATUS',
        'event_signups',
        signupId,
        {
          eventId: selectedEventId,
          oldStatus: targetSignup?.status,
          newStatus,
          applicantName: targetSignup?.members?.name || targetSignup?.name,
        }
      );
    } catch (err: any) {
      console.error('[WebAdminRoster] handleStatusChange error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 批次審核操作
  const handleBatchStatus = async (targetStatus: string) => {
    if (selectedSignupIds.size === 0) return;
    setLoadingSignups(true);
    setErrorMsg(null);

    try {
      const ids = Array.from(selectedSignupIds);
      const { error } = await client
        .from('event_signups')
        .update({ status: targetStatus })
        .in('id', ids);

      if (error) {
        throw new Error(`[批次更新審核狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setSignups((prev) =>
        prev.map((s) => (selectedSignupIds.has(s.id) ? { ...s, status: targetStatus } : s))
      );

      await logWebAuditAction(
        client,
        session.userId,
        'BATCH_UPDATE_SIGNUP_STATUS',
        'event_signups',
        undefined,
        {
          eventId: selectedEventId,
          count: ids.length,
          targetStatus,
          signupIds: ids,
        }
      );

      setSelectedSignupIds(new Set());
    } catch (err: any) {
      console.error('[WebAdminRoster] handleBatchStatus error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingSignups(false);
    }
  };

  // 批次全選 / 反選
  const toggleSelectAll = (filteredIds: string[]) => {
    const next = new Set(selectedSignupIds);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => next.has(id));

    if (allSelected) {
      filteredIds.forEach((id) => next.delete(id));
    } else {
      filteredIds.forEach((id) => next.add(id));
    }
    setSelectedSignupIds(next);
  };

  // 欄位操作函式
  const moveColumn = (key: string, direction: 'left' | 'right') => {
    const idx = columnOrder.indexOf(key);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= columnOrder.length) return;

    const nextOrder = [...columnOrder];
    const temp = nextOrder[idx];
    nextOrder[idx] = nextOrder[targetIdx];
    nextOrder[targetIdx] = temp;
    setColumnOrder(nextOrder);
  };

  const togglePinColumn = (key: string) => {
    if (pinnedColumns.includes(key)) {
      setPinnedColumns(pinnedColumns.filter((k) => k !== key));
    } else {
      setPinnedColumns([...pinnedColumns, key]);
    }
  };

  const hideColumn = (key: string) => {
    if (!hiddenColumns.includes(key)) {
      setHiddenColumns([...hiddenColumns, key]);
    }
  };

  const unhideColumn = (key: string) => {
    setHiddenColumns(hiddenColumns.filter((k) => k !== key));
  };

  const unhideAllColumnsAndRows = () => {
    setHiddenColumns([]);
    setHiddenRowIds(new Set());
    setShowHiddenMenu(false);
  };

  const resetColumnWidths = () => {
    const defWidths: Record<string, number> = {};
    ALL_COLUMNS.forEach((c) => {
      defWidths[c.key] = c.defaultWidth;
    });
    setColumnWidths(defWidths);
    setRowHeights({});
    setExpandedCells(new Set());
  };
  const resetColumnWidthsAndHeights = resetColumnWidths;

  // 列級操作函式
  const moveRow = (rowId: string, direction: 'up' | 'down') => {
    const order = customRowOrder.length > 0 ? customRowOrder : signups.map((s) => s.id);
    const idx = order.indexOf(rowId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= order.length) return;

    const next = [...order];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setCustomRowOrder(next);
  };

  const togglePinRow = (rowId: string) => {
    const next = new Set(pinnedRowIds);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    setPinnedRowIds(next);
  };

  const hideRow = (rowId: string) => {
    const next = new Set(hiddenRowIds);
    next.add(rowId);
    setHiddenRowIds(next);
  };

  // 欄位調寬拖曳
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const startResizing = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[key] || 100;
    resizingRef.current = { key, startX: e.clientX, startWidth };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.key]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 排序與計算最終要呈現的欄位
  const visibleColumns = useMemo(() => {
    const columnMap = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
    const pinnedSet = new Set(pinnedColumns);

    const orderedKeys = [
      ...pinnedColumns.filter((k) => !hiddenColumns.includes(k)),
      ...columnOrder.filter((k) => !pinnedSet.has(k) && !hiddenColumns.includes(k)),
    ];

    return orderedKeys.map((k) => columnMap.get(k)!).filter(Boolean);
  }, [columnOrder, pinnedColumns, hiddenColumns]);

  // 過濾後的名冊清單
  const filteredSignups = useMemo(() => {
    const rowMap = new Map(signups.map((s) => [s.id, s]));
    const order = customRowOrder.length > 0 ? customRowOrder : signups.map((s) => s.id);
    const sortedRows = order.map((id) => rowMap.get(id)).filter(Boolean) as SignupRow[];

    // 分離釘選列與普通列
    const pinned = sortedRows.filter((r) => pinnedRowIds.has(r.id) && !hiddenRowIds.has(r.id));
    const normal = sortedRows.filter((r) => !pinnedRowIds.has(r.id) && !hiddenRowIds.has(r.id));
    const allActiveRows = [...pinned, ...normal];

    return allActiveRows.filter((s) => {
      const m = s.members || {};
      const name = m.name || s.name || '';
      const phone = m.phone || '';
      const idCard = m.id_card || '';
      const studentId = m.student_id || '';
      const lineId = s.line_id || m.line_id || '';

      const matchKeyword =
        !searchKeyword ||
        name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        phone.includes(searchKeyword) ||
        idCard.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        studentId.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        lineId.toLowerCase().includes(searchKeyword.toLowerCase());

      const normStatus = normalizeStatus(s.status);
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'CONFIRMED' && normStatus.includes('正取')) ||
        (statusFilter === 'WAITLIST' && normStatus.includes('備取')) ||
        (statusFilter === 'CHECKING' && normStatus.includes('審核中')) ||
        (statusFilter === 'CANCELLED' && normStatus.includes('已取消'));

      return matchKeyword && matchStatus;
    });
  }, [signups, customRowOrder, pinnedRowIds, hiddenRowIds, searchKeyword, statusFilter]);

  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      const isSomeSelected =
        selectedSignupIds.size > 0 &&
        filteredSignups.some((s) => !selectedSignupIds.has(s.id));
      selectAllRef.current.indeterminate = isSomeSelected;
    }
  }, [selectedSignupIds, filteredSignups]);

  // 複製整份名冊為 TSV（所見即所得：依可見欄位與當前自訂順序）
  const handleCopyTSV = () => {
    if (filteredSignups.length === 0) return;

    const headers = ['序號', ...visibleColumns.map((c) => c.label)];

    const rows = filteredSignups.map((s, idx) => {
      const colValues = visibleColumns.map((c) => {
        const val = c.formatText(s);
        return String(val).replace(/\t|\r|\n/g, ' ').trim();
      });
      return [idx + 1, ...colValues].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsvContent).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
      logWebAuditAction(client, session.userId, 'EXPORT_ROSTER_TSV', 'event_signups', selectedEventId, {
        count: filteredSignups.length,
        visibleColumnsCount: visibleColumns.length,
      });
    });
  };

  // 當前選取的活動物件
  const currentEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId);
  }, [events, selectedEventId]);

  // 一鍵發送通知（支援勾選單獨發送與全體未通知正備取一鍵發送）
  const handleSendNotifications = async () => {
    if (!selectedEventId || !currentEvent) return;

    // 1. 決定發送名單
    let targetSignups: SignupRow[] = [];
    if (selectedSignupIds.size > 0) {
      targetSignups = signups.filter(
        (s) => selectedSignupIds.has(s.id) && (s.status.includes('正取') || s.status.includes('備取'))
      );
      if (targetSignups.length === 0) {
        alert('選取的名冊中沒有審核結果為「正取」或「備取」的成員，無法發送通知！');
        return;
      }
    } else {
      targetSignups = signups.filter(
        (s) => (s.status.includes('正取') || s.status.includes('備取')) && s.notification_status !== '已通知'
      );
      if (targetSignups.length === 0) {
        alert('名冊中目前沒有待發送通知的正取或備取人員！');
        return;
      }
    }

    // 2. 防呆檢驗：若發送對象包含正取，但活動未設定 LINE Group URL，阻擋發送
    const hasAccepted = targetSignups.some((s) => s.status.includes('正取'));
    if (hasAccepted && !currentEvent.line_group_url) {
      alert('此活動尚未設定專屬群組連結 (LINE Group URL)！\n\n系統規範在發送「正取通知」前，必須先於活動編輯頁面設定群組邀請連結，供社員一鍵入群。請先至活動管理填寫群組連結後再發送推播！');
      return;
    }

    const confirmMsg = selectedSignupIds.size > 0
      ? `確定要推播通知已勾選的 ${targetSignups.length} 位正取／備取人員嗎？`
      : `確定要一鍵推播通知全活動共 ${targetSignups.length} 位待通知的正取／備取人員嗎？`;

    if (!window.confirm(confirmMsg)) return;

    setSendingNotification(true);
    try {
      const query = new URLSearchParams({
        action: 'send_event_notifications',
        userId: session.userId,
        eventId: selectedEventId,
        ...(selectedSignupIds.size > 0 ? { signupIds: targetSignups.map((s) => s.id).join(',') } : {}),
      });

      const res = await fetch(`${GAS_API_URL}?${query.toString()}`);
      const result = await res.json();

      if (result.status === 'success') {
        const count = result.notifiedCount || targetSignups.length;
        alert(`發送成功！共發送了 ${count} 則審核推播通知。`);
        // 更新前端與快取
        const targetIds = new Set(targetSignups.map((s) => s.id));
        setSignups((prev) =>
          prev.map((s) => (targetIds.has(s.id) ? { ...s, notification_status: '已通知' } : s))
        );
        logWebAuditAction(client, session.userId, 'SEND_NOTIFICATIONS', 'event_signups', selectedEventId, {
          count,
        });
      } else {
        alert(`[推播通知失敗]: ${result.message || '未知錯誤'}`);
      }
    } catch (err: any) {
      alert(`[連線失敗]: ${err.message || String(err)}`);
    } finally {
      setSendingNotification(false);
    }
  };

  // 建立雲端資料夾與 Google 試算表 / 即時同步並開啟試算表
  const handleSyncOrOpenSheet = async () => {
    if (!selectedEventId || !currentEvent) return;

    setSyncingSheet(true);
    try {
      const query = new URLSearchParams({
        action: 'create_event_sheet',
        userId: session.userId,
        eventId: selectedEventId,
      });

      const res = await fetch(`${GAS_API_URL}?${query.toString()}`);
      const result = await res.json();

      if (result.status === 'success') {
        const targetUrl = result.spreadsheetUrl || currentEvent.spreadsheet_url;
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEventId
              ? {
                  ...e,
                  spreadsheet_url: result.spreadsheetUrl || e.spreadsheet_url,
                  spreadsheet_id: result.spreadsheetId || e.spreadsheet_id,
                  drive_folder_url: result.driveFolderUrl || e.drive_folder_url,
                }
              : e
          )
        );

        if (targetUrl) {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        alert(`[試算表操作失敗]: ${result.message || '未知錯誤'}`);
      }
    } catch (err: any) {
      alert(`[連線失敗]: ${err.message || String(err)}`);
    } finally {
      setSyncingSheet(false);
    }
  };

  // 修改通知狀態
  const handleNotificationStatusChange = async (signupId: string, newNotifyStatus: string) => {
    setUpdatingId(signupId);
    try {
      const { error } = await client
        .from('event_signups')
        .update({ notification_status: newNotifyStatus, updated_at: new Date().toISOString() })
        .eq('id', signupId);

      if (error) throw error;

      setSignups((prev) =>
        prev.map((s) => (s.id === signupId ? { ...s, notification_status: newNotifyStatus } : s))
      );
      logWebAuditAction(client, session.userId, 'UPDATE_NOTIFY_STATUS', 'event_signups', signupId, {
        notification_status: newNotifyStatus,
      });
    } catch (err: any) {
      alert(`[更新通知狀態失敗]: ${err.message || String(err)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // 儲存幹部備註
  const handleSaveNotes = async (signupId: string, newNotes: string) => {
    const trimmed = newNotes.trim();
    setEditingNotesId(null);
    setSignups((prev) => prev.map((s) => (s.id === signupId ? { ...s, notes: trimmed } : s)));

    try {
      const { error } = await client
        .from('event_signups')
        .update({ notes: trimmed, updated_at: new Date().toISOString() })
        .eq('id', signupId);

      if (error) throw error;
      logWebAuditAction(client, session.userId, 'UPDATE_OFFICER_NOTES', 'event_signups', signupId, {
        notes: trimmed,
      });
    } catch (err: any) {
      alert(`[儲存幹部備註失敗]: ${err.message || String(err)}`);
    }
  };

  // 列級上下拖曳換位
  const handleRowDrop = (targetRowId: string) => {
    if (!draggedRowId || draggedRowId === targetRowId) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      return;
    }
    const order = customRowOrder.length > 0 ? [...customRowOrder] : signups.map((s) => s.id);
    const fromIdx = order.indexOf(draggedRowId);
    const toIdx = order.indexOf(targetRowId);
    if (fromIdx > -1 && toIdx > -1) {
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, draggedRowId);
      setCustomRowOrder(order);
    }
    setDraggedRowId(null);
    setDragOverRowId(null);
  };

  // 欄位左右拖曳換位
  const handleColDrop = (targetColKey: string) => {
    if (!draggedColKey || draggedColKey === targetColKey) {
      setDraggedColKey(null);
      setDragOverColKey(null);
      return;
    }
    const newOrder = [...columnOrder];
    const fromIdx = newOrder.indexOf(draggedColKey);
    const toIdx = newOrder.indexOf(targetColKey);
    if (fromIdx > -1 && toIdx > -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedColKey);
      setColumnOrder(newOrder);
    }
    setDraggedColKey(null);
    setDragOverColKey(null);
  };

  // 計算每個釘選欄位的 sticky left 偏移值
  const stickyLeftPositions = useMemo(() => {
    const positions: Record<string, number> = {};
    let currentLeft = 44 + 46; // checkbox (44px) + # (46px)

    visibleColumns.forEach((col) => {
      if (pinnedColumns.includes(col.key)) {
        positions[col.key] = currentLeft;
        currentLeft += columnWidths[col.key] || col.defaultWidth;
      }
    });

    return positions;
  }, [visibleColumns, pinnedColumns, columnWidths]);

  const lastPinnedKey = useMemo(() => {
    const pinnedInVisible = visibleColumns.filter((c) => pinnedColumns.includes(c.key));
    if (pinnedInVisible.length > 0) {
      return pinnedInVisible[pinnedInVisible.length - 1].key;
    }
    return null;
  }, [visibleColumns, pinnedColumns]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 單一整合控制橫條 */}
      <div className="web-admin-toolbar" style={{ padding: '8px 14px' }}>
        <div className="web-admin-toolbar-left" style={{ gap: 10 }}>
          {/* 活動下拉選擇 */}
          <select
            className="web-admin-select"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={loadingEvents}
            style={{ fontWeight: 600, minWidth: 240, maxWidth: 320 }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                [{ev.id}] {ev.title} ({ev.status})
              </option>
            ))}
          </select>

          {/* 搜尋關鍵字輸入框 */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              placeholder="搜尋姓名、電話、身分證、學號、LINE..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ paddingLeft: 30, width: 220 }}
            />
          </div>

          {/* 審核狀態篩選選單 */}
          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="ALL">全體名冊 (全部狀態)</option>
            <option value="CONFIRMED">僅顯示正取</option>
            <option value="WAITLIST">僅顯示備取</option>
            <option value="CHECKING">僅顯示審核中</option>
            <option value="CANCELLED">僅顯示已取消</option>
          </select>
        </div>

        <div className="web-admin-toolbar-right" style={{ gap: 8, position: 'relative' }}>
          {/* 批次操作按鈕 */}
          {selectedSignupIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--wa-primary)' }}>
                選取 {selectedSignupIds.size} 筆
              </span>
              <button
                type="button"
                className="web-admin-btn"
                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                onClick={() => handleBatchStatus('正取 Confirmed')}
                disabled={loadingSignups}
              >
                <span>批次設為正取</span>
              </button>
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                onClick={() => handleBatchStatus('備取 Waitlisted')}
                disabled={loadingSignups}
              >
                <span>批次設為備取</span>
              </button>
            </div>
          )}

          {/* 重新整理按鈕（移至隱藏按鈕左邊） */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={() => {
              loadEvents();
              if (selectedEventId) loadSignups(selectedEventId);
            }}
            title="重新整理名冊"
            style={{ padding: '7px 10px' }}
          >
            <RefreshCw size={15} className={loadingSignups ? 'animate-spin' : ''} />
          </button>

          {/* 顯示隱藏項目按鈕（眼睛圖示） */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`web-admin-btn web-admin-btn-secondary ${hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'active' : ''}`}
              onClick={() => setShowHiddenMenu(!showHiddenMenu)}
              title="顯示與隱藏項目"
              style={{
                padding: '7px 10px',
                borderColor: hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'var(--wa-primary)' : undefined,
                color: hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'var(--wa-primary)' : undefined,
              }}
            >
              <Eye size={15} />
            </button>

            {/* 隱藏項目下拉面板 */}
            {showHiddenMenu && (
              <div ref={hiddenMenuRef} className="wa-dropdown-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--wa-border)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>欄位與列可見度</span>
                  <button
                    type="button"
                    onClick={unhideAllColumnsAndRows}
                    style={{ background: 'none', border: 'none', color: 'var(--wa-primary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    全部顯示
                  </button>
                </div>

                {hiddenRowIds.size > 0 && (
                  <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 6, fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>已隱藏 {hiddenRowIds.size} 列</span>
                    <button
                      type="button"
                      onClick={() => setHiddenRowIds(new Set())}
                      style={{ background: 'none', border: 'none', color: 'var(--wa-primary)', cursor: 'pointer', fontSize: '0.78rem' }}
                    >
                      還原所有列
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                  {ALL_COLUMNS.map((col) => {
                    const isHidden = hiddenColumns.includes(col.key);
                    return (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          className="wa-checkbox"
                          checked={!isHidden}
                          onChange={() => {
                            if (isHidden) {
                              unhideColumn(col.key);
                            } else {
                              hideColumn(col.key);
                            }
                          }}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 一鍵恢復預設欄位寬度與高度（左右箭頭圖示） */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={resetColumnWidthsAndHeights}
            title="一鍵恢復預設欄寬與列高"
            style={{ padding: '7px 10px' }}
          >
            <ArrowLeftRight size={15} />
          </button>

          {/* 純圖示複製整份名冊（TSV） */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={handleCopyTSV}
            title={copiedSuccess ? '已複製到剪貼簿！' : '複製當前名冊 (TSV 格式，供保險/入山表貼上)'}
            style={{ padding: '7px 10px' }}
          >
            {copiedSuccess ? <Check size={15} color="var(--wa-primary)" /> : <Copy size={15} />}
          </button>

          {/* 建立資料夾與 Google 試算表 / 即時同步並開啟試算表 */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={handleSyncOrOpenSheet}
            disabled={syncingSheet}
            title={
              currentEvent?.spreadsheet_url
                ? '即時同步名冊並開啟 Google 試算表'
                : '為此活動在雲端硬碟建立資料夾與 Google 試算表'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px' }}
          >
            {syncingSheet ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>同步中...</span>
              </>
            ) : currentEvent?.spreadsheet_url ? (
              <>
                <FileSpreadsheet size={15} />
                <span>開啟試算表</span>
              </>
            ) : (
              <>
                <FolderPlus size={15} />
                <span>建立資料夾與試算表</span>
              </>
            )}
          </button>

          {/* 一鍵發送通知按鈕 (綠色按鈕白字) */}
          <button
            type="button"
            className="web-admin-btn"
            onClick={handleSendNotifications}
            disabled={sendingNotification}
            title="一鍵推播審核結果與行前通知至已報名社員 LINE"
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              fontWeight: 600,
            }}
          >
            {sendingNotification ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            <span>發送通知</span>
          </button>
        </div>
      </div>

      {/* 錯誤橫幅 */}
      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 試算表高密度資料網格 */}
      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              {/* 全選核取方塊 */}
              <th style={{ width: 44, minWidth: 44, maxWidth: 44, textAlign: 'center', position: 'sticky', left: 0, zIndex: 20, backgroundColor: '#f8fafc', borderRight: '1px solid var(--wa-border)' }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="wa-checkbox"
                  checked={
                    filteredSignups.length > 0 &&
                    filteredSignups.every((s) => selectedSignupIds.has(s.id))
                  }
                  onChange={() => toggleSelectAll(filteredSignups.map((s) => s.id))}
                />
              </th>

              {/* 序號表頭 改為 # */}
              <th style={{ width: 46, minWidth: 46, maxWidth: 46, textAlign: 'center', position: 'sticky', left: 44, zIndex: 20, backgroundColor: '#f8fafc', borderRight: '1px solid var(--wa-border)' }}>
                #
              </th>

              {/* 動態渲染可見欄位表頭 */}
              {visibleColumns.map((col) => {
                const isPinned = pinnedColumns.includes(col.key);
                const stickyLeft = stickyLeftPositions[col.key];
                const isLastPinned = col.key === lastPinnedKey;
                const width = columnWidths[col.key] || col.defaultWidth;

                return (
                  <th
                    key={col.key}
                    style={{
                      width,
                      minWidth: width,
                      maxWidth: width,
                      position: isPinned ? 'sticky' : undefined,
                      left: isPinned ? stickyLeft : undefined,
                      zIndex: isPinned ? 15 : undefined,
                      backgroundColor: '#f8fafc',
                      borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                    }}
                    className={`${isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''} ${
                      dragOverColKey === col.key ? 'wa-col-drag-over' : ''
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedColKey && draggedColKey !== col.key) {
                        setDragOverColKey(col.key);
                      }
                    }}
                    onDragLeave={() => setDragOverColKey(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleColDrop(col.key);
                    }}
                  >
                    <div className="wa-th-cell">
                      <span className="wa-th-label" title={col.label}>{col.label}</span>

                      {/* 懸浮時靠左覆蓋表頭名稱之動作工具列 */}
                      <div className="wa-th-actions-overlay">
                        {/* 左右拖曳欄位手柄 */}
                        <div
                          className="wa-col-drag-handle"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', col.key);
                            setDraggedColKey(col.key);
                          }}
                          title="按住拖拉調整欄位順序"
                        >
                          <GripVertical size={13} />
                        </div>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="向左移動欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveColumn(col.key, 'left');
                          }}
                        >
                          <ChevronLeft size={13} />
                        </button>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="向右移動欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveColumn(col.key, 'right');
                          }}
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          type="button"
                          className={`wa-th-btn ${isPinned ? 'active' : ''}`}
                          title={isPinned ? '取消釘選' : '釘選至最左側'}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinColumn(col.key);
                          }}
                        >
                          <Pin size={13} />
                        </button>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="隱藏此欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            hideColumn(col.key);
                          }}
                        >
                          <EyeOff size={13} />
                        </button>
                      </div>
                    </div>

                    {/* 欄位邊緣調寬拖曳柄（置於 th 邊界線上） */}
                    <div
                      className="wa-col-resizer"
                      onMouseDown={(e) => startResizing(col.key, e)}
                      title="拖曳調整欄寬"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loadingSignups ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: 48, color: 'var(--wa-text-muted)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw className="animate-spin" size={18} />
                    <span>載入報名名冊中...</span>
                  </div>
                </td>
              </tr>
            ) : filteredSignups.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: 48, color: 'var(--wa-text-muted)' }}>
                  此活動目前尚無符合篩選條件的報名者
                </td>
              </tr>
            ) : (
              filteredSignups.map((s, idx) => {
                const isSelected = selectedSignupIds.has(s.id);
                const isRowPinned = pinnedRowIds.has(s.id);
                const isUpdating = updatingId === s.id;
                const normStatus = normalizeStatus(s.status);

                return (
                  <tr
                    key={s.id}
                    className={`${isSelected ? 'selected' : ''} ${isRowPinned ? 'wa-row-pinned' : ''} ${
                      dragOverRowId === s.id ? 'wa-row-drag-over' : ''
                    }`}
                    style={{ height: rowHeights[s.id] ? `${rowHeights[s.id]}px` : undefined }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedRowId && draggedRowId !== s.id) {
                        setDragOverRowId(s.id);
                      }
                    }}
                    onDragLeave={() => setDragOverRowId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleRowDrop(s.id);
                    }}
                  >
                    {/* 勾選核取方塊 */}
                    <td
                      style={{
                        textAlign: 'center',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        backgroundColor: '#ffffff',
                        borderRight: '1px solid var(--wa-border)',
                      }}
                    >
                      <input
                        type="checkbox"
                        className="wa-checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedSignupIds);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          setSelectedSignupIds(next);
                        }}
                      />
                    </td>

                    {/* 序號儲存格與四角懸浮操作列 + 中央拖曳手柄 */}
                    <td
                      className="wa-row-index-cell"
                      style={{
                        position: 'sticky',
                        left: 44,
                        zIndex: 10,
                        backgroundColor: isRowPinned ? '#f0fdf4' : '#ffffff',
                        borderRight: '1px solid var(--wa-border)',
                      }}
                    >
                      <span className="wa-row-index-text">{idx + 1}</span>

                      {/* 懸浮時分散在四個角顯示圖示並覆蓋序號數字 */}
                      <div className="wa-row-actions-quad">
                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-tl"
                          title="上移此列"
                          onClick={() => moveRow(s.id, 'up')}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          className={`wa-row-quad-btn wa-row-quad-tr ${isRowPinned ? 'active' : ''}`}
                          title={isRowPinned ? '取消置頂' : '固定至最上方'}
                          onClick={() => togglePinRow(s.id)}
                        >
                          <Pin size={11} />
                        </button>

                        {/* 中央上下拖曳換位手柄 */}
                        <div
                          className="wa-row-drag-handle"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', s.id);
                            setDraggedRowId(s.id);
                          }}
                          title="按住拖拉調整列順序"
                        >
                          <GripVertical size={13} />
                        </div>

                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-bl"
                          title="下移此列"
                          onClick={() => moveRow(s.id, 'down')}
                        >
                          <ArrowDown size={11} />
                        </button>
                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-br"
                          title="隱藏此列"
                          onClick={() => hideRow(s.id)}
                        >
                          <EyeOff size={11} />
                        </button>
                      </div>

                      {/* 拖曳調整列高柄 */}
                      <div
                        className="wa-row-resizer"
                        onMouseDown={(e) => startRowResizing(s.id, e)}
                        title="拖曳調整列高"
                      />
                    </td>

                    {/* 動態渲染可見欄位內容 */}
                    {visibleColumns.map((col) => {
                      const isPinned = pinnedColumns.includes(col.key);
                      const stickyLeft = stickyLeftPositions[col.key];
                      const isLastPinned = col.key === lastPinnedKey;
                      const textVal = col.formatText(s);

                      // 1. 審核狀態欄位 (下拉選單即時更新)
                      if (col.key === 'status') {
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
                              borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                          >
                            <select
                              className="web-admin-select"
                              value={normStatus}
                              onChange={(e) => handleStatusChange(s.id, e.target.value)}
                              disabled={isUpdating}
                              style={{
                                padding: '3px 8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                minWidth: 140,
                                backgroundColor: normStatus.includes('正取')
                                  ? 'rgba(5, 150, 105, 0.1)'
                                  : normStatus.includes('備取')
                                  ? 'rgba(217, 119, 6, 0.1)'
                                  : normStatus.includes('取消')
                                  ? 'rgba(220, 38, 38, 0.08)'
                                  : '#ffffff',
                                color: normStatus.includes('正取')
                                  ? '#047857'
                                  : normStatus.includes('備取')
                                  ? '#b45309'
                                  : normStatus.includes('取消')
                                  ? '#b91c1c'
                                  : 'var(--wa-text)',
                              }}
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      // 2. 通知狀態欄位 (下拉選單即時修改)
                      if (col.key === 'notification_status') {
                        const notifyVal = s.notification_status || '未通知';
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
                              borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                          >
                            <select
                              className="wa-status-select"
                              value={notifyVal}
                              onChange={(e) => handleNotificationStatusChange(s.id, e.target.value)}
                              disabled={isUpdating}
                              style={{
                                color: notifyVal === '已通知' ? '#047857' : '#64748b',
                                backgroundColor: notifyVal === '已通知' ? 'rgba(5, 150, 105, 0.1)' : '#f1f5f9',
                              }}
                            >
                              <option value="未通知">未通知</option>
                              <option value="已通知">已通知</option>
                            </select>
                          </td>
                        );
                      }

                      // 3. 幹部備註欄位 (點擊直接打字編輯)
                      if (col.key === 'notes') {
                        const isEditingNotes = editingNotesId === s.id;
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
                              borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                              cursor: 'pointer',
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                            onClick={() => {
                              if (!isEditingNotes) {
                                setEditingNotesId(s.id);
                                setEditingNotesText(s.notes || '');
                              }
                            }}
                            title="點擊可直接編輯幹部備註"
                          >
                            {isEditingNotes ? (
                              <input
                                type="text"
                                className="wa-notes-input"
                                autoFocus
                                value={editingNotesText}
                                onChange={(e) => setEditingNotesText(e.target.value)}
                                onBlur={() => handleSaveNotes(s.id, editingNotesText)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveNotes(s.id, editingNotesText);
                                  if (e.key === 'Escape') setEditingNotesId(null);
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '0.82rem' }}>
                                {s.notes ? (
                                  s.notes
                                ) : (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>
                                    點擊輸入備註...
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        );
                      }

                      // 4. 繳費狀態欄位徽章
                      if (col.key === 'payment_status') {
                        const isPaid = textVal.includes('已繳費') || textVal.includes('Paid');
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
                              borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                          >
                            <span className={`web-admin-badge ${isPaid ? 'web-admin-badge-success' : 'web-admin-badge-warning'}`}>
                              {textVal}
                            </span>
                          </td>
                        );
                      }

                      // 姓名欄位 (質感綠色膠囊按鈕，點擊開啟個資檢視彈窗)
                      if (col.key === 'name') {
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
                              borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                          >
                            <button
                              type="button"
                              className="wa-name-capsule-btn"
                              onClick={() => {
                                const mData: any = Array.isArray(s.members) ? s.members[0] : s.members;
                                setProfileModalUserId(s.line_user_id || null);
                                setProfileModalMember(
                                  mData
                                    ? { ...mData, line_user_id: s.line_user_id, name: mData.name || s.name }
                                    : { line_user_id: s.line_user_id, name: s.name }
                                );
                              }}
                              title="查看報名者詳細個人資料"
                            >
                              <User size={12} />
                              <span>{textVal}</span>
                            </button>
                          </td>
                        );
                      }

                      // 5. 一般欄位 (長文字原地展開)
                      const cellKey = `${s.id}:${col.key}`;
                      const isExpanded = expandedCells.has(cellKey);

                      return (
                        <td
                          key={col.key}
                          className={`wa-clickable-cell ${isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}`}
                          style={{
                            position: isPinned ? 'sticky' : undefined,
                            left: isPinned ? stickyLeft : undefined,
                            zIndex: isPinned ? 8 : undefined,
                            backgroundColor: '#ffffff',
                            maxWidth: columnWidths[col.key] || col.defaultWidth,
                            borderRight: isPinned ? '1px solid var(--wa-border)' : undefined,
                          }}
                          onClick={() => {
                            if (textVal && textVal !== '-') {
                              toggleCellExpand(cellKey);
                            }
                          }}
                          title={textVal !== '-' ? (isExpanded ? '點擊收合' : '點擊展開全文') : undefined}
                        >
                          <span className={isExpanded ? 'wa-cell-expanded' : 'wa-cell-ellipsis'}>
                            {textVal}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 報名者個人資料檢視彈窗 */}
      <MemberProfileModal
        isOpen={Boolean(profileModalUserId)}
        onClose={() => {
          setProfileModalUserId(null);
          setProfileModalMember(null);
        }}
        userId={profileModalUserId}
        officerUserId={session.userId}
        initialMember={profileModalMember}
        onOpenEditDrawer={(uid) => {
          setProfileModalUserId(null);
          setProfileModalMember(null);
          setEditDrawerUserId(uid);
          setEditDrawerOpen(true);
        }}
      />

      {/* 右側滑出式個人資料編輯抽屜 */}
      <MemberEditDrawer
        isOpen={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditDrawerUserId(null);
        }}
        userId={editDrawerUserId}
        officerUserId={session.userId}
        jwt={session.jwt}
        onSaved={(_updated) => {
          if (selectedEventId) {
            loadSignups(selectedEventId);
          }
        }}
      />
    </div>
  );
};
