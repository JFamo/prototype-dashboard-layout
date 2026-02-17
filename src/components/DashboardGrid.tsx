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
  repositionComponent,
  getMaxRow,
} from '../layoutEngine';
import { validateLayout } from '../validateLayout';
import { GridCell } from './GridCell';

interface Props {
  items: GridItem[];
  onChange: (items: GridItem[]) => void;
}

let idCounter = 100;

export const DashboardGrid: React.FC<Props> = ({ items, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [isMobile, setIsMobile] = useState(false);
  const [rejected, setRejected] = useState(false);

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

  const colPx = containerWidth / GRID_COLUMNS;

  // Flash rejection indicator
  const flashReject = useCallback(() => {
    setRejected(true);
    setTimeout(() => setRejected(false), 600);
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

  const [{ isDraggingAny }, dropRef] = useDrop(
    () => ({
      accept: ['PALETTE_ITEM', 'GRID_ITEM'],
      collect: (monitor) => ({
        isDraggingAny: monitor.canDrop() && !!monitor.getItemType(),
      }),
      drop: (dragItem: any, monitor) => {
        if (isMobile) return;
        const offset = monitor.getClientOffset();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!offset || !rect) return;

        const gridX = Math.max(0, Math.floor((offset.x - rect.left) / colPx));
        const gridY = Math.max(0, Math.floor((offset.y - rect.top) / CELL_HEIGHT_PX));

        if (monitor.getItemType() === 'PALETTE_ITEM') {
          const newItem: GridItem = {
            componentId: `comp-${++idCounter}`,
            componentType: dragItem.componentType as ComponentType,
            x: gridX,
            y: gridY,
            width: dragItem.width,
            height: dragItem.height,
          };
          const result = addComponent(items, newItem);
          if (result) onChange(result);
          else flashReject();
        } else {
          const result = repositionComponent(items, dragItem.componentId, gridX, gridY);
          if (result) onChange(result);
          else flashReject();
        }
      },
    }),
    [items, onChange, colPx, isMobile, flashReject]
  );

  const maxRow = getMaxRow(items);
  const gridHeight = Math.max((maxRow + 2) * CELL_HEIGHT_PX, 400);

  const violations = useMemo(() => validateLayout(items), [items]);
  const violatingIds = useMemo(
    () => new Set(violations.flatMap((v) => v.components)),
    [violations]
  );
  useEffect(() => {
    if (violations.length > 0) console.error('[LAYOUT BUG]', violations);
  }, [violations]);

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
        background: rejected ? 'rgba(211, 47, 47, 0.08)' : isMobile ? '#f5f5f5' : undefined,
        transition: 'background 0.15s',
      }}
    >
      {/* Grid lines */}
      {!isMobile &&
        Array.from({ length: GRID_COLUMNS + 1 }, (_, i) => (
          <div
            key={`col-${i}`}
            style={{
              position: 'absolute', left: i * colPx, top: 0, bottom: 0, width: 1,
              background: isDraggingAny ? 'rgba(74,144,217,0.12)' : 'rgba(0,0,0,0.05)',
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
              background: isDraggingAny ? 'rgba(74,144,217,0.12)' : 'rgba(0,0,0,0.05)',
              pointerEvents: 'none',
            }}
          />
        ))}

      {/* Rejection flash */}
      {rejected && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: '#d32f2f', color: '#fff', padding: '6px 16px', borderRadius: 4,
          fontFamily: 'sans-serif', fontSize: 13, zIndex: 50, pointerEvents: 'none',
          animation: 'fadeOut 0.6s forwards',
        }}>
          Cannot place here
        </div>
      )}

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
          <strong>⚠ Layout Bug ({violations.length}):</strong>
          {violations.map((v, i) => (
            <div key={i} style={{ marginTop: 2 }}>{v.message}</div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#999', fontFamily: 'sans-serif', fontSize: 14,
        }}>
          Drag components here
        </div>
      )}

      <style>{`@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }`}</style>
    </div>
  );
};
