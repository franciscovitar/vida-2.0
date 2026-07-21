/**
 * Marcadores de etapa seguros (sin secretos ni contenido de eventos).
 * Activar con CALENDAR_TRACE_STAGES=1.
 */
export function traceCalendarStage(stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): void {
  if (process.env.CALENDAR_TRACE_STAGES !== '1') return;
  const log = console.info.bind(console);
  log(`calendar:stage:${stage}`);
}
