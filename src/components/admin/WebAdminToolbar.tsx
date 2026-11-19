import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CircleDot,
  Filter,
  ListFilter,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';

export interface WebAdminFilterOption {
  value: string;
  label: string;
  /** Optional sub-group heading inside the filter group (e.g. active/upcoming/past events) */
  subGroup?: string;
  icon?: React.ReactNode;
}

export interface WebAdminFilterGroup {
  key: string;
  label: string;
  selected: string;
  /** Default unselected value (defaults to 'ALL') */
  defaultValue?: string;
  options: WebAdminFilterOption[];
  onChange: (value: string) => void;
}

export interface WebAdminSortOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface WebAdminSortConfig {
  value: string;
  defaultValue?: string;
  options: WebAdminSortOption[];
  onChange: (value: string) => void;
  direction?: 'asc' | 'desc';
  onDirectionChange?: (dir: 'asc' | 'desc') => void;
}

export interface WebAdminToolbarAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: string | number;
  /** Optional custom popover rendered when popoverOpen is true */
  popoverOpen?: boolean;
  popoverContent?: React.ReactNode;
  onPopoverClose?: () => void;
}

export interface WebAdminToolbarRightAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
}

export interface WebAdminToolbarProps {
  prefixElement?: React.ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: WebAdminFilterGroup[];
  sort?: WebAdminSortConfig;
  secondaryActions?: WebAdminToolbarAction[];
  refresh?: {
    onClick: () => void;
    loading?: boolean;
    title?: string;
  };
  extraRightElement?: React.ReactNode;
  rightActions?: WebAdminToolbarRightAction[];
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    title?: string;
    disabled?: boolean;
  };
}

/**
 * Shared Notion-style borderless icon toolbar for Web Admin pages.
 * Fixed left-to-right order:
 * [prefix] -> Search -> Filter -> Sort -> Secondary Icons -> Refresh ... [extraRight] -> Primary Action
 */
