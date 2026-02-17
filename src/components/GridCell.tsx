import React, { useCallback, useRef } from 'react';
import { useDrag } from 'react-dnd';
import type { GridItem } from '../types';
import { CELL_HEIGHT_PX, GRID_COLUMNS } from '../constants';

interface Props {
  item: GridItem;
  containerWidth: number;
  onResizeWidth: (id: string, newWidth: number) => void;
  onResizeLeftEdge: (id: string, newX: number) => void;
  onResizeHeight: (id: string, newHeight: number) => void;
  onRemove: (id: string) => void;
  isMobile: boolean;
  hasViolation?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  Chart: '#4a90d9',
  Grid: '#50b87a',
  KPI: '#e6a23c',
  StylizedKPIGraph: '#9b59b6',
};

export const GridCell: React.FC<Props> = ({
  item,
  containerWidth,
  onResizeWidth,
  onResizeLeftEdge,
  onResizeHeight,
  onRemove,
  isMobile,
  hasViolation,
}) => {
  const colPx = containerWidth / GRID_COLUMNS;
  const startXRef = useRef(0);
  const startValRef = useRef(0);

  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: 'GRID_ITEM',
      item: { componentId: item.componentId, width: item.width, height: item.height },
      canDrag: !isMobile,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [item, isMobile]
  );

  // FR-013: Right edge drag
  const onRightEdgeDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.stopPropagation();
      e.preventDefault();
      startXRef.current = e.clientX;
      startValRef.current = item.width;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current;
        const colDelta = Math.round(delta / colPx);
        const newWidth = Math.max(1, startValRef.current + colDelta);
        onResizeWidth(item.componentId, newWidth);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [item, colPx, onResizeWidth, isMobile]
  );

  // Left edge drag
  const onLeftEdgeDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.stopPropagation();
      e.preventDefault();
      startXRef.current = e.clientX;
      startValRef.current = item.x;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current;
        const colDelta = Math.round(delta / colPx);
        onResizeLeftEdge(item.componentId, startValRef.current + colDelta);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [item, colPx, onResizeLeftEdge, isMobile]
  );

  // FR-017: Bottom edge drag
  const onBottomEdgeDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.stopPropagation();
      e.preventDefault();
      startXRef.current = e.clientY;
      startValRef.current = item.height;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startXRef.current;
        const rowDelta = Math.round(delta / CELL_HEIGHT_PX);
        const newHeight = Math.max(1, startValRef.current + rowDelta);
        onResizeHeight(item.componentId, newHeight);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [item, onResizeHeight, isMobile]
  );

  const style: React.CSSProperties = isMobile
    ? {
        width: '100%',
        height: item.height * CELL_HEIGHT_PX,
        position: 'relative',
        marginBottom: 2,
      }
    : {
        position: 'absolute',
        left: item.x * colPx,
        top: item.y * CELL_HEIGHT_PX,
        width: item.width * colPx,
        height: item.height * CELL_HEIGHT_PX,
        opacity: isDragging ? 0.4 : 1,
      };

  return (
    <div
      ref={isMobile ? undefined : (dragRef as unknown as React.Ref<HTMLDivElement>)}
      style={{
        ...style,
        background: TYPE_COLORS[item.componentType] || '#888',
        border: hasViolation ? '3px solid #d32f2f' : '1px solid rgba(0,0,0,0.2)',
        borderRadius: 4,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#fff',
        fontSize: 12,
        fontFamily: 'sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <strong>{item.componentType}</strong>
      <span style={{ fontSize: 10, opacity: 0.8 }}>
        ({item.x},{item.y}) {item.width}×{item.height}
      </span>
      {!isMobile && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.componentId); }}
          style={{
            position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.3)',
            color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
            fontSize: 10, padding: '1px 4px',
          }}
        >
          ✕
        </button>
      )}
      {/* FR-013: Right edge handle */}
      {!isMobile && (
        <div
          onMouseDown={onRightEdgeDown}
          style={{
            position: 'absolute', top: 0, right: 0, width: 6, height: '100%',
            cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)',
          }}
        />
      )}
      {/* Left edge handle */}
      {!isMobile && (
        <div
          onMouseDown={onLeftEdgeDown}
          style={{
            position: 'absolute', top: 0, left: 0, width: 6, height: '100%',
            cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)',
          }}
        />
      )}
      {/* FR-017: Bottom edge handle */}
      {!isMobile && (
        <div
          onMouseDown={onBottomEdgeDown}
          style={{
            position: 'absolute', bottom: 0, left: 0, height: 6, width: '100%',
            cursor: 'ns-resize', background: 'rgba(255,255,255,0.15)',
          }}
        />
      )}
    </div>
  );
};
