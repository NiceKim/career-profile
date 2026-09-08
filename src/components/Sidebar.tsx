'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrainCircuit, ChevronLeft, ChevronRight, GitBranch, Layers3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/dashboard/resumes', label: 'Resumes', icon: GitBranch },
  { href: '/dashboard/objects', label: 'Objects', icon: Layers3 },
  { href: '/qna', label: 'Q&A', icon: BrainCircuit },
];

export function Sidebar({
  initial,
  collapsed,
  onToggle,
  width,
}: {
  initial: string;
  collapsed: boolean;
  onToggle: () => void;
  width: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      style={{ width }}
      className="fixed top-0 left-0 flex h-screen flex-col gap-2 border-r border-border bg-card p-2"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Toggle sidebar"
        className="grid size-8 place-items-center self-end rounded-md border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      <ul className="flex flex-col gap-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                title={link.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-[#2da44e]/8 text-[#2da44e]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && link.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex-1" />
      <Link
        href="/profile"
        title="Profile"
        className="grid size-8 place-items-center self-end rounded-md bg-foreground text-sm font-medium text-background"
      >
        {initial}
      </Link>
    </nav>
  );
}
