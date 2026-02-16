import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useDrop } from 'react-dnd';
import type { GridItem, ComponentType } from '../types';
import { CELL_HEIGHT_PX, GRID_COLUMNS, MOBILE_BREAKPOINT_PX } from '../constants';
import {
  resizeWidth,
  resizeLeftEdge,
  resizeHeight,
  addComponent,
  removeComponent,
  getMaxRow,
} from '../layoutEngine';
import { validateLayout } from '../validateLayout';
import { GridCell } from './GridCell';

interface Props {
  items: GridItem[];
  onChange: (items: GridItem[]) => void;
}

interface DropZone {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

let idCounter = 100;

// FR-028: Compute visible drop zones from current layout
function computeDropZones(items: GridItem[], _dragWidth: number, dragHeight: number): DropZone[] {
  const zones: DropZone[] = [];
  const maxRow = items.length === 0 ? 0 : Math.max(...items.map((i) => i.y + i.height));

  const rowBands = new Map<number, GridItem[]>();
  for (const item of items) {
    for (let r = item.y; r < item.y + item.height; r++) {
      if (!rowBands.has(r)) rowBands.set(r, []);
      rowBands.get(r)!.push(item);
    }
  }

  const processedRows = new Set<string>();
  for (const [, comps] of rowBands) {
    const sorted = [...new Map(comps.map(c => [c.componentId, c])).values()].sort((a, b) => a.x - b.x);
    const key = sorted.map(c => c.componentId).join(',');
    if (processedRows.has(key)) continue;
    processedRows.add(key);

    if (sorted.length < GRID_COLUMNS) {
      // Between each pair of adjacent components
      for (let i = 0; i < sorted.length - 1; i++) {
        const left = sorted[i];
        const right = sorted[i + 1];
        const midX = left.x + left.width;
        zones.push({
          x: midX,
          y: sorted[0].y,
          width: Math.max(1, right.x - midX) || 1,
          height: Math.max(...sorted.map(c => c.height)),
          label: `Between ${left.componentType} & ${right.componentType}`,
        });
      }

      // Left edge
      if (sorted[0].x === 0) {
        zones.push({
          x: 0,
          y: sorted[0].y,
          width: 1,
          height: Math.max(...sorted.map(c => c.height)),
          label: 'Left edge',
        });
      }

      // Right edge
      const last = sorted[sorted.length - 1];
      if (last.x + last.width === GRID_COLUMNS) {
        zones.push({
          x: GRID_COLUMNS - 1,
          y: sorted[0].y,
          width: 1,
          height: Math.max(...sorted.map(c => c.height)),
          label: 'Right edge',
        });
      }
    }
  }

  // Between row groups
  const occupiedYs = [...new Set(items.flatMap(i => Array.from({ length: i.height }, (_, k) => i.y + k)))].sort((a, b) => a - b);
  if (occupiedYs.length > 0) {
    const rowGroups: number[][] = [];
    let group = [occupiedYs[0]];
    for (let i = 1; i < occupiedYs.length; i++) {
      if (occupiedYs[i] === occupiedYs[i - 1] + 1) {
        group.push(occupiedYs[i]);
      } else {
        rowGroups.push(group);
        group = [occupiedYs[i]];
      }
    }
    rowGroups.push(group);

    for (let i = 0; i < rowGroups.length - 1; i++) {
      const betweenY = rowGroups[i][rowGroups[i].length - 1] + 1;
      zones.push({ x: 0, y: betweenY, width: GRID_COLUMNS, height: dragHeight, label: 'New row' });
    }
  }

  // Below all
  zones.push({ x: 0, y: maxRow, width: GRID_COLUMNS, height: dragHeight, label: 'Below all' });

  return zones;
}

// Find which drop zone the cursor is over, or the closest one
function hitTestZone(zones: DropZone[], relX: number, relY: number, colPx: number): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const left = z.x * colPx;
    const top = z.y * CELL_HEIGHT_PX;
    const right = left + z.width * colPx;
    const bottom = top + z.height * CELL_HEIGHT_PX;
    if (relX >= left && relX < right && relY >= top && relY < bottom) return i;
    // Distance to zone center
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dist = (relX - cx) ** 2 + (relY - cy) ** 2;
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return bestIdx;
}

