import styles from './HealthTrendChart.module.scss';

interface HealthTrendChartProps {
  values: readonly (number | null)[];
  baseline: number | null;
  label: string;
}

const WIDTH = 320;
const HEIGHT = 96;
const PAD = 8;

function toPoint(value: number, index: number, length: number, min: number, max: number): string {
  const x = length <= 1 ? WIDTH / 2 : PAD + (index / (length - 1)) * (WIDTH - PAD * 2);
  const spread = max - min;
  const normalized = spread === 0 ? 0.5 : (value - min) / spread;
  const y = HEIGHT - PAD - normalized * (HEIGHT - PAD * 2);
  return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
}

function buildSegments(
  values: readonly (number | null)[],
  min: number,
  max: number,
): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(toPoint(value, index, values.length, min, max));
  });

  if (current.length > 1) segments.push(current.join(' '));
  return segments;
}

export function HealthTrendChart({ values, baseline, label }: HealthTrendChartProps) {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const scaleValues = baseline === null ? present : [...present, baseline];

  if (present.length === 0 || scaleValues.length === 0) {
    return <div className={styles.empty}>Sin serie disponible</div>;
  }

  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  const segments = buildSegments(values, min, max);
  const baselineY =
    baseline === null ? null : Number(toPoint(baseline, 0, 1, min, max).split(',')[1]);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        {baselineY !== null ? (
          <line
            className={styles.baseline}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={baselineY}
            y2={baselineY}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {segments.map((points) => (
          <polyline
            key={points}
            className={styles.line}
            points={points}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {present.length === 1 ? (
          <circle
            className={styles.dot}
            cx={WIDTH / 2}
            cy={Number(toPoint(present[0], 0, 1, min, max).split(',')[1])}
            r="3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {baseline !== null ? <span className={styles.legend}>Línea punteada: baseline 30 días</span> : null}
    </div>
  );
}
