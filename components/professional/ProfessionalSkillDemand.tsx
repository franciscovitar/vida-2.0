'use client';

import { useState } from 'react';

import type { SkillDemandBaselineData } from '@/lib/professional/skill-demand-contract';
import {
  observedExperienceCounts,
  observedGeographyCounts,
  observedSkillCounts,
  type ObservedJobSampleData,
} from '@/lib/professional/observed-jobs-contract';

import styles from './ProfessionalSkillDemand.module.scss';

type Filter = 'all' | 'stack' | 'professional';
type SourceSelection = 'recent' | 'historical';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas las se√±ales' },
  { key: 'stack', label: 'Tecnolog√≠as' },
  { key: 'professional', label: 'Capacidades' },
];

type Count = { id: string; label: string; mentions: number };

function Bars({ entries, n, name }: { entries: readonly Count[]; n: number; name: string }) {
  return (
    <div className={styles.chart} role="region" aria-label={name}>
      {entries.map((entry) => (
        <div className={styles.row} key={entry.id}>
          <div className={styles['row-head']}>
            <span>{entry.label}</span>
            <strong>
              {entry.mentions} de {n}
            </strong>
          </div>
          <div
            className={styles.track}
            role="img"
            aria-label={entry.label + ': ' + entry.mentions + ' ofertas de ' + n}
          >
            <span
              className={styles.fill}
              style={{ width: (n > 0 ? (entry.mentions / n) * 100 : 0) + '%' }}
            />
          </div∂ªßq´^