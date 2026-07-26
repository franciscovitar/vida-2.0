/**
 * Catálogo de capacidades OpenClaw para el contrato read-only del Bloque 2.
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
      kind: 'forbidden',
      description: 'Bloqueada durante el modo read-only.',
    },
    {
      id: 'task.change-status.propose',
      kind: 'forbidden',
      description: 'Bloqueada durante el modo read-only.',
    },
    {
      id: 'inbox.capture.propose',
      kind: 'forbidden',
      description: 'Bloqueada durante el modo read-only.',
    },
    {
      id: 'gym.session.create.propose',
      kind: 'forbidden',
      description: 'Bloqueada durante el modo read-only.',
    },
    {
      id: 'calendar.block.propose',
      kind: 'forbidden',
      description: 'Bloqueada durante el modo read-only.',
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
