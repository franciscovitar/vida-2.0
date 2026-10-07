'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import {
  evaluateFinanceSurvivalScenario,
  type FinanceIrregularIncomeProfile,
  type FinanceSurvivalScenario,
} from '@/lib/finance/irregular-income-core';

import styles from './IrregularIncomePlanner.module.scss';

interface IrregularIncomePlannerProps {
  profile: FinanceIrregularIncomeProfile;
  eligibleLiquidityMinor: number;
}

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value / 100);
  } catch {
    return `${currency} ${Math.round(value / 100).toLocaleString('es-AR')}`;
  }
}

function formatPercent(value: number | null): string {
  if (value === null) return 'Sin datos';
  return new Intl.NumberFormat('es-AR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonths(value: number | null): string {
  if (value === null) return 'No consume liquidez en este escenario';
  return `${value.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} meses`;
}

function parsePositiveMinor(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const minor = Math.round(parsed * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function parseNonNegativeMinor(value: string): number | null {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const minor = Math.round(parsed * 100);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

export function IrregularIncomePlanner({
  profile,
  eligibleLiquidityMinor,
}: IrregularIncomePlannerProps) {
  const defaultSupport = profile.familySupport
    ? String(Math.round(profile.familySupport.medianMinor / 100))
    : '';
  const [leanBurn, setLeanBurn] = useState('');
  const [expectedSupport, setExpectedSupport] = useState(defaultSupport);
  const [scenario, setScenario] = useState<FinanceSurvivalScenario | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const leanMonthlyBurnMinor = parsePositiveMinor(leanBurn);
    const expectedFamilySupportMinor = parseNonNegativeMinor(expectedSupport);

    if (leanMonthlyBurnMinor === null || expectedFamilySupportMinor === null) {
      setScenario(null);
      setError('Revisá los montos: el mes austero debe ser mayor a cero.');
      return;
    }

    try {
      setScenario(
        evaluateFinanceSurvivalScenario({
          currency: profile.currency,
          leanMonthlyBurnMinor,
          expectedFamilySupportMinor,
          eligibleLiquidityMinor,
        }),
      );
      setError(null);
    } catch {
      setScenario(null);
      setError('No se pudo calcular el escenario con estos valores.');
    }
  }

  const normalSpend = profile.totalSpend?.medianMinor ?? null;
  const lowerObservedSpend = profile.totalSpend?.p25Minor ?? null;
  const typicalSupport = profile.familySupport?.medianMinor ?? null;
  const typicalWork = profile.workIncome?.medianMinor ?? null;
  const typicalBridge = profile.bridgeWithoutWork?.medianMinor ?? null;

  return (
    <div className={styles.shell}>
      <div className={styles.summary}>
        <div>
          <span>Ayuda familiar típica</span>
          <strong>
            {typicalSupport === null
              ? 'Sin datos'
              : formatMinor(typicalSupport, profile.currency)}
          </strong>
        </div>
        <div>
          <span>Trabajo freelance típico</span>
          <strong>
            {typicalWork === null ? 'Sin datos' : formatMinor(typicalWork, profile.currency)}
          </strong>
        </div>
        <div>
          <span>Gasto económico típico</span>
          <strong>
            {normalSpend === null ? 'Sin datos' : formatMinor(normalSpend, profile.currency)}
          </strong>
        </div>
        <div>
          <span>Meses con flujo negativo</span>
          <strong>
            {profile.negativeCashFlowMonths}/{profile.completeMonthCount} ·{' '}
            {formatPercent(profile.negativeCashFlowShare)}
          </strong>
        </div>
      </div>

      <p className={styles.context}>
        El gasto típico usa la mediana de los meses con cobertura común completa. El cuartil
        inferior observado es{' '}
        <strong>
          {lowerObservedSpend === null
            ? 'no disponible'
            : formatMinor(lowerObservedSpend, profile.currency)}
        </strong>
        . El puente mensual histórico sin contar trabajo freelance fue típicamente{' '}
        <strong>
          {typicalBridge === null
            ? 'no disponible'
            : formatMinor(typicalBridge, profile.currency)}
        </strong>
        .
      </p>

      <form className={styles.form} onSubmit={submit}>
        <label>
          <span>Escenario de mes austero</span>
          <input
            value={leanBurn}
            onChange={(event) => setLeanBurn(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="Cuánto necesitás para un mes austero"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Ayuda familiar esperada · escenario</span>
          <input
            value={expectedSupport}
            onChange={(event) => setExpectedSupport(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0"
            autoComplete="off"
          />
          <small>
            Se precarga con la mediana histórica, pero no se trata como ingreso garantizado.
          </small>
        </label>
        <Button type="submit" variant="secondary">
          Calcular escenario
        </Button>
      </form>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {scenario ? (
        <div className={styles.output} aria-live="polite">
          <div>
            <span>Puente mensual a cubrir</span>
            <strong>{formatMinor(scenario.monthlyBridgeMinor, scenario.currency)}</strong>
          </div>
          <div>
            <span>Cobertura sin ingresos nuevos</span>
            <strong>{formatMonths(scenario.noNewIncomeRunwayMonths)}</strong>
          </div>
          <div>
            <span>Cobertura con el escenario de ayuda</span>
            <strong>{formatMonths(scenario.supportAdjustedRunwayMonths)}</strong>
          </div>
          <div>
            <span>Recorte vs. gasto típico observado</span>
            <strong>
              {normalSpend === null
                ? 'Sin datos'
                : formatMinor(
                    Math.max(0, normalSpend - scenario.leanMonthlyBurnMinor),
                    scenario.currency,
                  )}
            </strong>
          </div>
        </div>
      ) : null}

      <small className={styles.footnote}>
        Cobertura común: {profile.commonCoverageStart ?? '—'} → {profile.commonCoverageEnd ?? '—'}.
        Este escenario no guarda nada y no cuenta ventas futuras hasta que el dinero exista.
      </small>
    </div>
  );
}
