# Professional Intelligence — Gate B2: resiliencia profesional (V16)

**Estado:** implementación de visualización sobre `vida-qa` para revisión; no se modifica Producción.

## Origen y alcance

PAS conserva el estado canónico en `AI/projects/professional-intelligence/AI_CAREER_RESILIENCE_CURRENT_V1.json`, observado el 2026-09-22. Vida **ya** incluye el derivado autorizado `data/generated/ai-career-resilience.json`, fijado al commit PAS `aa5d930c43c39401a5cfed1a30556e8c72780f4f`. Se verificó que las 132 bandas de tres medidas en once roles y cuatro horizontes coinciden numéricamente con PAS main al preparar esta entrega.

Gate B2 **no crea ni altera** un dataset de resiliencia, calendario, credenciales, automatizaciones, fuente PAS ni lógica de predicción. Reutiliza `loadCareerResilience`, `parseCareerResilienceSnapshot` y el DAL de autorización ya presente en `getProfessionalMarketPageData`.

## Experiencia

Nuevo módulo `ProfessionalResilienceComparison` en `/professional/mercado`:

- selector de **once perfiles**, incluidos Data Engineer, Data Scientist y Data Analyst/BI por separado;
- horizontes independientes `Y1`, `Y5`, `Y10`, `Y20` (no equivalentes a los horizontes de FORECAST V17);
- bandas separadas de **presión de sustitución por IA sola** (escenario expresado en rango porcentual no calibrado), **resiliencia del profesional actualizado** (índice heurístico) y **compresión de plantilla** (índice heurístico);
- cada banda muestra ambos extremos numéricos y escala desde cero; no se promedian las tres medidas ni se presenta un ganador;
- explicación textual en español y acciones de adaptación; análisis original inglés accesible al expandir;
- texto visible `Y20: prueba de estrés`, sin pronóstico puntual de empleo;
- aviso y degradación segura cuando el derivado está obsoleto, inválido o ausente.

## Advertencias científicas que no se pueden omitir

1. Presión de sustitución por IA es un **escenario NO calibrado**, no un riesgo de desempleo personal ni una probabilidad de desaparición de profesión.
2. Resiliencia 0–100 es un **índice heurístico condicionado** a que la persona mantenga capacidades actuales y use IA activamente. Un valor de 95 no significa 95% de seguridad laboral.
3. Compresión 0–100 es **índice heurístico** de presión sobre plantillas, no porcentaje de trabajadores que perderían su empleo.
4. Y10 y especialmente Y20 tienen incertidumbre muy alta. Y20 es únicamente prueba de robustez, no proyección científica calibrada hasta 2046.
5. Las proyecciones BLS 2025–2035 de Gate A miden otra variable, otras ocupaciones y geografía específica estadounidense; jamás mezclar numéricamente con estas bandas.
6. La clasificación no reemplaza evidencia personal, barreras junior, salarios locales ni vacantes reales. Los indicadores de PAS no se recomputan en el navegador.

## Evidencia y criterios de cierre

- La fuente PAS se valida por `source.commit` y `canonicalRef` existentes; los 11 perfiles y sus horizontes se mantienen íntegros.
- Se agregan pruebas de integridad y rechazo de semánticas falsas, porcentajes imposibles, perfiles de datos colapsados, fuentes falsas y fechas vencidas.
- Ejecutar `npm test`, `npm run check`, `npm run build` en una rama aislada antes de actualizar `vida-qa`.
- Después del Preview autenticado: revisión de etiquetas, selección de rol/horizonte, contraste oscuro, lectura móvil y significado de las tres bandas. No marcar revisión visual completada antes de observarla.
- No hacer merge a `main` ni desplegar Producción sin autorización de release y guardrails.
