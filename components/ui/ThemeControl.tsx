'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { ThemePreference } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/ThemeProvider';

import styles from './ThemeControl.module.scss';

const options: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

/** Selector segmentado de tema, pensado para la página de Ajustes. */
export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label="Tema de la interfaz">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          className={styles.option}
          data-active={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} strokeWidth={2} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
