'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import {
  evaluateFinancePurchaseScenario,
  type FinancePurchaseScenario,
  type FinancePurchaseScenarioSource,
} from '@/lib/finance/planning-core';

import styles from './PurchaseScenarioCalculator.module.scss';

interface PurchaseScenarioCalculatorProps {
  source: FinancePurchaseScenarioSource;
}

const CAPACITY_LABELS: Record<FinancePurchaseScenario['capacityState'], string> = {
  'within-safe-capacity': 'Dentro del disponible no comprometido',
  'uses-protected-capacity': 'Requiere usar dinero protegido',
  'exceeds-liquidity': 'Supera la liquidez elegible',
};

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

function parseAmountMinor(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const minor = Math.round(parsed * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function PurchaseScenarioCalculator({ source }: PurchaseScenarioCalculatorProps) {
  const [amount, setAmount] = useState('');
  const [scenario, setScenario] = useState<FinancePurchaseScenario | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseAmountMinor(amount);
    if (amountMinor === null) {
      setScenario(null);
      setError('Ingresá un monto positivo válido.');
      return;
    }

    try {
      setScenario(evaluateFinancePurchaseScenario(source, amountMinor));
      setError(null);
    } catch {
      setScenario(null);
      setError('No se pudo calcular este escenario con los datos actuales.');
    }
  }

  return (
    <div className={styles.shell}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>Monto de la compra · {source.currency}</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="Monto"
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="secondary">
          Calcular impacto
        </Button>
      </form>

      <small className={styles.privacy}>
        El monto vive solo en esta pantalla: no se guarda ni se envía al Finance Sheet.
      </small>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {scenario ? (
        <div className={styles.result} aria-live="polite">
          <div>
            <span>Resultado</span>
            <strong>{CAPACITY_LABELS[scenario.capacityState]}</strong>
          </div>
          <div>
            <span>Disponible no comprometido después</span>
            <strong>{formatMinor(scenario.postSafeToSpendMinor, scenario.currency)}</strong>
          </div>
          <div>
            <span>Dinero protegido que habría que usar</span>
            <strong>{formatMinor(scenario.beyondSafeCapacityMinor, scenario.currency)}</strong>
          </div>
          <div>
            <span>Exceso sobre liquidez</span>
            <strong>
              {formatMinor(scenario.exceedsEligibleLiquidityByMinor, scenario.currency)}
            </strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
