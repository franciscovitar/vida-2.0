'use client';

import { useMemo, useState, useTransition } from 'react';

import { runWriteAction, type ClientProposalSummary } from '@/app/actions/writes';
import { WritesDisabledNotice } from '@/components/actions/WritePanels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { ProposalStatus } from '@/types/actions';

import styles from './WritePanels.module.scss';

const STATUS_FILTERS: Array<ProposalStatus | 'all'> = [
  'all',
  'pending',
  'executing',
  'applied',
  'rejected',
  'failed',
  'expired',
  'rolling-back',
  'rolled-back',
  'rollback-failed',
];

function formatInstant(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function sourceLabel(source: string): string {
  if (source === 'openclaw') return 'OpenClaw · legado';
  if (source === 'web') return 'Web';
  if (source === 'agent:steward') return 'Agente · Mayordomo';
  if (source === 'agent:health-reflection') return 'Agente · Salud y reflexión';
  if (source === 'agent:digital-order') return 'Agente · Orden digital';
  if (source === 'agent:technical-guardian') return 'Agente · Guardián técnico';
  if (source === 'agent:steward:workflow:planning-suggestion') {
    return 'Automatización · Sugerencia diaria de planificación';
  }
  if (source.startsWith('agent:') && source.includes(':workflow:')) {
    return 'Automatización · Origen controlado';
  }
  return 'Origen controlado';
}

function canRollback(proposal: ClientProposalSummary): boolean {
  // La ventana exacta la valida el servidor; la UI solo ofrece el control.
  return proposal.status === 'applied' && proposal.reversible && Boolean(proposal.rollbackDeadline);
}

function DiffPreview({ proposal }: { proposal: ClientProposalSummary }) {
  if (!proposal.diff?.fields.length && !proposal.beforeSummary && !proposal.afterSummary) {
    return <p className={styles.message}>Sin diff sanitizado disponible.</p>;
  }
  return (
    <div className={styles.diff}>
      {proposal.beforeSummary || proposal.afterSummary ? (
        <p className={styles.message}>
          Antes: {proposal.beforeSummary ?? '—'} → Después: {proposal.afterSummary ?? '—'}
        </p>
      ) : null}
      {proposal.diff?.fields.map((field) => (
        <p key={field.field} className={styles.message}>
          <strong>{field.field}</strong>: {String(field.before ?? '—')} →{' '}
          {String(field.after ?? '—')}
        </p>
      ))}
      {proposal.diff?.warnings?.length ? (
        <ul className={styles.warnings}>
          {proposal.diff.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ApprovalsPanel({
  writesEnabled,
  initialProposals,
}: {
  writesEnabled: boolean;
  initialProposals: readonly ClientProposalSummary[];
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [phrases, setPhrases] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? proposals
        : proposals.filter((proposal) => proposal.status === statusFilter);
    return [...filtered].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [proposals, statusFilter]);

  function setPhrase(key: string, value: string) {
    setPhrases((prev) => ({ ...prev, [key]: value }));
  }

  function patchProposal(key: string, patch: Partial<ClientProposalSummary>) {
    setProposals((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Centro de aprobaciones" />
        <WritesDisabledNotice />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Centro de aprobaciones"
        description="Aprobar y revertir vuelven a pasar por el Policy Engine. Sin IDs internos ni ciphertext."
      />

      <label className={styles.label}>
        Filtrar por estado
        <select
          className={styles.input}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ProposalStatus | 'all')}
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? 'Todos' : status}
            </option>
          ))}
        </select>
      </label>

      {visible.length === 0 ? (
        <p className={styles.message}>No hay propuestas para este filtro.</p>
      ) : (
        visible.map((proposal) => {
          const phrase = phrases[proposal.key] ?? '';
          const rollbackOk = canRollback(proposal);
          const inFlight =
            proposal.status === 'executing' ||
            proposal.status === 'rolling-back' ||
            busyKey === proposal.key;

          return (
            <div key={proposal.key} className={styles.proposal}>
              <strong>{proposal.name}</strong>
              <div className={styles.actions}>
                <Badge domain="neutral" variant="outline">
                  {proposal.status}
                </Badge>
                <Badge domain="neutral" variant="outline">
                  riesgo {proposal.risk}
                </Badge>
                <Badge domain="neutral" variant="outline">
                  {proposal.actionType}
                </Badge>
                <Badge domain="neutral" variant="outline">
                  {sourceLabel(proposal.source)}
                </Badge>
                <span className={styles.message}>
                  {proposal.reversible ? 'reversible' : 'no reversible'}
                </span>
              </div>
              <p className={styles.message}>Motivo: {proposal.reason}</p>
              <p className={styles.message}>Cambio: {proposal.expectedChange}</p>
              <p className={styles.message}>
                Creada: {formatInstant(proposal.createdAt)} · Expira:{' '}
                {formatInstant(proposal.expiresAt)}
              </p>
              {proposal.rollbackDeadline ? (
                <p className={styles.message}>
                  Rollback hasta: {formatInstant(proposal.rollbackDeadline)}
                </p>
              ) : null}
              {proposal.resultCode ? (
                <p className={styles.message}>Resultado: {proposal.resultCode}</p>
              ) : null}
              <DiffPreview proposal={proposal} />

              {inFlight ? (
                <p className={styles.message} role="status">
                  Operación en curso…
                </p>
              ) : null}

              {proposal.status === 'pending' ? (
                <div className={styles.actions}>
                  <input
                    className={styles.input}
                    placeholder='Escribí "aprobar"'
                    value={phrase}
                    onChange={(event) => setPhrase(proposal.key, event.target.value)}
                    aria-label={`Frase de aprobación para ${proposal.name}`}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setBusyKey(proposal.key);
                      start(async () => {
                        const result = await runWriteAction({
                          actionType: 'proposal.approve',
                          payload: { proposalKey: proposal.key },
                          confirmation: {
                            mode: 'reinforced',
                            acknowledged: true,
                            phrase,
                          },
                        });
                        setMessage(result.message);
                        if (result.ok) {
                          patchProposal(proposal.key, {
                            status: 'applied',
                            decidedAt: new Date().toISOString(),
                            appliedAt: new Date().toISOString(),
                            resultCode: result.code,
                          });
                          setPhrase(proposal.key, '');
                        } else if (result.code === 'conflict' || result.code === 'expired') {
                          patchProposal(proposal.key, {
                            status: result.code === 'expired' ? 'expired' : proposal.status,
                            resultCode: result.code,
                          });
                        }
                        setBusyKey(null);
                      });
                    }}
                  >
                    Aprobar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setBusyKey(proposal.key);
                      start(async () => {
                        const result = await runWriteAction({
                          actionType: 'proposal.reject',
                          payload: { proposalKey: proposal.key },
                          confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
                        });
                        setMessage(result.message);
                        if (result.ok) {
                          patchProposal(proposal.key, {
                            status: 'rejected',
                            decidedAt: new Date().toISOString(),
                            resultCode: 'rejected',
                          });
                        } else if (result.code === 'conflict' || result.code === 'expired') {
                          patchProposal(proposal.key, {
                            status: result.code === 'expired' ? 'expired' : proposal.status,
                            resultCode: result.code,
                          });
                        }
                        setBusyKey(null);
                      });
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              ) : null}

              {rollbackOk ? (
                <div className={styles.actions}>
                  <input
                    className={styles.input}
                    placeholder='Escribí "revertir"'
                    value={phrase}
                    onChange={(event) => setPhrase(proposal.key, event.target.value)}
                    aria-label={`Frase de rollback para ${proposal.name}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setBusyKey(proposal.key);
                      start(async () => {
                        const result = await runWriteAction({
                          actionType: 'action.rollback',
                          payload: { proposalKey: proposal.key },
                          confirmation: {
                            mode: 'reinforced',
                            acknowledged: true,
                            phrase,
                          },
                        });
                        setMessage(result.message);
                        if (result.ok) {
                          patchProposal(proposal.key, {
                            status: 'rolled-back',
                            rolledBackAt: new Date().toISOString(),
                            resultCode: result.code,
                          });
                          setPhrase(proposal.key, '');
                        } else if (result.code === 'rollback-failed' || result.code === 'expired') {
                          patchProposal(proposal.key, {
                            status:
                              result.code === 'rollback-failed' ? 'rollback-failed' : 'expired',
                            resultCode: result.code,
                          });
                        }
                        setBusyKey(null);
                      });
                    }}
                  >
                    Revertir
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
