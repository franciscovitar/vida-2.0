'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/theme/ThemeProvider';

import styles from './ThemeToggle.module.scss';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const nextLabel = resolved === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={nextLabel}
      title={nextLabel}
    >
      {resolved === 'dark' ? (
        <Sun size={17} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Moon size={17} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
