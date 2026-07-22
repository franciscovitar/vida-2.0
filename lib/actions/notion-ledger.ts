/**
 * Repositorio persistente de propuestas + ledger de idempotencia/auditoría
 * sobre la base Acciones y propuestas de Vida 2.0.
 */
import { ACTIONS_PROPS, LEDGER_KIND, PROPOSAL_STATUSES } from '@/lib/actions/actions-props';
import type { AuditAppendResult, AuditSink } from '@/lib/actions/audit';
import type { IdempotencyStore } from '@/lib/actions/idempotency';
import {
  checkboxProp,
  createNotionActionsClient,
  dateProp,
  readCheckbox,
  readDateStart,
  readRichText,
  readSelectName,
  readTitle,
  richTextProp,
  selectProp,
  titleProp,
  type NotionActionsClient,
} from '@/lib/actions/notion-client';
import { idempotencyDigest, opaqueKey } from '@/lib/actions/opaque';
import type { ProposalRepositoryPort } from '@/lib/actions/ports';
import type {
  ActionAuditRecord,
  ActionProposalSummary,
  ActionResult,
  ProposalCreatePayload,
  ProposalStatus,
} from '@/types/actions';
import type { NotionRawPage } from '@/lib/notion/adapters';

export type ActionsLedgerDeps = {
  client: NotionActionsClient;
  actionsDataSourceId: string;
};

type PayloadBag = {
  _k?: string;
  _ledger?: string;
  reason?: string;
  expectedChange?: string;
  result?: ActionResult;
  actorHint?: string;
  verified?: boolean | null;
  errorCode?: string | null;
  [key: string]: unknown;
};

function parsePayloadBag(raw: string): PayloadBag {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PayloadBag;
  } catch {
    return {};
  }
}

