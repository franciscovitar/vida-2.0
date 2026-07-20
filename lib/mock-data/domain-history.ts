/**
 * Historial simulado para páginas de dominio en modo mock.
 * Determinista a partir de `today` (YYYY-MM-DD).
 */
import { RD, REGISTRO_DIARIO_HEADERS, SAL, SALUD_HEADERS } from '@/lib/google/constants';
import { addDaysYmd } from '@/lib/adapters/dates';
import { parseRegistroDiario, type RegistroRecord } from '@/lib/adapters/registro-diario';
import { parseSalud, type SaludRecord } from '@/lib/adapters/salud';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

/** Genera ~40 días de registro + salud para demos 7/30/90. */
export function buildMockDomainRecords(today: string): {
  registro: RegistroRecord[];
  salud: SaludRecord[];
} {
  const registroRows: unknown[][] = [[...REGISTRO_DIARIO_HEADERS]];
  const saludRows: unknown[][] = [[...SALUD_HEADERS]];

  for (let i = 45; i >= 0; i -= 1) {
    const date = addDaysYmd(today, -i);
    const day = Number.parseInt(date.slice(-2), 10);
    const gym = day % 3 === 0;
    const cardio = day % 4 === 0;
    const hasAw = i % 5 !== 0;

    registroRows.push(
      rowFor(REGISTRO_DIARIO_HEADERS, {
        [RD.fecha]: date,
        [RD.sleep]: 6.5 + (day % 3) * 0.5,
        [RD.energy]: 3 + (day % 3),
        [RD.mood]: 3,
        [RD.firstAlarm]: day % 2 === 0,
        [RD.bed]: true,
        [RD.shower]: day % 3 !== 0,
        [RD.posture]: day % 2 === 1,
        [RD.gym]: gym,
        [RD.cardio]: cardio,
        [RD.stretch]: gym,
        [RD.mealPrep]: day % 7 === 0,
        [RD.journaling]: day % 2 === 0,
        [RD.football]: day % 5 === 0,
        [RD.work]: hasAw ? 60 + (day % 5) * 20 : '',
        [RD.faculty]: hasAw ? (day % 3) * 30 : '',
        [RD.vida2]: hasAw ? 20 + (day % 4) * 10 : '',
        [RD.leisure]: hasAw ? (day % 2 === 0 ? 0 : 45) : '',
        [RD.pcActive]: hasAw ? 180 + day * 3 : '',
        [RD.pcAway]: hasAw ? 30 : '',
        [RD.unclassified]: hasAw ? 15 : '',
        [RD.screen]: hasAw ? 200 : '',
      }),
    );

    const partial = i === 0 && day % 2 === 0;
    if (i % 6 !== 1) {
      saludRows.push(
        rowFor(SALUD_HEADERS, {
          [SAL.fecha]: date,
          [SAL.sleep]: 6.8 + (day % 4) * 0.3,
          [SAL.deepSleep]: 1.2 + (day % 3) * 0.2,
          [SAL.remSleep]: 1.5,
          [SAL.steps]: day % 7 === 0 ? 0 : 5000 + day * 120,
          [SAL.activeCalories]: 300 + day * 5,
          [SAL.restingHr]: 54 + (day % 5),
          [SAL.meanHr]: 72,
          [SAL.hrv]: day % 3 === 0 ? 45 + (day % 10) : '',
          [SAL.workout]: gym ? 'Fuerza' : '',
          [SAL.importStatus]: partial ? 'parcial' : 'completo',
        }),
      );
    }
  }

  // Fila futura precreada (no debe contar).
  registroRows.push(
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: addDaysYmd(today, 3),
      [RD.gym]: true,
      [RD.energy]: 1,
    }),
  );

  return {
    registro: parseRegistroDiario(registroRows),
    salud: parseSalud(saludRows),
  };
}
