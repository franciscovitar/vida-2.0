'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Search } from 'lucide-react';

import {
  evaluatePersonalShoppingFinanceImpact,
  type PersonalShoppingFinanceContext,
  type PersonalShoppingFinanceImpact,
} from '@/lib/personal-shopping/finance-context-core';
import type {
  PersonalShoppingActiveState,
  PersonalShoppingSnapshot,
} from '@/lib/personal-shopping/service';
import type { PersonalPurchaseItem, PersonalPurchaseState } from '@/lib/personal-shopping/types';

import styles from './PersonalShoppingWorkspace.module.scss';

type ShoppingTab = PersonalShoppingActiveState | 'HISTORY';
type MutationBody = Record<string, unknown> & { action: string; operationId: string };
type MutationResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  snapshot?: PersonalShoppingSnapshot;
};
type TransitionOption = { state: PersonalPurchaseState; label: string; tone?: 'danger' };

const TABS: ReadonlyArray<{ value: ShoppingTab; label: string }> = [
  { value: 'BUY', label: 'Comprar' },
  { value: 'RESEARCH', label: 'Investigar' },
  { value: 'REPLENISH', label: 'Reponer' },
  { value: 'HISTORY', label: 'Historial' },
];

const STATE_LABELS: Record<PersonalPurchaseState, string> = {
  BUY: 'Comprar',
  RESEARCH: 'Investigar',
  REPLENISH: 'Reponer',
  PURCHASED: 'Comprado',
  DISCARDED: 'Descartado',
};

const TRANSITION_OPTIONS: Record<PersonalPurchaseState, readonly TransitionOption[]> = {
  BUY: [
    { state: 'PURCHASED', label: 'Marcar comprado' },
    { state: 'RESEARCH', label: 'Volver a Investigar' },
    { state: 'DISCARDED', label: 'Descartar', tone: 'danger' },
  ],
  RESEARCH: [
    { state: 'BUY', label: 'Pasar a Comprar' },
    { state: 'DISCARDED', label: 'Descartar', tone: 'danger' },
  ],
  REPLENISH: [
    { state: 'PURCHASED', label: 'Marcar comprado' },
    { state: 'BUY', label: 'Pasar a Comprar' },
    { state: 'DISCARDED', label: 'Descartar', tone: 'danger' },
  ],
  PURCHASED: [
    { state: 'BUY', label: 'Restaurar a Comprar' },
    { state: 'RESEARCH', label: 'Restaurar a Investigar' },
    { state: 'REPLENISH', label: 'Restaurar a Reponer' },
  ],
  DISCARDED: [
    { state: 'BUY', label: 'Restaurar a Comprar' },
    { state: 'RESEARCH', label: 'Restaurar a Investigar' },
    { state: 'REPLENISH', label: 'Restaurar a Reponer' },
  ],
};

function historyCount(snapshot: PersonalShoppingSnapshot): number {
  return snapshot.counts.PURCHASED + snapshot.counts.DISCARDED;
}

function tabCount(snapshot: PersonalShoppingSnapshot, tab: ShoppingTab): number {
  return tab === 'HISTORY' ? historyCount(snapshot) : snapshot.counts[tab];
}

function belongsToTab(item: PersonalPurchaseItem, tab: ShoppingTab): boolean {
  if (tab === 'HISTORY') return item.state === 'PURCHASED' || item.state === 'DISCARDED';
  return item.state === tab;
}

