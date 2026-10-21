# Logros V1 — lectura privada y piloto simple (DRAFT)

**Estado:** base privada Notion **creada y verificada vacía**; Vista Vida en rama DRAFT; no hay escrituras personales ni despliegue. Se descarta usar Upstash/Redis para Logros por decisión expresa del propietario.

## Arquitectura mínima
- **Notion Logros** es la única fuente de persistencia de resultados aceptados. Ya existe bajo Vida 2.0 / Datos del sistema (backend), con 8 propiedades verificadas.
- **PAS PR #572** contiene el gate de candidatos, deduplicación por `ClaveEvento`, escritor Python y adaptador Notion, probados en escenario sintético. No tiene autorización para registrar datos personales por sí solo.
- **Vida PR #247** ofrece una vista autenticada `/planificacion/logros` con lectura explícita: `ACHIEVEMENTS_V1_READ_ENABLED` OFF por defecto, `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID` y token privados. Aún no está conectada ni desplegada.
- **No agregar:** Redis/Upstash, cron, segundo ledger, colas ni ruta pública de escritura.

## Esquema confirmado en Notion
`Nombre` (title), `ClaveEvento` (rich_text), `Categoria` (select), `Asercion` (select), `Fecha` (date), `Estado` (select), `Sensibilidad` (select), `RegistroAutorizado` (checkbox). La vista muestra únicamente `ACCEPTED` + `STANDARD` + `RegistroAutorizado=true`; no expone referencias del diario.

## Gate de escritura simple y limitación
Para un piloto **manual y serial** con autorización por logro, un único ejecutor autenticado debe consultar la clave, validar la aceptación, escribir como máximo una vez, leer de nuevo y detenerse si hay duplicados, fallos o incertidumbre. **No habilitar concurrencia, procesos automáticos ni escrituras paralelas:** las búsquedas de Notion no imponen unicidad transaccional. Este procedimiento no certifica exclusividad universal. Antes de habilitar automatización, probar coordinación real o mantener un solo ejecutor.

## Qué falta para la función completa
1. QA repo-aware del escritor PAS y prueba acotada contra fuente autorizada con readback, sin registros personales hasta permiso específico.
2. Integrar extracción limitada del Journaling diario y cierres de proyectos, propuestas/aceptaciones, corrección y revocación.
3. Completar y certificar lectura privada en Vida y resumen de logros en Daily Planning; QA, privacidad y aprobación explícita para cualquier despliegue.

Ambas PR permanecen **DRAFT / NO MERGE / NO PRODUCTION**.
