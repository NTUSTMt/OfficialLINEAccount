import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  BarChart3,
  Bell,
  AlertCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import type { AdminFinanceItem } from '../../types/admin';
import type { AdminEvent } from '../../types/event';
import {
  ExpectedVsReceivedBar,
  StatusDonutChart,
  CategoryDonutChart,
  RevenueTrendChart,
} from './FinanceReportCharts';
import '../../pages/web-admin/webAdmin.css';

export interface FinanceReportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: AdminFinanceItem[];
  events: AdminEvent[];
  selectedEventId?: string;
  onSelectEvent?: (eventId: string) => void;
  onTriggerReminder?: (item: AdminFinanceItem) => void;
}

interface SemesterOption {
  key: string;
  label: string;
  startDate?: string;
  endDate?: string;
}

const SEMESTER_OPTIONS: SemesterOption[] = [
  { key: 'all', label: '全期 (All Time)' },
  { key: '113-2', label: '113 學年度第 2 學期 (113-2)', startDate: '2025-02-01', endDate: '2025-07-31' },
  { key: '113-1', label: '113 學年度第 1 學期 (113-1)', startDate: '2024-08-01', endDate: '2025-01-31' },
  { key: '112-2', label: '112 學年度第 2 學期 (112-2)', startDate: '2024-02-01', endDate: '2024-07-31' },
  { key: '112-1', label: '112 學年度第 1 學期 (112-1)', startDate: '2023-08-01', endDate: '2024-01-31' },
  { key: 'custom', label: '自訂日期區間 (Custom)' },
];

