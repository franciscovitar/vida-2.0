# Logros V1 — lectura privada (DRAFT)

**Estado:** base privada Notion Logros creada y vacía; vista desactivada y escritor todavía no certificado.

El propietario descartó Upstash/Redis para esta función. Primer piloto: manual, serial y por logro autorizado; no se garantiza unicidad ante escritores concurrentes.

## Alcance

- Vista autenticada `/planificacion/logros` en Vida.
- Solo lectura, sin acceso automático a Journaling.
- Desactivado salvo `ACHIEVEMENTS_V1_READ_ENABLED=true`.
- Fuente explícita: `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID`.
- No usar Proyectos, Tareas, Áreas o Hitos como Ledger.
- No crear registros ficticios ni mostrar propuestas no aceptadas.
- Un máximo de 100 filas consultadas y 30 tarjetas mostradas.
- Si la fuente está incompleta, mostrar una advertencia de cobertura parcial.
- No revelar referencias privadas, claves semánticas ni contenido del Journal.

## Esquema ya creado, todavía sin escrituras

- `Nombre`: título de Notion.
- `ClaveEvento`: texto de identidad estable, sin datos íntimos.
- `Categoria`: `ACADEMIC`, `PROJECT`, `PROFESSIONAL`, `PERSONAL` u `OTHER`.
- `Asercion`: `SELF_REPORTED` u `OWNER_VERIFIED`.
- `Fecha`: fecha o vacío si es desconocida.
- `Estado`: solo `ACCEPTED` aparece en Vida.
- `Sensibilidad`: solo `STANDARD` aparece en Vida.
- `RegistroAutorizado`: checkbox solo del futuro escritor confiable.

Los campos editables de Notion no son prueba independiente de permiso o veracidad.
El escritor deberá reutilizar los gates de PAS PR #572, con deduplicación y readback.

## QA y siguiente gate

- 19 pruebas focales observadas PASS.
- TypeScript estricto del modelo y de la configuración PASS.
- QA completa de Vida, E2E y activación requieren pruebas separadas.
- No se necesita otra base de Logros. Su activación, uso para registros personales y despliegue requieren permisos específicos.
- No fusionar ni desplegar esta propuesta sin completar esos controles.

## 2026-10-22 — Recuerdo narrative extension (DRAFT branch only)

- Owner explicitly authorized adding `Recuerdo` rich-text to the private Notion `Logros` data source, and preparing matching Vida code in a development branch, **not** deploying, merging or writing the 30 historical candidates.
- The exact Notion data source schema change was read back: 9 properties; the existing first accepted achievement remained and `Recuerdo` was blank. No historical achievement content was inserted.
- Read-only proposal: extend the `AchievementCard` type with an optional `story` hydrated strictly from `Recuerdo` on an ACCEPTED, STANDARD, authorized source row only. Legacy cards without a story remain valid. React renders as escaped plain text, allowing line breaks; secret-bearing or malformed stories are rejected.
- Uncap the previous 30-item projection and page native Notion API queries in bounded batches of 100, maximum 20 batches. Invalid page identity, duplicate event keys, source malformation and partial fetch remain visible as degraded/unavailable rather than claiming success.
- QA tests updated for detailed stories, backward compatibility, sensitivity/secret rejection and pagination >100. Tests are added to the branch, not asserted as executed in hosted CI until run independently.
- The pre-existing `feat/achievements-v1-readonly-20261020` branch is explicitly excluded from Vercel automatic deployment by `vercel.json` on current main. Its starting Git tree is byte-identical to main at `71b05f19d61cabf590cb3136f1654baaa17b2081`. No Vercel configuration or Production code is modified by this extension.
- **No general permission** to ingest private Journaling automatically or write new achievements. The owner will approve specific candidate stories and a bounded Notion import only after reviewing the curatorial selection and validating the read-only UI.
