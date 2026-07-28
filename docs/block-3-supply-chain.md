# Block 3 — Supply chain (npm audit)

- **Fecha:** 2026-07-28 (cierre técnico)
- **Comando:** `npm audit --omit=dev --json` (sin `npm audit fix --force`).
- **Alcance:** dependencias de producción reportadas por npm (dev omitido).
- **Bumps aplicados:** `next`/`eslint-config-next` ? `16.2.12`, `sharp` ? `0.35.3`, `overrides.gaxios` ? `7.3.0`, `overrides.googleapis-common` ? `8.0.3`.

## Resumen

| Severidad | Count |
| --------- | ----: |
| critical  |     0 |
| high      |     0 |
| moderate  |     0 |
| low       |     0 |
| info      |     0 |
| **total** | **0** |

## Clasificación posterior

- `next`: resuelto en `16.2.12`.
- `sharp`: resuelto en `0.35.3`.
- `googleapis` permanece en `^173.0.0`, pero sus transitivas vulnerables quedaron sustituidas por overrides estables:
  - `gaxios@7.3.0`
  - `googleapis-common@8.0.3`
- Resultado verificado con `npm audit --omit=dev --json`: **0 vulnerabilidades de producción**.

## Política Block 3 (cierre)

- Se aplicaron bumps explícitos y overrides mínimos compatibles; no se usó `npm audit fix --force`.
- El runtime de escrituras reversibles no introduce nuevas dependencias de cifrado (`node:crypto` + Upstash REST).
- Antes de activar writes en Preview, Work solo debe validar los cambios de esquema e integraciones externas; supply chain local quedó en verde.