export const DashboardGrid: React.FC<Props> = ({ items, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredZone, setHoveredZone] = useState(-1);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setContainerWidth(w);
        setIsMobile(w < MOBILE_BREAKPOINT_PX);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleResizeWidth = useCallback(
    (id: string, newWidth: number) => onChange(resizeWidth(items, id, newWidth)),
    [items, onChange]
  );
  const handleResizeLeftEdge = useCallback(
    (id: string, newX: number) => onChange(resizeLeftEdge(items, id, newX)),
    [items, onChange]
  );
  const handleResizeHeight = useCallback(
    (id: string, newHeight: number) => onChange(resizeHeight(items, id, newHeight)),
    [items, onChange]
  );
  const handleRemove = useCallback(
    (id: string) => onChange(removeComponent(items, id)),
    [items, onChange]
  );

  // Memoize colPx so it's available in useDrop
  const colPx = containerWidth / GRID_COLUMNS;

  // We need dropZones available inside useDrop, so compute them via ref
  const dropZonesRef = useRef<DropZone[]>([]);

  const [{ isDraggingAny, dragItem, dragItemType }, dropRef] = useDrop(
    () => ({
      accept: ['PALETTE_ITEM', 'GRID_ITEM'],
      collect: (monitor) => ({
        isDraggingAny: monitor.canDrop() && !!monitor.getItemType(),
        dragItem: monitor.getItem() as { componentId?: string; componentType?: string; width?: number; height?: number } | null,
        dragItemType: monitor.getItemType() as string | null,
      }),
      hover: (_dragItem: any, monitor) => {
        const offset = monitor.getClientOffset();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!offset || !rect) { setHoveredZone(-1); return; }
        const idx = hitTestZone(dropZonesRef.current, offset.x - rect.left, offset.y - rect.top, colPx);
        setHoveredZone(idx);
      },
      drop: (dragItem: any, monitor) => {
        if (isMobile) return;
        setHoveredZone(-1);
        const offset = monitor.getClientOffset();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!offset || !rect) return;

        const relX = offset.x - rect.left;
        const relY = offset.y - rect.top;

        // Snap to hovered drop zone if cursor is over one
        const zoneIdx = hitTestZone(dropZonesRef.current, relX, relY, colPx);
        const zone = zoneIdx >= 0 ? dropZonesRef.current[zoneIdx] : null;
        const dropX = zone ? zone.x : Math.max(0, Math.min(Math.floor(relX / colPx), GRID_COLUMNS - 1));
        const dropY = zone ? zone.y : Math.max(0, Math.floor(relY / CELL_HEIGHT_PX));

        if (monitor.getItemType() === 'PALETTE_ITEM') {
          const newItem: GridItem = {
            componentId: `comp-${++idCounter}`,
            componentType: dragItem.componentType as ComponentType,
            x: dropX,
            y: dropY,
            width: dragItem.width,
            height: dragItem.height,
          };
          const result = addComponent(items, newItem);
          if (result) onChange(result);
        } else {
          const comp = items.find(i => i.componentId === dragItem.componentId);
          if (!comp) return;
          const without = items.filter(i => i.componentId !== dragItem.componentId);
          const moved: GridItem = { ...comp, x: dropX, y: dropY };
          const result = addComponent(without, moved);
          if (result) onChange(result);
        }
      },
    }),
    [items, onChange, colPx, isMobile]
  );

  const maxRow = getMaxRow(items);
  const gridHeight = Math.max((maxRow + 2) * CELL_HEIGHT_PX, 400);

  const violations = useMemo(() => validateLayout(items), [items]);
  const violatingIds = useMemo(
    () => new Set(violations.flatMap((v) => v.components)),
    [violations]
  );
  useEffect(() => {
    if (violations.length > 0) {
      console.error('[LAYOUT BUG] Invariant violations detected:', violations);
    }
  }, [violations]);

  // Compute drop zones
  const showDropZones = isDraggingAny && !isMobile;
  const dragW = dragItem?.width ?? 6;
  const dragH = dragItem?.height ?? 1;
  const zoneItems = showDropZones && dragItemType === 'GRID_ITEM' && dragItem?.componentId
    ? items.filter(i => i.componentId !== dragItem.componentId)
    : items;
  const dropZones = useMemo(
    () => showDropZones ? computeDropZones(zoneItems, dragW, dragH) : [],
    [showDropZones, zoneItems, dragW, dragH]
  );
  dropZonesRef.current = dropZones;

  // Reset hovered zone when not dragging
  useEffect(() => { if (!showDropZones) setHoveredZone(-1); }, [showDropZones]);

  const mobileItems = isMobile
    ? [...items].sort((a, b) => a.y - b.y || a.x - b.x)
    : items;

  return (
    <div
      ref={(node) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        (dropRef as any)(node);
      }}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: isMobile ? undefined : gridHeight,
        background: isMobile ? '#f5f5f5' : undefined,
        transition: 'background 0.15s',
        ...(showDropZones ? { background: 'rgba(0,0,0,0.02)' } : {}),
      }}
    >
      {/* Grid lines */}
      {!isMobile &&
        Array.from({ length: GRID_COLUMNS + 1 }, (_, i) => (
          <div
            key={`col-${i}`}
            style={{
              position: 'absolute', left: i * colPx, top: 0, bottom: 0, width: 1,
              background: showDropZones ? 'rgba(74,144,217,0.12)' : 'rgba(0,0,0,0.05)',
              pointerEvents: 'none',
            }}
          />
        ))}
      {!isMobile &&
        Array.from({ length: maxRow + 3 }, (_, i) => (
          <div
            key={`row-${i}`}
            style={{
              position: 'absolute', top: i * CELL_HEIGHT_PX, left: 0, right: 0, height: 1,
              background: showDropZones ? 'rgba(74,144,217,0.12)' : 'rgba(0,0,0,0.05)',
              pointerEvents: 'none',
            }}
          />
        ))}

      {/* FR-030: Drop zone indicators with hover highlight */}
      {showDropZones &&
        dropZones.map((zone, i) => {
          const isHovered = i === hoveredZone;
          return (
            <div
              key={`dz-${i}`}
              style={{
                position: 'absolute',
                left: zone.x * colPx,
                top: zone.y * CELL_HEIGHT_PX,
                width: zone.width * colPx,
                height: zone.height * CELL_HEIGHT_PX,
                background: isHovered ? 'rgba(74, 144, 217, 0.3)' : 'rgba(74, 144, 217, 0.08)',
                border: isHovered ? '2px solid rgba(74, 144, 217, 0.9)' : '2px dashed rgba(74, 144, 217, 0.4)',
                borderRadius: 4,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 5,
                transition: 'background 0.1s, border 0.1s',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: isHovered ? 'rgba(74, 144, 217, 1)' : 'rgba(74, 144, 217, 0.7)',
                  fontFamily: 'sans-serif',
                  fontWeight: isHovered ? 700 : 500,
                  textAlign: 'center',
                  padding: '0 4px',
                }}
              >
                {zone.label}
              </span>
            </div>
          );
        })}

      {mobileItems.map((item) => (
        <GridCell
          key={item.componentId}
          item={item}
          containerWidth={containerWidth}
          onResizeWidth={handleResizeWidth}
          onResizeLeftEdge={handleResizeLeftEdge}
          onResizeHeight={handleResizeHeight}
          onRemove={handleRemove}
          isMobile={isMobile}
          hasViolation={violatingIds.has(item.componentId)}
        />
      ))}

      {violations.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#d32f2f', color: '#fff', padding: '8px 16px',
          fontFamily: 'sans-serif', fontSize: 12,
        }}>
          <strong>⚠ Layout Bug Detected ({violations.length} violation{violations.length > 1 ? 's' : ''}):</strong>
          {violations.map((v, i) => (
            <div key={i} style={{ marginTop: 2 }}>{v.message}</div>
          ))}
        </div>
      )}

      {items.length === 0 && !showDropZones && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#999', fontFamily: 'sans-serif', fontSize: 14,
        }}>
          Drag components here
        </div>
      )}
    </div>
  );
};
