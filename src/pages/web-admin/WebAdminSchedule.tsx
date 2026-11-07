import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  Filter,
  CreditCard,
  Layers,
  ExternalLink,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Bookmark,
  CalendarDays
} from 'lucide-react';
import { fetchScheduleFeed, triggerCalendarSync } from '../../utils/supabaseClient';
import { type WebAuthSession, getWebSession } from '../../utils/webAuth';
import type {
  ScheduleFeedItem,
  ScheduleCategoryFilter,
  ScheduleViewMode
} from '../../types/schedule';
import './webAdmin.css';

const WEEK_DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

// 格式化日期為 YYYY-MM-DD
const formatDateKey = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 解析時間字串為 YYYY-MM-DD
const toDateStr = (isoOrDateStr?: string | null): string => {
  if (!isoOrDateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr)) return isoOrDateStr;
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return '';
    return formatDateKey(d);
  } catch {
    return '';
  }
};

// 格式化繁體中文日期顯示
const formatTraditionalChineseDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = WEEK_DAY_NAMES[dateObj.getDay()];
  return `${y} 年 ${m} 月 ${d} 日 (${dayOfWeek})`;
};

export const WebAdminSchedule: React.FC = () => {
  const outletCtx = useOutletContext<{ session?: WebAuthSession } | undefined>();

  // 取得身分憑證
  const session = outletCtx?.session || getWebSession();
  const officerId = session?.userId || 'OFFICER_HUB';

  // 視圖與篩選狀態
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ScheduleCategoryFilter>('all');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 資料狀態
  const [feedItems, setFeedItems] = useState<ScheduleFeedItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // 時間軸折疊展開狀態 (群組 ID -> boolean)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // 搜尋前後視圖記錄，用於搜尋清空時還原視圖
  const previousViewModeRef = useRef<ScheduleViewMode>('calendar');
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  // 計算日曆視圖網格範圍 (以當月為核心，前後填滿完整週)
  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDate = new Date(year, month, 1 - firstDayOfMonth.getDay());
    const endDate = new Date(year, month + 1, 6 - lastDayOfMonth.getDay());

    const weeks: Array<Array<{ date: Date; dateString: string; isCurrentMonth: boolean; isToday: boolean }>> = [];
    const todayStr = formatDateKey(new Date());

    let current = new Date(startDate);
    let currentWeek: Array<{ date: Date; dateString: string; isCurrentMonth: boolean; isToday: boolean }> = [];

    while (current <= endDate) {
      const dateStr = formatDateKey(current);
      currentWeek.push({
        date: new Date(current),
        dateString: dateStr,
        isCurrentMonth: current.getMonth() === month,
        isToday: dateStr === todayStr
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      current.setDate(current.getDate() + 1);
    }

    return {
      weeks,
      startDateStr: formatDateKey(startDate),
      endDateStr: formatDateKey(endDate)
    };
  }, [currentDate]);

  // 載入排程資料流
  const loadScheduleData = useCallback(async () => {
    if (!officerId) return;
    setLoading(true);
    setError(null);

    try {
      let startTime: string | null = null;
      let endTime: string | null = null;

      if (viewMode === 'calendar' && !searchQuery.trim()) {
        startTime = `${calendarGrid.startDateStr}T00:00:00+08:00`;
        endTime = `${calendarGrid.endDateStr}T23:59:59+08:00`;
      } else {
        // 時間軸或全域搜尋：前後各查詢 6 個月
        const center = new Date(currentDate);
        const past = new Date(center);
        past.setMonth(past.getMonth() - 6);
        const future = new Date(center);
        future.setMonth(future.getMonth() + 6);
        startTime = `${formatDateKey(past)}T00:00:00+08:00`;
        endTime = `${formatDateKey(future)}T23:59:59+08:00`;
      }

      const items = await fetchScheduleFeed(officerId, {
        startTime,
        endTime,
        queryText: searchQuery.trim() || null,
        category: selectedCategory
      });

      setFeedItems(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`載入社務日程資料失敗: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [officerId, viewMode, searchQuery, selectedCategory, calendarGrid, currentDate]);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // 搜尋關鍵字連動：輸入搜尋字串時自動切換至時間軸；清空搜尋時切回日曆
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length > 0) {
      if (viewMode === 'calendar') {
        previousViewModeRef.current = 'calendar';
        setViewMode('timeline');
      }
    } else {
      if (previousViewModeRef.current === 'calendar') {
        setViewMode('calendar');
      }
    }
  };

  // 手動切換視圖
  const handleViewModeChange = (mode: ScheduleViewMode) => {
    setViewMode(mode);
    previousViewModeRef.current = mode;
  };

  // 月份導航
  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const handleGoToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(formatDateKey(new Date()));
  };

  // 點擊日期格子或省略按鈕：選取日期並平滑向下滑動至明細區
  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setTimeout(() => {
      if (detailSectionRef.current) {
        detailSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // 觸發 Google 日曆與外部校曆同步
  const handleTriggerSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await triggerCalendarSync(session?.jwt);
      setSyncMessage(res.message || '外部日曆同步完成');
      await loadScheduleData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`外部日曆同步作業失敗: ${msg}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // 選定日期的所有業務明細
  const selectedDateItems = useMemo(() => {
    if (!selectedDate) return [];
    return feedItems.filter((item) => {
      const s = toDateStr(item.start_time);
      const e = toDateStr(item.end_time || item.start_time);
      if (s === selectedDate || e === selectedDate) return true;
      if (s <= selectedDate && e >= selectedDate) return true;
      return false;
    });
  }, [selectedDate, feedItems]);

  // 時間軸視圖之倒序分組與智能聚合
  const timelineGroupedData = useMemo(() => {
    // 依起始時間倒序排列
    const sorted = [...feedItems].sort((a, b) => {
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    });

    const groups: Array<{
      dateKey: string;
      dateLabel: string;
      items: ScheduleFeedItem[];
      financeCount: number;
      financeTotalAmount: number;
      financeItems: ScheduleFeedItem[];
      loanCount: number;
      loanItems: ScheduleFeedItem[];
      otherItems: ScheduleFeedItem[];
    }> = [];

    const map = new Map<string, ScheduleFeedItem[]>();
    sorted.forEach((item) => {
      const dateKey = toDateStr(item.start_time) || '無時間標記';
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    });

    map.forEach((items, dateKey) => {
      const financeItems = items.filter((it) => it.source_type === 'finance');
      const loanItems = items.filter((it) => it.source_type === 'loan_pickup' || it.source_type === 'loan_return');
      const otherItems = items.filter(
        (it) => it.source_type !== 'finance' && it.source_type !== 'loan_pickup' && it.source_type !== 'loan_return'
      );

      const financeTotalAmount = financeItems.reduce((acc, cur) => {
        const amt = cur.details?.amount || 0;
        return acc + Number(amt);
      }, 0);

      groups.push({
        dateKey,
        dateLabel: formatTraditionalChineseDate(dateKey),
        items,
        financeCount: financeItems.length,
        financeTotalAmount,
        financeItems,
        loanCount: loanItems.length,
        loanItems,
        otherItems
      });
    });

    return groups;
  }, [feedItems]);

  // 切換群組折疊狀態
  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // 週長條演算法：計算多日行程與單日行程分佈
  const getWeekLayout = (
    weekDays: Array<{ date: Date; dateString: string; isCurrentMonth: boolean; isToday: boolean }>
  ) => {
    const weekStartStr = weekDays[0].dateString;
    const weekEndStr = weekDays[6].dateString;

    const multiDayItems: ScheduleFeedItem[] = [];
    const singleDayItemsMap: Record<string, ScheduleFeedItem[]> = {};

    weekDays.forEach((d) => {
      singleDayItemsMap[d.dateString] = [];
    });

    feedItems.forEach((it) => {
      const s = toDateStr(it.start_time);
      const e = toDateStr(it.end_time || it.start_time);
      const isMulti = s !== e && (it.is_macro || it.source_type === 'event' || it.source_type === 'school');

      if (e >= weekStartStr && s <= weekEndStr) {
        if (isMulti) {
          multiDayItems.push(it);
        } else {
          if (singleDayItemsMap[s]) {
            singleDayItemsMap[s].push(it);
          }
        }
      }
    });

    // 多日跨格長條演算法：貪婪指派水平軌道 (Slot 0, Slot 1)
    const slotAllocations: Array<{
      item: ScheduleFeedItem;
      startCol: number;
      endCol: number;
      slot: number;
    }> = [];
    const occupiedSlots: boolean[][] = [[], []];

    multiDayItems.forEach((it) => {
      const s = toDateStr(it.start_time);
      const e = toDateStr(it.end_time || it.start_time);

      const startCol = s < weekStartStr ? 0 : Math.max(0, weekDays.findIndex((d) => d.dateString === s));
      const endCol = e > weekEndStr ? 6 : Math.min(6, weekDays.findIndex((d) => d.dateString === e));

      let targetSlot = -1;
      for (let slot = 0; slot < 2; slot++) {
        let isFree = true;
        for (let col = startCol; col <= endCol; col++) {
          if (occupiedSlots[slot][col]) {
            isFree = false;
            break;
          }
        }
        if (isFree) {
          targetSlot = slot;
          for (let col = startCol; col <= endCol; col++) {
            occupiedSlots[slot][col] = true;
          }
          break;
        }
      }

      if (targetSlot !== -1) {
        slotAllocations.push({
          item: it,
          startCol,
          endCol,
          slot: targetSlot
        });
      } else {
        const fallBackDay = s < weekStartStr ? weekStartStr : s;
        if (singleDayItemsMap[fallBackDay]) {
          singleDayItemsMap[fallBackDay].push(it);
        }
      }
    });

    return { slotAllocations, singleDayItemsMap };
  };

  return (
    <div className="wa-schedule-container">
      {/* 頂部操作工具列 */}
      <div className="wa-schedule-toolbar">
        <div className="wa-schedule-toolbar-left">
          {/* 即時搜尋框 */}
          <div className="wa-schedule-search">
            <Search size={16} className="wa-schedule-search-icon" />
            <input
              type="text"
              placeholder="搜尋活動、隊員、末五碼、器材..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="wa-schedule-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="wa-schedule-search-clear"
                onClick={() => handleSearchChange('')}
                title="清除搜尋"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 分類篩選下拉 */}
          <div className="wa-schedule-filter-wrap">
            <Filter size={15} style={{ color: 'var(--wa-text-muted)' }} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ScheduleCategoryFilter)}
              className="wa-schedule-filter-select"
            >
              <option value="all">全部分類</option>
              <option value="events">活動與截止日</option>
              <option value="school">學校校曆</option>
              <option value="finance">財務入帳</option>
              <option value="loans">裝備借還</option>
              <option value="club_calendar">社團行事曆</option>
            </select>
          </div>
        </div>

        <div className="wa-schedule-toolbar-right">
          {/* 月曆月份切換 (在日曆檢視時顯示) */}
          {viewMode === 'calendar' && (
            <div className="wa-schedule-month-nav">
              <button
                type="button"
                className="wa-btn-icon"
                onClick={handlePrevMonth}
                title="上個月"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="wa-schedule-month-label">
                {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月
              </span>
              <button
                type="button"
                className="wa-btn-icon"
                onClick={handleNextMonth}
                title="下個月"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                className="wa-btn-secondary wa-btn-sm"
                onClick={handleGoToday}
              >
                回到今日
              </button>
            </div>
          )}

          {/* 視圖切換器 */}
          <div className="wa-schedule-view-switcher">
            <button
              type="button"
              className={`wa-view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('calendar')}
            >
              <CalendarDays size={15} />
              <span>日曆檢視</span>
            </button>
            <button
              type="button"
              className={`wa-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('timeline')}
            >
              <Clock size={15} />
              <span>時間軸檢視</span>
            </button>
          </div>

          {/* 外部日曆同步按鈕 */}
          <button
            type="button"
            className="wa-btn-secondary wa-btn-sm"
            onClick={handleTriggerSync}
            disabled={syncing}
            title="同步 Google 日曆與學校校曆"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? '同步中...' : '同步外部日曆'}</span>
          </button>
        </div>
      </div>

      {/* 提示訊息與錯誤提示 */}
      {syncMessage && (
        <div className="wa-schedule-alert wa-alert-success">
          <CheckCircle2 size={16} />
          <span>{syncMessage}</span>
        </div>
      )}

      {error && (
        <div className="wa-schedule-alert wa-alert-danger">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="wa-btn-secondary wa-btn-xs"
            onClick={loadScheduleData}
            style={{ marginLeft: 'auto' }}
          >
            重試
          </button>
        </div>
      )}

      {/* 載入中遮罩 */}
      {loading && (
        <div className="wa-schedule-loading-bar">
          <RefreshCw size={18} className="animate-spin" />
          <span>正在檢索社務日程資料...</span>
        </div>
      )}

      {/* 核心內容區 */}
      {!loading && (
        <>
          {viewMode === 'calendar' ? (
            /* ==================== 1. 日曆檢視 (Calendar View) ==================== */
            <div className="wa-calendar-card">
              {/* 週標題列 */}
              <div className="wa-calendar-header-row">
                {WEEK_DAY_NAMES.map((name, i) => (
                  <div
                    key={name}
                    className={`wa-calendar-header-cell ${i === 0 || i === 6 ? 'weekend' : ''}`}
                  >
                    {name}
                  </div>
                ))}
              </div>

              {/* 週網格 (固定每格 110px 高度) */}
              <div className="wa-calendar-body">
                {calendarGrid.weeks.map((weekDays, weekIdx) => {
                  const { slotAllocations, singleDayItemsMap } = getWeekLayout(weekDays);

                  return (
                    <div key={`week-${weekIdx}`} className="wa-calendar-week-row">
                      {weekDays.map((day, colIdx) => {
                        // 取得當前日期的多日條列
                        const daySlots = slotAllocations.filter(
                          (a) => colIdx >= a.startCol && colIdx <= a.endCol
                        );
                        const daySingles = singleDayItemsMap[day.dateString] || [];
                        const totalDayCount = daySlots.length + daySingles.length;
                        const overflowCount = totalDayCount - 2;

                        return (
                          <div
                            key={day.dateString}
                            className={`wa-calendar-cell ${!day.isCurrentMonth ? 'outside-month' : ''} ${
                              day.isToday ? 'today' : ''
                            } ${selectedDate === day.dateString ? 'selected' : ''}`}
                            onClick={() => handleSelectDate(day.dateString)}
                          >
                            {/* 單元格頂部：日期數字與今日標記 */}
                            <div className="wa-calendar-cell-top">
                              <span className="wa-calendar-day-number">{day.date.getDate()}</span>
                              {day.isToday && <span className="wa-calendar-today-pill">今日</span>}
                            </div>

                            {/* 排程項目容器 (固定高度 110px 邊界內) */}
                            <div className="wa-calendar-cell-items">
                              {/* 1. 多日行程長條 */}
                              {daySlots.slice(0, 2).map((alloc) => {
                                const isStart = colIdx === alloc.startCol;
                                const isEnd = colIdx === alloc.endCol;
                                const isMiddle = !isStart && !isEnd;
                                const isSchool = alloc.item.source_type === 'school';

                                return (
                                  <div
                                    key={`multi-${alloc.item.item_id}`}
                                    className={`wa-cal-bar ${isSchool ? 'school-bar' : 'event-bar'} ${
                                      isStart ? 'bar-start' : ''
                                    } ${isMiddle ? 'bar-middle' : ''} ${isEnd ? 'bar-end' : ''}`}
                                    title={alloc.item.title}
                                  >
                                    {isStart || colIdx === 0 ? alloc.item.title : ''}
                                  </div>
                                );
                              })}

                              {/* 2. 單日項目標籤 (醒目置頂、細部灰底白字) */}
                              {daySingles
                                .slice(0, Math.max(0, 2 - daySlots.length))
                                .map((item) => {
                                  const isDeadline = item.source_type === 'deadline';
                                  const isEvent = item.source_type === 'event';
                                  const isSchool = item.source_type === 'school';

                                  let itemClass = 'micro-tag';
                                  if (isDeadline) itemClass = 'deadline-tag';
                                  else if (isEvent) itemClass = 'event-tag';
                                  else if (isSchool) itemClass = 'school-tag';

                                  return (
                                    <div
                                      key={`single-${item.item_id}`}
                                      className={`wa-cal-badge ${itemClass}`}
                                      title={`${item.title} - ${item.sub_text}`}
                                    >
                                      {item.title}
                                    </div>
                                  );
                                })}

                              {/* 3. 超額省略標記 */}
                              {overflowCount > 0 && (
                                <button
                                  type="button"
                                  className="wa-cal-overflow-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectDate(day.dateString);
                                  }}
                                  title="點擊展開當日完整明細"
                                >
                                  ⋮ 另有 {overflowCount} 筆
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ==================== 2. 時間軸檢視 (Timeline View) ==================== */
            <div className="wa-timeline-container">
              {timelineGroupedData.length === 0 ? (
                <div className="wa-empty-state">
                  <CalendarDays size={40} style={{ color: 'var(--wa-text-subtle)', marginBottom: 12 }} />
                  <p>在此時間區間內查無任何社務日程紀錄</p>
                </div>
              ) : (
                timelineGroupedData.map((group) => {
                  const isFinanceExpanded = !!expandedGroups[`finance-${group.dateKey}`];
                  const isLoanExpanded = !!expandedGroups[`loan-${group.dateKey}`];

                  return (
                    <div key={group.dateKey} className="wa-timeline-group">
                      {/* 日期錨點標頭 */}
                      <div className="wa-timeline-date-header">
                        <div className="wa-timeline-date-bullet" />
                        <span className="wa-timeline-date-title">{group.dateLabel}</span>
                        <span className="wa-timeline-date-count">共 {group.items.length} 筆事項</span>
                      </div>

                      {/* 內容串流卡片 */}
                      <div className="wa-timeline-items-stream">
                        {/* 巨觀與校曆項目 */}
                        {group.otherItems.map((item) => (
                          <div key={item.item_id} className="wa-timeline-card">
                            <div className="wa-timeline-card-header">
                              <span className={`wa-status-pill ${item.source_type}`}>
                                {item.status_badge || item.source_type}
                              </span>
                              <span className="wa-timeline-item-time">
                                <Clock size={13} />
                                {item.start_time ? item.start_time.substring(11, 16) || '全天' : '全天'}
                              </span>
                            </div>
                            <div className="wa-timeline-card-body">
                              <h4 className="wa-timeline-item-title">{item.title}</h4>
                              <p className="wa-timeline-item-sub">{item.sub_text}</p>
                            </div>
                            {item.link_path && (
                              <div className="wa-timeline-card-footer">
                                <Link to={item.link_path} className="wa-card-jump-btn">
                                  <span>前往查看</span>
                                  <ExternalLink size={13} />
                                </Link>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 財務入帳智能聚合卡片 (>= 3 筆折疊) */}
                        {group.financeCount > 0 && (
                          <>
                            {group.financeCount >= 3 && !isFinanceExpanded ? (
                              <div
                                className="wa-timeline-aggregate-card"
                                onClick={() => toggleGroupExpand(`finance-${group.dateKey}`)}
                              >
                                <div className="wa-aggregate-icon">
                                  <CreditCard size={18} />
                                </div>
                                <div className="wa-aggregate-info">
                                  <span className="wa-aggregate-title">
                                    本日共計 {group.financeCount} 筆繳費申報 (總額 ${group.financeTotalAmount.toLocaleString()})
                                  </span>
                                  <span className="wa-aggregate-hint">點擊展開各筆隊員入帳明細</span>
                                </div>
                                <ChevronDown size={16} className="wa-aggregate-chevron" />
                              </div>
                            ) : (
                              group.financeItems.map((item) => (
                                <div key={item.item_id} className="wa-timeline-card finance-border">
                                  <div className="wa-timeline-card-header">
                                    <span className="wa-status-pill finance">財務入帳</span>
                                    <span className="wa-timeline-item-time">
                                      {item.start_time ? item.start_time.substring(11, 16) || '今日' : '今日'}
                                    </span>
                                  </div>
                                  <div className="wa-timeline-card-body">
                                    <h4 className="wa-timeline-item-title">{item.title}</h4>
                                    <p className="wa-timeline-item-sub">{item.sub_text}</p>
                                  </div>
                                  <div className="wa-timeline-card-footer">
                                    <Link to={item.link_path || '/admin-web/finance'} className="wa-card-jump-btn">
                                      <span>前往財務對帳</span>
                                      <ExternalLink size={13} />
                                    </Link>
                                  </div>
                                </div>
                              ))
                            )}
                            {group.financeCount >= 3 && isFinanceExpanded && (
                              <button
                                type="button"
                                className="wa-btn-link wa-collapse-toggle"
                                onClick={() => toggleGroupExpand(`finance-${group.dateKey}`)}
                              >
                                <ChevronUp size={14} />
                                <span>收起財務折疊卡片</span>
                              </button>
                            )}
                          </>
                        )}

                        {/* 裝備借還智能聚合卡片 (>= 3 筆折疊) */}
                        {group.loanCount > 0 && (
                          <>
                            {group.loanCount >= 3 && !isLoanExpanded ? (
                              <div
                                className="wa-timeline-aggregate-card"
                                onClick={() => toggleGroupExpand(`loan-${group.dateKey}`)}
                              >
                                <div className="wa-aggregate-icon">
                                  <Layers size={18} />
                                </div>
                                <div className="wa-aggregate-info">
                                  <span className="wa-aggregate-title">
                                    本日共計 {group.loanCount} 筆裝備借還紀錄
                                  </span>
                                  <span className="wa-aggregate-hint">點擊展開借用人與器材點收明細</span>
                                </div>
                                <ChevronDown size={16} className="wa-aggregate-chevron" />
                              </div>
                            ) : (
                              group.loanItems.map((item) => (
                                <div key={item.item_id} className="wa-timeline-card loan-border">
                                  <div className="wa-timeline-card-header">
                                    <span className="wa-status-pill loans">裝備借還</span>
                                    <span className="wa-timeline-item-time">
                                      {item.start_time ? item.start_time.substring(11, 16) || '今日' : '今日'}
                                    </span>
                                  </div>
                                  <div className="wa-timeline-card-body">
                                    <h4 className="wa-timeline-item-title">{item.title}</h4>
                                    <p className="wa-timeline-item-sub">{item.sub_text}</p>
                                  </div>
                                  <div className="wa-timeline-card-footer">
                                    <Link to={item.link_path || '/admin-web/loans'} className="wa-card-jump-btn">
                                      <span>前往裝備點收</span>
                                      <ExternalLink size={13} />
                                    </Link>
                                  </div>
                                </div>
                              ))
                            )}
                            {group.loanCount >= 3 && isLoanExpanded && (
                              <button
                                type="button"
                                className="wa-btn-link wa-collapse-toggle"
                                onClick={() => toggleGroupExpand(`loan-${group.dateKey}`)}
                              >
                                <ChevronUp size={14} />
                                <span>收起裝備借還折疊卡片</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ==================== 3. 選定日期詳細清單 (向下展開區塊) ==================== */}
          {selectedDate && (
            <div
              id="wa-schedule-detail-section"
              ref={detailSectionRef}
              className="wa-schedule-detail-section"
            >
              <div className="wa-detail-header">
                <div className="wa-detail-title-group">
                  <Bookmark size={20} style={{ color: 'var(--wa-primary)' }} />
                  <h3 className="wa-detail-title">
                    {formatTraditionalChineseDate(selectedDate)} 業務明細
                  </h3>
                  <span className="wa-detail-badge">{selectedDateItems.length} 筆事項</span>
                </div>
                <button
                  type="button"
                  className="wa-btn-secondary wa-btn-sm"
                  onClick={() => setSelectedDate(null)}
                >
                  <X size={15} />
                  <span>關閉展開</span>
                </button>
              </div>

              {selectedDateItems.length === 0 ? (
                <div className="wa-empty-state-sm">
                  <span>此日期查無特定活動、繳費申報或裝備借還事項</span>
                </div>
              ) : (
                <div className="wa-detail-grid">
                  {selectedDateItems.map((item) => (
                    <div key={item.item_id} className="wa-detail-card">
                      <div className="wa-detail-card-head">
                        <span className={`wa-status-pill ${item.source_type}`}>
                          {item.status_badge || item.source_type}
                        </span>
                        <span className="wa-detail-time">
                          {item.start_time ? item.start_time.substring(11, 16) || '全天' : '全天'}
                        </span>
                      </div>

                      <div className="wa-detail-card-main">
                        <h4 className="wa-detail-item-title">{item.title}</h4>
                        <p className="wa-detail-item-sub">{item.sub_text}</p>

                        {/* 活動額外統計指標 */}
                        {item.details?.stats && (
                          <div className="wa-detail-stats">
                            <span>正取: {item.details.stats.accepted || 0} 人</span>
                            <span>候補: {item.details.stats.waitlist || 0} 人</span>
                            <span>總計: {item.details.stats.total || 0} 人</span>
                          </div>
                        )}
                      </div>

                      <div className="wa-detail-card-action">
                        {item.link_path && (
                          <Link to={item.link_path} className="wa-card-jump-btn">
                            <span>開啟對應功能</span>
                            <ExternalLink size={14} />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
