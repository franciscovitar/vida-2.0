import { readFileSync } from 'node:fs';

const files = [
  "components/world/World.module.scss",
  "components/world/WorldTemporal.tsx",
  "lib/world/temporal-contract.ts",
  "data/generated/world/temporal/periods/month/2026-01.json",
  "data/generated/world/temporal/periods/month/2026-02.json",
  "data/generated/world/temporal/periods/month/2026-03.json",
  "data/generated/world/temporal/periods/month/2026-04.json",
  "data/generated/world/temporal/periods/month/2026-05.json",
  "data/generated/world/temporal/periods/month/2026-06.json",
  "data/generated/world/temporal/periods/month/2026-08.json",
  "data/generated/world/temporal/periods/month/2026-09.json",
  "data/generated/world/temporal/periods/week/2026-W37.json",
  "data/generated/world/temporal/periods/week/2026-W38.json",
  "data/generated/world/temporal/periods/week/2026-W39.json",
  "data/generated/world/temporal/periods/week/2026-W40.json",
  "data/generated/world/temporal/periods/year/2025.json"
];

for (const path of files) {
  const content = readFileSync(path);
  console.log(`WORLD_FORMAT_BEGIN ${path}`);
  console.log(content.toString('base64'));
  console.log(`WORLD_FORMAT_END ${path}`);
}
