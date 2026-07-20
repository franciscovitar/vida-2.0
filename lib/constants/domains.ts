import type { CSSProperties } from 'react';

import type { Domain } from '@/types';

export interface DomainMeta {
  label: string;
  /** Variable CSS con el color sólido del dominio. */
  color: string;
}

/**
 * Metadatos de cada dominio semántico. El color apunta a una variable CSS
 * definida en `globals.scss`, de modo que el modo claro y oscuro se resuelven
 * automáticamente. Los colores diferencian información, no decoran.
 */
export const domainMeta: Record<Domain, DomainMeta> = {
  habits: { label: 'Hábitos', color: 'var(--c-habits)' },
  health: { label: 'Salud', color: 'var(--c-health)' },
  productivity: { label: 'Productividad', color: 'var(--c-productivity)' },
  projects: { label: 'Proyectos', color: 'var(--c-projects)' },
  tasks: { label: 'Tareas', color: 'var(--c-tasks)' },
  learning: { label: 'Aprendizaje', color: 'var(--c-learning)' },
  neutral: { label: 'General', color: 'var(--c-neutral)' },
  danger: { label: 'Alerta', color: 'var(--c-danger)' },
};

/** Devuelve las variables CSS de un dominio para aplicarlas por estilo inline. */
export function domainVars(domain: Domain): CSSProperties {
  return {
    '--domain-color': `var(--c-${domain})`,
    '--domain-soft': `var(--c-${domain}-soft)`,
    '--domain-border': `var(--c-${domain}-border)`,
  } as CSSProperties;
}
