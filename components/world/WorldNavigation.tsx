import Link from 'next/link';

import { WORLD_DOMAINS, worldDomainHref } from '@/lib/world/contract';

import styles from './World.module.scss';

const MODES = [
  { label: 'Inicio', href: '/world' },
  { label: 'Ahora', href: '/world/ahora' },
  { label: 'Aprender', href: '/world/aprender' },
  { label: 'Biblioteca', href: '/world/biblioteca' },
] as const;

const TEMPORAL = [
  { label: 'Día', href: '/world/ahora' },
  { label: 'Semana', href: '/world/ahora/semana' },
  { label: 'Mes', href: '/world/ahora/mes' },
  { label: 'Año', href: '/world/ahora/ano' },
] as const;

export function WorldNavigation({ showTemporal = false }: { showTemporal?: boolean }) {
  return (
    <nav className={styles.navigation} aria-label="Navegación de World">
      <div className={styles['mode-row']}>
        {MODES.map((item) => (
          <Link key={item.href} className={styles['mode-link']} href={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
      {showTemporal ? (
        <div className={styles['temporal-row']} aria-label="Resolución temporal de Ahora">
          <span className={styles['temporal-label']}>Ahora:</span>
          {TEMPORAL.map((item) => (
            <Link key={item.href} className={styles['temporal-link']} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
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
