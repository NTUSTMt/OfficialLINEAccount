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
  X
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface EventItem {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
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

export function normalizeStatus(raw: string | undefined): string {
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

export const ALL_COLUMNS: ColumnDef[] = [
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
    label: '備註',
    defaultWidth: 130,
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

  // 彈出視窗與控制選單
  const [detailModal, setDetailModal] = useState<{ title: string; content: string } | null>(null);
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
        })
      );
    } catch {
      // 忽略儲存錯誤
    }
  }, [columnOrder, pinnedColumns, hiddenColumns, columnWidths]);

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
        .select('id, title, start_date, end_date, status')
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
  };

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

          {/* 純圖示重新整理按鈕 */}
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

          {/* 筆數提示 */}
          <div style={{ fontSize: '0.84rem', color: 'var(--wa-text-muted)' }}>
            篩選：<strong>{filteredSignups.length}</strong> 人 / 總報名：<strong>{signups.length}</strong> 人
          </div>
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

          {/* 一鍵恢復預設欄位寬度（左右箭頭圖示） */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={resetColumnWidths}
            title="一鍵恢復預設欄位寬度"
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
              <th style={{ width: 44, minWidth: 44, maxWidth: 44, textAlign: 'center', position: 'sticky', left: 0, zIndex: 20, backgroundColor: '#f8fafc' }}>
                <input
                  type="checkbox"
                  checked={
                    filteredSignups.length > 0 &&
                    filteredSignups.every((s) => selectedSignupIds.has(s.id))
                  }
                  onChange={() => toggleSelectAll(filteredSignups.map((s) => s.id))}
                />
              </th>

              {/* 序號表頭 改為 # */}
              <th style={{ width: 46, minWidth: 46, maxWidth: 46, textAlign: 'center', position: 'sticky', left: 44, zIndex: 20, backgroundColor: '#f8fafc' }}>
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
                    }}
                    className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                  >
                    <div className="wa-th-cell">
                      <span className="wa-th-label" title={col.label}>{col.label}</span>

                      {/* 懸浮時靠左覆蓋表頭名稱之動作工具列 */}
                      <div className="wa-th-actions-overlay">
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

                      {/* 欄位邊緣調寬拖曳柄 */}
                      <div
                        className="wa-col-resizer"
                        onMouseDown={(e) => startResizing(col.key, e)}
                        title="拖曳調整欄寬"
                      />
                    </div>
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
                  <tr key={s.id} className={`${isSelected ? 'selected' : ''} ${isRowPinned ? 'wa-row-pinned' : ''}`}>
                    {/* 勾選核取方塊 */}
                    <td
                      style={{
                        textAlign: 'center',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selectedSignupIds);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          setSelectedSignupIds(next);
                        }}
                      />
                    </td>

                    {/* 序號儲存格與四角懸浮操作列 */}
                    <td
                      className="wa-row-index-cell"
                      style={{
                        position: 'sticky',
                        left: 44,
                        zIndex: 10,
                        backgroundColor: isRowPinned ? '#f0fdf4' : '#ffffff',
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
                    </td>

                    {/* 動態渲染可見欄位內容 */}
                    {visibleColumns.map((col) => {
                      const isPinned = pinnedColumns.includes(col.key);
                      const stickyLeft = stickyLeftPositions[col.key];
                      const isLastPinned = col.key === lastPinnedKey;
                      const textVal = col.formatText(s);

                      // 專屬特殊欄位渲染
                      if (col.key === 'status') {
                        return (
                          <td
                            key={col.key}
                            style={{
                              position: isPinned ? 'sticky' : undefined,
                              left: isPinned ? stickyLeft : undefined,
                              zIndex: isPinned ? 8 : undefined,
                              backgroundColor: '#ffffff',
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
                            }}
                            className={isPinned ? `wa-col-pinned ${isLastPinned ? 'wa-col-pinned-divider' : ''}` : ''}
                          >
                            <span className={`web-admin-badge ${isPaid ? 'web-admin-badge-success' : 'web-admin-badge-warning'}`}>
                              {textVal}
                            </span>
                          </td>
                        );
                      }

                      // 長文字或支援點擊展開的儲存格
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
                          }}
                          onClick={() => {
                            if (textVal && textVal !== '-') {
                              setDetailModal({
                                title: `${col.label}（${s.members?.name || s.name || '報名者'}）`,
                                content: textVal,
                              });
                            }
                          }}
                          title={textVal !== '-' ? '點擊檢視全文' : undefined}
                        >
                          <span className="wa-cell-ellipsis">
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

      {/* 長文字浮動卡片 Popover Modal */}
      {detailModal && (
        <div className="wa-popover-overlay" onClick={() => setDetailModal(null)}>
          <div className="wa-popover-card" onClick={(e) => e.stopPropagation()}>
            <div className="wa-popover-header">
              <h4 className="wa-popover-title">{detailModal.title}</h4>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="wa-popover-body">
              {detailModal.content}
            </div>
            <div className="wa-popover-footer">
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(detailModal.content);
                  setDetailModal(null);
                }}
              >
                <Copy size={14} />
                <span>複製內容</span>
              </button>
              <button
                type="button"
                className="web-admin-btn"
                onClick={() => setDetailModal(null)}
              >
                <span>關閉</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
