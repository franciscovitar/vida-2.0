/**
 * Block 4 — fronteras de recursos, documentos y ownership de propuestas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  isOpenClawAreaAllowed,
  isOpenClawDocumentEntryAllowed,
  openClawAgentSource,
} from '@/lib/openclaw/agents';
import {
  filterOpenClawOwnProposals,
  isOpenClawProposalOwnedByAgent,
} from '@/lib/openclaw/proposals';
import type { ActionProposalSummary } from '@/types/actions';
import type { WebCatalogEntry } from '@/types/web-catalog';

function entry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'resource.test',
    editorialName: 'Test',
    sourceRef: 'opaque',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'personal-systems',
    slug: 'test',
    aliases: [],
    navigationPlacement: 'none',
    navigationOrder: null,
    renderMode: 'health',
    privacy: 'general',
    policy: {
      visibleWeb: true,
      searchable: true,
      generalAI: 'allowed',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
    ...overrides,
  };
}

function proposal(
  key: string,
  source: string,
  createdAt: string,
  status: ActionProposalSummary['status'] = 'pending',
): ActionProposalSummary {
  return {
    key,
    name: key,
    actionType: 'inbox.capture',
    targetType: 'inbox',
    targetKey: null,
    status,
    confirmationMode: 'explicit',
    risk: 'low',
    reversible: true,
    reason: 'test',
    expectedChange: 'test',
    beforeSummary: null,
    afterSummary: null,
    createdAt,
    decidedAt: null,
    appliedAt: null,
    resultCode: null,
    expiresAt: null,
    executionStartedAt: null,
    rollbackDeadline: null,
    rolledBackAt: null,
    payloadDigest: null,
    contractVersion: 'vida2-writes-v1',
    source,
    beforeDigest: null,
    diff: null,
  };
}

test('B4-R1: Salud y reflexión solo puede resolver el Área Salud', () => {
  assert.equal(isOpenClawAreaAllowed('health-reflection', 'salud'), true);
  assert.equal(isOpenClawAreaAllowed('health-reflection', 'facultad'), false);
  assert.equal(isOpenClawAreaAllowed('health-reflection', 'genova-trabajo'), false);
  assert.equal(isOpenClawAreaAllowed('health-reflection', 'vida-personal'), false);
  assert.equal(isOpenClawAreaAllowed('steward', 'facultad'), true);
});

test('B4-R2: documentos de salud usan renderer health/gym y bloquean privados/sistema', () => {
  assert.equal(isOpenClawDocumentEntryAllowed('health-reflection', entry()), true);
  assert.equal(
    isOpenClawDocumentEntryAllowed('health-reflection', entry({ renderMode: 'gym' })),
    true,
  );
  assert.equal(
    isOpenClawDocumentEntryAllowed('health-reflection', entry({ renderMode: 'document' })),
    false,
  );
  assert.equal(
    isOpenClawDocumentEntryAllowed('health-reflection', entry({ privacy: 'private' })),
    false,
  );
  assert.equal(isOpenClawDocumentEntryAllowed('steward', entry({ privacy: 'system' })), false);
  assert.equal(isOpenClawDocumentEntryAllowed('digital-order', entry()), false);
  assert.equal(isOpenClawDocumentEntryAllowed('technical-guardian', entry()), false);
});

test('B4-R3: cada agente ve únicamente sus propuestas; legado pertenece a steward', () => {
  const rows = [
    proposal('p-health', 'agent:health-reflection', '2026-07-30T12:00:00.000Z'),
    proposal('p-steward', 'agent:steward', '2026-07-30T11:00:00.000Z'),
    proposal('p-legacy', 'openclaw', '2026-07-30T10:00:00.000Z'),
    proposal('p-web', 'web', '2026-07-30T09:00:00.000Z'),
  ];

  assert.deepEqual(
    filterOpenClawOwnProposals(rows, 'health-reflection').map((item) => item.key),
    ['p-health'],
  );
  assert.deepEqual(
    filterOpenClawOwnProposals(rows, 'steward').map((item) => item.key),
    ['p-steward', 'p-legacy'],
  );
  assert.equal(isOpenClawProposalOwnedByAgent(rows[0]!, 'steward'), false);
  assert.equal(isOpenClawProposalOwnedByAgent(rows[2]!, 'health-reflection'), false);
});

test('B4-R4: filtros de estado/límite no atraviesan ownership', () => {
  const rows = [
    proposal('p-new', 'agent:health-reflection', '2026-07-30T12:00:00.000Z'),
    proposal('p-old', 'agent:health-reflection', '2026-07-30T10:00:00.000Z'),
    proposal('p-applied', 'agent:health-reflection', '2026-07-30T11:00:00.000Z', 'applied'),
    proposal('p-other', 'agent:steward', '2026-07-30T13:00:00.000Z'),
  ];
  assert.deepEqual(
    filterOpenClawOwnProposals(rows, 'health-reflection', { status: 'pending', limit: 1 }).map(
      (item) => item.key,
    ),
    ['p-new'],
  );
});

test('B4-R5: source es canónico y la ruta read transmite AgentId autenticado', () => {
  assert.equal(openClawAgentSource('steward'), 'agent:steward');
  assert.equal(openClawAgentSource('health-reflection'), 'agent:health-reflection');

  const readRoute = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/read/route.ts'),
    'utf8',
  );
  const proposalRoute = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/proposals/[key]/route.ts'),
    'utf8',
  );
  assert.match(readRoute, /executeOpenClawRead\(validation\.value, parsed\.value\.agentId\)/);
  assert.match(proposalRoute, /isOpenClawProposalOwnedByAgent/);
  assert.doesNotMatch(proposalRoute, /proposal\.source !== 'openclaw'/);
});
