/**
 * Constantes canónicas de Notion (Vida 2.0) — solo lectura.
 *
 * Únicas bases permitidas en Fase 4A. No se consulta el workspace completo.
 */

/** Página raíz Vida 2.0 (referencia; no se lee en esta fase). */
export const NOTION_ROOT_PAGE_ID = '39808627-4b6f-819e-bf92-c90cf6a7b4ab';

export const NOTION_DATABASES = {
  tasks: {
    databaseId: '74d13efe-cc12-43fc-a58e-3e5baef3f8f7',
    dataSourceId: 'a19c1f00-7c4b-4920-ae8a-63d3d4e2525a',
  },
  projects: {
    databaseId: '6f9de902-6c44-4ac1-83dd-4976bf6104d2',
    dataSourceId: 'a7b11d6e-f324-4fc7-af71-d2d89da71d28',
  },
  areas: {
    databaseId: '6089edbd-7a0c-4941-bebd-d31475633be2',
    dataSourceId: '9f166408-d1b0-4bdf-a9f4-9c6801d8b750',
  },
} as const;

/** Lista blanca de data sources consultables. */
export const ALLOWED_NOTION_DATA_SOURCE_IDS: readonly string[] = [
  NOTION_DATABASES.tasks.dataSourceId,
  NOTION_DATABASES.projects.dataSourceId,
  NOTION_DATABASES.areas.dataSourceId,
];

/** Nombres exactos de propiedades en Notion. */
export const TASK_PROPS = {
  title: 'Tarea',
  status: 'Estado',
  date: 'Fecha',
  priority: 'Prioridad',
  duration: 'Duración estimada',
  energy: 'Energía requerida',
  project: 'Proyecto',
  area: 'Área',
  projectArea: 'Área del proyecto',
  blocker: 'Bloqueo',
  note: 'Nota',
} as const;

export const PROJECT_PROPS = {
  title: 'Proyecto',
  status: 'Estado',
  area: 'Área',
  expectedResult: 'Resultado esperado',
  nextAction: 'Próxima acción',
  relatedTasks: 'Tareas relacionadas',
  dueDate: 'Fecha límite',
  reviewDate: 'Fecha de revisión',
  blocker: 'Bloqueo',
} as const;

export const AREA_PROPS = {
  title: 'Área',
  status: 'Estado',
  purpose: 'Propósito',
  reviewDate: 'Fecha de revisión',
  relatedProjects: 'Proyectos relacionados',
  relatedTasks: 'Tareas relacionadas',
} as const;

export const TASK_STATUSES = [
  'Pendiente',
  'En progreso',
  'Bloqueada',
  'Hecha',
  'Algún día',
] as const;

export const TASK_PRIORITIES = ['Alta', 'Media', 'Baja'] as const;

export const TASK_DURATIONS = ['5-15 min', '30 min', '1 h', '2 h+'] as const;

export const TASK_ENERGIES = ['Baja', 'Media', 'Alta'] as const;

export const PROJECT_STATUSES = [
  'Activo',
  'En espera',
  'Bloqueado',
  'Completado',
  'Cancelado',
] as const;

export const AREA_STATUSES = ['Activa', 'En pausa', 'Inactiva'] as const;

export type NotionDataSourceKind = 'tasks' | 'projects' | 'areas';