function isProposalStatus(value: string | null): value is ProposalStatus {
  return value !== null && (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

function pageToProposal(page: NotionRawPage): ActionProposalSummary | null {
  const props = page.properties;
  const bag = parsePayloadBag(readRichText(props[ACTIONS_PROPS.payloadSanitized]));
  if (bag._ledger === LEDGER_KIND.idempotency || bag._ledger === LEDGER_KIND.audit) {
    return null;
  }
  const title = readTitle(props[ACTIONS_PROPS.title]);
  if (title.startsWith('idem:') || title.startsWith('audit:')) return null;
  const actionType = readSelectName(props[ACTIONS_PROPS.actionType]);
  if (!actionType) return null;
  const statusRaw = readSelectName(props[ACTIONS_PROPS.status]);
  if (!isProposalStatus(statusRaw)) return null;
  const key = typeof bag._k === 'string' && bag._k ? bag._k : opaqueKey('prop', page.id);
  const confirmation =
    readSelectName(props[ACTIONS_PROPS.confirmationMode]) === 'reinforced'
      ? 'reinforced'
      : 'explicit';
  const riskRaw = readSelectName(props[ACTIONS_PROPS.risk]);
  const risk = riskRaw === 'high' || riskRaw === 'medium' || riskRaw === 'low' ? riskRaw : 'medium';
  const targetTypeRaw = readSelectName(props[ACTIONS_PROPS.targetType]) ?? 'system';
  return {
    key,
    name: title || 'Propuesta',
    actionType,
    targetType: targetTypeRaw as ActionProposalSummary['targetType'],
    targetKey: readRichText(props[ACTIONS_PROPS.targetKey]) || null,
    status: statusRaw,
    confirmationMode: confirmation,
    risk,
    reversible: readCheckbox(props[ACTIONS_PROPS.reversible]),
    reason: typeof bag.reason === 'string' ? bag.reason : '',
    expectedChange: typeof bag.expectedChange === 'string' ? bag.expectedChange : '',
    beforeSummary: readRichText(props[ACTIONS_PROPS.beforeSummary]) || null,
    afterSummary: readRichText(props[ACTIONS_PROPS.afterSummary]) || null,
    createdAt: readDateStart(props[ACTIONS_PROPS.createdAt]) ?? new Date().toISOString(),
    decidedAt: readDateStart(props[ACTIONS_PROPS.decidedAt]),
    appliedAt: readDateStart(props[ACTIONS_PROPS.appliedAt]),
    resultCode: readRichText(props[ACTIONS_PROPS.resultCode]) || null,
  };
}

function findProposalPage(pages: readonly NotionRawPage[], key: string): NotionRawPage | null {
  for (const page of pages) {
    const summary = pageToProposal(page);
    if (summary && summary.key === key) return page;
    if (opaqueKey('prop', page.id) === key) return page;
  }
  return null;
}

export function createNotionProposalRepository(deps: ActionsLedgerDeps): ProposalRepositoryPort {
  async function allPages(): Promise<NotionRawPage[]> {
    const res = await deps.client.queryDataSource(deps.actionsDataSourceId);
    return res.ok ? res.pages : [];
  }

  return {
    async create(payload: ProposalCreatePayload, meta) {
      const bag: PayloadBag = {
        ...payload.sanitizedPayload,
        _k: meta.key,
        reason: payload.reason,
        expectedChange: payload.expectedChange,
      };
      const created = await deps.client.createPage({
        dataSourceId: deps.actionsDataSourceId,
        properties: {
          [ACTIONS_PROPS.title]: titleProp(payload.name),
          [ACTIONS_PROPS.actionType]: selectProp(payload.proposedActionType),
          [ACTIONS_PROPS.targetType]: selectProp(payload.targetType),
          [ACTIONS_PROPS.targetKey]: richTextProp(payload.targetKey ?? ''),
          [ACTIONS_PROPS.status]: selectProp('pending'),
          [ACTIONS_PROPS.confirmationMode]: selectProp('explicit'),
          [ACTIONS_PROPS.risk]: selectProp(payload.risk),
          [ACTIONS_PROPS.reversible]: checkboxProp(payload.reversible),
          [ACTIONS_PROPS.payloadSanitized]: richTextProp(JSON.stringify(bag).slice(0, 1900)),
          [ACTIONS_PROPS.beforeSummary]: richTextProp(''),
          [ACTIONS_PROPS.afterSummary]: richTextProp(''),
          [ACTIONS_PROPS.idempotencyKey]: richTextProp(meta.idempotencyKey),
          [ACTIONS_PROPS.createdAt]: dateProp(meta.createdAt),
          [ACTIONS_PROPS.decidedAt]: dateProp(null),
          [ACTIONS_PROPS.appliedAt]: dateProp(null),
          [ACTIONS_PROPS.resultCode]: richTextProp(''),
        },
      });
      if (!created.ok) {
        throw new Error(created.message);
      }
      return (
        pageToProposal(created.page) ?? {
          key: meta.key,
          name: payload.name,
          actionType: payload.proposedActionType,
          targetType: payload.targetType,
          targetKey: payload.targetKey,
          status: 'pending',
          confirmationMode: 'explicit',
          risk: payload.risk,
          reversible: payload.reversible,
          reason: payload.reason,
          expectedChange: payload.expectedChange,
          beforeSummary: null,
          afterSummary: null,
          createdAt: meta.createdAt,
          decidedAt: null,
          appliedAt: null,
          resultCode: null,
        }
      );
    },

    async get(key) {
      const page = findProposalPage(await allPages(), key);
      return page ? pageToProposal(page) : null;
    },

    async list(status?: ProposalStatus) {
      const all = (await allPages())
        .map((page) => pageToProposal(page))
        .filter((row): row is ActionProposalSummary => row !== null);
      return status ? all.filter((row) => row.status === status) : all;
    },

    async updateStatus(key, status, patch) {
      const page = findProposalPage(await allPages(), key);
      if (!page) return null;
      const properties: Record<string, unknown> = {
        [ACTIONS_PROPS.status]: selectProp(status),
      };
      if (patch.decidedAt !== undefined) {
        properties[ACTIONS_PROPS.decidedAt] = dateProp(patch.decidedAt);
      }
      if (patch.appliedAt !== undefined) {
        properties[ACTIONS_PROPS.appliedAt] = dateProp(patch.appliedAt);
      }
      if (patch.resultCode !== undefined) {
        properties[ACTIONS_PROPS.resultCode] = richTextProp(patch.resultCode ?? '');
      }
      if (patch.afterSummary !== undefined) {
        properties[ACTIONS_PROPS.afterSummary] = richTextProp(patch.afterSummary ?? '');
      }
      const updated = await deps.client.updatePage(page.id, properties);
      if (!updated.ok) return null;
      return pageToProposal(updated.page);
    },
  };
}

function sanitizeResultForLedger(result: ActionResult): ActionResult {
  const json = JSON.stringify(result);
  if (/secret_|Bearer |notion\.so|BEGIN PRIVATE/i.test(json)) {
    return {
      ...result,
      message: 'Resultado sanitizado.',
      summary: result.summary ? 'ok' : null,
    };
  }
  return result;
}

/**
 * Idempotencia persistente en la base de acciones.
 * Mitiga duplicados con consulta previa + clave determinista + comprobación posterior.
 * Notion no ofrece unicidad atómica; concurrencia extrema puede producir duplicados raros.
 */
export function createNotionIdempotencyStore(deps: ActionsLedgerDeps): IdempotencyStore {
  async function findByDigest(digest: string): Promise<NotionRawPage | null> {
    const res = await deps.client.queryDataSource(deps.actionsDataSourceId, {
      filter: {
        property: ACTIONS_PROPS.idempotencyKey,
        rich_text: { equals: digest },
      },
    });
    if (!res.ok) return null;
    for (const page of res.pages) {
      const bag = parsePayloadBag(readRichText(page.properties[ACTIONS_PROPS.payloadSanitized]));
      if (bag._ledger === LEDGER_KIND.idempotency) return page;
      const title = readTitle(page.properties[ACTIONS_PROPS.title]);
      if (title.startsWith('idem:')) return page;
    }
    return null;
  }

  return {
    async get(actor, actionType, key) {
      const digest = idempotencyDigest(actor, actionType, key);
      const page = await findByDigest(digest);
      if (!page) return null;
      const bag = parsePayloadBag(readRichText(page.properties[ACTIONS_PROPS.payloadSanitized]));
      const stored = bag.result;
      if (
        stored &&
        typeof stored === 'object' &&
        typeof (stored as ActionResult).code === 'string'
      ) {
        return stored as ActionResult;
      }
      try {
        const raw = readRichText(page.properties[ACTIONS_PROPS.payloadSanitized]);
        const parsed = JSON.parse(raw) as { result?: ActionResult } & ActionResult;
        if (parsed.result && typeof parsed.result.code === 'string') return parsed.result;
        if (typeof parsed.code === 'string') return parsed as ActionResult;
        return null;
      } catch {
        return null;
      }
    },

    async set(actor, actionType, key, result) {
      const digest = idempotencyDigest(actor, actionType, key);
      const existing = await findByDigest(digest);
      if (existing) return;
      const safe = sanitizeResultForLedger(result);
      const bag = { _ledger: LEDGER_KIND.idempotency, result: safe };
      await deps.client.createPage({
        dataSourceId: deps.actionsDataSourceId,
        properties: {
          [ACTIONS_PROPS.title]: titleProp(`idem:${digest.slice(0, 12)}`),
          // actionType real de la operación (opción de select ya existente en setup).
          [ACTIONS_PROPS.actionType]: selectProp(
            actionType.startsWith('proposal.') ? actionType : actionType,
          ),
          [ACTIONS_PROPS.targetType]: selectProp(safe.target?.type ?? 'system'),
          [ACTIONS_PROPS.targetKey]: richTextProp(safe.target?.key ?? ''),
          [ACTIONS_PROPS.status]: selectProp(safe.ok ? 'applied' : 'failed'),
          [ACTIONS_PROPS.confirmationMode]: selectProp('explicit'),
          [ACTIONS_PROPS.risk]: selectProp('low'),
          [ACTIONS_PROPS.reversible]: checkboxProp(false),
          [ACTIONS_PROPS.payloadSanitized]: richTextProp(JSON.stringify(bag).slice(0, 1900)),
          [ACTIONS_PROPS.beforeSummary]: richTextProp(''),
          [ACTIONS_PROPS.afterSummary]: richTextProp(safe.summary ?? ''),
          [ACTIONS_PROPS.idempotencyKey]: richTextProp(digest),
          [ACTIONS_PROPS.createdAt]: dateProp(new Date().toISOString()),
          [ACTIONS_PROPS.decidedAt]: dateProp(null),
          [ACTIONS_PROPS.appliedAt]: dateProp(new Date().toISOString()),
          [ACTIONS_PROPS.resultCode]: richTextProp(safe.code),
        },
      });
      // Comprobación posterior (no atómica frente a concurrencia extrema).
      await findByDigest(digest);
    },
  };
}

export function createNotionAuditSink(deps: ActionsLedgerDeps): AuditSink {
  return {
    async append(record: ActionAuditRecord): Promise<AuditAppendResult> {
      const actionSelect =
        record.actionType.startsWith('task.') ||
        record.actionType.startsWith('inbox.') ||
        record.actionType.startsWith('gym.') ||
        record.actionType.startsWith('proposal.')
          ? record.actionType
          : 'proposal.create';
      const created = await deps.client.createPage({
        dataSourceId: deps.actionsDataSourceId,
        properties: {
          [ACTIONS_PROPS.title]: titleProp(`audit:${record.actionType}`),
          [ACTIONS_PROPS.actionType]: selectProp(actionSelect),
          [ACTIONS_PROPS.targetType]: selectProp(record.targetType ?? 'system'),
          [ACTIONS_PROPS.targetKey]: richTextProp(record.targetKey ?? ''),
          [ACTIONS_PROPS.status]: selectProp(
            record.resultCode === 'applied' || record.resultCode === 'idempotent-replay'
              ? 'applied'
              : 'failed',
          ),
          [ACTIONS_PROPS.confirmationMode]: selectProp(
            record.confirmationMode === 'none' ? 'explicit' : record.confirmationMode,
          ),
          [ACTIONS_PROPS.risk]: selectProp(record.risk ?? 'low'),
          [ACTIONS_PROPS.reversible]: checkboxProp(record.reversible ?? false),
          [ACTIONS_PROPS.payloadSanitized]: richTextProp(
            JSON.stringify({
              _ledger: LEDGER_KIND.audit,
              actorHint: record.actorHint,
              verified: record.verified,
              errorCode: record.errorCode,
            }).slice(0, 1900),
          ),
          [ACTIONS_PROPS.beforeSummary]: richTextProp(record.beforeSummary ?? ''),
          [ACTIONS_PROPS.afterSummary]: richTextProp(record.afterSummary ?? ''),
          [ACTIONS_PROPS.idempotencyKey]: richTextProp(
            record.idempotencyDigest ?? record.idempotencyKey,
          ),
          [ACTIONS_PROPS.createdAt]: dateProp(record.at),
          [ACTIONS_PROPS.decidedAt]: dateProp(null),
          [ACTIONS_PROPS.appliedAt]: dateProp(record.at),
          [ACTIONS_PROPS.resultCode]: richTextProp(record.resultCode),
        },
      });
      if (!created.ok) {
        return { ok: false, message: created.message };
      }
      return { ok: true };
    },

    async list() {
      const res = await deps.client.queryDataSource(deps.actionsDataSourceId);
      if (!res.ok) return [];
      const rows: ActionAuditRecord[] = [];
      for (const page of res.pages) {
        const props = page.properties;
        const bag = parsePayloadBag(readRichText(props[ACTIONS_PROPS.payloadSanitized]));
        const title = readTitle(props[ACTIONS_PROPS.title]);
        if (bag._ledger !== LEDGER_KIND.audit && !title.startsWith('audit:')) continue;
        rows.push({
          actionType: readSelectName(props[ACTIONS_PROPS.actionType]) ?? 'audit',
          actorHint: typeof bag.actorHint === 'string' ? bag.actorHint : 'user',
          at: readDateStart(props[ACTIONS_PROPS.createdAt]) ?? new Date().toISOString(),
          resultCode: (readRichText(props[ACTIONS_PROPS.resultCode]) ||
            'failed') as ActionAuditRecord['resultCode'],
          confirmationMode:
            readSelectName(props[ACTIONS_PROPS.confirmationMode]) === 'reinforced'
              ? 'reinforced'
              : 'explicit',
          idempotencyKey: readRichText(props[ACTIONS_PROPS.idempotencyKey]),
          errorCode: typeof bag.errorCode === 'string' ? bag.errorCode : null,
          targetKey: readRichText(props[ACTIONS_PROPS.targetKey]) || null,
          verified: bag.verified === true,
        });
      }
      return rows;
    },
  };
}

export function createActionsLedgerFromToken(token: string, actionsDataSourceId: string) {
  const deps: ActionsLedgerDeps = {
    client: createNotionActionsClient(token),
    actionsDataSourceId,
  };
  return {
    proposals: createNotionProposalRepository(deps),
    idempotency: createNotionIdempotencyStore(deps),
    audit: createNotionAuditSink(deps),
  };
}
