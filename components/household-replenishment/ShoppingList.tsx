'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import {
  attachHouseholdReconnectSync,
  fetchCanonicalHouseholdSnapshot,
  HttpHouseholdMutationTransport,
  IndexedDbHouseholdMutationOutboxStore,
  type HouseholdReconnectController,
} from '@/lib/household-replenishment/browser-offline';
import {
  applyOptimisticHouseholdMutation,
  type HouseholdMutation,
  type HouseholdMutationFlushResult,
} from '@/lib/household-replenishment/offline-sync';
import type {
  ReplenishmentListEntry,
  ReplenishmentSnapshot,
  UserCorrectionType,
} from '@/lib/household-replenishment/types';

import styles from './ShoppingList.module.scss';

const mutationStore = new IndexedDbHouseholdMutationOutboxStore();
const mutationTransport = new HttpHouseholdMutationTransport();

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function confidenceLabel(entry: Pick<ReplenishmentListEntry, 'confidence'>): string {
  if (entry.confidence === 'HIGH') return 'Confianza alta';
  if (entry.confidence === 'MEDIUM') return 'Confianza media';
  return 'Aprendiendo';
}

export function ShoppingList({ initialSnapshot }: { initialSnapshot: ReplenishmentSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(initialSnapshot);
  const reconnectSync = useRef<HouseholdReconnectController | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Otros');
  const [cadence, setCadence] = useState('');
  const [storeDraft, setStoreDraft] = useState(
    initialSnapshot.shoppingPreferences.defaultStore ?? '',
  );
  const [categoryOrderDraft, setCategoryOrderDraft] = useState(
    initialSnapshot.shoppingPreferences.categoryOrder,
  );
  const [variantDrafts, setVariantDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [supermarketMode, setSupermarketMode] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('Todas');

  const commitSnapshot = useCallback((next: ReplenishmentSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    void mutationStore.saveSnapshot(next).catch(() => undefined);
  }, []);

  const handleFlushResult = useCallback(
    (result: HouseholdMutationFlushResult) => {
      setPendingCount(result.remaining);
      if (result.snapshot) commitSnapshot(result.snapshot);

      if (result.stoppedOn === 'transport-error' && result.remaining > 0) {
        const plural = result.remaining === 1 ? '' : 's';
        setNotice(
          `${result.remaining} cambio${plural} guardado${plural} en este dispositivo. Se sincronizará al volver internet.`,
        );
      } else if (result.stoppedOn === 'conflict') {
        setNotice('Hay un cambio pendiente que necesita volver a intentarse con la lista actual.');
      } else if (result.remaining === 0) {
        setNotice(null);
      }
    },
    [commitSnapshot],
  );

  const refreshCanonical = useCallback(async () => {
    try {
      const pending = await mutationStore.listPendingMutations();
      setPendingCount(pending.length);
      if (pending.length > 0) return;

      const canonical = await fetchCanonicalHouseholdSnapshot();
      if (canonical) commitSnapshot(canonical);
    } catch {
      // El refresco compartido es best-effort; el outbox protege las mutaciones.
    }
  }, [commitSnapshot]);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);

      try {
        const [pending, cached] = await Promise.all([
          mutationStore.listPendingMutations(),
          mutationStore.loadSnapshot(),
        ]);
        if (!active) return;

        setPendingCount(pending.length);
        const compatibleCached = cached
          ? {
              ...initialSnapshot,
              ...cached,
              shoppingPreferences:
                cached.shoppingPreferences ?? initialSnapshot.shoppingPreferences,
              quality: cached.quality ?? initialSnapshot.quality,
            }
          : null;
        let base = !isOnline && compatibleCached ? compatibleCached : initialSnapshot;
        for (const entry of pending) {
          base = applyOptimisticHouseholdMutation(base, entry.mutation);
        }
        commitSnapshot(base);
      } catch {
        // Si IndexedDB no está disponible, la vista online sigue siendo utilizable.
      }

      reconnectSync.current = attachHouseholdReconnectSync(
        mutationStore,
        mutationTransport,
        handleFlushResult,
      );
    };

    void initialize();

    return () => {
      active = false;
      reconnectSync.current?.dispose();
      reconnectSync.current = null;
    };
  }, [commitSnapshot, handleFlushResult, initialSnapshot]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onFocus = () => {
      if (navigator.onLine) void refreshCanonical();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refreshCanonical();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const interval = window.setInterval(() => {
      if (navigator.onLine) void refreshCanonical();
    }, 15_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [refreshCanonical]);

  async function mutate(payload: HouseholdMutation) {
    setSaving(true);
    setNotice(null);

    try {
      await mutationStore.persistMutation(payload);
      commitSnapshot(applyOptimisticHouseholdMutation(snapshotRef.current, payload));

      const pending = await mutationStore.listPendingMutations();
      setPendingCount(pending.length);

      if (reconnectSync.current) {
        await reconnectSync.current.flushNow();
      } else {
        setNotice('Cambio guardado en este dispositivo. Se sincronizará en cuanto sea posible.');
      }
    } catch {
      setNotice('No se pudo guardar el cambio ni siquiera localmente. Probá de nuevo.');
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
      category,
      seedIntervalDays: Number.isFinite(selectedCadence) ? selectedCadence : null,
      operationId: crypto.randomUUID(),
    });
    setName('');
    setCadence('');
  }

  async function addExistingNeed(needId: string) {
    await mutate({
      action: 'add-existing',
      needId,
      operationId: crypto.randomUUID(),
    });
  }

  async function markBought(needId: string) {
    const variantName = variantDrafts[needId]?.trim() || null;
    await mutate({
      action: 'bought',
      needId,
      variantName,
      operationId: crypto.randomUUID(),
    });
  }

  async function correct(needId: string, type: UserCorrectionType) {
    await mutate({ action: 'correct', needId, type, operationId: crypto.randomUUID() });
  }

  async function changeCategory(needId: string, nextCategory: string) {
    await mutate({
      action: 'categorize',
      needId,
      category: nextCategory,
      operationId: crypto.randomUUID(),
    });
  }

  function moveCategory(index: number, direction: -1 | 1) {
    setCategoryOrderDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const currentValue = next[index];
      const targetValue = next[nextIndex];
      if (currentValue == null || targetValue == null) return current;
      next[index] = targetValue;
      next[nextIndex] = currentValue;
      return next;
    });
  }

  async function saveShoppingPreferences() {
    await mutate({
      action: 'preferences',
      defaultStore: storeDraft.trim() || null,
      categoryOrder: categoryOrderDraft,
      operationId: crypto.randomUUID(),
    });
  }

  const qualityLabel =
    snapshot.quality.status === 'CALIBRATION_READY'
      ? 'Ya hay evidencia para calibrar'
      : snapshot.quality.status === 'COLLECTING'
        ? 'Juntando evidencia real'
        : 'Todavía sin historial suficiente';

  const catalogCategories = snapshot.shoppingPreferences.categoryOrder.filter((candidate) =>
    snapshot.catalog.some((entry) => entry.category === candidate),
  );
  const normalizedCatalogSearch = catalogSearch.trim().toLocaleLowerCase('es');
  const filteredCatalog = snapshot.catalog.filter((entry) => {
    const categoryMatches = catalogCategory === 'Todas' || entry.category === catalogCategory;
    const searchMatches =
      normalizedCatalogSearch.length === 0 ||
      entry.name.toLocaleLowerCase('es').includes(normalizedCatalogSearch);
    return categoryMatches && searchMatches;
  });

  const workspaceClassName = supermarketMode
    ? `${styles.workspace} ${styles['supermarket-mode']}`
    : styles.workspace;

  return (
    <div className={workspaceClassName}>
      <section className={styles['mode-toolbar']} aria-label="Modo de compra">
        <div>
          <strong>
            {supermarketMode && snapshot.shoppingPreferences.defaultStore
              ? `Modo súper · ${snapshot.shoppingPreferences.defaultStore}`
              : supermarketMode
                ? 'Modo súper activo'
                : 'Lista compartida'}
          </strong>
          <span>
            {online ? 'En línea' : 'Sin conexión'}
            {pendingCount > 0
              ? ` · ${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`
              : ' · Todo sincronizado'}
          </span>
        </div>
        <button
          type="button"
          aria-pressed={supermarketMode}
          onClick={() => setSupermarketMode((current) => !current)}
        >
          {supermarketMode ? 'Salir del modo súper' : 'Modo súper'}
        </button>
      </section>

      {!supermarketMode ? (
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
              <span>Categoría</span>
              <select
                value={category}
                disabled={saving}
                onChange={(event) => setCategory(event.target.value)}
              >
                {snapshot.shoppingPreferences.categoryOrder.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
      ) : null}

      {!supermarketMode ? (
        <details className={styles['settings-card']}>
          <summary>Orden del súper y recorrido</summary>
          <div className={styles['settings-body']}>
            <label className={styles.field}>
              <span>Supermercado habitual (opcional)</span>
              <input
                value={storeDraft}
                maxLength={80}
                disabled={saving}
                placeholder="Ej. Carrefour, Disco, Mariano Max"
                onChange={(event) => setStoreDraft(event.target.value)}
              />
            </label>

            <div className={styles['category-order']}>
              <span className={styles['settings-label']}>Orden de categorías</span>
              <ol>
                {categoryOrderDraft.map((item, index) => (
                  <li key={item}>
                    <span>{item}</span>
                    <div>
                      <button
                        type="button"
                        disabled={saving || index === 0}
                        aria-label={`Subir ${item}`}
                        onClick={() => moveCategory(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={saving || index === categoryOrderDraft.length - 1}
                        aria-label={`Bajar ${item}`}
                        onClick={() => moveCategory(index, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <button
              type="button"
              className={styles['primary-button']}
              disabled={saving}
              onClick={() => void saveShoppingPreferences()}
            >
              Guardar recorrido
            </button>
          </div>
        </details>
      ) : null}

      {!supermarketMode ? (
        <details className={styles['catalog-card']} open>
          <summary>
            <span>Mis productos</span>
            <span className={styles['catalog-count']}>{snapshot.catalog.length}</span>
          </summary>

          <div className={styles['catalog-body']}>
            <div className={styles['catalog-filters']}>
              <label className={styles.field}>
                <span>Buscar</span>
                <input
                  type="search"
                  value={catalogSearch}
                  placeholder="Ej. papel higiénico, huevos, yerba…"
                  onChange={(event) => setCatalogSearch(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Categoría</span>
                <select
                  value={catalogCategory}
                  onChange={(event) => setCatalogCategory(event.target.value)}
                >
                  <option value="Todas">Todas</option>
                  {catalogCategories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className={styles['catalog-helper']}>
              Acá están todas tus necesidades recurrentes. Agregar a Comprar no crea otro producto:
              usa la misma necesidad y conserva su historial.
            </p>

            {filteredCatalog.length === 0 ? (
              <p className={styles['watch-empty']}>No hay productos que coincidan con ese filtro.</p>
            ) : (
              <ul className={styles['catalog-list']}>
                {filteredCatalog.map((entry) => (
                  <li key={entry.needId}>
                    <div className={styles['catalog-product']}>
                      <div>
                        <strong>{entry.name}</strong>
                        <span className={styles.category}>{entry.category}</span>
                      </div>
                      <div className={styles.meta}>
                        <span>{confidenceLabel(entry)}</span>
                        {entry.lastPurchasedAt ? (
                          <span>Última compra: {formatDate(entry.lastPurchasedAt)}</span>
                        ) : (
                          <span>Sin compras registradas todavía</span>
                        )}
                      </div>
                    </div>

                    <div className={styles['catalog-action']}>
                      {entry.status === 'BUY' ? (
                        <span className={styles['catalog-status']}>En Comprar</span>
                      ) : entry.status === 'WATCH' ? (
                        <>
                          <span className={styles['catalog-status']}>Quizás pronto</span>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void addExistingNeed(entry.needId)}
                          >
                            Agregar a Comprar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void addExistingNeed(entry.needId)}
                        >
                          Agregar a Comprar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="comprar">
        <div className={styles['section-header']}>
          <div>
            <p className={styles.eyebrow}>{supermarketMode ? 'Recorré y marcá' : 'Lista activa'}</p>
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
                    {supermarketMode ? (
                      <span className={styles.category}>{entry.category}</span>
                    ) : (
                      <select
                        className={styles['category-select']}
                        value={entry.category}
                        disabled={saving}
                        aria-label={`Categoría de ${entry.name}`}
                        onChange={(event) => void changeCategory(entry.needId, event.target.value)}
                      >
                        {snapshot.shoppingPreferences.categoryOrder.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {!supermarketMode ? <p>{entry.reason}</p> : null}
                  {!supermarketMode ? (
                    <div className={styles.meta}>
                      <span>{confidenceLabel(entry)}</span>
                      {formatDate(entry.nextExpectedAt) ? (
                        <span>Estimado: {formatDate(entry.nextExpectedAt)}</span>
                      ) : null}
                      {entry.lastPurchasedVariantName ? (
                        <span>Última variante: {entry.lastPurchasedVariantName}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles['purchase-panel']}>
                  <label className={styles['variant-field']}>
                    <span>Marca / tamaño (opcional)</span>
                    <input
                      value={variantDrafts[entry.needId] ?? ''}
                      list={entry.variants.length > 0 ? `variants-${entry.needId}` : undefined}
                      maxLength={100}
                      disabled={saving}
                      placeholder={entry.lastPurchasedVariantName ?? 'Ej. Skip 3L'}
                      onChange={(event) =>
                        setVariantDrafts((current) => ({
                          ...current,
                          [entry.needId]: event.target.value,
                        }))
                      }
                    />
                    {entry.variants.length > 0 ? (
                      <datalist id={`variants-${entry.needId}`}>
                        {entry.variants.map((variant) => (
                          <option key={variant.id} value={variant.name} />
                        ))}
                      </datalist>
                    ) : null}
                  </label>

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
                    {!supermarketMode ? (
                      <>
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
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!supermarketMode ? (
        <section className={styles['quality-card']} aria-labelledby="calidad-aprendizaje">
          <div className={styles['section-header']}>
            <div>
              <p className={styles.eyebrow}>Uso real y aprendizaje</p>
              <h2 id="calidad-aprendizaje">Calidad del aprendizaje</h2>
            </div>
            <span className={styles['quality-status']}>{qualityLabel}</span>
          </div>

          <div className={styles['quality-grid']}>
            <div>
              <strong>{snapshot.quality.activeNeeds}</strong>
              <span>necesidades activas</span>
            </div>
            <div>
              <strong>{snapshot.quality.needsWithPurchases}</strong>
              <span>con compras reales</span>
            </div>
            <div>
              <strong>{snapshot.quality.evaluatedPredictions}</strong>
              <span>predicciones evaluables</span>
            </div>
            <div>
              <strong>
                {snapshot.quality.medianAbsoluteErrorDays == null
                  ? '—'
                  : `${snapshot.quality.medianAbsoluteErrorDays} d`}
              </strong>
              <span>error mediano</span>
            </div>
          </div>

          {snapshot.quality.withinToleranceRate == null ? (
            <p>
              El sistema ya está en uso real. Para calibrar las predicciones necesitamos varias
              compras por necesidad y dejar que el historial se forme con tu uso cotidiano.
            </p>
          ) : (
            <p>
              {Math.round(snapshot.quality.withinToleranceRate * 100)}% de las predicciones
              históricas quedó dentro de la tolerancia. Tempranas: {snapshot.quality.earlyCount} ·
              tardías: {snapshot.quality.lateCount}.
            </p>
          )}
        </section>
      ) : null}

      {!supermarketMode ? (
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
      ) : null}
    </div>
  );
}
