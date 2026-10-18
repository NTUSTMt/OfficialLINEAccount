import React, { useState } from 'react';

// ============================================================================
// 國立臺灣科技大學登山社 - 輕量自研 SVG/CSS 視覺圖表與 KPI 元件
// 無外部圖表套件依賴 (Zero external charting library dependencies)
// ============================================================================

export interface ExpectedVsReceivedBarProps {
  expected: number;
  received: number;
  pending?: number;
}

export interface StatusDonutChartProps {
  confirmed: number;
  checking: number;
  unpaid: number;
  total?: number;
}

export interface CategoryDonutChartProps {
  activity: number;
  equipment: number;
  membership: number;
  general: number;
}

export interface RevenueTrendItem {
  label: string;
  amount: number;
}

export interface RevenueTrendChartProps {
  data: RevenueTrendItem[];
}

/**
 * 1. 應收與實收對比雙層進度條 (ExpectedVsReceivedBar)
 */
export const ExpectedVsReceivedBar: React.FC<ExpectedVsReceivedBarProps> = ({
  expected = 0,
  received = 0,
  pending = 0
}) => {
  const safeExpected = Math.max(0, expected || 0);
  const safeReceived = Math.max(0, received || 0);
  const safePending = Math.max(0, pending || 0);

  const rate = safeExpected > 0
    ? (safeReceived / safeExpected) * 100
    : (safeReceived > 0 ? 100 : 0);

  const maxVal = Math.max(safeExpected, safeReceived + safePending, 1);
  const receivedPct = Math.min(100, Math.max(0, (safeReceived / maxVal) * 100));
  const pendingPct = Math.min(100 - receivedPct, Math.max(0, (safePending / maxVal) * 100));
  const unpaidDiff = Math.max(0, safeExpected - safeReceived - safePending);

  return (
    <div className="wa-finance-chart wa-chart-container wa-progress-chart-card">
      <div className="wa-chart-header">
        <div>
          <div className="wa-chart-title">實收達成進度</div>
          <div className="wa-chart-subtitle">
            實收 NT$ {safeReceived.toLocaleString()} / 應收 NT$ {safeExpected.toLocaleString()}
          </div>
        </div>
        <div className="wa-chart-kpi-badge">
          <span className="wa-chart-kpi-rate">{rate.toFixed(1)}%</span>
          <span className="wa-chart-kpi-caption">達成率</span>
        </div>
      </div>

      <div className="wa-chart-bar-track">
        <svg
          className="wa-chart-bar-svg"
          width="100%"
          height="14"
          viewBox="0 0 100 14"
          preserveAspectRatio="none"
        >
          {/* 背景軌道 */}
          <rect x="0" y="0" width="100" height="14" rx="7" fill="var(--wa-surface-alt, #f1f5f9)" />
          {/* 已入帳 (Received) */}
          {receivedPct > 0 && (
            <rect
              x="0"
              y="0"
              width={receivedPct}
              height="14"
              rx={receivedPct >= 99 ? 7 : 4}
              fill="var(--wa-primary, #059669)"
            />
          )}
          {/* 待核帳 / 待處理 (Pending) */}
          {pendingPct > 0 && (
            <rect
              x={receivedPct}
              y="0"
              width={pendingPct}
              height="14"
              rx={receivedPct + pendingPct >= 99 ? 7 : 0}
              fill="var(--wa-warning, #d97706)"
            />
          )}
        </svg>
      </div>

      <div className="wa-chart-bar-metrics">
        <div className="wa-chart-metric-item">
          <span className="wa-chart-metric-dot wa-dot-confirmed" />
          <span className="wa-chart-metric-label">已入帳</span>
          <span className="wa-chart-metric-value">NT$ {safeReceived.toLocaleString()}</span>
        </div>
        <div className="wa-chart-metric-item">
          <span className="wa-chart-metric-dot wa-dot-checking" />
          <span className="wa-chart-metric-label">待核對</span>
          <span className="wa-chart-metric-value">NT$ {safePending.toLocaleString()}</span>
        </div>
        <div className="wa-chart-metric-item">
          <span className="wa-chart-metric-dot wa-dot-unpaid" />
          <span className="wa-chart-metric-label">待繳差額</span>
          <span className="wa-chart-metric-value">NT$ {unpaidDiff.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 2. 繳費狀態分佈甜甜圈圖 (StatusDonutChart)
 */
export const StatusDonutChart: React.FC<StatusDonutChartProps> = ({
  confirmed = 0,
  checking = 0,
  unpaid = 0,
  total
}) => {
  const safeConfirmed = Math.max(0, confirmed || 0);
  const safeChecking = Math.max(0, checking || 0);
  const safeUnpaid = Math.max(0, unpaid || 0);
  const computedTotal = total ?? (safeConfirmed + safeChecking + safeUnpaid);

  const radius = 42;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // 約 263.89

  const confirmedLen = computedTotal > 0 ? (safeConfirmed / computedTotal) * circumference : 0;
  const checkingLen = computedTotal > 0 ? (safeChecking / computedTotal) * circumference : 0;
  const unpaidLen = computedTotal > 0 ? (safeUnpaid / computedTotal) * circumference : 0;

  const confirmedPct = computedTotal > 0 ? Math.round((safeConfirmed / computedTotal) * 100) : 0;
  const checkingPct = computedTotal > 0 ? Math.round((safeChecking / computedTotal) * 100) : 0;
  const unpaidPct = computedTotal > 0 ? Math.round((safeUnpaid / computedTotal) * 100) : 0;

  return (
    <div className="wa-finance-chart wa-chart-container wa-donut-chart-card">
      <div className="wa-chart-header">
        <div className="wa-chart-title">繳費對帳狀態</div>
        <div className="wa-chart-subtitle">共 {computedTotal} 筆記錄</div>
      </div>

      <div className="wa-donut-wrapper">
        <svg
          className="wa-donut-svg"
          width="130"
          height="130"
          viewBox="0 0 130 130"
        >
          {/* 背景空環 */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke="var(--wa-border, #e2e8f0)"
            strokeWidth={strokeWidth}
          />

          {computedTotal > 0 && (
            <g transform="rotate(-90 65 65)">
              {/* 已確認 (綠色) */}
              {confirmedLen > 0 && (
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="var(--wa-primary, #059669)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${confirmedLen} ${circumference - confirmedLen}`}
                  strokeDashoffset={0}
                  strokeLinecap="round"
                />
              )}
              {/* 待核帳 (橘黃) */}
              {checkingLen > 0 && (
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="var(--wa-warning, #d97706)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${checkingLen} ${circumference - checkingLen}`}
                  strokeDashoffset={-confirmedLen}
                  strokeLinecap="round"
                />
              )}
              {/* 未繳費 (紅色) */}
              {unpaidLen > 0 && (
                <circle
                  cx="65"
                  cy="65"
                  r={radius}
                  fill="none"
                  stroke="var(--wa-danger, #dc2626)"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${unpaidLen} ${circumference - unpaidLen}`}
                  strokeDashoffset={-(confirmedLen + checkingLen)}
                  strokeLinecap="round"
                />
              )}
            </g>
          )}

          {/* 中央文字 */}
          <text
            x="65"
            y="60"
            textAnchor="middle"
            className="wa-donut-center-main"
          >
            {computedTotal > 0 ? `${confirmedPct}%` : '0'}
          </text>
          <text
            x="65"
            y="76"
            textAnchor="middle"
            className="wa-donut-center-sub"
          >
            {computedTotal > 0 ? '已核實' : '無資料'}
          </text>
        </svg>

        {/* 右側 / 下方圖例 */}
        <div className="wa-donut-legend">
          <div className="wa-donut-legend-row">
            <span className="wa-chart-metric-dot wa-dot-confirmed" />
            <span className="wa-donut-legend-label">已確認</span>
            <span className="wa-donut-legend-num">{safeConfirmed} 筆</span>
            <span className="wa-donut-legend-pct">({confirmedPct}%)</span>
          </div>
          <div className="wa-donut-legend-row">
            <span className="wa-chart-metric-dot wa-dot-checking" />
            <span className="wa-donut-legend-label">待核帳</span>
            <span className="wa-donut-legend-num">{safeChecking} 筆</span>
            <span className="wa-donut-legend-pct">({checkingPct}%)</span>
          </div>
          <div className="wa-donut-legend-row">
            <span className="wa-chart-metric-dot wa-dot-unpaid" />
            <span className="wa-donut-legend-label">待繳費</span>
            <span className="wa-donut-legend-num">{safeUnpaid} 筆</span>
            <span className="wa-donut-legend-pct">({unpaidPct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 3. 收支項目類別分佈甜甜圈圖 (CategoryDonutChart)
 */
export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  activity = 0,
  equipment = 0,
  membership = 0,
  general = 0
}) => {
  const safeActivity = Math.max(0, activity || 0);
  const safeEquipment = Math.max(0, equipment || 0);
  const safeMembership = Math.max(0, membership || 0);
  const safeGeneral = Math.max(0, general || 0);
  const total = safeActivity + safeEquipment + safeMembership + safeGeneral;

  const radius = 42;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;

  const categories = [
    { label: '活動款項', val: safeActivity, color: '#059669', dotClass: 'wa-dot-activity' },
    { label: '裝備租借', val: safeEquipment, color: '#0284c7', dotClass: 'wa-dot-equipment' },
    { label: '常年會費', val: safeMembership, color: '#7c3aed', dotClass: 'wa-dot-membership' },
    { label: '一般收支', val: safeGeneral, color: '#d97706', dotClass: 'wa-dot-general' }
  ];

  let cumulativeOffset = 0;
  const slices = categories.map(cat => {
    const len = total > 0 ? (cat.val / total) * circumference : 0;
    const offset = -cumulativeOffset;
    cumulativeOffset += len;
    const pct = total > 0 ? Math.round((cat.val / total) * 100) : 0;
    return { ...cat, len, offset, pct };
  });

  return (
    <div className="wa-finance-chart wa-chart-container wa-donut-chart-card">
      <div className="wa-chart-header">
        <div className="wa-chart-title">收支類別分佈</div>
        <div className="wa-chart-subtitle">實收總計 NT$ {total.toLocaleString()}</div>
      </div>

      <div className="wa-donut-wrapper">
        <svg
          className="wa-donut-svg"
          width="130"
          height="130"
          viewBox="0 0 130 130"
        >
          {/* 背景空環 */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke="var(--wa-border, #e2e8f0)"
            strokeWidth={strokeWidth}
          />

          {total > 0 && (
            <g transform="rotate(-90 65 65)">
              {slices.map((slice, idx) => (
                slice.len > 0 ? (
                  <circle
                    key={idx}
                    cx="65"
                    cy="65"
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${slice.len} ${circumference - slice.len}`}
                    strokeDashoffset={slice.offset}
                    strokeLinecap="round"
                  />
                ) : null
              ))}
            </g>
          )}

          {/* 中央文字 */}
          <text
            x="65"
            y="59"
            textAnchor="middle"
            className="wa-donut-center-main"
          >
            {total >= 10000 ? `${Math.round(total / 1000)}k` : total.toLocaleString()}
          </text>
          <text
            x="65"
            y="75"
            textAnchor="middle"
            className="wa-donut-center-sub"
          >
            總收入
          </text>
        </svg>

        {/* 圖例 */}
        <div className="wa-donut-legend">
          {slices.map((s, idx) => (
            <div key={idx} className="wa-donut-legend-row">
              <span className={`wa-chart-metric-dot ${s.dotClass}`} style={{ backgroundColor: s.color }} />
              <span className="wa-donut-legend-label">{s.label}</span>
              <span className="wa-donut-legend-num">NT$ {s.val.toLocaleString()}</span>
              <span className="wa-donut-legend-pct">({s.pct}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 4. 營收趨勢圖 (RevenueTrendChart)
 */
export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ data = [] }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="wa-finance-chart wa-chart-container wa-trend-chart-card">
        <div className="wa-chart-header">
          <div className="wa-chart-title">財務收支走勢</div>
        </div>
        <div className="wa-chart-empty-state">尚無走勢資料</div>
      </div>
    );
  }

  const svgWidth = 500;
  const svgHeight = 180;
  const paddingLeft = 55;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const rawMax = Math.max(...data.map(d => d.amount), 0);
  const maxAmount = rawMax > 0 ? Math.ceil(rawMax * 1.15) : 10000;
  const minAmount = 0;

  // 計算每個點的座標
  const points = data.map((d, i) => {
    const x = paddingLeft + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
    const ratio = (d.amount - minAmount) / (maxAmount - minAmount || 1);
    const y = paddingTop + chartH - ratio * chartH;
    return { ...d, x, y };
  });

  // 折線 Path
  const linePath = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // 面積 Path
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const bottomY = paddingTop + chartH;
  const areaPath = `${linePath} L ${lastPt.x} ${bottomY} L ${firstPt.x} ${bottomY} Z`;

  // Y軸參考刻度
  const yTicks = [
    { label: `NT$ ${Math.round(maxAmount).toLocaleString()}`, y: paddingTop },
    { label: `NT$ ${Math.round(maxAmount / 2).toLocaleString()}`, y: paddingTop + chartH / 2 },
    { label: 'NT$ 0', y: bottomY }
  ];

  return (
    <div className="wa-finance-chart wa-chart-container wa-trend-chart-card">
      <div className="wa-chart-header">
        <div>
          <div className="wa-chart-title">財務收支走勢</div>
          <div className="wa-chart-subtitle">依時段 / 活動彙整累積金額走勢</div>
        </div>
      </div>

      <div className="wa-trend-svg-container">
        <svg
          className="wa-trend-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="revenue-trend-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--wa-primary, #059669)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--wa-primary, #059669)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* 橫向參考格線 */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={tick.y}
                x2={svgWidth - paddingRight}
                y2={tick.y}
                stroke="var(--wa-border, #e2e8f0)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="wa-trend-axis-label"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* 漸層面積 */}
          <path d={areaPath} fill="url(#revenue-trend-gradient)" />

          {/* 主要趨勢線 */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--wa-primary, #059669)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 數據點與 X 軸標籤 */}
          {points.map((pt, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* 數據點圓形 */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4}
                  fill="#ffffff"
                  stroke="var(--wa-primary, #059669)"
                  strokeWidth={isHovered ? 3 : 2}
                  style={{ transition: 'all 0.15s ease' }}
                />

                {/* X 軸標籤 */}
                <text
                  x={pt.x}
                  y={bottomY + 18}
                  textAnchor="middle"
                  className={`wa-trend-x-label ${isHovered ? 'active' : ''}`}
                >
                  {pt.label}
                </text>

                {/* 懸浮 Tooltip */}
                {isHovered && (
                  <g>
                    <rect
                      x={Math.max(10, Math.min(svgWidth - 110, pt.x - 50))}
                      y={Math.max(5, pt.y - 32)}
                      width="100"
                      height="24"
                      rx="4"
                      fill="var(--wa-text, #0f172a)"
                      className="wa-chart-tooltip-bg"
                    />
                    <text
                      x={Math.max(10, Math.min(svgWidth - 110, pt.x - 50)) + 50}
                      y={Math.max(5, pt.y - 32) + 16}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="600"
                    >
                      NT$ {pt.amount.toLocaleString()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
