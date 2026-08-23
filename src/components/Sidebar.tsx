'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from './Sidebar.module.css';

const links = [
  { href: '/dashboard/resumes', label: 'R', title: 'R' },
  { href: '/dashboard/objects', label: 'O', title: 'O' },
  { href: '/qna', label: 'AI', title: 'Q&A' },
];

export function Sidebar({ initial }: { initial: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={styles.sidebar} style={{ width: collapsed ? 48 : 160 }}>
      <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar" className={styles.toggle}>
        {collapsed ? '»' : '«'}
      </button>
      <ul className={styles.links}>
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                title={link.title}
                aria-current={active ? 'page' : undefined}
                className={active ? styles.linkActive : styles.link}
              >
                {collapsed ? link.label : `${link.label} — ${link.title}`}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={styles.spacer} />
      <Link href="/profile" title="Profile" className={styles.avatar}>
        {initial}
      </Link>
    </nav>
  );
}
