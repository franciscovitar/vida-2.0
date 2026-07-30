/**
 * Catálogo de capacidades OpenClaw filtrado por perfil canónico.
 */
import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import {
  getOpenClawAgentProfile,
  isOpenClawProposalAllowed,
  isOpenClawReadAllowed,
} from '@/lib/openclaw/agents';
import type {
  OpenClawAgentId,
  OpenClawCapability,
  OpenClawProposeOperation,
  OpenClawReadOperation,
} from '@/types/openclaw';

const READ_CAPABILITIES: readonly {
  id: OpenClawReadOperation;
  description: string;
}[] = [
  { id: 'system.overview', description: 'Resumen acotado del sistema.' },
  { id: 'areas.list', description: 'Lista Áreas canónicas autorizadas.' },
  { id: 'areas.get', description: 'Detalle de un Área canónica autorizada.' },
  { id: 'tasks.list', description: 'Tareas filtradas sin IDs internos.' },
  { id: 'projects.list', description: 'Proyectos filtrados.' },
  { id: 'calendar.upcoming', description: 'Agenda próxima sanitizada.' },
  { id: 'gym.summary', description: 'Resumen sanitizado de Gimnasio.' },
  { id: 'approvals.list', description: 'Propuestas propias en solo lectura.' },
  { id: 'documents.search', description: 'Búsqueda documental autorizada.' },
  { id: 'document.get', description: 'Documento autorizado por slug.' },
];

const PROPOSAL_TOOL_IDS = [
  'task.create.propose',
  'task.change-status.propose',
  'inbox.capture.propose',
  'gym.session.create.propose',
  'calendar.hold.create.propose',
] as const satisfies readonly OpenClawProposeOperation[];

type Env = Readonly<Record<string, string | undefined>>;

export function listOpenClawCapabilities(
  agentIdOrEnv: OpenClawAgentId | Env = 'steward',
  maybeEnv: Env = process.env,
): readonly OpenClawCapability[] {
  const legacyGlobal = typeof agentIdOrEnv !== 'string';
  const agentId = typeof agentIdOrEnv === 'string' ? agentIdOrEnv : 'steward';
  const env = typeof agentIdOrEnv === 'string' ? maybeEnv : agentIdOrEnv;
  const profile = getOpenClawAgentProfile(agentId);
  const proposalsEnabled = isOpenClawProposalsEnabled(env);

  const reads: OpenClawCapability[] = READ_CAPABILITIES.map((capability) => {
    const allowed = legacyGlobal || isOpenClawReadAllowed(agentId, capability.id);
    return {
      id: capability.id,
      kind: allowed ? 'read' : 'forbidden',
      description: allowed ? capability.description : `Bloqueada para el perfil ${profile.name}.`,
    };
  });

  const proposals: OpenClawCapability[] = PROPOSAL_TOOL_IDS.map((id) => {
    const allowed = proposalsEnabled && (legacyGlobal || isOpenClawProposalAllowed(agentId, id));
    return {
      id,
      kind: allowed ? 'proposal' : 'forbidden',
      description: allowed
        ? 'Crea una propuesta pendiente; nunca aplica la escritura final.'
        : `Bloqueada para el perfil ${profile.name}.`,
    };
  });

  return [
    ...reads,
    ...proposals,
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
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'task.change-status',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'inbox.capture',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'gym.session.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'calendar.hold.create',
      kind: 'forbidden',
      description: 'Escritura final no permitida vía OpenClaw.',
    },
    {
      id: 'calendar.event.create',
      kind: 'forbidden',
      description: 'Creación genérica de eventos Calendar prohibida.',
    },
    {
      id: 'journaling.read',
      kind: 'forbidden',
      description: 'Journaling excluido por política.',
    },
    {
      id: 'gmail.read',
      kind: 'forbidden',
      description: 'Gmail pendiente de autorización externa independiente.',
    },
    {
      id: 'drive.read',
      kind: 'forbidden',
      description: 'Drive pendiente de autorización externa independiente.',
    },
  ];
}