export const WebAdminToolbar: React.FC<WebAdminToolbarProps> = ({
  prefixElement,
  search,
  filters = [],
  sort,
  secondaryActions = [],
  refresh,
  extraRightElement,
  rightActions = [],
  primaryAction,
}) => {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [openPopover, setOpenPopover] = useState<'filter' | 'sort' | null>(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [sortSearch, setSortSearch] = useState('');

  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterSearchRef = useRef<HTMLInputElement>(null);
  const sortSearchRef = useRef<HTMLInputElement>(null);

  const isSearchOpen = searchExpanded || Boolean(search?.value);

  const activeFiltersCount = useMemo(
    () =>
      filters.filter((g) => {
        const def = g.defaultValue ?? 'ALL';
        return g.selected !== def && g.selected !== '';
      }).length,
    [filters],
  );

  const isSortActive = useMemo(() => {
    if (!sort) return false;
    if (sort.defaultValue !== undefined) {
      return sort.value !== sort.defaultValue;
    }
    return Boolean(sort.value);
  }, [sort]);

  const activeFilterTooltip = useMemo(() => {
    if (activeFiltersCount === 0) return '篩選條件';
    const summary = filters
      .filter((g) => g.selected !== (g.defaultValue ?? 'ALL') && g.selected !== '')
      .map((g) => {
        const matched = g.options.find((o) => o.value === g.selected);
        return `${g.label}: ${matched?.label ?? g.selected}`;
      })
      .join(' | ');
    return `已套用篩選 (${activeFiltersCount}) — ${summary}`;
  }, [activeFiltersCount, filters]);

  const activeSortTooltip = useMemo(() => {
    if (!sort) return '排序方式';
    const matched = sort.options.find((o) => o.value === sort.value);
    return matched ? `排序: ${matched.label}` : '排序方式';
  }, [sort]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
        secondaryActions.forEach((act) => {
          if (act.popoverOpen && act.onPopoverClose) {
            act.onPopoverClose();
          }
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenPopover(null);
        if (searchExpanded && !search?.value) {
          setSearchExpanded(false);
        }
        secondaryActions.forEach((act) => {
          if (act.popoverOpen && act.onPopoverClose) {
            act.onPopoverClose();
          }
        });
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchExpanded, search?.value, secondaryActions]);

  // Focus search input inside popover when opened
  useEffect(() => {
    if (openPopover === 'filter') {
      requestAnimationFrame(() => filterSearchRef.current?.focus());
    } else if (openPopover === 'sort') {
      requestAnimationFrame(() => sortSearchRef.current?.focus());
    }
  }, [openPopover]);

  const handleOpenSearch = () => {
    setSearchExpanded(true);
    setOpenPopover(null);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleResetAllFilters = () => {
    filters.forEach((g) => {
      g.onChange(g.defaultValue ?? 'ALL');
    });
  };

  const filteredSortOptions = useMemo(() => {
    if (!sort) return [];
    const q = sortSearch.trim().toLowerCase();
    if (!q) return sort.options;
    return sort.options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [sort, sortSearch]);

  const filteredFilterGroups = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    return filters
      .map((group) => {
        const matchedOptions = q
          ? group.options.filter(
              (opt) =>
                opt.label.toLowerCase().includes(q) ||
                group.label.toLowerCase().includes(q) ||
                (opt.subGroup && opt.subGroup.toLowerCase().includes(q)),
            )
          : group.options;
        return { ...group, options: matchedOptions };
      })
      .filter((group) => group.options.length > 0);
  }, [filters, filterSearch]);

  return (
    <div ref={toolbarRef} className="wa-notion-toolbar">
      <div className="wa-notion-toolbar-left">
        {/* Optional prefix (e.g. Roster Event Selector) */}
        {prefixElement}

        {/* 1. Search (Expandable Notion-style icon -> inline input) */}
        {search && (
          isSearchOpen ? (
            <div className="wa-notion-search-wrap">
              <Search size={14} color="var(--wa-text-muted)" style={{ flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                className="wa-notion-search-input"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                onBlur={() => {
                  if (!search.value) setSearchExpanded(false);
                }}
                placeholder={search.placeholder ?? '搜尋關鍵字...'}
                aria-label={search.placeholder ?? '搜尋關鍵字'}
              />
              {search.value ? (
                <button
                  type="button"
                  className="wa-notion-search-clear"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    search.onChange('');
                    searchInputRef.current?.focus();
                  }}
                  title="清除搜尋"
                  aria-label="清除搜尋"
                >
                  <X size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  className="wa-notion-search-clear"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSearchExpanded(false)}
                  title="收合搜尋"
                  aria-label="收合搜尋"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="wa-notion-icon-btn"
              onClick={handleOpenSearch}
              title={search.placeholder ?? '搜尋'}
              aria-label={search.placeholder ?? '搜尋'}
            >
              <Search size={16} />
            </button>
          )
        )}

        {/* 2. Filter Icon + Unified Popover */}
        {filters.length > 0 && (
          <div className="wa-notion-popover-anchor">
            <button
              type="button"
              className={`wa-notion-icon-btn ${activeFiltersCount > 0 ? 'is-active' : ''} ${openPopover === 'filter' ? 'is-open' : ''}`}
              onClick={() => {
                setFilterSearch('');
                setOpenPopover((prev) => (prev === 'filter' ? null : 'filter'));
              }}
              title={activeFilterTooltip}
              aria-label={activeFilterTooltip}
              aria-expanded={openPopover === 'filter'}
            >
              <Filter size={15} />
              {activeFiltersCount > 0 && (
                <span className="wa-notion-badge-count">{activeFiltersCount}</span>
              )}
            </button>

            {openPopover === 'filter' && (
              <div className="wa-notion-popover" role="dialog" aria-label="篩選條件">
                <div className="wa-notion-popover-search-box">
                  <Search size={13} color="var(--wa-text-subtle)" style={{ flexShrink: 0 }} />
                  <input
                    ref={filterSearchRef}
                    type="text"
                    className="wa-notion-popover-search-input"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="搜尋篩選條件..."
                  />
                  {filterSearch && (
                    <button
                      type="button"
                      className="wa-notion-search-clear"
                      onClick={() => setFilterSearch('')}
                      aria-label="清除篩選搜尋"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="wa-notion-popover-list">
                  {filteredFilterGroups.length === 0 ? (
                    <div className="wa-notion-popover-empty">找不到符合的篩選條件</div>
                  ) : (
                    filteredFilterGroups.map((group) => {
                      let lastSubGroup: string | undefined;
                      return (
                        <div key={group.key}>
                          <div className="wa-notion-popover-section">{group.label}</div>
                          {group.options.map((opt) => {
                            const isSelected = group.selected === opt.value;
                            const showSubGroup =
                              opt.subGroup && opt.subGroup !== lastSubGroup;
                            if (opt.subGroup) {
                              lastSubGroup = opt.subGroup;
                            }
                            return (
                              <React.Fragment key={`${group.key}-${opt.value}`}>
                                {showSubGroup && (
                                  <div className="wa-notion-popover-subgroup">
                                    {opt.subGroup}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className={`wa-notion-popover-item ${isSelected ? 'is-selected' : ''}`}
                                  onClick={() => {
                                    group.onChange(opt.value);
                                  }}
                                >
                                  <span className="wa-notion-popover-item-main">
                                    <span className="wa-notion-popover-item-icon">
                                      {opt.icon ?? <CircleDot size={13} />}
                                    </span>
                                    <span className="wa-notion-popover-item-label">
                                      {opt.label}
                                    </span>
                                  </span>
                                  {isSelected && <Check size={14} style={{ flexShrink: 0 }} />}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>

                {activeFiltersCount > 0 && (
                  <div className="wa-notion-popover-footer">
                    <button
                      type="button"
                      className="wa-notion-popover-reset"
                      onClick={handleResetAllFilters}
                    >
                      <RotateCcw size={12} />
                      <span>重設篩選</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Sort Icon + Popover */}
        {sort && sort.options.length > 0 && (
          <div className="wa-notion-popover-anchor">
            <button
              type="button"
              className={`wa-notion-icon-btn ${isSortActive ? 'is-active' : ''} ${openPopover === 'sort' ? 'is-open' : ''}`}
              onClick={() => {
                setSortSearch('');
                setOpenPopover((prev) => (prev === 'sort' ? null : 'sort'));
              }}
              title={activeSortTooltip}
              aria-label={activeSortTooltip}
              aria-expanded={openPopover === 'sort'}
            >
              <ArrowUpDown size={15} />
            </button>

            {openPopover === 'sort' && (
              <div className="wa-notion-popover" role="dialog" aria-label="排序方式">
                <div className="wa-notion-popover-search-box">
                  <Search size={13} color="var(--wa-text-subtle)" style={{ flexShrink: 0 }} />
                  <input
                    ref={sortSearchRef}
                    type="text"
                    className="wa-notion-popover-search-input"
                    value={sortSearch}
                    onChange={(e) => setSortSearch(e.target.value)}
                    placeholder="排序方式..."
                  />
                  {sortSearch && (
                    <button
                      type="button"
                      className="wa-notion-search-clear"
                      onClick={() => setSortSearch('')}
                      aria-label="清除排序搜尋"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="wa-notion-popover-list">
                  {filteredSortOptions.length === 0 ? (
                    <div className="wa-notion-popover-empty">找不到符合的排序欄位</div>
                  ) : (
                    filteredSortOptions.map((opt) => {
                      const isSelected = sort.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`wa-notion-popover-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => {
                            if (isSelected && sort.onDirectionChange && sort.direction) {
                              sort.onDirectionChange(sort.direction === 'asc' ? 'desc' : 'asc');
                            } else {
                              sort.onChange(opt.value);
                              setOpenPopover(null);
                            }
                          }}
                        >
                          <span className="wa-notion-popover-item-main">
                            <span className="wa-notion-popover-item-icon">
                              {opt.icon ?? <ListFilter size={13} />}
                            </span>
                            <span className="wa-notion-popover-item-label">{opt.label}</span>
                          </span>
                          {isSelected && (
                            sort.direction ? (
                              sort.direction === 'asc' ? (
                                <ArrowUp size={14} style={{ flexShrink: 0 }} />
                              ) : (
                                <ArrowDown size={14} style={{ flexShrink: 0 }} />
                              )
                            ) : (
                              <Check size={14} style={{ flexShrink: 0 }} />
                            )
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Secondary Actions (Borderless Icon Buttons in Fixed Order) */}
        {secondaryActions.map((act) => (
          <div key={act.key} className="wa-notion-popover-anchor">
            <button
              type="button"
              className={`wa-notion-icon-btn ${act.active ? 'is-active' : ''} ${act.popoverOpen ? 'is-open' : ''}`}
              onClick={() => {
                setOpenPopover(null);
                act.onClick();
              }}
              disabled={act.disabled}
              title={act.title}
              aria-label={act.title}
            >
              {act.icon}
              {act.badge !== undefined && (
                <span className="wa-notion-badge-count">{act.badge}</span>
              )}
            </button>
            {act.popoverOpen && act.popoverContent}
          </div>
        ))}

        {/* 5. Refresh Icon Button */}
        {refresh && (
          <button
            type="button"
            className="wa-notion-icon-btn"
            onClick={refresh.onClick}
            disabled={refresh.loading}
            title={refresh.title ?? '重新整理'}
            aria-label={refresh.title ?? '重新整理'}
          >
            <RefreshCw size={15} className={refresh.loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Right Side: Optional Batch/Extra Actions + Labeled Secondary Actions + Fixed Primary New Button */}
      {(extraRightElement || rightActions.length > 0 || primaryAction) && (
        <div className="wa-notion-toolbar-right">
          {extraRightElement}
          {rightActions.map((act) => (
            <button
              key={act.key}
              type="button"
              className={`wa-notion-secondary-btn ${act.active ? 'is-active' : ''}`}
              onClick={act.onClick}
              disabled={act.disabled}
              title={act.title ?? act.label}
              aria-label={act.title ?? act.label}
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
          {primaryAction && (
            <button
              type="button"
              className="wa-notion-primary-btn"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              title={primaryAction.title ?? primaryAction.label}
              aria-label={primaryAction.title ?? primaryAction.label}
            >
              {primaryAction.icon ?? <Plus size={15} />}
              <span>{primaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
