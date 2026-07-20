import type { ProductivitySummary } from '@/types';

/** Resumen de productividad simulado (estilo ActivityWatch). */
export const productivity: ProductivitySummary = {
  date: '2026-07-20',
  activeMinutes: 5 * 60 + 10,
  previousActiveMinutes: 6 * 60 + 5,
  buckets: [
    {
      id: 'work',
      label: 'Trabajo',
      domain: 'productivity',
      minutes: 2 * 60 + 40,
      previousMinutes: 3 * 60 + 10,
    },
    {
      id: 'university',
      label: 'Facultad',
      domain: 'learning',
      minutes: 1 * 60 + 20,
      previousMinutes: 55,
    },
    { id: 'vida2', label: 'Vida 2.0', domain: 'habits', minutes: 45, previousMinutes: 30 },
    { id: 'leisure', label: 'Ocio', domain: 'neutral', minutes: 25, previousMinutes: 70 },
  ],
};
