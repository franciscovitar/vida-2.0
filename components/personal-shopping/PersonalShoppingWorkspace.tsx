'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Search } from 'lucide-react';

import type {
  PersonalShoppingActiveState,
  PersonalShoppingSnapshot,
} from '@/lib/personal-shopping/service';
import type { PersonalPurchaseItem } from '@/lib/personal-shopping/types';

import styles from './PersonalShoppingWorkspace.module.scss';

type ShoppingTab = PersonalShoppingActiveState | 'HISTORY';

const TABS: ReadonlyArray<{ value: ShoppingTab; label: string }> = [
  { value: 'BUY', label: 'Comprar' },
  { value: 'RESEARCH', label: 'Investigar' },
  { value: 'REPLENISH', label: 'Reponer' },
  { value: 'HISTORY', label: 'Historial' },
];

const STATE_LABELS: Record<PersonalPurchaseItem['state'], string> = {
  BUY: 'Comprar',
  RESEARCH: 'Investigar',
  REPLENISH: 'Reponer',
  PURCHASED: 'Comprado',
  DISCARDED: 'Descartado',
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

function formatPrice(item: PersonalPurchaseItem): string | null {
  if (item.estimatedPriceMinor == null || !item.currency) return null;
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: item.currency,
      minimumFractionDigits: item.currency === 'ARS' ? 0 : 2,
      maximumFractionDigits: item.currency === 'ARS' ? 0 : 2,
    }).format(item.estimatedPriceMinor / 100);
  } catch {
    return `${item.currency} ${(item.estimatedPriceMinor / 100).toLocaleString('es-AR')}`;
  }
}

export function PersonalShoppingWorkspace({
  initialSnapshot,
  writesEnabled,
}: {
  initialSnapshot: PersonalShoppingSnapshot;
  writesEnabled: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [tab, setTab] = useState<ShoppingTab>('BUY');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [addState, setAddState] = useState<PersonalShoppingActiveState>('BUY');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return snapshot.items.filter((item) => {
      if (!belongsToTab(item, tab)) return false;
      if (!normalized) return true;
      return [item.title, item.need, item.category, item.notes]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es').includes(normalized));
    });
  }, [query, snapshot.items, tab]);

  function chooseTab(next: ShoppingTab) {
    setTab(next);
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
      const response = await fetch('/api/personal-shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          title: nextTitle,
          state: addState,
          operationId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
        snapshot?: PersonalShoppingSnapshot;
      };
      if (!response.ok || !result.ok || !result.snapshot) {
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
            <span className="sr-only">Compra o necesidad</span>
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
            <span className="sr-only">Estado inicial</span>
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

      <nav className={styles.tabs} aria-label="Estados de compras personales">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-current={tab === item.value ? 'page' : undefined}
            onClick={() => chooseTab(item.value)}
          >
            <span>{item.label}</span>
            <strong>{tabCount(snapshot, item.value)}</strong>
          </button>
        ))}
      </nav>

      <section className={styles.list} aria-labelledby="personal-shopping-list-title">
        <div className={styles['list-header']}>
          <div>
            <span className={styles.eyebrow}>Mis compras</span>
            <h2 id="personal-shopping-list-title">
              {TABS.find((item) => item.value === tab)?.label}
            </h2>
          </div>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar en mis compras</span>
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
              return (
                <li key={item.id}>
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
                  <button type="button" className={styles['detail-button']} disabled>
                    Ver detalle
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
