'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';

const SIDEBAR_WIDTH = { expanded: 160, collapsed: 48 };

// Owns the collapse state so both the (fixed-position) Sidebar and main's left margin
// stay in sync — a fixed sidebar no longer reserves its own space in the layout.
export function AppShell({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar initial={initial} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} width={width} />
      <main style={{ flex: 1, padding: '1.5rem', marginLeft: width }}>{children}</main>
    </div>
  );
}
