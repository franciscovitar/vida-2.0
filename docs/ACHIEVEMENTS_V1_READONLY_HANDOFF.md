# Logros V1 — lectura privada (DRAFT)

**Estado:** base privada Notion Logros con 9 registros ACCEPTED verificados el 2026-10-22 (8 históricos con autorización específica y el registro previo de Football). Lector extendido de Vida en rama DRAFT, todavía no desplegado; escritor recurrente no certificado.

El propietario descartó Upstash/Redis para esta función. Primer piloto: manual, serial y por logro autorizado; no se garantiza unicidad ante escritores concurrentes.

## Alcance

- Vista autenticada `/planificacion/logros` en Vida.
- Solo lectura, sin acceso automático a Journaling.
- Desactivado salvo `ACHIEVEMENTS_V1_READ_ENABLED=true`.
- Fuente explícita: `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID`.
- No usar Proyectos, Tareas, Áreas o Hitos como Ledger.
- No crear registros ficticios ni mostrar propuestas no aceptadas.
- Lectura histórica original: 100 filas/30 tarjetas. Cambio propuesto en este PR: paginación de 100 en 100, máximo 20 páginas, sin recorte artificial de 30 tarjetas; cobertura incompleta debe identificarse.
- Si la fuente está incompleta, mostrar una advertencia de cobertura parcial.
- No revelar referencias privadas, claves semánticas ni el Journal íntegro; mostrar únicamente recuerdos resumidos explícitamente autorizados en la vista autenticada.

## Esquema y escritura manual aprobada (lectura privada)

- `Nombre`: título de Notion.
- `Recuerdo`: narración breve aprobada por el propietario, privada y opcional; máximo de lectura en Vista 1800 caracteres.
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

## 2026-10-22 — Estado de datos real tras primer lote

- **8 de 8** recuerdos históricos fueron cargados por autorización explícita del propietario mediante Notion, serialmente y con verificación exacta de fecha/categoría/estado/clave/narrativa al leer la vista nativa. Hay **9 ACCEPTED en total**, incluyendo el registro previo de Football; no se detectaron claves duplicadas. La primera venta de web conserva `Fecha` nula por inferencia a partir del Journal del día siguiente.
- Este documento no guarda nombres, texto de recuerdos, claves personales ni URLs individuales; esos datos pertenecen exclusivamente a la base Notion privada.
- Un límite temporal del conector Notion bloqueó consultas SQL/rows; se comprobó el estado final por una vista nativa. Ese incidente no confiere permiso para omitir deduplicación en escrituras futuras.
- **No** se habilitó una escritura automática o periódica; las 8 creaciones corresponden solo al lote aprobado. Otros candidatos del archivo privado V5 siguen sin autorizar para Notion.
- Pruebas observadas de la **lógica pura**, tras remover anotaciones TypeScript para ejecución aislada: 14/14 PASS del turno previo. Sin workflow de CI asociado al HEAD `575452cd81f2f9c4f0a96f95311cdcb9c0541a30`. **No** se ejecutaron el typecheck nativo, `npm test`, lint ni build con Node >=24 y dependencias exactas; siguen siendo bloqueos para aprobación de merge/Production.
- La vista de producción existente no debe considerarse actualizada por estos registros: mostrar historias requiere pasar QA completo y un despliegue específico autorizado.
