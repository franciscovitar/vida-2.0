import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countryFlags } from '@/lib/media/country-flags';

test('países canónicos conocidos se muestran como banderas sin perder su etiqueta accesible', () => {
  const flags = countryFlags(['Argentina', 'Corea del Sur', 'Estados Unidos']);
  assert.deepEqual(flags.map((item) => item.flag), ['🇦🇷', '🇰🇷', '🇺🇸']);
  assert.deepEqual(flags.map((item) => item.country), [
    'Argentina',
    'Corea del Sur',
    'Estados Unidos',
  ]);
});

test('un país todavía no mapeado conserva texto como fallback', () => {
  assert.deepEqual(countryFlags(['País desconocido']), [
    { country: 'País desconocido', flag: null },
  ]);
});
