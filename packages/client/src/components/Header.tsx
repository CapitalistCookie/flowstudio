'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRANDING } from '@flowstudio/shared';
import { cn } from '@/lib/utils';
import { Video, FolderOpen, LayoutDashboard } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/record', label: 'Record', icon: Video },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header
      className="border-b px-6 py-3 flex items-center justify-between"
      style={{ borderColor: 'rgba(148, 163, 184, 0.2)', backgroundColor: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
            {BRANDING.name}
          </h1>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  active ? 'font-medium' : 'opacity-60 hover:opacity-100'
                )}
                style={active ? { backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)' } : undefined}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
        <span>{BRANDING.tagline}</span>
      </div>
    </header>
  );
}
