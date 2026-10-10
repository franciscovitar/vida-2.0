# Profesional Gate C2a — Requisitos observados en muestra dirigida (V06/V11 parcial)

Fecha: 2026-10-10. Destino: `/professional/mercado`, solo Preview autenticado `vida-qa`; no Producción.

## Evidencia comprobada

El almacén canónico de Job Search es Google Sheet `Job Search Market Evidence V1` (`1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k`), con tres pestañas: Observations, Weekly Summary y Source Yield. Se verificó el 2026-10-10 que las tres contenían solamente la fila de encabezado. No existe hoy un histórico de observaciones semanales verificable en ese almacén. No se introducen filas ni se simula que las búsquedas programadas ya recolectaron muestras.

PAS main (commit `08ae01c509111438cb77f0f9582b9966013ae4a2`) sí conserva el ejercicio Market-fit QA del 2026-10-02:

- `AI/projects/professional-profile-v1/MARKET_FIT_QA_CURRENT_V1.json`: muestra dirigida `n=20` y 17 recuentos originales.
- `AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md`: descripción metodológica, 20 puestos de muestra y URLs de anuncios.

Esta muestra reúne roles junior, semi-senior y senior de Software Engineer, Full-Stack y Product Engineer, con Córdoba, Argentina y LATAM remoto mezclados. Fue seleccionada deliberadamente para evaluar el encaje del perfil y **NO es un censo ni un muestreo probabilístico**.

## Implementación

Nuevo derivado sanitizado `data/generated/professional-skills-demand-c2.json`, de solo lectura y fijado al commit/ref PAS original. Presenta las 17 menciones sin inferir tasas de mercado: `TypeScript/JavaScript 20 de 20`, `React/Next.js 19 de 20`, `Postgres/SQL 16 de 20`, etc. Es una comparación del conjunto seleccionado. El componente `ProfessionalSkillDemand` muestra barras por mención absoluta con filtros tecnologías/capacidades, fuente y fecha siempre visibles y enlace al informe con las 20 URLs. Las barras usan una escala relativa a las veinte observaciones de la muestra **solo para visualizar el recuento**. Nunca se etiqueta como porcentaje de vacantes de Argentina.

La vista indica por qué permanecen pendientes:

- frecuencia actual de vacantes por región/seniority;
- comparación Córdoba/Argentina/LATAM;
- evolución temporal de demanda por habilidad, subas/bajas y cambios de mercado.

Para desbloquear comparaciones nuevas, Job Search (dueño de sourcing) debe aportar observaciones semanales fechadas, geografía/eligibilidad, URL/identidad deduplicable, rol/seniority, `must_have` explícitos y método estable, bajo `JOB_SEARCH_RESEARCH_MODEL_V1.md`. PAS debe validar comparabilidad, denominadores y procedencia y publicar un nuevo derivado autorizado. El cliente no calcula inferencias laborales.

## Restricciones

- Respetar `LABOR_MARKET_SOURCE_POLICY_V1.md`: una oferta puede mencionar varias habilidades; contarla una sola vez por señal; etiquetas sin texto explícito no son exigencias comprobadas.
- No presentar 20 como total de anuncios del mercado, ni los recuentos como cuotas de mercado, porcentajes de contratación o demanda representativa.
- No fusionar series de bolsas de empleo con consultas/metodología incompatible, ni confundir encuesta de trabajadores con ofertas.
- No incluir anuncios vencidos como vacantes activas ni llamar «actual» al baseline pasado su control de frescura (30 días).
- No inferir que la muestra es representativa de Córdoba/LATAM ni de los puestos junior.
- Publicar cambios a este dataset solo después de una nueva revisión canónica, no por cambiar fechas.
- No escribir a PAS, Drive, empresas, CV o postulaciones mediante este módulo.

## Verificación

- Seis pruebas `PRO-C2-01...06`: identidad exacta de los 17 conteos (n=20), fuente, límites, rechazo de porcentaje falso, ausencia de tendencias, caducidad, preservación de tipos.
- CI final: `npm test`, `npm run check`, `npm run build`. No subir a `vida-qa` hasta PASS.
- Después de QA: revisar desktop, móvil, contraste y filtros; Producción queda intacta hasta autorización expresa.
