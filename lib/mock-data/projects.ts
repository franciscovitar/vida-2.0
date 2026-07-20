import type { Project } from '@/types';

/** Proyectos personales simulados. */
export const projects: Project[] = [
  {
    id: 'proj-vida2',
    name: 'Vida 2.0',
    area: 'Personal',
    domain: 'projects',
    status: 'active',
    progress: 35,
    openTasks: 6,
  },
  {
    id: 'proj-genova',
    name: 'Genova',
    area: 'Trabajo',
    domain: 'productivity',
    status: 'active',
    progress: 62,
    openTasks: 4,
  },
  {
    id: 'proj-facultad',
    name: 'Cursada 2º cuatrimestre',
    area: 'Facultad',
    domain: 'learning',
    status: 'active',
    progress: 48,
    openTasks: 9,
  },
  {
    id: 'proj-aprendizaje',
    name: 'Aprendizaje continuo',
    area: 'Aprendizaje',
    domain: 'learning',
    status: 'paused',
    progress: 20,
    openTasks: 3,
  },
];
