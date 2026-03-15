'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const StdbProvider = dynamic(
  () => import('@/components/stdb-provider').then((mod) => mod.StdbProvider),
  { ssr: false }
);

export function StdbProviderWrapper({ children }: { children: ReactNode }) {
  return <StdbProvider>{children}</StdbProvider>;
}
