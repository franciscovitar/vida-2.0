'use client';

import { useState, type FormEvent } from 'react';

import type {
  ReplenishmentListEntry,
  ReplenishmentMutationSuccess,
  ReplenishmentSnapshot,
  UserCorrectionType,
} from '@/lib/household-replenishment/types';

import styles from './ShoppingList.module.scss';

type MutationPayload =
  | {
      action: 'add';
      name: string;
      seedIntervalDays: number | null;
      operationId: string;
    }
  | {
      action: 'bought';
      needId: string;
      operationId: string;
    }
  | {
      action: 'correct';
      needId: string;
      type: UserCorrectionType;
      operationId: string;
    };

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function confidenceLabel(entry: ReplenishmentListEntry): string {
  if (entry.confidence === 'HIGH') return 'Confianza alta';
  if (entry.confidence === 'MEDIUM') return 'Confianza media';
  return 'Aprendiendo';
}

export function ShoppingList({ initialSnapshot }: { initialSnapshot: ReplenishmentSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function mutate(payload: MutationPayload) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/household-replenishment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as Partial<ReplenishmentMutationSuccess> & {
        message?: unknown;
      };

      if (!response.ok || data.ok !== true || !data.snapshot) {
        setNotice(
          typeof data.message === 'string' ? data.message : 'No se pudo guardar el cambio.',
        );
        return;
      }

      setSnapshot(data.snapshot);
    } catch {
      setNotice('No se pudo conectar con la lista. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const selectedCadence = cadence ? Number(cadence) : null;
    await mutate({
      action: 'add',
      name: trimmed,
      seedIntervalDays: Number.isFinite(selectedCadence) ? selectedCadence : null,
      operationId: crypto.randomUUID(),
    });
    setName('');
    setCadence('');
  }

  async function markBought(needId: string) {
    await mutate({ action: 'bought', needId, operationId: crypto.randomUUID() });
  }

  async function correct(needId: string, type: UserCorrectionType) {
    await mutate({ action: 'correct', needId, type, operationId: crypto.randomUUID() });
  }

  return (
    <div className={styles.workspace}>
      <section className={styles['add-card']} aria-labelledby="agregar-producto">
        <div>
          <p className={styles.eyebrow}>Agregar rápido</p>
          <h2 id="agregar-producto">¿Falta algo?</h2>
        </div>
        <form className={styles['add-form']} onSubmit={(event) => void addItem(event)}>
          <label className={styles.field}>
            <span>Producto</span>
            <input
              value={name}
              maxLength={80}
              disabled={saving}
              placeholder="Ej. Detergente"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Más o menos, ¿cada cuánto?</span>
            <select
              value={cadence}
              disabled={saving}
              onChange={(event) => setCadence(event.target.value)}
            >
              <option value="">No sé</option>
              <option value="7">Semanal</option>
              <option value="14">Cada 2 semanas</option>
              <option value="30">Mensual</option>
              <option value="75">Cada 2–3 meses</option>
            </select>
          </label>
          <button
            className={styles['primary-button']}
            type="submit"
            disabled={saving || !name.trim()}
          >
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      </section>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="comprar">
        <div className={styles['section-header']}>
          <div>
            <p className={styles.eyebrow}>Lista activa</p>
            <h2 id="comprar">Comprar</h2>
          </div>
          <span className={styles.count}>{snapshot.buy.length}</span>
        </div>

        {snapshot.buy.length === 0 ? (
          <div className={styles.empty}>
            <strong>Por ahora, nada pendiente.</strong>
            <span>Lo que agregues o el sistema estime va a aparecer acá.</span>
          </div>
        ) : (
          <ul className={styles.list}>
            {snapshot.buy.map((entry) => (
              <li className={styles.item} key={entry.needId}>
                <div className={styles['item-main']}>
                  <div className={styles['item-title-row']}>
                    <strong>{entry.name}</strong>
                    <span className={styles.category}>{entry.category}</span>
                  </div>
                  <p>{entry.reason}</p>
                  <div className={styles.meta}>
                    <span>{confidenceLabel(entry)}</span>
                    {formatDate(entry.nextExpectedAt) ? (
                      <span>Estimado: {formatDate(entry.nextExpectedAt)}</span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles['bought-button']}
                    disabled={saving}
                    onClick={() => void markBought(entry.needId)}
                  >
                    ✓ Compré
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void correct(entry.needId, 'STILL_HAVE')}
                  >
                    Todavía tengo
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void correct(entry.needId, 'LOW')}
                  >
                    Queda poco
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void correct(entry.needId, 'OUT')}
                  >
                    Sin stock
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="quizas-pronto">
        <div className={styles['section-header']}>
          <div>
            <p className={styles.eyebrow}>Predicciones con más incertidumbre</p>
            <h2 id="quizas-pronto">Quizás pronto</h2>
          </div>
          <span className={styles.count}>{snapshot.watch.length}</span>
        </div>

        {snapshot.watch.length === 0 ? (
          <p className={styles['watch-empty']}>Todavía no hay productos para vigilar.</p>
        ) : (
          <ul className={styles['watch-list']}>
            {snapshot.watch.map((entry) => (
              <li key={entry.needId}>
                <div>
                  <strong>{entry.name}</strong>
                  <p>{entry.reason}</p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void correct(entry.needId, 'LOW')}
                >
                  Agregar ahora
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
