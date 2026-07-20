/**
 * Contratos de dominio de Vida 2.0.
 *
 * Estos tipos describen la forma de los datos que la aplicación consumirá.
 * En esta fase se alimentan con datos simulados (`lib/mock-data`), pero están
 * pensados para reemplazarse por datos reales (Google Sheets, Notion, Google
 * Calendar) sin tener que rehacer los componentes.
 */

/** Áreas semánticas que ordenan la información y su color. */
export type Domain =
  'habits' | 'health' | 'productivity' | 'projects' | 'tasks' | 'learning' | 'neutral' | 'danger';

/** Estado genérico para métricas y comparaciones. */
export type Trend = 'up' | 'down' | 'steady';

/** Valoración cualitativa de una métrica respecto de su objetivo. */
export type MetricStatus = 'good' | 'warning' | 'bad' | 'neutral';

/** Estado de carga de una fuente de datos, útil para skeletons y errores. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/* -------------------------------------------------------------------------- */
/* Hábitos                                                                     */
/* -------------------------------------------------------------------------- */

export type HabitStatus = 'done' | 'pending' | 'unavailable';

export interface Habit {
  id: string;
  name: string;
  /** Emoji o clave de icono corta para acompañar el nombre. */
  icon?: string;
  status: HabitStatus;
  /** Racha actual en días. */
  streak: number;
  /** Objetivo de repeticiones para el período (por defecto 1 = diario). */
  target: number;
  /** Repeticiones completadas en el período actual. */
  completed: number;
}

/* -------------------------------------------------------------------------- */
/* Salud y sueño                                                              */
/* -------------------------------------------------------------------------- */

export interface DailyHealth {
  date: string;
  /** Sueño total en minutos. */
  sleepMinutes: number;
  /** Sueño profundo en minutos. */
  deepSleepMinutes: number;
  /** Frecuencia cardíaca en reposo (ppm). */
  restingHeartRate: number;
  steps: number;
  /** Energía autoevaluada de 1 a 5. */
  energy: number;
  /** Variación de cada métrica respecto del día anterior. */
  trend: {
    sleep: Trend;
    deepSleep: Trend;
    restingHeartRate: Trend;
    steps: Trend;
  };
}

/* -------------------------------------------------------------------------- */
/* Productividad (ActivityWatch)                                              */
/* -------------------------------------------------------------------------- */

export interface ProductivityBucket {
  id: string;
  label: string;
  domain: Domain;
  /** Minutos registrados hoy. */
  minutes: number;
  /** Minutos del día anterior, para comparación. */
  previousMinutes: number;
}

export interface ProductivitySummary {
  date: string;
  buckets: ProductivityBucket[];
  /** Minutos totales de PC activa. */
  activeMinutes: number;
  previousActiveMinutes: number;
}

/* -------------------------------------------------------------------------- */
/* Tareas y proyectos                                                        */
/* -------------------------------------------------------------------------- */

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  area: string;
  domain: Domain;
  priority: TaskPriority;
  /** Fecha límite en formato ISO (YYYY-MM-DD). */
  dueDate?: string;
  status: TaskStatus;
}

export interface Project {
  id: string;
  name: string;
  area: string;
  domain: Domain;
  status: 'active' | 'paused' | 'done';
  /** Progreso 0-100. */
  progress: number;
  openTasks: number;
}

/* -------------------------------------------------------------------------- */
/* Calendario                                                                */
/* -------------------------------------------------------------------------- */

export type CalendarCategory = 'work' | 'university' | 'personal';

export interface CalendarEvent {
  id: string;
  title: string;
  category: CalendarCategory;
  /** Hora de inicio en formato HH:mm (24h). */
  start: string;
  /** Hora de fin en formato HH:mm (24h). */
  end: string;
  location?: string;
}

/* -------------------------------------------------------------------------- */
/* Metas semanales                                                           */
/* -------------------------------------------------------------------------- */

export interface WeeklyGoal {
  id: string;
  name: string;
  domain: Domain;
  target: number;
  current: number;
  unit: string;
}

