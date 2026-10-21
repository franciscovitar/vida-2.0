# Logros V1 — integración de lectura privada (DRAFT)

## Objetivo
Vista real de `/planificacion/logros` para la experiencia de progreso conseguido, sin duplicar tareas, Journal ni historia de proyectos. Este cambio es **read-only**, con credenciales del servidor y autenticación Vida obligatoria. **No crea la base, no escribe Notion, no publica logros ni despliega.**

## Estado y activación
- Por defecto: `ACHIEVEMENTS_V1_READ_ENABLED` desactivado; no solicita datos a Notion y no agrega enlace a Planificación V2.
- Para un futuro piloto autorizado, definir en entorno del servidor `ACHIEVEMENTS_V1_READ_ENABLED=true`, `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID` válido y `NOTION_API_TOKEN`. El ID debe ser el de una fuente privada **Logros**, distinta de Proyectos, Tareas, Áreas y Hitos; no usar un ID supuesto.
- Este PR es DRAFT: no habilitar esas variables sin existencia real, schema/readback/permiso, ni fusionar a main sin revisión de build y del despliegue automático de Vida.

## Esquema de lectura contractual — propuesta, no base creada
| Propiedad privada | Tipo Notion | Valores / uso |
| --- | --- | --- |
| `Nombre` | title | título breve sin secretos ni datos sensibles |
| `ClaveEvento` | rich_text | identidad estable del acontecimiento, no hash de Journal |
| `Categoria` | select | `ACADEMIC`, `PROJECT`, `PROFESSIONAL`, `PERSONAL`, `OTHER` |
| `Asercion` | select | `SELF_REPORTED` o `OWNER_VERIFIED`; solo escritor confiable puede asignarla |
| `Fecha` | date | día real, o sin fecha si desconocido |
| `Estado` | select | solo `ACCEPTED` se proyecta; `PROPOSED` nunca visible |
| `Sensibilidad` | select | solo `STANDARD` |
| `RegistroAutorizado` | checkbox | true únicamente tras aceptación/evidencia por adaptador confiable |

El validador read-only **no certifica** los flags ni sustituye un escritor autenticado. El contrato canónico de candidatos y reconciliación está en PAS PR #572 (`scripts/achievement_ledger_v1.py`); conservar ese gate en el futuro escritor. No tratar controles editables de Notion como evidencia de un permiso por sí mismos.

## Garantías de lectura
- Solo se abre el data source explícito y permitido, usando una sola página de hasta 100 ítems; si hay más páginas, estado `degraded` y ningún claim de cobertura completa.
- Se muestran como máximo 30 tarjetas ordenadas; fuente incierta `unavailable`, no configurada `not-configured`, cero filas `empty`.
- Los duplicados de `ClaveEvento` son rechazados y excluidos, no fusionados silenciosamente; resultados no aceptados, sensibles o malformados se descartan.
- El cliente recibe exclusivamente `title`, `occurredOn`, `category`, `evidenceLabel`; no Notion IDs, claves internas, source refs ni texto del Journal. React escapa el título.
- No hay extracción de Journal, cron, webhook, llamada a Work/YouTube, escritura Notion o gastos remotos.

## QA y siguientes gates
Se ejecutaron localmente con Node 22 (type stripping) **19/19** pruebas de `tests/achievements-view.test.ts` y `tests/achievements-config.test.ts`; los 7 archivos derivados fueron subidos como Git blobs con SHA exactos idénticos a los evaluados. Todavía **no** se ejecutaron las pruebas integradas de Vida, lint, typecheck o build; requerir un agente repo-aware con checkout real antes de integrar.

Próximo gate: verificar Notion propietario/esquema y consentimiento específico para crear una fuente privada Logros, implementar escritor con dedup y readback, piloto real acotado con entradas diarias voluntarias y QA completa de Vida. No escanear todo el Journal.
