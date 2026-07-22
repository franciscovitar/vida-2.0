/**
 * Catálogo de capacidades OpenClaw (contratos resumidos).
 */
import type { OpenClawCapability } from '@/types/openclaw';

export function listOpenClawCapabilities(): readonly OpenClawCapability[] {
  return [
    {
      id: 'system.overview',
      kind: 'read',
      description: 'Resumen acotado del sistema (fuentes, áreas, tareas, agenda, gym, propuestas).',
    },
    {
      id: 'areas.list',
      kind: 'read',
      description: 'Lista las cuatro Áreas canónicas.',
    },
    {
      id: 'areas.get',
      kind: 'read',
      description: 'Detalle de un Área canónica por slug/clave estable.',
    },
    {
      id: 'tasks.list',
      kind: 'read',
      description: 'Tareas filtradas (máx. 50) sin IDs internos ni notas completas.',
    },
    {
      id: 'projects.list',
      kind: 'read',
      description: 'Proyectos filtrados (máx. 50).',
    },
    {
      id: 'calendar.upcoming',
      kind: 'read',
      description: 'Eventos próximos (máx. 31 días), sin asistentes ni enlaces privados.',
    },
    {
      id: 'gym.summary',
      kind: 'read',
      description: 'Resumen sanitizado de Gimnasio (sin inventar rutina).',
    },
    {
      id: 'approvals.list',
      kind: 'read',
      description: 'Propuestas pendientes/autorizadas (solo lectura).',
    },
    {
      id: 'documents.search',
      kind: 'read',
      description: 'Búsqueda documental del Registro Web (política actual).',
    },
    {
      id: 'document.get',
      kind: 'read',
      description: 'Documento público por slug (sin Journaling ni privados).',
    },
    {
      id: 'task.create.propose',
      kind: 'proposal',
      description: 'Crea propuesta pending de nueva tarea.',
    },
    {
      id: 'task.change-status.propose',
      kind: 'proposal',
      description: 'Crea propuesta pending de cambio de estado.',
    },
    {
      id: 'inbox.capture.propose',
      kind: 'proposal',
      description: 'Crea propuesta pending de captura en Bandeja.',
    },
    {
      id: 'gym.session.create.propose',
      kind: 'proposal',
      description: 'Crea propuesta pending de sesión de gimnasio.',
    },
    {
      id: 'calendar.block.propose',
      kind: 'proposal',
      description: 'Crea propuesta pending de bloque Calendar (sin evento real).',
    },
    {
      id: 'proposal.approve',
      kind: 'forbidden',
      description: 'Aprobación solo desde la web autenticada.',
    },
    {
      id: 'proposal.reject',
      kind: 'forbidden',
      description: 'Rechazo solo desde la web autenticada.',
    },
    {
      id: 'task.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'gym.session.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'calendar.event.create',
      kind: 'forbidden',
      description: 'Creación de eventos Calendar prohibida.',
    },
    {
      id: 'journaling.read',
      kind: 'forbidden',
      description: 'Journaling excluido por política.',
    },
  ];
}
