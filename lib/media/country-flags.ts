const COUNTRY_CODES: Record<string, string> = {
  Alemania: 'DE',
  'Antillas Neerlandesas': 'AN',
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Brasil: 'BR',
  Bélgica: 'BE',
  Canada: 'CA',
  Canadá: 'CA',
  Catar: 'QA',
  China: 'CN',
  Chipre: 'CY',
  Colombia: 'CO',
  'Corea del Sur': 'KR',
  'Czech Republic': 'CZ',
  Dinamarca: 'DK',
  España: 'ES',
  'Estados Unidos': 'US',
  Finlandia: 'FI',
  Francia: 'FR',
  Grecia: 'GR',
  'Hong Kong': 'HK',
  India: 'IN',
  Irlanda: 'IE',
  Italia: 'IT',
  Japón: 'JP',
  Kenia: 'KE',
  Letonia: 'LV',
  Luxembourg: 'LU',
  Luxemburgo: 'LU',
  México: 'MX',
  Noruega: 'NO',
  'Nueva Zelanda': 'NZ',
  Paraguay: 'PY',
  'Países Bajos': 'NL',
  Polonia: 'PL',
  'Reino Unido': 'GB',
  Sudáfrica: 'ZA',
  Suecia: 'SE',
  Suiza: 'CH',
  Taiwan: 'TW',
  Taiwán: 'TW',
  Turquía: 'TR',
};

function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((character) => String.fromCodePoint(127397 + character.charCodeAt(0)))
    .join('');
}

export interface CountryFlag {
  country: string;
  flag: string | null;
}

/**
 * La Sheet conserva el nombre canónico del país para filtrar/buscar. La card
 * deriva sólo la representación visual; un país no mapeado conserva su texto
 * en vez de desaparecer.
 */
export function countryFlags(countries: string[]): CountryFlag[] {
  return countries.map((country) => ({
    country,
    flag: COUNTRY_CODES[country] ? flagEmoji(COUNTRY_CODES[country]) : null,
  }));
}
