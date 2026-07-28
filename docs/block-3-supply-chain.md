# Block 3 — Supply chain (npm audit)

- **Fecha:** 2026-07-28
- **Comando:** `npm audit --omit=dev --json` (sin `npm audit fix`, sin bumps).
- **Alcance:** dependencias de producción reportadas por npm (dev omitido).

## Resumen

| Severidad | Count |
| --------- | ----: |
| critical  |     0 |
| high      |     8 |
| moderate  |     0 |
| low       |     0 |
| info      |     0 |
| **total** | **8** |

Dependencias (metadata): prod=122, total=610.

## Clasificación

| Paquete             | Sev  | Directo | Rango                    | Fix disponible   | Notas / vía                                                                                                |
| ------------------- | ---- | ------- | ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `brace-expansion`   | high | no      | `<=5.0.7`                | sí (no aplicado) | brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash                 |
| `gaxios`            | high | no      | `7.1.3`                  | sí (no aplicado) | rimraf                                                                                                     |
| `glob`              | high | no      | `4.3.0 - 10.5.0`         | sí (no aplicado) | minimatch                                                                                                  |
| `googleapis-common` | high | no      | `>=8.0.2-rc.0`           | sí (no aplicado) | gaxios                                                                                                     |
| `minimatch`         | high | no      | `2.0.0 - 10.0.2`         | sí (no aplicado) | brace-expansion                                                                                            |
| `next`              | high | sí      | `9.5.6-canary.0 - 10.0.7 |                  | 14.3.0-canary.0 - 16.3.0-preview.7`                                                                        | sí (no aplicado) | Next.js: Middleware / Proxy bypass in App Router applications using Turbopack and single locale; Next.js: Denial of Service in App Router using Server Actions; Next.js: Server-Side Request Forgery in Server Actions on custom servers; Next.js: Cache confusion of response bodies for requests with bodies |
| `rimraf`            | high | no      | `2.3.0 - 3.0.2           |                  | 4.2.0 - 5.0.10`                                                                                            | sí (no aplicado) | glob                                                                                                                                                                                                                                                                                                           |
| `sharp`             | high | no      | `<0.35.0`                | sí (no aplicado) | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 |

## Política Block 3

- Este informe es inventario para Work; **no** se ejecuta `npm audit fix` ni se suben versiones en este bloque.
- Hallazgos transitivos vía `googleapis` / `glob` / `sharp` / `next` requieren corte de versión coordinado fuera de Block 3.
- Runtime de escrituras reversibles no introduce nuevas dependencias de cifrado (usa `node:crypto`).
