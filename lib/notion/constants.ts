/**
 * Constantes de esquema de Notion.
 *
 * Las referencias reales viven exclusivamente en variables de entorno. Los IDs
 * sintéticos de `NOTION_DATABASES` se conservan solo como fixtures estables de tests.
 */

/** @deprecated Fixtures sintéticos para tests; no usar como configuración productiva. */
export const NOTION_DATABASES = {
  tasks: {
    databaseId: '10000000-0000-4000-8000-000000000001',
    dataSourceId: '20000000-0000-4000-8000-000000000001',
  },
  projects: {
    databaseId: '10000000-0000-4000-8000-000000000002',
    dataSourceId: '20000000-0000-4000-8000-000000000002',
  },
  areas: {
    databaseId: '10000000-0000-4000-8000-000000000003',
    dataSourceId: '20000000-0000-4000-8000-000000000003',
  },
} as const;

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
