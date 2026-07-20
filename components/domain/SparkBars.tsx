import styles from './SparkBars.module.scss';

/** Barras compactas para series (null = hueco). */
export function SparkBars({
  values,
  label,
  domain = 'neutral',
}: {
  values: readonly (number | boolean | null)[];
  label: string;
  domain?: string;
}) {
  const numeric = values.map((value) => {
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0.15;
    return value;
  });
  const max = Math.max(...numeric.filter((v): v is number => v !== null && v > 0), 1);

  return (
    <div className={styles.root} role="img" aria-label={label} data-domain={domain}>
      {numeric.map((value, index) => (
        <span
          key={index}
          className={styles.bar}
          data-empty={value === null || undefined}
          style={
            value === null
              ? undefined
              : { height: `${Math.max(12, Math.round((value / max) * 100))}%` }
          }
        />
      ))}
    </div>
  );
}
