'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Brand } from '@/components/layout/Brand';

import { NavSections } from './NavSections';
import styles from './MobileNav.module.scss';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Abrir menú de navegación"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div className={styles.overlay} role="presentation" onClick={() => setOpen(false)}>
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Navegación"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.head}>
              <Brand />
              <button
                type="button"
                className={styles.close}
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.body}>
              <NavSections onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
