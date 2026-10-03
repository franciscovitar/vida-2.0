import Link from 'next/link';

import { WORLD_DOMAINS, worldDomainHref } from '@/lib/world/contract';

import styles from './World.module.scss';

const MODES = [
  { label: 'Inicio', href: '/world' },
  { label: 'Ahora', href: '/world/ahora' },
  { label: 'Aprender', href: '/world/aprender' },
  { label: 'Biblioteca', href: '/world/biblioteca' },
] as const;

export function WorldNavigation() {
  return (
    <nav className={styles.navigation} aria-label="Navegación de World">
      <div className={styles['mode-row']}>
        {MODES.map((item) => (
          <Link key={item.href} className={styles['mode-link']} href={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className={styles['domain-row']} aria-label="Dominios de World">
        {WORLD_DOMAINS.map((domain) => (
          <Link key={domain.id} className={styles['domain-link']} href={worldDomainHref(domain.id)}>
            {domain.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
