# Professional Visual Intelligence — Gate 0

**Fecha:** 2026-10-10. **Estado:** contrato en revisión; todavía no hay gráficos nuevos ni cambios en Producción.

La inteligencia canónica continúa en PAS. Vida solo representa derivados sanitizados. Se conservan las cinco pestañas y el catálogo de 19 visualizaciones definido en PAS:

- `AI/projects/professional-intelligence/PROFESSIONAL_VISUALIZATION_ARCHITECTURE_V1.md`
- `AI/projects/professional-intelligence/PROFESSIONAL_VISUALIZATION_CATALOG_V1.json`
- `AI/projects/professional-intelligence/VIDA2_PROFESSIONAL_VISUALIZATION_DESIGN_V1.md`

## Evidencia disponible para Gate A

- **V02 — crecimiento y empleo neto:** PAS conserva las proyecciones oficiales de BLS 2025–2035 para ocho ocupaciones estadounidenses. Los porcentajes no son cantidades de puestos.
- **V03 — aperturas anuales:** disponibles para esas ocupaciones. Incluyen reemplazos y puestos nuevos; no representan vacantes actualmente publicadas en Argentina.
- **V04 — salarios:** las medianas argentinas de OpenQube/Sysarmy 2026.01 son referencias históricas. Separar seniority, dolarización, muestra, moneda y fecha; no llamarlas salarios actuales.
- **V13 — requisitos y evidencia:** existen nueve familias de roles y evidencia practicada/demostrada. Todavía no existe una matriz completa por faceta verificable. No convertir recuentos en porcentaje de dominio.

La muestra LATAM de avisos de trabajo no constituye un censo ni una tendencia temporal comparable. Las 14 ofertas de IA están documentadas, pero faltan evaluaciones controladas para comparar su rendimiento por tarea. Los escenarios a 1, 5, 10 y 20 años son **heurísticas**, no probabilidades de despido.

## Contrato implementado en este PR

`lib/professional/visualization-contract.ts` define los IDs V01–V19 y los estados de disponibilidad. Para V02/V03/V04 valida origen PAS, versión, ocupación, unidad, geografía, período, seniority, muestra y tipo de fuente. Si faltan datos o hay incompatibilidades, rechaza la entrada en vez de inventar una barra o un ranking.

`tests/professional-visualization.test.ts` contiene trece pruebas de validez y rechazo de mezclas incompatibles.

Los derivados `data/generated/world` identificados en `.prettierignore` permanecen **sin modificar**: son contenidos publicados cuya integridad depende de sus bytes y de las validaciones canónicas de World. La exclusión es exacta para cuatro archivos históricos, no global.

## Verificación y siguiente paso

En el primer intento de CI del PR #222, la suite completa de pruebas, TypeScript, ESLint y Stylelint pasaron. Prettier falló sobre los tres archivos nuevos y cuatro JSON de World ya existentes en `main`; por eso el build no se ejecutó.

La corrección de formato y la exclusión acotada están preparadas para una verificación completa. No declarar Gate 0 cerrado hasta observar `npm test`, `npm run check` y `npm run build` aprobados en el PR.

Después, Gate A agregará una vista accesible de crecimiento porcentual, empleo neto y aperturas de BLS bajo `/professional/mercado`, sin cambiar las fuentes canónicas ni predecir demanda laboral argentina a partir de EE. UU.

**Fuera de alcance:** publicar gráficos sin evidencia, nuevas tareas programadas, cambios de permisos, despliegues, compras, postulaciones o actualizaciones de perfil público.
