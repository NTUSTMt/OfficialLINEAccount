import React, { useState } from 'react';
import { Search, Filter, ArrowUpDown, X, Check, ArrowUp, ArrowDown, RefreshCw, Plus } from 'lucide-react';

export interface FilterGroup {
  key: string;
  label: string;
  selected: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export interface SortOption {
  key: string;
  label: string;
}

interface NotionFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  filters?: FilterGroup[];
  sortOptions?: SortOption[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (key: string, order: 'asc' | 'desc') => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onAdd?: () => void;
  addTooltip?: string;
  prefixElement?: React.ReactNode;
  extraBeforeAdd?: React.ReactNode;
  popoverMode?: boolean;
}

export const NotionFilterBar: React.FC<NotionFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = '搜尋關鍵字...',
  filters = [],
  sortOptions = [],
  sortBy = '',
  sortOrder = 'desc',
  onSortChange,
  onRefresh,
  isRefreshing = false,
  onAdd,
  addTooltip = '新增',
  prefixElement,
  extraBeforeAdd,
  popoverMode = false
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  // 計算已啟用的篩選條件數量
  const activeFiltersCount = filters.filter(f => f.selected && f.selected !== 'all' && f.selected !== '').length;

  return (
    <div style={{ width: '100%', marginBottom: '14px' }}>
      {/* 頂部常駐列：搜尋框 + 篩選圖示 + 排序圖示 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%'
      }}>
        {/* 前綴元素 (如歷史活動返回按鈕) */}
        {prefixElement}

        {/* 搜尋框 */}
        <div style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search
            size={16}
            color="#94a3b8"
            style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: '100%',
              padding: '9px 34px 9px 36px',
              fontSize: '14px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                color: '#94a3b8'
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Notion 篩選圖示按鈕 */}
        {filters.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsFilterOpen(!isFilterOpen);
                if (isSortOpen) setIsSortOpen(false);
              }}
              title="篩選條件"
              style={{
                position: 'relative',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: activeFiltersCount > 0 ? '1px solid #10b981' : '1px solid #e2e8f0',
                backgroundColor: activeFiltersCount > 0 ? '#ecfdf5' : '#ffffff',
                color: activeFiltersCount > 0 ? '#059669' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >
              <Filter size={17} />
              {activeFiltersCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #ffffff'
                }}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* 電腦端懸浮氣泡選單 (Popover Dropdown) */}
            {popoverMode && isFilterOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
                  onClick={() => setIsFilterOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '320px',
                    maxHeight: '440px',
                    overflowY: 'auto',
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    padding: '16px',
                    boxSizing: 'border-box',
                    zIndex: 1050,
                    textAlign: 'left'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '10px'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>篩選條件</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {activeFiltersCount > 0 && (
                        <button
                          type="button"
                          onClick={() => filters.forEach(f => f.onChange('all'))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: '2px 6px'
                          }}
                        >
                          重設全部
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsFilterOpen(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {filters.map((group) => (
                      <div key={group.key}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                          {group.label}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {group.options.map((opt) => {
                            const isSelected = group.selected === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => group.onChange(opt.value)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  border: isSelected ? '1px solid #10b981' : '1px solid #e2e8f0',
                                  backgroundColor: isSelected ? '#ecfdf5' : '#f8fafc',
                                  color: isSelected ? '#059669' : '#334155',
                                  fontWeight: isSelected ? 600 : 400,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                {isSelected && <Check size={12} />}
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    style={{
                      width: '100%',
                      marginTop: '16px',
                      padding: '8px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    完成
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Notion 排序圖示按鈕 */}
        {sortOptions.length > 0 && onSortChange && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsSortOpen(!isSortOpen);
                if (isFilterOpen) setIsFilterOpen(false);
              }}
              title="排序依據"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >
              <ArrowUpDown size={17} />
            </button>

            {/* 電腦端懸浮氣泡選單 (Popover Dropdown) */}
            {popoverMode && isSortOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 1040 }}
                  onClick={() => setIsSortOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '260px',
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    padding: '16px',
                    boxSizing: 'border-box',
                    zIndex: 1050,
                    textAlign: 'left'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                    borderBottom: '1px solid #f1f5f9',
                    paddingBottom: '8px'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>排序設定</span>
                    <button
                      type="button"
                      onClick={() => setIsSortOpen(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>順序</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => onSortChange(sortBy, 'desc')}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: sortOrder === 'desc' ? '1px solid #10b981' : '1px solid #e2e8f0',
                          backgroundColor: sortOrder === 'desc' ? '#ecfdf5' : '#f8fafc',
                          color: sortOrder === 'desc' ? '#059669' : '#475569',
                          fontWeight: sortOrder === 'desc' ? 600 : 400,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <ArrowDown size={12} />
                        <span>降冪 (新至舊)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSortChange(sortBy, 'asc')}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: sortOrder === 'asc' ? '1px solid #10b981' : '1px solid #e2e8f0',
                          backgroundColor: sortOrder === 'asc' ? '#ecfdf5' : '#f8fafc',
                          color: sortOrder === 'asc' ? '#059669' : '#475569',
                          fontWeight: sortOrder === 'asc' ? 600 : 400,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <ArrowUp size={12} />
                        <span>升冪 (舊至新)</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>排序依據欄位</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {sortOptions.map((opt) => {
                        const isSelected = sortBy === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              onSortChange(opt.key, sortOrder);
                              setIsSortOpen(false);
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              border: isSelected ? '1px solid #10b981' : '1px solid #e2e8f0',
                              backgroundColor: isSelected ? '#ecfdf5' : '#ffffff',
                              color: isSelected ? '#059669' : '#1e293b',
                              fontWeight: isSelected ? 600 : 400,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              textAlign: 'left'
                            }}
                          >
                            <span>{opt.label}</span>
                            {isSelected && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 重新整理圖示按鈕 */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="重新整理"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: isRefreshing ? '#94a3b8' : '#64748b',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw
              size={17}
              style={{
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
              }}
            />
          </button>
        )}

        {/* 新增項目按鈕前置自訂按鈕 (如歷史活動按鈕) */}
        {extraBeforeAdd}

        {/* 新增項目按鈕 */}
        {onAdd && (
          <button
            onClick={onAdd}
            title={addTooltip}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#059669',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)'
            }}
          >
            <Plus size={19} />
          </button>
        )}
      </div>

      {/* 篩選面板 (Bottom Sheet) */}
      {isFilterOpen && !popoverMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            width: '100%',
            maxWidth: '520px',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            padding: '20px 18px 28px',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '12px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>篩選條件</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={() => {
                      filters.forEach(f => f.onChange('all'));
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '13px',
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    重設全部
                  </button>
                )}
                <button
                  onClick={() => setIsFilterOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* 各欄位篩選器 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filters.map((group) => (
                <div key={group.key}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {group.options.map((opt) => {
                      const isSelected = group.selected === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => group.onChange(opt.value)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            border: isSelected ? '1px solid #10b981' : '1px solid #e2e8f0',
                            backgroundColor: isSelected ? '#ecfdf5' : '#f8fafc',
                            color: isSelected ? '#059669' : '#334155',
                            fontWeight: isSelected ? 600 : 400,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {isSelected && <Check size={14} />}
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 完成按鈕 (設定完就收起來) */}
            <button
              onClick={() => setIsFilterOpen(false)}
              style={{
                width: '100%',
                marginTop: '22px',
                padding: '11px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              完成設定
            </button>
          </div>
        </div>
      )}

      {/* 排序面板 (Bottom Sheet) */}
      {isSortOpen && !popoverMode && sortOptions.length > 0 && onSortChange && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            width: '100%',
            maxWidth: '520px',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            padding: '20px 18px 28px',
            maxHeight: '70vh',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '12px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>排序設定</h3>
              <button
                onClick={() => setIsSortOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 順序切換 (遞增 / 遞減) */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>順序</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => onSortChange(sortBy, 'desc')}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: sortOrder === 'desc' ? '1px solid #10b981' : '1px solid #e2e8f0',
                    backgroundColor: sortOrder === 'desc' ? '#ecfdf5' : '#f8fafc',
                    color: sortOrder === 'desc' ? '#059669' : '#475569',
                    fontWeight: sortOrder === 'desc' ? 600 : 400,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <ArrowDown size={14} />
                  <span>降冪 (新至舊 / 大至小)</span>
                </button>
                <button
                  onClick={() => onSortChange(sortBy, 'asc')}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: sortOrder === 'asc' ? '1px solid #10b981' : '1px solid #e2e8f0',
                    backgroundColor: sortOrder === 'asc' ? '#ecfdf5' : '#f8fafc',
                    color: sortOrder === 'asc' ? '#059669' : '#475569',
                    fontWeight: sortOrder === 'asc' ? 600 : 400,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <ArrowUp size={14} />
                  <span>升冪 (舊至新 / 小至大)</span>
                </button>
              </div>
            </div>

            {/* 排序欄位清單 */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>排序依據欄位</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sortOptions.map((opt) => {
                  const isSelected = sortBy === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        onSortChange(opt.key, sortOrder);
                        setIsSortOpen(false); // 設定完就收起來
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        border: isSelected ? '1px solid #10b981' : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? '#ecfdf5' : '#ffffff',
                        color: isSelected ? '#059669' : '#1e293b',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left'
                      }}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
