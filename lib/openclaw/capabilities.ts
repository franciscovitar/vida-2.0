/**
 * Catálogo de capacidades OpenClaw (lectura + proposal-only opcional).
 */
import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import type { OpenClawCapability } from '@/types/openclaw';

const PROPOSAL_TOOL_IDS = [
  'task.create.propose',
  'task.change-status.propose',
  'inbox.capture.propose',
  'gym.session.create.propose',
  'calendar.hold.create.propose',
] as const;

export function listOpenClawCapabilities(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly OpenClawCapability[] {
  const proposalsEnabled = isOpenClawProposalsEnabled(env);
  const proposalKind = proposalsEnabled ? ('proposal' as const) : ('forbidden' as const);
  const proposalDescription = proposalsEnabled
    ? 'Crea una propuesta pendiente (sin aplicar escritura final).'
    : 'Bloqueada: OPENCLAW_PROPOSALS_ENABLED y WRITE_ACTIONS_ENABLED requeridos.';

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
    ...PROPOSAL_TOOL_IDS.map((id) => ({
      id,
      kind: proposalKind,
      description: proposalDescription,
    })),
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
      id: 'action.rollback',
      kind: 'forbidden',
      description: 'Rollback solo desde la web autenticada.',
    },
    {
      id: 'task.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw (direct-write).',
    },
    {
      id: 'task.change-status',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw (direct-write).',
    },
    {
      id: 'inbox.capture',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw (direct-write).',
    },
    {
      id: 'gym.session.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw (direct-write).',
    },
    {
      id: 'calendar.hold.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw (direct-write).',
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
