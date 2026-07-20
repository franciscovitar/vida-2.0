/** Helpers compartidos para construir vistas del dashboard. */
import type { DeltaView, MetricView } from '@/types';

import { formatDuration } from '../format';

export function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Saludo según la hora (0-23). */
export function greetingForHour(hour: number): string {
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Métrica sin dato disponible para el día. */
export function noDataMetric(context = 'sin registro'): MetricView {
  return { value: 'Sin datos', context, status: 'neutral' };
}

/** Delta a partir de dos números (minutos), con el mismo formato que la UI. */
export function deltaFromMinutes(current: number, previous: number): DeltaView {
  const diff = current - previous;
  if (diff === 0) return { direction: 'steady', label: 'igual' };
  if (diff > 0) return { direction: 'up', label: `+${formatDuration(diff)}` };
  return { direction: 'down', label: `−${formatDuration(-diff)}` };
}

/** Delta vacío (no hay dato para comparar). */
export function emptyDelta(): DeltaView {
  return { direction: 'none', label: '' };
}
