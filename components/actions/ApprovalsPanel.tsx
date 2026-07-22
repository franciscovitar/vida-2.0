'use client';

import { useState, useTransition } from 'react';

import { runWriteAction } from '@/app/actions/writes';
import { WritesDisabledNotice } from '@/components/actions/WritePanels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { ActionProposalSummary } from '@/types/actions';

import styles from './WritePanels.module.scss';

export function ApprovalsPanel({
  writesEnabled,
  initialProposals,
}: {
  writesEnabled: boolean;
  initialProposals: readonly ActionProposalSummary[];
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [phrase, setPhrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!writesEnabled) {
    return (
      <Card>
        <SectionHeader title="Propuestas" />
        <WritesDisabledNotice />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Centro de aprobaciones"
        description="Aprobar vuelve a pasar por el Policy Engine. Calendar no crea eventos reales."
      />
      {proposals.length === 0 ? (
        <p className={styles.message}>No hay propuestas pendientes en memoria de proceso.</p>
      ) : (
        proposals.map((proposal) => (
          <div key={proposal.key} className={styles.proposal}>
            <strong>{proposal.name}</strong>
            <div className={styles.actions}>
              <Badge domain="neutral" variant="outline">
                {proposal.status}
              </Badge>
              <Badge domain="neutral" variant="outline">
                riesgo {proposal.risk}
              </Badge>
              <span className={styles.message}>
                {proposal.reversible ? 'reversible' : 'no reversible'}
              </span>
            </div>
            <p className={styles.message}>Motivo: {proposal.reason}</p>
            <p className={styles.message}>Cambio: {proposal.expectedChange}</p>
            {proposal.status === 'pending' ? (
              <div className={styles.actions}>
                <input
                  className={styles.input}
                  placeholder='Escribí "aprobar" para reforzar'
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
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
                        setProposals((prev) =>
                          prev.map((item) =>
                            item.key === proposal.key
                              ? { ...item, status: 'approved', decidedAt: new Date().toISOString() }
                              : item,
                          ),
                        );
                        setPhrase('');
                      }
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
                    start(async () => {
                      const result = await runWriteAction({
                        actionType: 'proposal.reject',
                        payload: { proposalKey: proposal.key },
                        confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
                      });
                      setMessage(result.message);
                      if (result.ok) {
                        setProposals((prev) =>
                          prev.map((item) =>
                            item.key === proposal.key
                              ? { ...item, status: 'rejected', decidedAt: new Date().toISOString() }
                              : item,
                          ),
                        );
                      }
                    });
                  }}
                >
                  Rechazar
                </Button>
              </div>
            ) : null}
          </div>
        ))
      )}
      {message ? <p className={styles.message}>{message}</p> : null}
    </Card>
  );
}
