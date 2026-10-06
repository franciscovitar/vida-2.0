import Link from 'next/link';

import styles from './ProfessionalV2.module.scss';

type ProfessionalSection = 'panorama' | 'mercado' | 'herramientas' | 'crecimiento';

const ITEMS: Array<{ id: ProfessionalSection; label: string; href: string }> = [
  { id: 'panorama', label: 'Panorama', href: '/professional' },
  { id: 'mercado', label: 'Mercado', href: '/professional/mercado' },
  { id: 'herramientas', label: 'Herramientas', href: '/professional/herramientas' },
  { id: 'crecimiento', label: 'Crecimiento', href: '/professional/crecimiento' },
];

export function ProfessionalNavigation({ current }: { current: ProfessionalSection }) {
  return (
    <nav className={styles.navigation} aria-label="Secciones de Profesional">
      {ITEMS.map((item) => (
        <Link
          aria-current={current === item.id ? 'page' : undefined}
          className={styles['navigation-link']}
          href={item.href}
          key={item.id}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
