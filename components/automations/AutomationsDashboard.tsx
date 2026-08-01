'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { runAutomationNow, setAutomationPaused } from '@/app/actions/automations';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { AutomationDashboardData, AutomationUiStatus } from '@/lib/automations/dashboard';
import type { Domain } from '@/types';

import styles from './AutomationsDashboard.module.scss';

const STATUS_LABELS: Record<AutomationUiStatus, string> = {
  disabled: 'Desactivada',
  ready: 'Lista',
  degraded: 'Degradada',
  misconfigured: 'Revisar',
  paused: 'Pausada',
};
const STATUS_DOMAINS: Record<AutomationUiStatus, Domain> = {
  disabled: 'neutral',
  ready: 'habits',
  degraded: 'projects',
  misconfigured: 'danger',
  paused: 'projects',
};

function instant(value: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'No disponible'
    : date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function AutomationsDashboard({ data }: { data: AutomationDashboardData }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <div className={styles.stack}>
      <div className={styles.warning} role="note">
        Las automatizaciones solo leen o crean propuestas pendientes. Aprobar, rechazar y revertir
        siguen siendo acciones exclusivas de la Web.
      </div>

      <Card aria-labelledby="automation-readiness-title">
        <SectionHeader
          id="automation-readiness-title"
          title="Preparación del sistema"
          description="Evaluación única y sanitizada compartida con Ajustes."
          action={
            <Badge domain={STATUS_DOMAINS[data.readinessState]} variant="outline">
              {STATUS_LABELS[data.readinessState]}
            </Badge>
          }
        />
        <ul className={styles.checks}>
          {data.readinessChecks.map((check) => (
            <li key={check.id} data-ready={check.ready}>
              <span aria-hidden="true">{check.ready ? '✓' : '–'}</span>
              {check.label}
            </li>
          ))}
        </ul>
      </Card>

      <div className={styles.grid}>
        {data.items.map((item) => (
          <Card key={item.workflowKey} aria-labelledby={`automation-${item.workflowKey}`}>
            <SectionHeader
              id={`automation-${item.workflowKey}`}
              title={item.name}
              description={item.description}
              action={
                <Badge domain={STATUS_DOMAINS[item.status]} variant="outline">
                  {STATUS_LABELS[item.status]}
                </Badge>
              }
            />
            <dl className={styles.facts}>
              <div>
                <dt>Agente</dt>
                <dd>{item.principals}</dd>
              </div>
              <div>
                <dt>Horario</dt>
                <dd>{item.schedule}</dd>
              </div>
              <div>
                <dt>Próxima</dt>
                <dd>{instant(item.nextRun)}</dd>
              </div>
              <div>
                <dt>Última</dt>
                <dd>{instant(item.lastRun?.finishedAt ?? item.lastRun?.createdAt ?? null)}</dd>
              </div>
              <div>
                <dt>Resultado</dt>
                <dd>{item.lastRun?.summary ?? 'Sin ejecuciones'}</dd>
              </div>
              <div>
                <dt>Intentos</dt>
                <dd>{item.lastRun?.attempt ?? 0}</dd>
              </div>
              <div>
                <dt>Circuito</dt>
                <dd>{item.circuit}</dd>
              </div>
              <div>
                <dt>Propuesta</dt>
                <dd>
                  {item.lastRun?.proposalCreated ? 'Creada y pendiente de decisión Web' : 'Ninguna'}
                </dd>
              </div>
            </dl>

            <div className={styles.controls}>
              {item.canRunNow ? (
                <>
                  <label className={styles.confirm}>
                    <input
                      type="checkbox"
                      checked={confirmed[item.workflowKey] ?? false}
                      onChange={(event) =>
                        setConfirmed((current) => ({
                          ...current,
                          [item.workflowKey]: event.target.checked,
                        }))
                      }
                    />
                    Confirmo esta ejecución manual
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={busy || !confirmed[item.workflowKey]}
                    aria-busy={pendingAction === `run:${item.workflowKey}`}
                    onClick={() =>
                      startTransition(async () => {
                        setPendingAction(`run:${item.workflowKey}`);
                        try {
                          const result = await runAutomationNow({
                            workflowKey: item.workflowKey,
                            confirmed: true,
                          });
                          setMessage(result.message);
                          setConfirmed((current) => ({ ...current, [item.workflowKey]: false }));
                          router.refresh();
                        } finally {
                          setPendingAction(null);
                        }
                      })
                    }
                  >
                    {pendingAction === `run:${item.workflowKey}` ? 'Ejecutando…' : 'Ejecutar ahora'}
                  </Button>
                </>
              ) : (
                <p className={styles.hint}>
                  {item.workflowKey === 'approval-digest'
                    ? 'La ejecución manual no está disponible porque este workflow separa dos principales.'
                    : 'Ejecución manual no disponible en el estado actual.'}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                disabled={busy || !data.storeConfigured || !data.systemEnabled}
                aria-busy={pendingAction === `pause:${item.workflowKey}`}
                onClick={() =>
                  startTransition(async () => {
                    setPendingAction(`pause:${item.workflowKey}`);
                    try {
                      const result = await setAutomationPaused({
                        workflowKey: item.workflowKey,
                        paused: !item.paused,
                        confirmed: true,
                      });
                      setMessage(result.message);
                      router.refresh();
                    } finally {
                      setPendingAction(null);
                    }
                  })
                }
              >
                {pendingAction === `pause:${item.workflowKey}`
                  ? item.paused
                    ? 'Reanudando…'
                    : 'Pausando…'
                  : item.paused
                    ? 'Reanudar'
                    : 'Pausar'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card aria-labelledby="recent-runs-title">
        <SectionHeader
          id="recent-runs-title"
          title="Ejecuciones recientes"
          description="Últimas 20 ejecuciones sanitizadas, ordenadas de más nueva a más antigua."
        />
        {data.recentRuns.length === 0 ? (
          <p className={styles.hint}>Todavía no hay ejecuciones registradas.</p>
        ) : (
          <div className={styles['table-wrap']}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Estado</th>
                  <th>Inicio</th>
                  <th>Intentos</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((run, index) => (
                  <tr key={`${run.workflowKey}:${run.createdAt}:${index}`}>
                    <td>
                      {data.items.find((item) => item.workflowKey === run.workflowKey)?.name ??
                        run.workflowKey}
                    </td>
                    <td>{run.status}</td>
                    <td>{instant(run.startedAt ?? run.createdAt)}</td>
                    <td>{run.attempt}</td>
                    <td>{run.summary ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {message ? (
        <p className={styles.status} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
