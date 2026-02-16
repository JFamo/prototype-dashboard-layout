import { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { GridItem } from './types';
import { DashboardGrid } from './components/DashboardGrid';
import { Palette } from './components/Palette';
import { stabilize } from './layoutEngine';

// Sample dashboard matching the spec's example
const INITIAL_ITEMS: GridItem[] = stabilize([
  { componentId: 'chart-a', componentType: 'Chart', x: 0, y: 0, width: 6, height: 2 },
  { componentId: 'chart-b', componentType: 'KPI', x: 6, y: 0, width: 6, height: 1 },
  { componentId: 'kpi-c', componentType: 'StylizedKPIGraph', x: 6, y: 1, width: 6, height: 1 },
  { componentId: 'grid-d', componentType: 'Grid', x: 0, y: 2, width: 12, height: 3 },
]);

function App() {
  const [items, setItems] = useState<GridItem[]>(INITIAL_ITEMS);

  return (
    <DndProvider backend={HTML5Backend}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Palette />
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <div style={{
            fontFamily: 'sans-serif', fontSize: 13, color: '#666',
            marginBottom: 8, padding: '4px 0',
          }}>
            Dashboard Layout Prototype — Drag edges to resize, drag components to reposition, drag from palette to add
          </div>
          <DashboardGrid items={items} onChange={setItems} />
        </div>
      </div>
    </DndProvider>
  );
}

export default App;