export const FinanceReportDrawer: React.FC<FinanceReportDrawerProps> = ({
  isOpen,
  onClose,
  items = [],
  events = [],
  selectedEventId = '',
  onSelectEvent,
  onTriggerReminder,
}) => {
  // 模式切換：Mode A (活動 / 專題明細) vs Mode B (全社綜合走勢)
  const [activeMode, setActiveMode] = useState<'event' | 'overall'>('event');

  // 學年度與學期過濾器
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 當前選取的活動 ID
  const [currentEventId, setCurrentEventId] = useState<string>(selectedEventId || '');

  // 監聽鍵盤 ESC 關閉抽屜
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 同步外部傳入的 selectedEventId 或預設第一個活動
  useEffect(() => {
    if (selectedEventId) {
      setCurrentEventId(selectedEventId);
    } else if (!currentEventId && events.length > 0) {
      setCurrentEventId(events[0].id);
    }
  }, [selectedEventId, events, currentEventId]);

  // 切換學期設定
  const handleSemesterChange = (semesterKey: string) => {
    setSelectedSemester(semesterKey);
    const found = SEMESTER_OPTIONS.find((s) => s.key === semesterKey);
    if (found && found.startDate && found.endDate) {
      setStartDate(found.startDate);
      setEndDate(found.endDate);
    } else if (semesterKey === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // 依時間區間篩選全體資料
  const filteredByDateItems = useMemo(() => {
    return items.filter((it) => {
      if (!it.created_at) return true;
      const d = it.created_at.slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [items, startDate, endDate]);

  // 當前選中的活動物件
  const currentEvent = useMemo(() => {
    return events.find((ev) => ev.id === currentEventId);
  }, [events, currentEventId]);

  // Mode A: 活動專案篩選之項目
  const eventItems = useMemo(() => {
    if (!currentEventId) return [];
    return filteredByDateItems.filter((it) => {
      const isTargetIdMatch = it.target_id === currentEventId;
      const isNameMatch = currentEvent && (it.type?.includes(currentEvent.name) || it.target_id === currentEvent.name);
      return isTargetIdMatch || isNameMatch;
    });
  }, [filteredByDateItems, currentEventId, currentEvent]);

  // Mode A KPI 計算
  const {
    expectedTotal,
    confirmedTotal,
    checkingTotal,
    unpaidTotal,
    pendingTotal,
    completionRate,
  } = useMemo(() => {
    let exp = 0;
    let conf = 0;
    let chk = 0;
    let unp = 0;

    for (const it of eventItems) {
      const amt = Number(it.amount) || 0;
      exp += amt;
      if (it.status === '已核銷 Confirmed') {
        conf += amt;
      } else if (it.status === '待確認 Checking') {
        chk += amt;
      } else {
        unp += amt;
      }
    }

    const pend = chk + unp;
    const rate = exp > 0 ? (conf / exp) * 100 : conf > 0 ? 100 : 0;

    return {
      expectedTotal: exp,
      confirmedTotal: conf,
      checkingTotal: chk,
      unpaidTotal: unp,
      pendingTotal: pend,
      completionRate: rate,
    };
  }, [eventItems]);

  // Mode A 未繳費 / 異常核銷名冊
  const unpaidOrPendingRoster = useMemo(() => {
    return eventItems.filter((it) => it.status !== '已核銷 Confirmed');
  }, [eventItems]);

  // Mode B 類別分佈金額計算
  const categoryTotals = useMemo(() => {
    let activity = 0;
    let equipment = 0;
    let membership = 0;
    let general = 0;

    for (const it of filteredByDateItems) {
      const amt = Number(it.amount) || 0;
      const cat =
        it.itemCategory ||
        ((it.type || '').includes('活動') || it.sourceType === 'event_signup'
          ? 'activity'
          : (it.type || '').includes('裝備') || it.sourceType === 'loan'
          ? 'equipment'
          : (it.type || '').includes('社籍') || (it.type || '').includes('社費')
          ? 'membership'
          : 'general');

      if (cat === 'activity') activity += amt;
      else if (cat === 'equipment') equipment += amt;
      else if (cat === 'membership') membership += amt;
      else general += amt;
    }

    return { activity, equipment, membership, general };
  }, [filteredByDateItems]);

  // Mode B 營收走勢分組計算 (以月份為維度)
  const revenueTrendData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of filteredByDateItems) {
      if (it.status === '已核銷 Confirmed') {
        const month = it.created_at ? it.created_at.slice(0, 7) : '未標記';
        map[month] = (map[month] || 0) + (Number(it.amount) || 0);
      }
    }
    return Object.keys(map)
      .sort()
      .map((k) => ({ label: k, amount: map[k] }));
  }, [filteredByDateItems]);

  // Mode B 全期/期間總覽 KPI
  const overallKpis = useMemo(() => {
    let conf = 0;
    let pend = 0;
    for (const it of filteredByDateItems) {
      const amt = Number(it.amount) || 0;
      if (it.status === '已核銷 Confirmed') {
        conf += amt;
      } else {
        pend += amt;
      }
    }
    return {
      confirmedRevenue: conf,
      pendingRevenue: pend,
      itemCount: filteredByDateItems.length,
    };
  }, [filteredByDateItems]);

  // 匯出 CSV (UTF-8 BOM 防 Excel 亂碼)
  const exportCsv = () => {
    const targetItems = activeMode === 'event' ? eventItems : filteredByDateItems;
    const headers = [
      '流水號',
      '姓名',
      '類別',
      '項目明細',
      '金額',
      '對帳核銷狀態',
      '銀行末五碼',
      '建立時間',
      '備註說明',
    ];

    const rows = targetItems.map((it) => [
      `"${(it.id || '').replace(/"/g, '""')}"`,
      `"${(it.name || '').replace(/"/g, '""')}"`,
      `"${(it.itemCategory || it.sourceType || '').replace(/"/g, '""')}"`,
      `"${(it.type || '').replace(/"/g, '""')}"`,
      it.amount || 0,
      `"${(it.status || '').replace(/"/g, '""')}"`,
      `"${(it.bank_last5 || '').replace(/"/g, '""')}"`,
      `"${(it.created_at || '').replace(/"/g, '""')}"`,
      `"${(it.notes || it.officer_notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `財務報表_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 友善列印 / PDF
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <div
        className="wa-drawer-panel wa-finance-report-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 抽屜標頭 */}
        <div className="wa-drawer-header">
          <div>
            <h2 className="wa-drawer-title">財務報表與走勢分析</h2>
            <div className="wa-drawer-subtitle" style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
              活動收支核銷進度與全社財務視覺化
            </div>
          </div>
          <button
            type="button"
            className="wa-drawer-close-btn"
            onClick={onClose}
            aria-label="關閉抽屜"
          >
            <X size={18} />
          </button>
        </div>

        {/* 雙模式切換導覽頁籤 */}
        <div className="wa-report-tab-bar wa-no-print">
          <button
            type="button"
            className={`wa-report-tab-btn ${activeMode === 'event' ? 'active' : ''}`}
            onClick={() => setActiveMode('event')}
          >
            <BarChart3 size={15} />
            <span>活動 / 專題明細</span>
          </button>
          <button
            type="button"
            className={`wa-report-tab-btn ${activeMode === 'overall' ? 'active' : ''}`}
            onClick={() => setActiveMode('overall')}
          >
            <TrendingUp size={15} />
            <span>全社綜合走勢</span>
          </button>
        </div>

        {/* 工具與篩選列 */}
        <div className="wa-report-filter-bar wa-no-print">
          <div className="wa-report-filter-row">
            <div className="wa-report-filter-item">
              <label className="wa-report-filter-label">學期篩選</label>
              <select
                className="wa-form-input wa-report-select"
                value={selectedSemester}
                onChange={(e) => handleSemesterChange(e.target.value)}
              >
                {SEMESTER_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="wa-report-filter-item wa-report-date-range">
              <label className="wa-report-filter-label">自訂起訖</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  className="wa-form-input wa-report-date-input"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSelectedSemester('custom');
                  }}
                  title="起始日期"
                />
                <span style={{ color: 'var(--wa-text-muted)', fontSize: '0.82rem' }}>至</span>
                <input
                  type="date"
                  className="wa-form-input wa-report-date-input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSelectedSemester('custom');
                  }}
                  title="結束日期"
                />
              </div>
            </div>
          </div>

          {/* 匯出與列印動作按鈕 */}
          <div className="wa-report-actions-row">
            <button
              type="button"
              className="web-admin-btn web-admin-btn-secondary wa-report-action-btn"
              onClick={exportCsv}
              title="匯出 UTF-8 格式 CSV 試算表"
            >
              <Download size={14} />
              <span>匯出 CSV</span>
            </button>
            <button
              type="button"
              className="web-admin-btn web-admin-btn-secondary wa-report-action-btn"
              onClick={handlePrint}
              title="開啟瀏覽器列印或另存為 PDF"
            >
              <Printer size={14} />
              <span>友善列印 / PDF</span>
            </button>
          </div>
        </div>

        {/* 抽屜主要滾動內容 */}
        <div className="wa-drawer-body wa-report-body">
          {activeMode === 'event' ? (
            /* Mode A: 活動 / 專題明細 */
            <div className="wa-report-mode-container">
              {/* 活動下拉選擇器 */}
              <div className="wa-report-event-selector-card">
                <label className="wa-report-section-label">選擇活動專案</label>
                <select
                  className="wa-form-input"
                  value={currentEventId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setCurrentEventId(newId);
                    onSelectEvent?.(newId);
                  }}
                >
                  {events.length === 0 && <option value="">目前尚無活動資料</option>}
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} {ev.startDate ? `(${ev.startDate})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode A 核心 KPI 指標卡片 */}
              <div className="wa-report-kpi-grid">
                <div className="wa-report-kpi-card">
                  <div className="wa-report-kpi-title">應收總額</div>
                  <div className="wa-report-kpi-value">
                    NT$ {expectedTotal.toLocaleString()}
                  </div>
                  <div className="wa-report-kpi-sub">共 {eventItems.length} 筆對帳名額</div>
                </div>

                <div className="wa-report-kpi-card wa-report-kpi-success">
                  <div className="wa-report-kpi-title">實收已核銷</div>
                  <div className="wa-report-kpi-value">
                    NT$ {confirmedTotal.toLocaleString()}
                  </div>
                  <div className="wa-report-kpi-sub">已完成對帳入帳</div>
                </div>

                <div className="wa-report-kpi-card wa-report-kpi-warning">
                  <div className="wa-report-kpi-title">待核銷 / 待繳費</div>
                  <div className="wa-report-kpi-value">
                    NT$ {pendingTotal.toLocaleString()}
                  </div>
                  <div className="wa-report-kpi-sub">
                    待確認 NT$ {checkingTotal.toLocaleString()} / 待繳 NT$ {unpaidTotal.toLocaleString()}
                  </div>
                </div>

                <div className="wa-report-kpi-card">
                  <div className="wa-report-kpi-title">繳費達成率</div>
                  <div className="wa-report-kpi-value">
                    {completionRate.toFixed(1)}%
                  </div>
                  <div className="wa-report-kpi-sub">實收佔應收比例</div>
                </div>
              </div>

              {/* SVG 雙層進度條對比 */}
              <ExpectedVsReceivedBar
                expected={expectedTotal}
                received={confirmedTotal}
                pending={checkingTotal}
              />

              {/* SVG 核銷狀態圓餅圖 */}
              <StatusDonutChart
                confirmed={confirmedTotal}
                checking={checkingTotal}
                unpaid={unpaidTotal}
                total={expectedTotal}
              />

              {/* 異常與未繳名冊專區 */}
              <div className="wa-report-roster-section">
                <div className="wa-report-roster-header">
                  <div>
                    <h3 className="wa-report-roster-title">異常與待核帳名冊</h3>
                    <div className="wa-report-roster-sub">
                      針對未繳費或待核帳社員提供獨立催繳提醒通知
                    </div>
                  </div>
                  <span className="wa-badge wa-badge-warning">
                    {unpaidOrPendingRoster.length} 位待處理
                  </span>
                </div>

                {unpaidOrPendingRoster.length === 0 ? (
                  <div className="wa-report-empty-roster">
                    <CheckCircle2 size={32} style={{ color: 'var(--wa-primary)' }} />
                    <p style={{ margin: '8px 0 0', fontWeight: 600 }}>本活動所有名單皆已完成核銷！</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--wa-text-muted)' }}>無滯留未繳費或異常帳款</p>
                  </div>
                ) : (
                  <div className="wa-report-roster-list">
                    {unpaidOrPendingRoster.map((item) => (
                      <div key={item.id} className="wa-report-roster-item">
                        <div className="wa-report-roster-info">
                          <div className="wa-report-roster-name-row">
                            <span className="wa-report-roster-name">{item.name}</span>
                            <span
                              className={`wa-badge ${
                                item.status === '待確認 Checking'
                                  ? 'wa-badge-warning'
                                  : 'wa-badge-danger'
                              }`}
                            >
                              {item.status === '待確認 Checking' ? '待確認' : '待繳費'}
                            </span>
                          </div>
                          <div className="wa-report-roster-detail-row">
                            <span>應繳 NT$ {Number(item.amount || 0).toLocaleString()}</span>
                            {item.bank_last5 && <span>末五碼: {item.bank_last5}</span>}
                            {item.notes && <span className="wa-report-roster-note">{item.notes}</span>}
                          </div>
                        </div>

                        <div className="wa-report-roster-action">
                          <button
                            type="button"
                            className="web-admin-btn web-admin-btn-secondary wa-report-reminder-btn"
                            onClick={() => onTriggerReminder?.(item)}
                            title={`向 ${item.name} 發送 LINE 繳費提醒通知`}
                          >
                            <Bell size={13} />
                            <span>發送提醒</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Mode B: 全社綜合走勢 */
            <div className="wa-report-mode-container">
              {/* Mode B 核心指標 */}
              <div className="wa-report-kpi-grid">
                <div className="wa-report-kpi-card wa-report-kpi-success">
                  <div className="wa-report-kpi-title">實收已核銷總額</div>
                  <div className="wa-report-kpi-value">
                    NT$ {overallKpis.confirmedRevenue.toLocaleString()}
                  </div>
                  <div className="wa-report-kpi-sub">已入帳之有效收益</div>
                </div>

                <div className="wa-report-kpi-card wa-report-kpi-warning">
                  <div className="wa-report-kpi-title">待確認與待繳款項</div>
                  <div className="wa-report-kpi-value">
                    NT$ {overallKpis.pendingRevenue.toLocaleString()}
                  </div>
                  <div className="wa-report-kpi-sub">尚在對帳或待繳流程中</div>
                </div>

                <div className="wa-report-kpi-card">
                  <div className="wa-report-kpi-title">篩選紀錄總數</div>
                  <div className="wa-report-kpi-value">
                    {overallKpis.itemCount} 筆
                  </div>
                  <div className="wa-report-kpi-sub">符合日期篩選條件項目</div>
                </div>
              </div>

              {/* 類別收支分佈圓餅圖 */}
              <CategoryDonutChart
                activity={categoryTotals.activity}
                equipment={categoryTotals.equipment}
                membership={categoryTotals.membership}
                general={categoryTotals.general}
              />

              {/* 營收歷史走勢長條折線圖 */}
              <RevenueTrendChart data={revenueTrendData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
