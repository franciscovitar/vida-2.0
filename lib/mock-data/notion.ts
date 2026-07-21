/**
 * Mocks coherentes con Tareas / Proyectos / Áreas de Notion.
 */
import { addDaysYmd } from '@/lib/adapters/dates';
import { areaDomain } from '@/lib/notion/adapters';
import { projectDateKind, taskDateKind } from '@/lib/notion/classify';
import type { NotionArea, NotionDashboardData, NotionProject, NotionTask } from '@/types/notion';

const AREA_IDS = {
  facultad: 'mock-area-facultad',
  genova: 'mock-area-genova',
  salud: 'mock-area-salud',
  personal: 'mock-area-personal',
} as const;

const PROJECT_IDS = {
  cursada: 'mock-proj-cursada',
  genovaSprint: 'mock-proj-genova',
  vida2: 'mock-proj-vida2',
  rutina: 'mock-proj-rutina',
  pausado: 'mock-proj-pausado',
} as const;

function rel(id: string, name: string) {
  return { id, name, available: true as const };
}

export function buildMockNotionAreas(): NotionArea[] {
  return [
    {
      id: AREA_IDS.facultad,
      name: 'Facultad',
      status: 'Activa',
      purpose: 'Avanzar la cursada y entregar trabajos a tiempo.',
      reviewDate: '2026-08-01',
      relatedProjectCount: 1,
      relatedTaskCount: 3,
      domain: areaDomain('Facultad'),
    },
    {
      id: AREA_IDS.genova,
      name: 'Genova / Trabajo',
      status: 'Activa',
      purpose: 'Entregar valor en el producto Genova con foco semanal.',
      reviewDate: '2026-07-25',
      relatedProjectCount: 1,
      relatedTaskCount: 3,
      domain: areaDomain('Genova / Trabajo'),
    },
    {
      id: AREA_IDS.salud,
      name: 'Salud',
      status: 'Activa',
      purpose: 'Mantener entrenamiento, sueño y hábitos de salud.',
      reviewDate: '2026-07-28',
      relatedProjectCount: 1,
      relatedTaskCount: 2,
      domain: areaDomain('Salud'),
    },
    {
      id: AREA_IDS.personal,
      name: 'Vida personal',
      status: 'Activa',
      purpose: 'Proyectos personales y sistema Vida 2.0.',
      reviewDate: '2026-08-05',
      relatedProjectCount: 2,
      relatedTaskCount: 3,
      domain: areaDomain('Vida personal'),
    },
  ];
}

export function buildMockNotionProjects(today: string): NotionProject[] {
  const rows: Omit<NotionProject, 'dateKind' | 'domain'>[] = [
    {
      id: PROJECT_IDS.cursada,
      name: 'Cursada 2º cuatrimestre',
      status: 'Activo',
      area: rel(AREA_IDS.facultad, 'Facultad'),
      expectedResult: 'Materias al día y TP entregados.',
      nextAction: 'Terminar sección de memoria del TP',
      dueDate: '2026-08-15',
      reviewDate: '2026-07-27',
      blocker: null,
      relatedTaskCount: 3,
    },
    {
      id: PROJECT_IDS.genovaSprint,
      name: 'Sprint Genova julio',
      status: 'Activo',
      area: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      expectedResult: 'Cerrar issues prioritarios del sprint.',
      nextAction: 'Revisar PR abierto',
      dueDate: today,
      reviewDate: today,
      blocker: null,
      relatedTaskCount: 3,
    },
    {
      id: PROJECT_IDS.vida2,
      name: 'Vida 2.0 web',
      status: 'Activo',
      area: rel(AREA_IDS.personal, 'Vida personal'),
      expectedResult: 'Dashboard usable con Google Sheets y Notion lectura.',
      nextAction: 'Preparar integración Notion solo lectura',
      dueDate: '2026-07-18',
      reviewDate: '2026-07-22',
      blocker: 'Esperando token de integración interna',
      relatedTaskCount: 2,
    },
    {
      id: PROJECT_IDS.rutina,
      name: 'Rutina de entrenamiento',
      status: 'En espera',
      area: rel(AREA_IDS.salud, 'Salud'),
      expectedResult: 'Plan semanal estable de gym y zona 2.',
      nextAction: null,
      dueDate: '2026-07-30',
      reviewDate: '2026-07-26',
      blocker: null,
      relatedTaskCount: 2,
    },
    {
      id: PROJECT_IDS.pausado,
      name: 'Archivo de notas viejas',
      status: 'Completado',
      area: rel(AREA_IDS.personal, 'Vida personal'),
      expectedResult: 'Notas archivadas.',
      nextAction: null,
      dueDate: '2026-06-01',
      reviewDate: null,
      blocker: null,
      relatedTaskCount: 0,
    },
  ];

  return rows.map((row) => ({
    ...row,
    dateKind: projectDateKind(row.status, row.dueDate, today),
    domain: areaDomain(row.area?.name ?? row.name),
  }));
}

