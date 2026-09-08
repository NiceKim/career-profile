'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';

const SIDEBAR_WIDTH = { expanded: 176, collapsed: 56 };

// Owns the collapse state so both the (fixed-position) Sidebar and main's left margin
// stay in sync — a fixed sidebar no longer reserves its own space in the layout.
export function AppShell({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar initial={initial} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} width={width} />
      <main className="flex-1 p-6" style={{ marginLeft: width }}>
        {children}
      </main>
    </div>
  );
}
