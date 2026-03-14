'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRANDING } from '@flowstudio/shared';
import { cn } from '@/lib/utils';
import { FluxLogo } from '@/components/FluxLogo';
import { FolderOpen, LayoutDashboard } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 glass border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <FluxLogo size="sm" />
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-all duration-200',
                  active ? 'font-medium glow-amber' : 'opacity-60 hover:opacity-100 hover:bg-white/30'
                )}
                style={active ? { backgroundColor: 'rgba(245, 166, 35, 0.12)', color: 'var(--color-primary)' } : undefined}
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