export function buildMockNotionTasks(today: string): NotionTask[] {
  const yesterday = addDaysYmd(today, -1);
  const rows: Omit<NotionTask, 'dateKind' | 'domain'>[] = [
    {
      id: 'mock-task-1',
      title: 'Entregar borrador del TP de SO',
      status: 'En progreso',
      date: today,
      priority: 'Alta',
      duration: '2 h+',
      energy: 'Alta',
      project: rel(PROJECT_IDS.cursada, 'Cursada 2º cuatrimestre'),
      area: rel(AREA_IDS.facultad, 'Facultad'),
      projectArea: rel(AREA_IDS.facultad, 'Facultad'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-2',
      title: 'Repasar apuntes de redes',
      status: 'Pendiente',
      date: yesterday,
      priority: 'Media',
      duration: '1 h',
      energy: 'Media',
      project: rel(PROJECT_IDS.cursada, 'Cursada 2º cuatrimestre'),
      area: rel(AREA_IDS.facultad, 'Facultad'),
      projectArea: rel(AREA_IDS.facultad, 'Facultad'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-3',
      title: 'Consultar duda al ayudante',
      status: 'Algún día',
      date: null,
      priority: 'Baja',
      duration: '5-15 min',
      energy: 'Baja',
      project: rel(PROJECT_IDS.cursada, 'Cursada 2º cuatrimestre'),
      area: rel(AREA_IDS.facultad, 'Facultad'),
      projectArea: rel(AREA_IDS.facultad, 'Facultad'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-4',
      title: 'Revisar pull request de Genova',
      status: 'Pendiente',
      date: today,
      priority: 'Alta',
      duration: '30 min',
      energy: 'Media',
      project: rel(PROJECT_IDS.genovaSprint, 'Sprint Genova julio'),
      area: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      projectArea: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-5',
      title: 'Actualizar checklist del sprint',
      status: 'Bloqueada',
      date: today,
      priority: 'Media',
      duration: '5-15 min',
      energy: 'Baja',
      project: rel(PROJECT_IDS.genovaSprint, 'Sprint Genova julio'),
      area: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      projectArea: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      blocker: 'Espera feedback del lead',
      note: null,
    },
    {
      id: 'mock-task-6',
      title: 'Documentar decisión de API',
      status: 'Hecha',
      date: yesterday,
      priority: 'Media',
      duration: '30 min',
      energy: 'Media',
      project: rel(PROJECT_IDS.genovaSprint, 'Sprint Genova julio'),
      area: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      projectArea: rel(AREA_IDS.genova, 'Genova / Trabajo'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-7',
      title: 'Sesión de zona 2 40 min',
      status: 'Pendiente',
      date: today,
      priority: 'Media',
      duration: '1 h',
      energy: 'Media',
      project: rel(PROJECT_IDS.rutina, 'Rutina de entrenamiento'),
      area: rel(AREA_IDS.salud, 'Salud'),
      projectArea: rel(AREA_IDS.salud, 'Salud'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-8',
      title: 'Comprar magnesio',
      status: 'Pendiente',
      date: null,
      priority: 'Baja',
      duration: '5-15 min',
      energy: 'Baja',
      project: rel(PROJECT_IDS.rutina, 'Rutina de entrenamiento'),
      area: rel(AREA_IDS.salud, 'Salud'),
      projectArea: rel(AREA_IDS.salud, 'Salud'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-9',
      title: 'Definir contratos Notion de lectura',
      status: 'En progreso',
      date: today,
      priority: 'Alta',
      duration: '2 h+',
      energy: 'Alta',
      project: rel(PROJECT_IDS.vida2, 'Vida 2.0 web'),
      area: rel(AREA_IDS.personal, 'Vida personal'),
      projectArea: rel(AREA_IDS.personal, 'Vida personal'),
      blocker: null,
      note: 'Solo lectura; sin token real todavía',
    },
    {
      id: 'mock-task-10',
      title: 'Revisar copy de /tareas',
      status: 'Pendiente',
      date: '2026-07-22',
      priority: 'Baja',
      duration: '30 min',
      energy: 'Baja',
      project: rel(PROJECT_IDS.vida2, 'Vida 2.0 web'),
      area: rel(AREA_IDS.personal, 'Vida personal'),
      projectArea: rel(AREA_IDS.personal, 'Vida personal'),
      blocker: null,
      note: null,
    },
    {
      id: 'mock-task-11',
      title: 'Relación huérfana de prueba',
      status: 'Pendiente',
      date: null,
      priority: 'Baja',
      duration: '5-15 min',
      energy: 'Baja',
      project: { id: 'missing-project', name: null, available: false },
      area: rel(AREA_IDS.personal, 'Vida personal'),
      projectArea: { id: 'missing-area', name: null, available: false },
      blocker: null,
      note: 'Proyecto no disponible',
    },
  ];

  return rows.map((row) => ({
    ...row,
    dateKind: taskDateKind(row.status, row.date, today),
    domain: areaDomain(row.area?.name ?? 'Vida personal'),
  }));
}

export function buildMockNotionDashboard(
  today: string,
): Omit<
  NotionDashboardData,
  'source' | 'status' | 'notice' | 'syncedAt' | 'taskSummary' | 'projectSummary'
> {
  return {
    targetDate: today,
    areas: buildMockNotionAreas(),
    projects: buildMockNotionProjects(today),
    tasks: buildMockNotionTasks(today),
  };
}
