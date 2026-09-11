'use client';

import { Film, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MediaDashboardView } from '@/components/media/MediaDashboard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  deriveFocusTitles,
  focusLimit,
  type MediaFocusLevel,
} from '@/lib/media/focus';
import type { MediaDashboardData, MediaKind, MediaTitleView } from '@/types/media';

import styles from './MediaDashboard.module.scss';

const FOCUS_LEVELS: MediaFocusLevel[] = [1, 2, 3];

function score(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function commitmentLabel(item: MediaTitleView): string | null {
  if (item.medium === 'movie') {
    return item.runtimeMinutes === null ? null : `${Math.round(item.runtimeMinutes)} min`;
  }

  const parts: string[] = [];
  if (item.runtimeMinutes !== null) parts.push(`${Math.round(item.runtimeMinutes)} min/ep`);
  if (item.seasons !== null) parts.push(`${item.seasons} temp.`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function levelPurpose(level: MediaFocusLevel): string {
  if (level === 1) return 'decidir rápido';
  if (level === 2) return 'más variedad';
  return 'explorar tranquilo';
}

interface MediaFocusDashboardProps {
  data: MediaDashboardData;
}

export function MediaFocusDashboard({ data }: MediaFocusDashboardProps) {
  const firstReadyMedium =
    data.sources.find((source) => source.state === 'ready')?.medium ?? 'movie';
  const [medium, setMedium] = useState<MediaKind>(firstReadyMedium);
  const [level, setLevel] = useState<MediaFocusLevel>(1);
  const [exploring, setExploring] = useState(false);

  const focusByLevel = useMemo(
    () =>
      new Map(
        FOCUS_LEVELS.map((focusLevel) => [
          focusLevel,
          deriveFocusTitles(data.titles, medium, focusLevel),
        ]),
      ),
    [data.titles, medium],
  );

  const focus = focusByLevel.get(level) ?? [];

  function switchMedium(next: MediaKind) {
    setMedium(next);
    setLevel(1);
  }

  if (data.status === 'unavailable') {
    return <MediaDashboardView data={data} />;
  }

  if (exploring) {
    return (
      <div className={styles.stack}>
        <section className={styles.hero} aria-label="Explorador completo">
          <p className={styles['bank-principle']}>
            <strong>Estás explorando el Banco completo.</strong> Nada de esto es una lista de
            pendientes.
          </p>
          <div>
            <button
              type="button"
              className={styles['empty-action']}
              onClick={() => setExploring(false)}
            >
              Volver a Foco
            </button>
          </div>
        </section>
        <MediaDashboardView data={data} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {data.notice ? <p className={styles.notice}>{data.notice}</p> : null}

      <section className={styles.hero} aria-label="Foco de Media">
        <div className={styles['medium-tabs']} role="tablist" aria-label="Tipo de contenido">
          <button
            type="button"
            role="tab"
            aria-selected={medium === 'movie'}
            className={styles['medium-tab']}
            data-active={medium === 'movie'}
            onClick={() => switchMedium('movie')}
          >
            <Film size={17} aria-hidden="true" />
            Películas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={medium === 'series'}
            className={styles['medium-tab']}
            data-active={medium === 'series'}
            onClick={() => switchMedium('series')}
          >
            <Tv size={17} aria-hidden="true" />
            Series
          </button>
        </div>

        <p className={styles['bank-principle']}>
          <strong>Foco reduce opciones sin borrar nada.</strong> Cada nivel contiene al anterior;
          ampliá sólo cuando quieras más variedad.
        </p>

        <div className={styles['collection-tabs']} role="group" aria-label="Nivel de Foco">
          {FOCUS_LEVELS.map((focusLevel) => {
            const count = focusByLevel.get(focusLevel)?.length ?? 0;
            return (
              <button
                key={focusLevel}
                type="button"
                className={styles.chip}
                data-active={level === focusLevel}
                aria-pressed={level === focusLevel}
                onClick={() => setLevel(focusLevel)}
              >
                Foco {focusLevel} · {count}
              </button>
            );
          })}
        </div>
      </section>

      <div className={styles['result-header']}>
        <div>
          <strong>Foco {level}</strong>
          <span>
            {' '}
            · {levelPurpose(level)} · hasta {focusLimit(medium, level)} opciones
          </span>
        </div>
        <span className={styles['score-note']}>
          Es una vista derivada: el Banco completo sigue intacto.
        </span>
      </div>

      {focus.length === 0 ? (
        <EmptyState
          icon={medium === 'movie' ? Film : Tv}
          title="No hay opciones elegibles en este Foco"
          description="El Banco no se modificó. Podés abrir el explorador completo para revisar todo."
          action={
            <button
              type="button"
              className={styles['empty-action']}
              onClick={() => setExploring(true)}
            >
              Explorar Banco completo
            </button>
          }
        />
      ) : (
        <section className={styles.grid} aria-label={`Foco ${level}`}>
          {focus.map((item, index) => {
            const commitment = commitmentLabel(item);
            const guidance = item.whatToExpect ?? item.spoilerFreeSummary;

            return (
              <article key={item.key} className={styles['title-card']}>
                <div className={styles['title-top']}>
                  <div className={styles['title-block']}>
                    <h2>{item.title}</h2>
                    {item.originalTitle && item.originalTitle !== item.title ? (
                      <p className={styles['original-title']}>{item.originalTitle}</p>
                    ) : null}
                  </div>
                  {item.year !== null ? <span className={styles.year}>{item.year}</span> : null}
                </div>

                <div className={styles.badges}>
                  {index === 0 ? <Badge domain="projects">Primera del Foco</Badge> : null}
                  {item.radar ? <Badge domain="projects">Radar</Badge> : null}
                  {item.bankTier ? <Badge variant="outline">Tier {item.bankTier}</Badge> : null}
                </div>

                <div className={styles.meta}>
                  {item.creator ? <span>{item.creator}</span> : null}
                  {commitment ? <span>{commitment}</span> : null}
                  {item.countries.length > 0 ? <span>{item.countries.join(', ')}</span> : null}
                </div>

                {item.genres.length > 0 ? (
                  <div className={styles.genres}>
                    {item.genres.slice(0, 3).map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                  </div>
                ) : null}

                {guidance ? (
                  <div className={styles.experience}>
                    <div className={styles['experience-block']}>
                      <span className={styles['experience-label']}>Para elegir</span>
                      <p>{guidance}</p>
                    </div>
                  </div>
                ) : null}

                {item.cinephileValue !== null || item.culturalImpact !== null ? (
                  <div className={styles.scores}>
                    <div className={styles['inferred-scores']}>
                      {item.cinephileValue !== null ? (
                        <span>
                          Cinéfilo <strong>{score(item.cinephileValue)}</strong>
                        </span>
                      ) : null}
                      {item.culturalImpact !== null ? (
                        <span>
                          Impacto <strong>{score(item.culturalImpact)}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}

      <section className={styles.controls} aria-label="Banco completo">
        <p className={styles['bank-principle']}>
          ¿Querés salir de estos niveles? El resto sigue disponible, sólo está fuera de vista para
          reducir ruido.
        </p>
        <div>
          <button
            type="button"
            className={styles['empty-action']}
            onClick={() => setExploring(true)}
          >
            Explorar Banco completo
          </button>
        </div>
      </section>
    </div>
  );
}
