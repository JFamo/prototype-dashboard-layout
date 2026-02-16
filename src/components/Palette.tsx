import React from 'react';
import { useDrag } from 'react-dnd';
import type { ComponentType } from '../types';
import { DEFAULT_SIZES } from '../constants';

const TYPES: ComponentType[] = ['Chart', 'Grid', 'KPI', 'StylizedKPIGraph'];

const TYPE_COLORS: Record<string, string> = {
  Chart: '#4a90d9',
  Grid: '#50b87a',
  KPI: '#e6a23c',
  StylizedKPIGraph: '#9b59b6',
};

const PaletteItem: React.FC<{ type: ComponentType }> = ({ type }) => {
  const defaults = DEFAULT_SIZES[type];
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: 'PALETTE_ITEM',
    item: { componentType: type, width: defaults.width, height: defaults.height },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }));

  return (
    <div
      ref={dragRef as unknown as React.Ref<HTMLDivElement>}
      style={{
        padding: '8px 12px',
        margin: 4,
        background: TYPE_COLORS[type],
        color: '#fff',
        borderRadius: 4,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        fontSize: 13,
        fontFamily: 'sans-serif',
        textAlign: 'center',
      }}
    >
      {type}
      <div style={{ fontSize: 10, opacity: 0.7 }}>
        {defaults.width}×{defaults.height}
      </div>
    </div>
  );
};

export const Palette: React.FC = () => (
  <div style={{
    width: 160, padding: 8, borderRight: '1px solid #ddd',
    display: 'flex', flexDirection: 'column', gap: 4,
    fontFamily: 'sans-serif',
  }}>
    <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>Components</div>
    {TYPES.map((t) => (
      <PaletteItem key={t} type={t} />
    ))}
  </div>
);
