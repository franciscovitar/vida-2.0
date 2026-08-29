import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Block1QaCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

type WorkspaceDefinition = {
  id: string;
  component: string;
  styles: string;
  storageKey: string;
};

const WORKSPACES: readonly WorkspaceDefinition[] = [
  {
    id: 'gym',
    component: 'components/actions/GymSessionPanel.tsx',
    styles: 'components/actions/GymSessionPanel.module.scss',
    storageKey: 'LOCAL_DRAFT_KEYS.gym',
  },
  {
    id: 'tasks',
    component: 'components/tasks/TaskPlanningWorkspace.tsx',
    styles: 'components/tasks/TaskPlanningWorkspace.module.scss',
    storageKey: 'LOCAL_DRAFT_KEYS.tasks',
  },
  {
    id: 'projects',
    component: 'components/projects/ProjectReviewWorkspace.tsx',
    styles: 'components/projects/ProjectReviewWorkspace.module.scss',
    storageKey: 'LOCAL_DRAFT_KEYS.projects',
  },
  {
    id: 'inbox',
    component: 'components/inbox/InboxPlanningWorkspace.tsx',
    styles: 'components/inbox/InboxPlanningWorkspace.module.scss',
    storageKey: 'LOCAL_DRAFT_KEYS.inbox',
  },
  {
    id: 'reviews',
    component: 'components/reviews/ReviewWorkspace.tsx',
    styles: 'components/reviews/ReviewWorkspace.module.scss',
    storageKey: 'LOCAL_DRAFT_KEYS.reviews',
  },
] as const;

const ROUTES = [
  ['app/(app)/gimnasio/page.tsx', 'GymSessionPanel'],
  ['app/(app)/tareas/page.tsx', 'TaskPlanningWorkspace'],
  ['app/(app)/proyectos/page.tsx', 'ProjectReviewWorkspace'],
  ['app/(app)/bandeja/page.tsx', 'InboxPlanningWorkspace'],
  ['app/(app)/aprobaciones/page.tsx', 'ReviewWorkspace'],
] as const;

