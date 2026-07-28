# Block 3 — Supply chain (npm audit)

- **Fecha:** 2026-07-28 (cierre técnico)
- **Comando:** `npm audit --omit=dev --json` (sin `npm audit fix --force`).
- **Alcance:** dependencias de producción reportadas por npm (dev omitido).
- **Bumps aplicados:** `next`/`eslint-config-next` → `16.2.12`, `sharp` → `0.35.3`
  (dependency + `overrides.sharp: "$sharp"`), `googleapis` ya en latest `^173.0.0`.

## Resumen

| Severidad | Count |
| --------- | ----: |
| critical  |     0 |
| high      |     6 |
| moderate  |     0 |
| low       |     0 |
| info      |     0 |
| **total** | **6** |

## Clasificación

| Paquete             | Sev  | Directo | Rango                             | Fix disponible  | Notas / vía                      |
| ------------------- | ---- | ------- | --------------------------------- | --------------- | -------------------------------- |
| `brace-expansion`   | high | no      | `<=5.0.7`                         | sí (no forzado) | DoS vía expansión ilimitada      |
| `gaxios`            | high | no      | `7.1.3`                           | sí (no forzado) | transitivo `googleapis` → rimraf |
| `glob`              | high | no      | `4.3.0 - 10.5.0`                  | sí (no forzado) | vía minimatch                    |
| `googleapis-common` | high | no      | `>=8.0.2-rc.0`                    | sí (no forzado) | vía gaxios                       |
| `minimatch`         | high | no      | `2.0.0 - 10.0.2`                  | sí (no forzado) | vía brace-expansion              |
| `rimraf`            | high | no      | `2.3.0 - 3.0.2 \| 4.2.0 - 5.0.10` | sí (no forzado) | vía glob                         |

**Resueltos en este cierre:** `next` (16.2.12) y `sharp` (0.35.3, sin advisory prod).

## Política Block 3 (cierre)

- Bumps acotados aplicados; sin `npm audit fix --force`.
- Restantes transitivos de `googleapis` quedan para corte coordinado posterior.
- Runtime de escrituras reversibles no introduce crypto deps nuevas (`node:crypto` + Upstash REST).
