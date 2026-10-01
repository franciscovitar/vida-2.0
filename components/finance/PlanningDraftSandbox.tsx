'use client';

import { useState, type FormEvent } from 'react';

import { PurchaseScenarioCalculator } from '@/components/finance/PurchaseScenarioCalculator';
import { Button } from '@/components/ui/Button';
import { buildFinancePlanningDraft } from '@/lib/finance/planning-draft-core';
import type { FinancePlanningSnapshot } from '@/lib/finance/planning-core';

import styles from './PlanningDraftSandbox.module.scss';

interface PlanningDraftSandboxProps {
  currency: string;
  eligibleLiquidityMinor: number;
  obligationHorizonDays: number;
  liquidityQuality: 'verified' | 'partial' | null;
}

function parseNonNegativeMinor(value: string, required: boolean): number | null {
  if (!value.trim()) return required ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const minor = Math.round(parsed * 100);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function formatMonths(value: number | null): string {
  if (value === null) return 'No disponible';
  return `${value.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} meses`;
}

export function PlanningDraftSandbox({
  currency,
  eligibleLiquidityMinor,
  obligationHorizonDays,
  liquidityQuality,
}: PlanningDraftSandboxProps) {
  const [reserve, setReserve] = useState('');
  const [obligations, setObligations] = useState('');
  const [goals, setGoals] = useState('');
  const [other, setOther] = useState('');
  const [essentialBurn, setEssentialBurn] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [snapshot, setSnapshot] = useState<FinancePlanningSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const protectedReserveMinor = parseNonNegativeMinor(reserve, true);
    const upcomingObligationsMinor = parseNonNegativeMinor(obligations, false);
    const committedGoalFundingMinor = parseNonNegativeMinor(goals, false);
    const otherCommitmentsMinor = parseNonNegativeMinor(other, false);
    const essentialMonthlyBurnMinor = essentialBurn.trim()
      ? parseNonNegativeMinor(essentialBurn, true)
      : null;

    if (
      protectedReserveMinor === null ||
      upcomingObligationsMinor === null ||
      committedGoalFundingMinor === null ||
      otherCommitmentsMinor === null ||
      (essentialBurn.trim() && essentialMonthlyBurnMinor === null)
    ) {
      setSnapshot(null);
      setError('Revisá los montos: deben ser números válidos y no negativos.');
      return;
    }

    if (!confirmed) {
      setSnapshot(null);
      setError('Confirmá que los montos no reservan dos veces la misma plata.');
      return;
    }

    try {
      const draft = buildFinancePlanningDraft({
        asOf: new Date().toISOString(),
        currency,
        eligibleLiquidityMinor,
        protectedReserveMinor,
        upcomingObligationsMinor,
        committedGoalFundingMinor,
        otherCommitmentsMinor,
        essentialMonthlyBurnMinor,
        nonOverlappingConfirmed: confirmed,
      });
      setSnapshot(draft.snapshot);
      setError(null);
    } catch {
      setSnapshot(null);
      setError('No se pudo construir el borrador con estos valores.');
    }
  }

  function reset() {
    setReserve('');
    setObligations('');
    setGoals('');
    setOther('');
    setEssentialBurn('');
    setConfirmed(false);
    setSnapshot(null);
    setError(null);
  }

  return (
    <div className={styles.shell}>
      <div className={styles.heading}>
        <div>
          <strong>Borrador local · {currency}</strong>
          <small>
            Probá una política antes de guardarla. La liquidez base viene del ledger real
            {liquidityQuality === 'partial' ? ' con evidencia parcial.' : '.'}
          </small>
        </div>
        <span>{formatMinor(eligibleLiquidityMinor, currency)} elegibles</span>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <label>
          <span>Reserva protegida</span>
          <input
            value={reserve}
            onChange={(event) => setReserve(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Requerido · puede ser 0"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Obligaciones próximos {obligationHorizonDays} días</span>
          <input
            value={obligations}
            onChange={(event) => setObligations(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Fondos comprometidos a metas</span>
          <input
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Otros compromisos</span>
          <input
            value={other}
            onChange={(event) => setOther(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Gasto esencial mensual · opcional</span>
          <input
            value={essentialBurn}
            onChange={(event) => setEssentialBurn(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Para calcular meses de cobertura"
            autoComplete="off"
          />
        </label>

        <label className={styles.confirm}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Confirmo que estos montos no representan dos veces la misma plata.</span>
        </label>

        <div className={styles.actions}>
          <Button type="submit" variant="primary">
            Calcular borrador
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Limpiar
          </Button>
        </div>
      </form>

      <small className={styles.privacy}>
        Nada de este borrador se guarda, sincroniza o escribe en el Finance Sheet.
      </small>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {snapshot ? (
        <div className={styles.output}>
          <div className={styles.metrics}>
            <div>
              <span>Safe-to-Spend del borrador</span>
              <strong>{formatMinor(snapshot.safeToSpend.safeToSpendMinor, currency)}</strong>
            </div>
            <div>
              <span>Shortfall</span>
              <strong>{formatMinor(snapshot.safeToSpend.shortfallMinor, currency)}</strong>
            </div>
            <div>
              <span>Cobertura de reserva</span>
              <strong>{formatMonths(snapshot.resilience.reserveCoverageMonths)}</strong>
            </div>
            <div>
              <span>Cobertura de liquidez</span>
              <strong>{formatMonths(snapshot.resilience.essentialCoverageMonths)}</strong>
            </div>
          </div>

          <PurchaseScenarioCalculator
            source={{ currency: snapshot.currency, safeToSpend: snapshot.safeToSpend }}
          />
        </div>
      ) : null}
    </div>
  );
}
