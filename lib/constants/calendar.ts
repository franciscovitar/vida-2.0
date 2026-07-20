import type { CalendarCategory, Domain } from '@/types';

/** Traduce cada categoría de evento a su etiqueta y dominio semántico. */
export const calendarCategoryMeta: Record<CalendarCategory, { label: string; domain: Domain }> = {
  work: { label: 'Trabajo', domain: 'productivity' },
  university: { label: 'Universidad', domain: 'learning' },
  personal: { label: 'Personal', domain: 'habits' },
};
