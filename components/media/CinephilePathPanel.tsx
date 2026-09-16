'use client';

import { Film, Gamepad2, Sparkles, Tv } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useCinephilePath } from '@/components/media/CinephilePathContext';
import type {
  CinephilePathProgress,
  CinephilePathRecommendation,
} from '@/lib/media/cinephile-path';

import styles from './CinephilePathPanel.module.scss';

function percent(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function gain(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface PathCardProps {
  progress: CinephilePathProgress;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

function PathCard({ progress, label, icon: Icon, primary = false }: PathCardProps) {
  return (
    <article className={styles.pathCard} data-primary={primary}>
      <div className={styles.pathHeading}>
        <span className={styles.pathIcon} aria-hidden="true">
          <Icon size={17} />
        </span>
        <div>
          <span>{label}</span>
          <strong>{progress.level}</strong>
        </div>
        <b>{percent(progress.percent)}%</b>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={`Progreso ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <p>
        {progress.percent >= 100
          ? 'Hito amateur alcanzado. Desde acá, explorar es completamente libre.'
          : progress.nextLevel
            ? `Siguiente hito: ${progress.nextLevel}.`
            : 'Tu recorrido sigue sumando sin rachas ni castigos.'}
      </p>
    </article>
  );
}

interface RecommendationColumnProps {
  title: string;
  items: CinephilePathRecommendation[];
}

function RecommendationColumn({ title, items }: RecommendationColumnProps) {
  return (
    <div className={styles.recommendationColumn}>
      <h4>{title}</h4>
      {items.length > 0 ? (
        <div className={styles.recommendationList}>
          {items.map((item) => (
            <article key={item.key} className={styles.recommendation}>
              <div className={styles.recommendationTitle}>
                <strong>{item.title}</strong>
                {item.year !== null ? <span>{item.year}</span> : null}
              </div>
              <p>{item.reason}</p>
              <div className={styles.gains}>
                <span>+{gain(item.mediumGain)} pp en su camino</span>
                <span>+{gain(item.globalGain)} pp global</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyRecommendations}>No hay saltos pendientes en este Banco.</p>
      )}
    </div>
  );
}

export function CinephilePathPanel() {
  const snapshot = useCinephilePath();
  if (!snapshot) return null;

  return (
    <section className={styles.panel} aria-labelledby="cinephile-path-title">
      <header className={styles.header}>
        <div className={styles.eyebrow}>
          <Gamepad2 size={16} aria-hidden="true" /> Camino del cinéfilo
        </div>
        <div className={styles.titleRow}>
          <div>
            <h2 id="cinephile-path-title">Tu mapa audiovisual ya construido</h2>
            <p>
              Acá cuenta lo que ya viste. Las obras más importantes pesan más y también suma haber
              recorrido épocas y géneros distintos. Lo que todavía no viste son opciones, no deuda.
            </p>
          </div>
          <Sparkles size={22} aria-hidden="true" />
        </div>
      </header>

      <div className={styles.pathGrid}>
        <PathCard progress={snapshot.global} label="Global" icon={Sparkles} primary />
        <PathCard progress={snapshot.movie} label="Películas" icon={Film} />
        <PathCard progress={snapshot.series} label="Series" icon={Tv} />
      </div>

      <div className={styles.breakdown}>
        <div>
          <span>Obras fundamentales</span>
          <strong>{percent(snapshot.global.breakdown.foundations)}%</strong>
        </div>
        <div>
          <span>Recorrido histórico</span>
          <strong>{percent(snapshot.global.breakdown.eras)}%</strong>
        </div>
        <div>
          <span>Diversidad de géneros</span>
          <strong>{percent(snapshot.global.breakdown.genres)}%</strong>
        </div>
      </div>

      <div className={styles.explanation}>
        <p>
          <strong>Qué significa 100%:</strong> un hito de cultura audiovisual amateur muy formada,
          deliberadamente por debajo de una formación profesional. El objetivo es ampliar tu mapa,
          no completar todo el catálogo.
        </p>
        <p>
          El hito es fijo: si mañana aparecen nuevas películas o series, tu porcentaje no baja. Las
          novedades sólo pueden cambiar cuáles son las mejores próximas opciones.
        </p>
      </div>

      <div className={styles.recommendations}>
        <div className={styles.recommendationHeading}>
          <div>
            <span>Desde tu Banco</span>
            <h3>Próximos saltos culturales</h3>
          </div>
          <p>Ordenados por cuánto amplían tu camino actual, no por obligación de verlos.</p>
        </div>
        <div className={styles.recommendationGrid}>
          <RecommendationColumn title="Películas" items={snapshot.recommendations.movie} />
          <RecommendationColumn title="Series" items={snapshot.recommendations.series} />
        </div>
      </div>

      <footer className={styles.footer}>
        Modelo {snapshot.version}. Tu gusto personal no altera este progreso: que una obra no te
        guste no borra la cultura que ganaste al verla.
      </footer>
    </section>
  );
}