/* -------------------------------------------------------------------------- */
/* Bandeja de entrada / captura rápida                                       */
/* -------------------------------------------------------------------------- */

export interface InboxItem {
  id: string;
  text: string;
  /** Fecha ISO de captura. */
  createdAt: string;
  /** Marca si todavía no se envió a Notion (siempre true en esta fase). */
  pendingSync: boolean;
}

/* -------------------------------------------------------------------------- */
/* Vista "Hoy"                                                               */
/* -------------------------------------------------------------------------- */

export interface DailyFocus {
  primary: string;
  secondary: string[];
}

export interface SyncState {
  /** Última sincronización simulada, en ISO. */
  lastSyncedAt: string;
  /** Fuentes de datos y si respondieron. */
  sources: { id: string; label: string; ok: boolean }[];
}

/* -------------------------------------------------------------------------- */
/* Capa de datos: vistas listas para la interfaz                             */
/* -------------------------------------------------------------------------- */

/** Origen de los datos que alimenta la vista Hoy. */
export type DataSourceKind = 'mock' | 'google';

/**
 * Estado de la integración con el Sheet DEV para la vista Hoy.
 * - `mock`: datos simulados (sin credenciales).
 * - `ready`: datos reales del Sheet DEV.
 * - resto: la integración eligió Google pero no pudo completarse; se muestran
 *   mocks con un aviso discreto.
 */
export type TodayStatus =
  | 'mock'
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-tab'
  | 'missing-header'
  | 'no-data'
  | 'read-error';

/** Métrica ya formateada para mostrar (o "Sin datos" cuando la celda está vacía). */
export interface MetricView {
  value: string;
  unit?: string;
  context: string;
  status: MetricStatus;
  trend?: Trend;
}

/** Métricas del resumen diario. */
export interface SummaryView {
  habits: MetricView;
  sleep: MetricView;
  work: MetricView;
  faculty: MetricView;
  energy: MetricView;
}

/** Métricas de salud y sueño. */
export interface HealthView {
  sleep: MetricView;
  deepSleep: MetricView;
  restingHeartRate: MetricView;
  steps: MetricView;
}

export type DeltaDirection = 'up' | 'down' | 'steady' | 'none';

/** Comparación de una métrica frente al día anterior. */
export interface DeltaView {
  direction: DeltaDirection;
  label: string;
}

export interface ProductivityRowView {
  id: string;
  label: string;
  domain: Domain;
  value: string;
  /** Minutos usados para la barra de progreso (0 cuando no hay dato). */
  fillMinutes: number;
  delta: DeltaView;
}

export interface ProductivityView {
  active: { value: string; delta: DeltaView };
  maxMinutes: number;
  rows: ProductivityRowView[];
}

/** Hábito del día listo para la interfaz (estado + racha). */
export interface HabitView {
  id: string;
  name: string;
  icon?: string;
  status: HabitStatus;
  streak: number;
  /** false cuando no hay dato del hábito (estado "no disponible"). */
  streakAvailable: boolean;
}

export interface DayHeaderView {
  fullDate: string;
  greeting: string;
  syncOk: boolean;
  syncLabel: string;
}

/** Todo lo que necesita la vista Hoy, con su origen y estado. */
export interface TodayData {
  source: DataSourceKind;
  status: TodayStatus;
  /** Mensaje discreto cuando la integración no está lista (null si todo ok). */
  notice: string | null;
  /** Fecha civil AR de la vista Hoy (siempre hoy). */
  targetDate: string;
  /** Fecha del Registro diario usada para hábitos/productividad (null si hoy no tiene). */
  registroDate: string | null;
  /** Fecha de Salud usada (solo hoy; null si hoy no tiene salud). */
  healthDate: string | null;
  header: DayHeaderView;
  summary: SummaryView;
  health: HealthView;
  productivity: ProductivityView;
  habits: HabitView[];
  weekly: WeeklyGoal[];
}
