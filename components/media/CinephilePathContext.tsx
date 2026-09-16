'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { buildCinephilePath } from '@/lib/media/cinephile-path';
import type { CinephilePathSnapshot } from '@/lib/media/cinephile-path';
import type { MediaTitleView } from '@/types/media';

const CinephilePathContext = createContext<CinephilePathSnapshot | null>(null);

interface CinephilePathProviderProps {
  titles: MediaTitleView[];
  children: ReactNode;
}

export function CinephilePathProvider({ titles, children }: CinephilePathProviderProps) {
  const snapshot = useMemo(() => buildCinephilePath(titles), [titles]);
  return <CinephilePathContext.Provider value={snapshot}>{children}</CinephilePathContext.Provider>;
}

export function useCinephilePath(): CinephilePathSnapshot | null {
  return useContext(CinephilePathContext);
}
