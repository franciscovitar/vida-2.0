'use client';

import { ClipboardCheck, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { ActionProposalSummary } from '@/types/actions';

import styles from './ReviewWorkspace.module.scss';

type ReviewDecision = 'pending' | 'recommend-approve' | 'recommend-reject' | 'needs-info';
type ReviewRisk = 'low' | 'medium' | 'high';

interface LocalReview {
  key: string;
  name: string;
  reason: string;
  expectedChange: string;
  risk: ReviewRisk;
  reversible: boolean;
  decision: ReviewDecision;
}

const DECISION_LABELS: Record<ReviewDecision, string> = {
  pending: 'Pendiente',
  'recommend-approve': 'Recomendar aprobación',
  'recommend-reject': 'Recomendar rechazo',
  'needs-info': 'Pedir más información',
};

const RISK_LABELS: Record<ReviewRisk, string> = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

export function ReviewWorkspace({
  initialProposals,
}: {
  initialProposals: readonly ActionProposalSummary[];
}) {
  const [proposalDecisions, setProposalDecisions] = useState<Record<string, ReviewDecision>>({});
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [expectedChange, setExpectedChange] = useState('');
  const [risk, setRisk] = useState<ReviewRisk>('low');
  const [reversible, setReversible] = useState(true);
  const [decision, setDecision] = useState<ReviewDecision>('pending');
  const [reviews, setReviews] = useState<LocalReview[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className={styles.workspace}>
      <Card>
        <SectionHeader
          title="Centro de revisión"
          description="Evaluá riesgo, reversibilidad y evidencia antes de habilitar una acción futura."
          icon={ShieldCheck}
          domain="neutral"
        />
        <p className={styles['safety-notice']}>
          No se escribió ningún dato externo. Las decisiones son recomendaciones locales y no
          aprueban, rechazan ni ejecutan propuestas.
        </p>

        {initialProposals.length === 0 ? (
          <p className={styles.empty}>
            No hay propuestas del runtime disponibles en este modo seguro.
          </p>
        ) : (
          <div className={styles.proposals}>
            {initialProposals.map((proposal) => {
              const localDecision = proposalDecisions[proposal.key] ?? 'pending';
              return (
                <article key={proposal.key} className={styles.proposal}>
                  <div className={styles['proposal-top']}>
                    <div>
                      <Badge domain="neutral" variant="outline">
                        {proposal.status}
                      </Badge>
                      <strong>{proposal.name}</strong>
                    </div>
                    <div className={styles.badges}>
                      <Badge domain="neutral" variant="outline">
                        riesgo {RISK_LABELS[proposal.risk]}
                      </Badge>
                      <Badge domain="neutral" variant="outline">
                        {proposal.reversible ? 'reversible' : 'no reversible'}
                      </Badge>
                    </div>
                  </div>
                  <p className={styles.body}>Motivo: {proposal.reason}</p>
                  <p className={styles.body}>Cambio esperado: {proposal.expectedChange}</p>
                  <label className={styles.field}>
                    <span>Criterio local</span>
                    <select
                      className={styles.input}
                      value={localDecision}
                      onChange={(event) =>
                        setProposalDecisions((current) => ({
                          ...current,
                          [proposal.key]: event.target.value as ReviewDecision,
                        }))
                      }
                    >
                      {Object.entries(DECISION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.meta}>
                    Acción: {proposal.actionType} · confirmación {proposal.confirmationMode}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="Preparar una revisión manual"
          description="Documentá una decisión antes de convertirla en propuesta formal."
          domain="neutral"
        />
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const cleanName = name.trim();
            const cleanReason = reason.trim();
            const cleanChange = expectedChange.trim();
            if (!cleanName || !cleanReason || !cleanChange) {
              setMessage('Completá nombre, motivo y cambio esperado.');
              return;
            }

            setReviews((current) => [
              {
                key: crypto.randomUUID(),
                name: cleanName,
                reason: cleanReason,
                expectedChange: cleanChange,
                risk,
                reversible,
                decision,
              },
              ...current,
            ]);
            setName('');
            setReason('');
            setExpectedChange('');
            setRisk('low');
            setReversible(true);
            setDecision('pending');
            setMessage('Revisión agregada a la lista local.');
          }}
        >
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Nombre</span>
              <input
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                placeholder="Cambio o decisión a evaluar"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Riesgo</span>
              <select
                className={styles.input}
                value={risk}
                onChange={(event) => setRisk(event.target.value as ReviewRisk)}
              >
                {Object.entries(RISK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Recomendación</span>
              <select
                className={styles.input}
                value={decision}
                onChange={(event) => setDecision(event.target.value as ReviewDecision)}
              >
                {Object.entries(DECISION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Motivo y evidencia</span>
            <textarea
              className={styles.textarea}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Por qué se propone y qué evidencia la respalda"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Cambio esperado</span>
            <textarea
              className={styles.textarea}
              value={expectedChange}
              onChange={(event) => setExpectedChange(event.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Qué debería cambiar y cómo se verificaría"
              required
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={reversible}
              onChange={(event) => setReversible(event.target.checked)}
            />
            El cambio puede revertirse sin pérdida de información
          </label>
          <Button
            type="submit"
            variant="primary"
            iconLeft={ClipboardCheck}
            className={styles['touch-button']}
          >
            Agregar revisión local
          </Button>
          {message ? (
            <p className={styles.message} aria-live="polite">
              {message}
            </p>
          ) : null}
        </form>
      </Card>

      <Card>
        <SectionHeader
          title="Revisiones preparadas"
          description={`${reviews.length} evaluaciones locales en esta sesión`}
          domain="neutral"
        />
        {reviews.length === 0 ? (
          <p className={styles.empty}>Todavía no preparaste revisiones manuales.</p>
        ) : (
          <div className={styles.reviews}>
            {reviews.map((review) => (
              <article key={review.key} className={styles.review}>
                <div className={styles['proposal-top']}>
                  <div>
                    <Badge domain="neutral" variant="soft">
                      {DECISION_LABELS[review.decision]}
                    </Badge>
                    <strong>{review.name}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconLeft={Trash2}
                    className={styles['touch-button']}
                    onClick={() =>
                      setReviews((current) => current.filter((item) => item.key !== review.key))
                    }
                  >
                    Quitar
                  </Button>
                </div>
                <div className={styles.badges}>
                  <Badge domain="neutral" variant="outline">
                    riesgo {RISK_LABELS[review.risk]}
                  </Badge>
                  <Badge domain="neutral" variant="outline">
                    {review.reversible ? 'reversible' : 'no reversible'}
                  </Badge>
                </div>
                <p className={styles.body}>Motivo: {review.reason}</p>
                <p className={styles.body}>Cambio esperado: {review.expectedChange}</p>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
