import { countryFlags } from '@/lib/media/country-flags';

import styles from './MediaDashboard.module.scss';

interface MediaCountryFlagsProps {
  countries: string[];
}

export function MediaCountryFlags({ countries }: MediaCountryFlagsProps) {
  if (countries.length === 0) return null;

  return (
    <span className={styles['country-flags']} aria-label={`País: ${countries.join(', ')}`}>
      {countryFlags(countries).map(({ country, flag }) => (
        <span key={country} className={styles['country-flag']} title={country}>
          {flag ?? country}
        </span>
      ))}
    </span>
  );
}
