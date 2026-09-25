import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export interface AdvancedColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
}

export interface UseAdvancedTableOptions<T> {
  storageKey: string;
  columns: AdvancedColumnDef[];
  items: T[];
  getItemId: (item: T) => string;
}

export function useAdvancedTable<T>({
  storageKey,
  columns,
  items,
  getItemId,
}: UseAdvancedTableOptions<T>) {
  // 欄位順序
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.columnOrder) && parsed.columnOrder.length > 0) {
          const validKeys = new Set(columns.map((c) => c.key));
          const filtered = parsed.columnOrder.filter((k: string) => validKeys.has(k));
          columns.forEach((c) => {
            if (!filtered.includes(c.key)) filtered.push(c.key);
          });
          return filtered;
        }
      }
    } catch {}
    return columns.map((c) => c.key);
  });

  // 釘選欄位
  const [pinnedColumns, setPinnedColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.pinnedColumns)) return parsed.pinnedColumns;
      }
    } catch {}
    return [];
  });

  // 隱藏欄位
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hiddenColumns)) return parsed.hiddenColumns;
      }
    } catch {}
    return [];
  });

  // 欄位寬度
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
          return parsed.columnWidths;
        }
      }
    } catch {}
    const defWidths: Record<string, number> = {};
    columns.forEach((c) => {
      defWidths[c.key] = c.defaultWidth;
    });
    return defWidths;
  });

  // 列級排序、釘選與隱藏
  const [pinnedRowIds, setPinnedRowIds] = useState<Set<string>>(new Set());
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());
  const [customRowOrder, setCustomRowOrder] = useState<string[]>([]);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  // 隱藏面板控制
  const [showHiddenMenu, setShowHiddenMenu] = useState(false);
  const hiddenMenuRef = useRef<HTMLDivElement>(null);

  // 儲存狀態至 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          columnOrder,
          pinnedColumns,
          hiddenColumns,
          columnWidths,
        })
      );
    } catch {}
  }, [storageKey, columnOrder, pinnedColumns, hiddenColumns, columnWidths]);

  // 點擊外部關閉隱藏面板
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

  // 欄位操作
  const moveColumn = useCallback(
    (key: string, direction: 'left' | 'right') => {
      const idx = columnOrder.indexOf(key);
      if (idx === -1) return;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= columnOrder.length) return;

      const nextOrder = [...columnOrder];
      const temp = nextOrder[idx];
      nextOrder[idx] = nextOrder[targetIdx];
      nextOrder[targetIdx] = temp;
      setColumnOrder(nextOrder);
    },
    [columnOrder]
  );

  const reorderColumn = useCallback(
    (srcKey: string, destKey: string) => {
      if (srcKey === destKey) return;
      const srcIdx = columnOrder.indexOf(srcKey);
      const destIdx = columnOrder.indexOf(destKey);
      if (srcIdx === -1 || destIdx === -1) return;

      const nextOrder = [...columnOrder];
      const [removed] = nextOrder.splice(srcIdx, 1);
      nextOrder.splice(destIdx, 0, removed);
      setColumnOrder(nextOrder);
    },
    [columnOrder]
  );

  const togglePinColumn = useCallback((key: string) => {
    setPinnedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const hideColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const unhideColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => prev.filter((k) => k !== key));
  }, []);

  const unhideAllColumnsAndRows = useCallback(() => {
    setHiddenColumns([]);
    setHiddenRowIds(new Set());
    setShowHiddenMenu(false);
  }, []);

  const resetColumnWidthsAndHeights = useCallback(() => {
    const defWidths: Record<string, number> = {};
    columns.forEach((c) => {
      defWidths[c.key] = c.defaultWidth;
    });
    setColumnWidths(defWidths);
    setColumnOrder(columns.map((c) => c.key));
    setPinnedColumns([]);
    setHiddenColumns([]);
    setPinnedRowIds(new Set());
    setHiddenRowIds(new Set());
    setCustomRowOrder([]);
  }, [columns]);

  // 欄位調寬拖曳
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const startResizing = useCallback(
    (key: string, e: React.MouseEvent) => {
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
    },
    [columnWidths]
  );

  // 列級操作
  const moveRow = useCallback(
    (rowId: string, direction: 'up' | 'down') => {
      const order = customRowOrder.length > 0 ? customRowOrder : items.map(getItemId);
      const idx = order.indexOf(rowId);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= order.length) return;

      const next = [...order];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      setCustomRowOrder(next);
    },
    [customRowOrder, items, getItemId]
  );

  const togglePinRow = useCallback((rowId: string) => {
    setPinnedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const hideRow = useCallback((rowId: string) => {
    setHiddenRowIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
  }, []);

  const handleDropRow = useCallback(
    (targetId: string) => {
      if (!draggedRowId || draggedRowId === targetId) return;
      const order = customRowOrder.length > 0 ? customRowOrder : items.map(getItemId);
      const srcIdx = order.indexOf(draggedRowId);
      const destIdx = order.indexOf(targetId);
      if (srcIdx === -1 || destIdx === -1) return;

      const next = [...order];
      const [removed] = next.splice(srcIdx, 1);
      next.splice(destIdx, 0, removed);
      setCustomRowOrder(next);
      setDraggedRowId(null);
    },
    [draggedRowId, customRowOrder, items, getItemId]
  );

  // 計算最終要呈現的可見欄位
  const visibleColumns = useMemo(() => {
    const columnMap = new Map(columns.map((c) => [c.key, c]));
    const pinnedSet = new Set(pinnedColumns);

    const orderedKeys = [
      ...pinnedColumns.filter((k) => !hiddenColumns.includes(k)),
      ...columnOrder.filter((k) => !pinnedSet.has(k) && !hiddenColumns.includes(k)),
    ];

    return orderedKeys.map((k) => columnMap.get(k)!).filter(Boolean);
  }, [columns, columnOrder, pinnedColumns, hiddenColumns]);

  // 釘選欄位之 sticky left 計算
  const { stickyLeftPositions, lastPinnedKey } = useMemo(() => {
    const positions: Record<string, number> = {};
    let currentLeft = 44 + 46; // 44px (Checkbox) + 46px (#)
    let lastKey: string | null = null;

    for (const col of visibleColumns) {
      if (pinnedColumns.includes(col.key)) {
        positions[col.key] = currentLeft;
        currentLeft += columnWidths[col.key] || col.defaultWidth;
        lastKey = col.key;
      }
    }

    return { stickyLeftPositions: positions, lastPinnedKey: lastKey };
  }, [visibleColumns, pinnedColumns, columnWidths]);

  // 排序後的資料列 (已濾除 hiddenRowIds，已排序 customRowOrder 與置頂列)
  const sortedItems = useMemo(() => {
    const itemMap = new Map(items.map((i) => [getItemId(i), i]));
    const order = customRowOrder.length > 0 ? customRowOrder : items.map(getItemId);
    const sorted = order.map((id) => itemMap.get(id)).filter(Boolean) as T[];

    const pinned = sorted.filter(
      (i) => pinnedRowIds.has(getItemId(i)) && !hiddenRowIds.has(getItemId(i))
    );
    const normal = sorted.filter(
      (i) => !pinnedRowIds.has(getItemId(i)) && !hiddenRowIds.has(getItemId(i))
    );

    return [...pinned, ...normal];
  }, [items, customRowOrder, pinnedRowIds, hiddenRowIds, getItemId]);

  return {
    columnOrder,
    setColumnOrder,
    pinnedColumns,
    setPinnedColumns,
    hiddenColumns,
    setHiddenColumns,
    columnWidths,
    setColumnWidths,
    pinnedRowIds,
    hiddenRowIds,
    customRowOrder,
    draggedRowId,
    setDraggedRowId,
    showHiddenMenu,
    setShowHiddenMenu,
    hiddenMenuRef,
    moveColumn,
    reorderColumn,
    togglePinColumn,
    hideColumn,
    unhideColumn,
    unhideAllColumnsAndRows,
    resetColumnWidthsAndHeights,
    startResizing,
    moveRow,
    togglePinRow,
    hideRow,
    handleDropRow,
    visibleColumns,
    stickyLeftPositions,
    lastPinnedKey,
    sortedItems,
  };
}