function read(root: string, relativePath: string): string | null {
  try {
    return readFileSync(path.join(root, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function everySource(
  sources: ReadonlyMap<string, string | null>,
  predicate: (source: string, id: string) => boolean,
): boolean {
  for (const [id, source] of sources) {
    if (!source || !predicate(source, id)) return false;
  }
  return true;
}

export function runBlock1FinalQa(root = process.cwd()): Block1QaCheck[] {
  const componentSources = new Map(
    WORKSPACES.map((workspace) => [workspace.id, read(root, workspace.component)]),
  );
  const styleSources = new Map(
    WORKSPACES.map((workspace) => [workspace.id, read(root, workspace.styles)]),
  );
  const storage = read(root, 'lib/local-drafts/storage.ts');
  const hook = read(root, 'lib/local-drafts/use-local-draft-backup.ts');
  const status = read(root, 'components/local-drafts/LocalDraftStatus.tsx');
  const packageJson = read(root, 'package.json');
  const documentation = read(root, 'docs/BLOCK-1-FINAL-QA.md');

  const checks: Block1QaCheck[] = [
    {
      id: 'qa-files',
      label: 'Archivos interactivos disponibles',
      ok:
        everySource(componentSources, () => true) &&
        everySource(styleSources, () => true) &&
        Boolean(storage && hook && status),
      detail: 'Los cinco workspaces y la infraestructura local pueden leerse.',
    },
    {
      id: 'no-write-actions',
      label: 'Sin escrituras directas desde los workspaces',
      ok: everySource(componentSources, (source, id) => {
        if (source.includes('fetch(')) return false;
        if (id === 'gym') {
          return (
            source.includes('runWriteAction') &&
            source.includes("actionType: 'proposal.create'") &&
            !source.includes("actionType: 'gym.session.create'")
          );
        }
        return !source.includes('runWriteAction') && !source.includes('@/app/actions/writes');
      }),
      detail:
        'Los workspaces locales no escriben directo; gym solo crea propuestas (proposal.create).',
    },
    {
      id: 'local-backup-hook',
      label: 'Persistencia local conectada',
      ok: everySource(
        componentSources,
        (source) =>
          source.includes('useLocalDraftBackup') &&
          source.includes('LocalDraftStatus') &&
          source.includes('validate:') &&
          source.includes('hasContent:'),
      ),
      detail: 'Todos los workspaces validan, guardan y muestran el estado local.',
    },
    {
      id: 'unique-storage-keys',
      label: 'Claves locales separadas',
      ok: WORKSPACES.every((workspace) =>
        componentSources.get(workspace.id)?.includes(workspace.storageKey),
      ),
      detail: 'Cada módulo usa su propia clave de localStorage.',
    },
    {
      id: 'storage-guardrails',
      label: 'Límites y vencimiento activos',
      ok: Boolean(
        storage?.includes('LOCAL_DRAFT_VERSION = 1') &&
        storage.includes('30 * 24 * 60 * 60 * 1_000') &&
        storage.includes('LOCAL_DRAFT_MAX_LENGTH = 250_000') &&
        storage.includes('if (!result.ok) storage.removeItem(storageKey)'),
      ),
      detail: 'Versión, TTL de 30 días, tamaño máximo y descarte seguro confirmados.',
    },
    {
      id: 'restore-and-save',
      label: 'Recuperación y autoguardado diferidos',
      ok: Boolean(
        hook?.includes('window.setTimeout(() =>') &&
        hook.includes('}, 0)') &&
        hook.includes('}, 300)') &&
        hook.includes('window.clearTimeout(timer)') &&
        hook.includes('lastSerializedRef.current = JSON.stringify(result.value)') &&
        !hook.includes('skipInitialSaveRef'),
      ),
      detail: 'La recuperación no bloquea la primera modificación y el autoguardado usa debounce.',
    },
    {
      id: 'manual-clear',
      label: 'Eliminación local disponible',
      ok: Boolean(
        hook?.includes('const clear = useCallback') &&
        hook.includes('removeLocalDraft(storage, key)') &&
        status?.includes('Eliminar copia local'),
      ),
      detail: 'La persona puede borrar cada copia local desde la interfaz.',
    },
    {
      id: 'privacy-disclosure',
      label: 'Aviso de privacidad visible',
      ok: Boolean(
        status?.includes('No está cifrado') &&
        status.includes('no se sincroniza') &&
        status.includes('no modifica Notion, Sheets ni Calendar'),
      ),
      detail: 'La interfaz explica con precisión el alcance de localStorage.',
    },
    {
      id: 'gym-compatibility',
      label: 'Borrador de gimnasio compatible con la rutina',
      ok: Boolean(
        componentSources.get('gym')?.includes('value.routineKey === routine?.name') &&
        componentSources
          .get('gym')
          ?.includes('days.some((day) => day.key === value.workoutDayKey)'),
      ),
      detail: 'Un borrador de otra rutina o día se descarta antes de restaurarse.',
    },
    {
      id: 'mobile-targets',
      label: 'Controles móviles de 44 px',
      ok: everySource(
        styleSources,
        (source) => source.includes('min-height: 44px') && !source.includes('overflow-x: scroll'),
      ),
      detail: 'Los workspaces conservan targets táctiles y evitan scroll horizontal forzado.',
    },
    {
      id: 'routes-wired',
      label: 'Rutas conectadas a los workspaces',
      ok: ROUTES.every(([route, symbol]) => read(root, route)?.includes(symbol)),
      detail: 'Gimnasio, Tareas, Proyectos, Bandeja y Aprobaciones usan las interfaces nuevas.',
    },
    {
      id: 'client-secret-boundary',
      label: 'Sin secretos en componentes cliente',
      ok: everySource(
        componentSources,
        (source) =>
          !source.includes('process.env') &&
          !source.includes('NOTION_API_TOKEN') &&
          !source.includes('GOOGLE_PRIVATE_KEY') &&
          !source.includes('AUTH_SECRET'),
      ),
      detail: 'No se detectaron variables sensibles dentro de componentes cliente.',
    },
    {
      id: 'qa-command',
      label: 'Comando de QA disponible',
      ok: Boolean(packageJson?.includes('"qa:block1": "tsx scripts/block-1-final-qa.ts"')),
      detail: 'npm run qa:block1 ejecuta esta auditoría determinística.',
    },
    {
      id: 'manual-checklist',
      label: 'Checklist de Preview documentado',
      ok: Boolean(
        documentation?.includes('Preview de Vercel') &&
        documentation.includes('390 × 844') &&
        documentation.includes('WRITE_ACTIONS_ENABLED=false') &&
        documentation.includes('OPENCLAW_API_ENABLED=false'),
      ),
      detail: 'La validación manual de navegador, móvil y Preview está documentada.',
    },
  ];

  return checks;
}

function printReport(checks: readonly Block1QaCheck[]): void {
  const passed = checks.filter((check) => check.ok).length;

  console.log('\nBloque 1 · QA final\n');
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.id} — ${check.label}`);
    if (!check.ok) console.log(`      ${check.detail}`);
  }
  console.log(`\nResultado: ${passed}/${checks.length} controles aprobados.\n`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const checks = runBlock1FinalQa();
  printReport(checks);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}
