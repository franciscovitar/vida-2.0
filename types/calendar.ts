/**
 * Contratos planos de Google Calendar (Fase 5A: solo lectura).
 * Sin cliente OAuth, tokens ni respuestas crudas del SDK.
 */
export type CalendarDataSourceMode = 'mock' | 'google';

export type CalendarIntegrationStatus =
  | 'mock'
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'invalid-calendar-id'
  | 'calendar-not-found'
  | 'rate-limited'
  | 'network-error'
  | 'read-error'
  | 'empty';

export type CalendarAgendaView = 'today' | '7' | '30';

export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type CalendarTransparency = 'opaque' | 'transparent';

/** Evento adaptado para la UI (JSON plano). */
export interface CalendarEvent {
  id: string;
  title: string;
  /** ID de calendario autorizado (p. ej. primary). */
  calendarId: string;
  /** Etiqueta legible; null si no aporta información extra. */
  calendarLabel: string | null;
  location: string | null;
  status: CalendarEventStatus;
  transparency: CalendarTransparency;
  /**
   * true si el evento ocupa tiempo en la agenda (opaco y no cancelado).
   * Los transparentes no bloquean ni suman minutos ocupados.
   */
  blocksTime: boolean;
  allDay: boolean;
  multiDay: boolean;
  /** Primera fecha civil local (YYYY-MM-DD) en America/Argentina/Cordoba. */
  startDate: string;
  /** Última fecha civil inclusiva (YYYY-MM-DD). */
  endDate: string;
  /** HH:mm local, o null si es día completo. */
  startTime: string | null;
  /** HH:mm local, o null si es día completo. */
  endTime: string | null;
  /** Minutos de duración timed; null para día completo. */
  durationMinutes: number | null;
  /** true si proviene de una serie recurrente expandida (singleEvents). */
  recurring: boolean;
  /** true si se solapa con otro evento que bloquea tiempo el mismo día. */
  overlaps: boolean;
}

export interface CalendarEventTime {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  multiDay: boolean;
}

export interface CalendarFreeBlock {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface CalendarDayGroup {
  date: string;
  label: string;
  events: CalendarEvent[];
  occupiedMinutes: number;
  freeBlocks: CalendarFreeBlock[];
  conflictCount: number;
  empty: boolean;
}

export interface CalendarAgendaSummary {
  todayEventCount: number;
  occupiedMinutesToday: number;
  firstEvent: CalendarEvent | null;
  lastEvent: CalendarEvent | null;
  nextEvent: CalendarEvent | null;
  freeBlocksToday: CalendarFreeBlock[];
  overlapCountToday: number;
  totalEvents: number;
}

/** Vista de agenda para /agenda. */
export interface CalendarAgendaData {
  source: CalendarDataSourceMode;
  status: CalendarIntegrationStatus;
  notice: string | null;
  timezone: string;
  view: CalendarAgendaView;
  rangeStart: string;
  rangeEnd: string;
  targetDate: string;
  syncedAt: string;
  calendarIds: string[];
  days: CalendarDayGroup[];
  summary: CalendarAgendaSummary;
  timelineToday: CalendarEvent[];
}

/** Resumen liviano de un evento (Focus / Hoy). */
export interface CalendarEventBrief {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

/**
 * Contrato FocusCard / bloques de foco (determinístico, sin IA).
 *
 * Regla documentada: un evento de día completo NO bloquea las 24 h
 * automáticamente; solo se lista informativamente y no resta minutos libres.
 */
export interface CalendarFocusBlock {
  currentEvent: CalendarEventBrief | null;
  nextEvent: CalendarEventBrief | null;
  minutesUntilNext: number | null;
  nextFreeBlock: CalendarFreeBlock | null;
  freeBlockDurationMinutes: number | null;
  status: 'in-event' | 'between-events' | 'free' | 'empty-day';
}

/**
 * Preview para integrar después en Hoy (aún no cableado a getTodayData).
 */
export interface CalendarTodayPreview {
  currentEvent: CalendarEventBrief | null;
  nextEvent: CalendarEventBrief | null;
  todayEvents: CalendarEvent[];
  occupiedMinutes: number;
  freeBlocks: CalendarFreeBlock[];
  conflicts: CalendarEvent[];
  source: CalendarDataSourceMode;
  status: CalendarIntegrationStatus;
  notice: string | null;
  focus: CalendarFocusBlock;
}
