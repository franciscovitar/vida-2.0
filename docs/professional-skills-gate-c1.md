# Profesional Gate C1 — Habilidades, evidencia y dirección profesional

**Fecha:** 2026-10-10. **Destino:** `/professional/crecimiento` en `vida-qa`. No autorizado para `main`/Producción.

## Objetivo

Transformar las cinco capacidades de crecimiento actuales del usuario en una comparación útil: qué competencias figuran como requisitos principales de cada uno de los nueve perfiles profesionales canónicos, qué evidencia de proyectos existe, qué todavía necesita verificarse de manera directa y qué práctica sería valiosa.

No fabricar frecuencias de vacantes, demanda futura por habilidad, scores universales, probabilidad de empleo ni dominio demostrado mediante uso de agentes IA.

## Fuentes

PAS `main` commit `08ae01c509111438cb77f0f9582b9966013ae4a2`:

- `AI/projects/professional-intelligence/PROFESSIONAL_GROWTH_CURRENT_V1.json` (cola de cinco, observado 2026-10-02).
- `AI/projects/professional-intelligence/ROLE_ARCHETYPES_V1.json` (nueve perfiles y referencias ontológicas de habilidades).
- `AI/projects/professional-intelligence/PERSONAL_EVIDENCE_GRAPH_V1.json` (estados practicado / demostrado por artefactos, observado 2026-09-22; no equivalen a verificación independiente).
- El snapshot previamente autorizado `data/generated/professional-snapshot.json` provee presentación local en español de las cinco capacidades, con `skillRefs` idénticas a PAS actual.
- `data/generated/professional-forecast-horizons.json` existente aporta pronósticos independientes por seis áreas a 12–24 meses, 3–5 y 5–10 años.

El derivado sanitizado `data/generated/professional-skills-matrix.json` concentra cinco capacidades y sus diez skill refs distintos, doce referencias en total, nueve perfiles y estados personales sin IDs de artefactos ni textos privados originales. Es read-only, con commit, referencias canónicas, fecha de observación y contrato que falla cerrado.

## Diseño y límites de interpretación

En Perfil & Crecimiento, la persona puede seleccionar uno de los nueve perfiles y ver para cada capacidad sus referencias de habilidades core que coinciden con el perfil, su estado de evidencia de artefactos y su próxima práctica. El número de coincidencias **cuenta referencias de la ontología**: no ofertas de trabajo, no puntuación de empleabilidad ni skill mastery. La cola conserva el orden del PAS, pero no recibe un ranking nuevo.

Debajo hay un bloque de horizonte independiente para seleccionar una **familia profesional distinta** del perfil, con las seis familias canónicas de FORECAST y sus tres horizontes. La selección de ambas taxonomías es deliberadamente independiente. Los pronósticos son de sector, **no son demanda por skill individual**. Si falta o vence una fuente, se muestra una advertencia y los paneles no fabrican resultados.

El V06 (frecuencia por sector) y el V07 (serie temporal de skills) permanecen `INSUFFICIENT_COMPARABLE_REPEATED_JOB_SAMPLES` hasta disponer de muestras laborales comparables y deduplicadas con cobertura/ventanas repetidas. V13 aporta estados por skill en artefactos, V14 relación ontológica entre perfiles y V15 próximo ejercicio, sin % de dominio ni esfuerzo inventado.

## Calidad y release

- Seis tests `PRO-C1-01..06` verifican 5 ítems, 9 perfiles, skill refs, estados, rechazo de métricas fabricadas, fuente/fechas y separación de pronósticos.
- QA obligatoria: `npm test`, `npm run check`, `npm run build`.
- Mantener la autorización de `getProfessionalGrowthPageData()`, sin rutas nuevas públicas, permisos, credenciales, cron, jobs ni cambios de PAS.
- Desplegar solo Preview `vida-qa`, alias autenticado `https://vida-2-0-git-vida-qa-genova.vercel.app/`, cuando la CI pase. Preservar todo el trabajo anterior.
- Revisión visual de escritorio/móvil y de interacciones de los selectores antes de considerar cierre UX o cualquier release a Producción.