function formatMinor(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'ARS' ? 0 : 2,
      maximumFractionDigits: currency === 'ARS' ? 0 : 2,
    }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toLocaleString('es-AR')}`;
  }
}

function formatPrice(item: PersonalPurchaseItem): string | null {
  if (item.estimatedPriceMinor == null || !item.currency) return null;
  return formatMinor(item.estimatedPriceMinor, item.currency);
}

function minorToInput(value: number | null): string {
  if (value == null) return '';
  return String(value / 100).replace('.', ',');
}

function priceInputToMinor(value: string): { ok: true; value: number | null } | { ok: false } {
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return { ok: true, value: null };

  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(,\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(raw)) {
    normalized = raw;
  } else {
    return { ok: false };
  }

  const parsed = Number(normalized);
  const minor = Math.round(parsed * 100);
  return Number.isFinite(parsed) && Number.isSafeInteger(minor) && minor >= 0
    ? { ok: true, value: minor }
    : { ok: false };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date);
}

async function postMutation(body: MutationBody): Promise<MutationResponse> {
  const response = await fetch('/api/personal-shopping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as MutationResponse;
  if (!response.ok || !result.ok || !result.snapshot) {
    return { ok: false, message: result.message ?? 'No se pudo guardar. Probá de nuevo.' };
  }
  return result;
}

function monthlyTargetHeadline(
  impact: NonNullable<PersonalShoppingFinanceImpact['monthlyTarget']>,
) {
  if (impact.projectedOverTargetMinor > 0) {
    return `${formatMinor(impact.projectedOverTargetMinor, impact.currency)} por encima del objetivo`;
  }
  if (impact.postRemainingTargetMinor === 0) return 'Sin margen del objetivo después';
  return `${formatMinor(impact.postRemainingTargetMinor, impact.currency)} de margen después`;
}

function safeToSpendHeadline(impact: NonNullable<PersonalShoppingFinanceImpact['safeToSpend']>) {
  const { scenario } = impact;
  if (scenario.capacityState === 'exceeds-liquidity') {
    return `${formatMinor(
      scenario.exceedsEligibleLiquidityByMinor,
      scenario.currency,
    )} por encima de la liquidez elegible`;
  }
  if (scenario.capacityState === 'uses-protected-capacity') {
    return `${formatMinor(
      scenario.beyondSafeCapacityMinor,
      scenario.currency,
    )} por encima de Safe-to-Spend`;
  }
  return `${formatMinor(scenario.postSafeToSpendMinor, scenario.currency)} de capacidad después`;
}

function PersonalShoppingFinanceImpactPanel({ impact }: { impact: PersonalShoppingFinanceImpact }) {
  const monthly = impact.monthlyTarget;
  const safe = impact.safeToSpend;

  return (
    <section className={styles['finance-impact']} aria-label="Impacto financiero estimado">
      <div className={styles['finance-impact-heading']}>
        <div>
          <span className={styles.eyebrow}>Finanzas · solo lectura</span>
          <strong>Impacto de {formatMinor(impact.purchaseAmountMinor, impact.currency)}</strong>
        </div>
        <span className={styles['finance-read-only-badge']}>No registra gastos</span>
      </div>

      {monthly || safe ? (
        <div className={styles['finance-impact-grid']}>
          {monthly ? (
            <article className={styles['finance-impact-card']}>
              <span>Objetivo mensual</span>
              <strong>{monthlyTargetHeadline(monthly)}</strong>
              <small>
                Margen actual: {formatMinor(monthly.remainingTargetMinor, monthly.currency)} ·
                objetivo activo: {formatMinor(monthly.activeTargetMinor, monthly.currency)}
              </small>
            </article>
          ) : null}

          {safe ? (
            <article className={styles['finance-impact-card']}>
              <span>Safe-to-Spend</span>
              <strong>{safeToSpendHeadline(safe)}</strong>
              <small>
                Capacidad actual:{' '}
                {formatMinor(safe.scenario.preSafeToSpendMinor, safe.scenario.currency)} ·{' '}
                {safe.liquidityQuality === 'verified' ? 'liquidez verificada' : 'cobertura parcial'}
              </small>
            </article>
          ) : null}
        </div>
      ) : (
        <p className={styles['finance-unavailable']}>
          Finance no tiene evidencia suficiente para calcular esta moneda. No completamos el dato
          con supuestos.
        </p>
      )}

      <p className={styles['finance-impact-note']}>
        Es contexto estimado para decidir. Marcar Comprado no crea ni modifica movimientos de
        Finance.
      </p>
    </section>
  );
}

function PersonalShoppingDetail({
  item,
  writesEnabled,
  financeContext,
  onSnapshot,
  onTransition,
}: {
  item: PersonalPurchaseItem;
  writesEnabled: boolean;
  financeContext: PersonalShoppingFinanceContext;
  onSnapshot: (snapshot: PersonalShoppingSnapshot) => void;
  onTransition: (snapshot: PersonalShoppingSnapshot, state: PersonalPurchaseState) => void;
}) {
  const [need, setNeed] = useState(item.need ?? '');
  const [quantityText, setQuantityText] = useState(item.quantityText ?? '');
  const [category, setCategory] = useState(item.category ?? '');
  const [currency, setCurrency] = useState(item.currency ?? '');
  const [estimatedPrice, setEstimatedPrice] = useState(minorToInput(item.estimatedPriceMinor));
  const [targetPrice, setTargetPrice] = useState(minorToInput(item.targetPriceMinor));
  const [purchaseCondition, setPurchaseCondition] = useState(item.purchaseCondition ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [candidateLinks, setCandidateLinks] = useState(item.candidateLinks.join('\n'));
  const [focus, setFocus] = useState(item.focus);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writesEnabled || saving) return;

    const estimated = priceInputToMinor(estimatedPrice);
    const target = priceInputToMinor(targetPrice);
    if (!estimated.ok || !target.ok) {
      setNotice('Revisá los precios. Usá números, con coma o punto para decimales.');
      return;
    }
    if ((estimated.value !== null || target.value !== null) && !currency.trim()) {
      setNotice('Elegí una moneda si cargás un precio.');
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const result = await postMutation({
        action: 'update-details',
        operationId: crypto.randomUUID(),
        itemId: item.id,
        need: need.trim() || null,
        quantityText: quantityText.trim() || null,
        category: category.trim() || null,
        currency: currency.trim() || null,
        estimatedPriceMinor: estimated.value,
        targetPriceMinor: target.value,
        purchaseCondition: purchaseCondition.trim() || null,
        notes: notes.trim() || null,
        candidateLinks: candidateLinks
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
        focus,
      });
      if (!result.ok || !result.snapshot) {
        setNotice(result.message ?? 'No se pudo guardar. Probá de nuevo.');
        return;
      }
      onSnapshot(result.snapshot);
      setNotice(
        result.code === 'idempotent' ? 'No había cambios para guardar.' : 'Detalles guardados.',
      );
    } catch {
      setNotice('No se pudo conectar con Compras. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function transition(toState: PersonalPurchaseState) {
    if (!writesEnabled || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await postMutation({
        action: 'transition',
        operationId: crypto.randomUUID(),
        itemId: item.id,
        toState,
      });
      if (!result.ok || !result.snapshot) {
        setNotice(result.message ?? 'No se pudo cambiar el estado.');
        return;
      }
      onTransition(result.snapshot, toState);
    } catch {
      setNotice('No se pudo conectar con Compras. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const financeImpact = evaluatePersonalShoppingFinanceImpact(item, financeContext);
  const created = formatDate(item.createdAt);
  const updated = formatDate(item.updatedAt);
  const closed = formatDate(item.purchasedAt ?? item.discardedAt);

  return (
    <div className={styles['item-detail']} id={`personal-shopping-detail-${item.id}`}>
      <div className={styles['detail-heading']}>
        <div>
          <span className={styles.eyebrow}>Detalle</span>
          <strong>{item.title}</strong>
        </div>
        <span className={styles['state-badge']}>{STATE_LABELS[item.state]}</span>
      </div>

      <form className={styles['detail-form']} onSubmit={saveDetails}>
        <label className={styles['wide-field']}>
          <span>Necesidad / qué resuelve</span>
          <textarea
            value={need}
            onChange={(event) => setNeed(event.target.value)}
            maxLength={500}
            rows={2}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label>
          <span>Cantidad</span>
          <input
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            maxLength={80}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label>
          <span>Categoría</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={120}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label>
          <span>Moneda</span>
          <input
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            placeholder="ARS"
            maxLength={3}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label>
          <span>Precio estimado</span>
          <input
            value={estimatedPrice}
            onChange={(event) => setEstimatedPrice(event.target.value)}
            inputMode="decimal"
            placeholder="Ej. 150000"
            disabled={!writesEnabled || saving}
          />
        </label>

        <label>
          <span>Precio objetivo</span>
          <input
            value={targetPrice}
            onChange={(event) => setTargetPrice(event.target.value)}
            inputMode="decimal"
            placeholder="Opcional"
            disabled={!writesEnabled || saving}
          />
        </label>

        <label className={styles['wide-field']}>
          <span>Compro si…</span>
          <textarea
            value={purchaseCondition}
            onChange={(event) => setPurchaseCondition(event.target.value)}
            maxLength={500}
            rows={2}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label className={styles['wide-field']}>
          <span>Notas</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={5000}
            rows={3}
            disabled={!writesEnabled || saving}
          />
        </label>

        <label className={styles['wide-field']}>
          <span>Links candidatos · uno por línea</span>
          <textarea
            value={candidateLinks}
            onChange={(event) => setCandidateLinks(event.target.value)}
            rows={3}
            placeholder="https://…"
            disabled={!writesEnabled || saving}
          />
        </label>

        <label className={styles['focus-field']}>
          <input
            type="checkbox"
            checked={focus}
            onChange={(event) => setFocus(event.target.checked)}
            disabled={!writesEnabled || saving}
          />
          <span>En foco</span>
        </label>

        <div className={styles['detail-actions']}>
          <button type="submit" disabled={!writesEnabled || saving}>
            {saving ? 'Guardando…' : 'Guardar detalles'}
          </button>
        </div>
      </form>

      {financeImpact ? <PersonalShoppingFinanceImpactPanel impact={financeImpact} /> : null}

      <div className={styles['lifecycle-section']}>
        <div>
          <span className={styles.eyebrow}>Lifecycle</span>
          <strong>
            {item.state === 'PURCHASED' || item.state === 'DISCARDED' ? 'Restaurar' : 'Decidir'}
          </strong>
        </div>
        <div className={styles['transition-actions']}>
          {TRANSITION_OPTIONS[item.state].map((option) => (
            <button
              key={option.state}
              type="button"
              data-tone={option.tone}
              disabled={!writesEnabled || saving}
              onClick={() => void transition(option.state)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles['detail-dates']}>
        {created ? <span>Creado: {created}</span> : null}
        {updated ? <span>Actualizado: {updated}</span> : null}
        {closed ? (
          <span>
            {item.state === 'PURCHASED' ? 'Comprado' : 'Descartado'}: {closed}
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export function PersonalShoppingWorkspace({
  initialSnapshot,
  writesEnabled,
  financeContext,
}: {
  initialSnapshot: PersonalShoppingSnapshot;
  writesEnabled: boolean;
  financeContext: PersonalShoppingFinanceContext;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [tab, setTab] = useState<ShoppingTab>('BUY');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [addState, setAddState] = useState<PersonalShoppingActiveState>('BUY');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return snapshot.items.filter((item) => {
      if (!belongsToTab(item, tab)) return false;
      if (!normalized) return true;
      return [
        item.title,
        item.need,
        item.category,
        item.notes,
        item.purchaseCondition,
        ...item.candidateLinks,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es').includes(normalized));
    });
  }, [query, snapshot.items, tab]);

  function chooseTab(next: ShoppingTab) {
    setTab(next);
    setOpenItemId(null);
    if (next !== 'HISTORY') setAddState(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writesEnabled || saving) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setNotice('Escribí qué querés comprar o investigar.');
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const result = await postMutation({
        action: 'add',
        title: nextTitle,
        state: addState,
        operationId: crypto.randomUUID(),
      });
      if (!result.ok || !result.snapshot) {
        setNotice(result.message ?? 'No se pudo agregar. Probá de nuevo.');
        return;
      }
      setSnapshot(result.snapshot);
      setTitle('');
      setTab(addState);
      setNotice(result.code === 'existing' ? 'Ese ítem ya estaba abierto.' : null);
    } catch {
      setNotice('No se pudo conectar con Compras. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function applyTransition(
    nextSnapshot: PersonalShoppingSnapshot,
    nextState: PersonalPurchaseState,
  ) {
    setSnapshot(nextSnapshot);
    setOpenItemId(null);
    if (nextState === 'PURCHASED' || nextState === 'DISCARDED') {
      setTab('HISTORY');
    } else {
      setTab(nextState);
      setAddState(nextState);
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.capture} aria-labelledby="personal-shopping-capture-title">
        <div>
          <span className={styles.eyebrow}>Captura rápida</span>
          <h2 id="personal-shopping-capture-title">¿Qué querés resolver?</h2>
          <p>Agregalo ahora. Precio, links y detalles pueden esperar.</p>
        </div>

        <form className={styles['capture-form']} onSubmit={submit}>
          <label className={styles['title-field']}>
            <span className="visually-hidden">Compra o necesidad</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej. auriculares para entrenar"
              maxLength={180}
              autoComplete="off"
              disabled={!writesEnabled || saving}
            />
          </label>
          <label className={styles['state-field']}>
            <span className="visually-hidden">Estado inicial</span>
            <select
              value={addState}
              onChange={(event) => setAddState(event.target.value as PersonalShoppingActiveState)}
              disabled={!writesEnabled || saving}
            >
              <option value="BUY">Comprar</option>
              <option value="RESEARCH">Investigar</option>
              <option value="REPLENISH">Reponer</option>
            </select>
          </label>
          <button
            className={styles['add-button']}
            type="submit"
            disabled={!writesEnabled || saving}
          >
            <Plus size={17} aria-hidden="true" />
            <span>{saving ? 'Guardando…' : 'Agregar'}</span>
          </button>
        </form>

        {!writesEnabled ? (
          <p className={styles.notice}>
            La lista está en modo lectura mientras se habilita el nuevo store.
          </p>
        ) : notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
      </section>

      <nav className={styles.tabs} aria-label="Estados de compras personales" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.value}
            id={`personal-shopping-tab-${item.value.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            aria-controls="personal-shopping-list-panel"
            onClick={() => chooseTab(item.value)}
          >
            <span>{item.label}</span>
            <strong>{tabCount(snapshot, item.value)}</strong>
          </button>
        ))}
      </nav>

      <section
        className={styles.list}
        id="personal-shopping-list-panel"
        role="tabpanel"
        aria-labelledby={`personal-shopping-tab-${tab.toLowerCase()}`}
      >
        <div className={styles['list-header']}>
          <div>
            <span className={styles.eyebrow}>Mis compras</span>
            <h2 id="personal-shopping-list-title">
              {TABS.find((item) => item.value === tab)?.label}
            </h2>
          </div>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Buscar en mis compras</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              type="search"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>{query ? 'No encontramos coincidencias' : 'Nada pendiente acá'}</strong>
              <p>
                {query
                  ? 'Probá otra búsqueda o cambiá de sección.'
                  : tab === 'HISTORY'
                    ? 'Las compras y descartes terminados van a aparecer acá.'
                    : 'Podés agregar algo cuando aparezca una necesidad real.'}
              </p>
            </div>
          </div>
        ) : (
          <ul className={styles.items}>
            {visible.map((item) => {
              const price = formatPrice(item);
              const isOpen = openItemId === item.id;
              return (
                <li key={item.id}>
                  <div className={styles['item-row']}>
                    <div className={styles['item-main']}>
                      <div className={styles['item-title']}>
                        <strong>{item.title}</strong>
                        {item.focus ? <span>En foco</span> : null}
                      </div>
                      <div className={styles.meta}>
                        <span>{STATE_LABELS[item.state]}</span>
                        {item.category ? <span>{item.category}</span> : null}
                        {price ? <span>{price} estimado</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles['detail-button']}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? `personal-shopping-detail-${item.id}` : undefined}
                      onClick={() => setOpenItemId(isOpen ? null : item.id)}
                    >
                      {isOpen ? 'Cerrar detalle' : 'Ver detalle'}
                    </button>
                  </div>
                  {isOpen ? (
                    <PersonalShoppingDetail
                      item={item}
                      writesEnabled={writesEnabled}
                      financeContext={financeContext}
                      onSnapshot={setSnapshot}
                      onTransition={applyTransition}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
