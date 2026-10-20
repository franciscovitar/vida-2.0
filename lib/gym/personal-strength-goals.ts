import type { GymV2ExerciseTrend } from '@/lib/gym/v2-analytics';
import type { GymRoutineSection } from '@/types/gym';

export interface GymPersonalStrengthGoal {
  label: string;
  target: string;
  latestLoad: number | null;
  latestReps: number | null;
  latestDate: string | null;
  provisional: boolean;
}

const GOAL_MATCHERS: Readonly<Record<string, RegExp>> = {
  'jalon al pecho': /jal[oó]n.*pecho/i,
  'remo maquina': /remo.*m[aá]quina/i,
  'press militar maquina': /press militar.*m[aá]quina/i,
  'press pecho maquina': /press (?:de )?(?:banca|pecho).*m[aá]quina/i,
  'biceps sentado': /curl.*b[ií]ceps.*mancuernas?/i,
  'elevaciones laterales': /elevaciones laterales.*mancuernas(?! de pie)/i,
  'hip thrust maquina': /hip[ -]?thrust.*m[aá]quina/i,
  'curl femoral': /curl femoral.*tumbado/i,
  'prensa horizontal': /prensa horizontal/i,
};

function normalizedLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Notion owns goal prescriptions; Sheets owns observed records.
 * Never infer external-strength rankings or ETAs from personal aspirations.
 */
export function buildPersonalStrengthGoals(
  sections: readonly GymRoutineSection[],
  trends: readonly GymV2ExerciseTrend[],
): GymPersonalStrengthGoal[] {
  const section = sections.find(
    (item) => normalizedLabel(item.label) === 'metas personales de fuerza',
  );
  if (!section) return [];

  return section.items.flatMap((item) => {
    const parsed = item.match(/^(.+?)\s+[—–]\s+(.+)$/);
    if (!parsed) return [];
    const label = parsed[1]!.trim();
    const target = parsed[2]!.trim();
    const matcher = GOAL_MATCHERS[normalizedLabel(label)];
    const trend = matcher
      ? trends
          .filter((entry) => matcher.test(entry.exerciseName))
          .sort((a, b) => b.latestDate.localeCompare(a.latestDate))[0]
      : undefined;

    return [
      {
        label,
        target,
        latestLoad: trend?.latestLoad ?? null,
        latestReps: trend?.latestReps ?? null,
        latestDate: trend?.latestDate ?? null,
        provisional: /provisional/i.test(target),
      },
    ];
  });
}
