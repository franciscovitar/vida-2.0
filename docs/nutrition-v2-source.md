# Nutrition V2 — fuente y contrato visual

## Fuente de verdad

- Plan, meal prep y criterios operativos: Notion (`health.diet`).
- Ingesta cuantitativa real: Google Sheet dedicado de Nutrition Intelligence.
- Vida Web: vista derivada; no duplica comidas, alimentos del catálogo ni objetivos.

La navegación primaria separa responsabilidades:

- `/dieta` — **Hoy**: estado del día, energía/macros, registro y como máximo una señal persistida prioritaria;
- `/dieta/tendencias` — **Tendencias**: ventanas 7D / 28D / 90D, con 28D por defecto;
- `/dieta/nutrientes` — **Nutrientes**: patrones longitudinales, cobertura y referencias, también 7D / 28D / 90D con 28D por defecto;
- `/dieta/plan` — **Plan**: contenido operativo read-only desde Notion.

El spreadsheet se resuelve solo en servidor con `GOOGLE_NUTRITION_SPREADSHEET_ID` junto con la cuenta de servicio existente. El código no contiene el ID real y no hace fallback al Sheet general de hábitos ni al de Gimnasio.

## Tabs leídos por Vida

- `Meals`
- `Food Items`
- `Daily Summary`
- `Targets`
- `Nutrient Targets`
- `Nutrient Summary`
- `Food Nutrients` — sólo para auditoría de frescura/integridad lower-level
- `AI Insights`

`Meals` + `Food Items` son autoridad de ingesta. `Daily Summary` y `Nutrient Summary` son vistas materializadas derivadas. `Targets` contiene decisiones fechadas de energía/macros. `Nutrient Targets` contiene referencias fechadas por nutriente. `AI Insights` contiene interpretación persistida por Nutrition Intelligence.

`Food Catalog` y `Food Catalog Nutrients` pertenecen al runtime/store de Nutrition Intelligence y Vida no los lee. `Food Nutrients` también pertenece a Nutrition Intelligence, pero Vida puede leerlo en modo auditoría para comprobar que un `Nutrient Summary` fresco realmente conserva lineage lower-level suficiente. Vida no recalcula cantidades micronutricionales desde esas filas ni convierte la web en otra base de datos.

## Macros

La UI muestra proteína, carbohidratos, grasas y fibra.

- con cobertura completa: Vida muestra el total canónico derivado de valores realmente presentes;
- con cobertura parcial: Vida suma únicamente valores conocidos y los etiqueta como `conocidos/parcial`;
- Vida no infiere proteína, carbohidratos, grasas ni fibra desde calorías, nombre del alimento o una distribución heurística;
- si un alimento material no tiene un macro cuantificado, ese valor permanece desconocido para ese alimento y el total diario no se presenta como completo;
- un subtotal parcial puede mostrarse como cantidad conocida, pero no genera porcentaje de meta ni conclusión de adecuación;
- energía parcial tampoco genera porcentaje o diferencia contra el objetivo;
- cuando existen Meals/Food Items activos para una fecha, Vida recompone esa fecha desde los registros crudos y no deja que un Daily Summary atrasado los sobrescriba;
- la reconciliación aplica también a Tendencias: una corrección histórica o un día todavía no materializado puede aparecer desde autoridad cruda;
- un `void`, supersession o reasignación retroactiva también puede limpiar el día anterior aunque el Daily Summary materializado todavía no se haya reconstruido;
- una comida activa sin items o un item inválido ligado a esa comida degrada cobertura en vez de permitir un falso `complete`;
- Daily Summary sigue siendo una vista materializada útil para fallback cuando no hay autoridad cruda disponible, no autoridad por encima de Food Items;
- desconocido nunca se convierte en cero.

Los objetivos activos de `Targets` tienen prioridad para energía/macros. En particular, la meta personal activa de fibra prevalece visualmente sobre una referencia dietaria genérica de `Nutrient Targets`.

Para energía, Vida conserva `energyTargetKcalLow/High` cuando la decisión es un rango. Hoy no convierte ese rango en un midpoint artificial: muestra el rango y calcula la diferencia contra el borde aplicable. Al abrir una fecha histórica, Today también permite decisiones `superseded` cuando eran las vigentes en ese día. Tendencias resuelve cada punto por `Daily Summary.targetDecisionId`; si esa lineage falta, usa la decisión de `Targets` vigente en esa fecha. `draft` y `void` no se usan. Un target actual nunca se aplica retrospectivamente a todo el gráfico.

## Micronutrientes

La pantalla contiene un catálogo visual amplio de vitaminas, minerales y otros nutrientes. Ese catálogo define nombres/unidades de presentación, no cantidades personales ni recomendaciones.

La vista principal de Nutrientes es longitudinal. Para cada ventana:

- sólo los días con `sourceCoverage = complete` entran en promedios comparables;
- los días parciales siguen visibles como cobertura, pero no reducen artificialmente el promedio;
- antes de usar una fecha, Vida compara `Nutrient Summary.updatedAt` contra mutaciones de Meals/Food Items y `Daily Summary.updatedAt` para ese día;
- si una fila micronutricional quedó detrás de evidencia más nueva, la fecha completa se excluye de promedios/señales hasta que Nutrition Intelligence reconstruya `Nutrient Summary`;
- si faltan timestamps contractuales o no pueden leerse las fuentes necesarias para auditar frescura, la fecha falla cerrada como no verificable en vez de mostrarse como actual;
- `sourceCoverage = complete` no se acepta sólo porque el summary lo declare: Vida exige lineage lower-level activa y defensible para todos los Food Items cubiertos, sin duplicados/orphans y con `sourceFoodItemCount` coherente; una fila lower-level puede conservar `coverage = partial` por incertidumbre de estimación sin convertir automáticamente al día en cobertura parcial, porque cobertura e incertidumbre son ejes distintos;
- los subtotales `partial` también se auditan estructuralmente: si hay duplicados activos, orphan rows, identidad/fecha/meal incompatibles o un `sourceFoodItemCount` explícito que contradice las fuentes lower-level, Vida suprime el subtotal y lo trata como no verificable;
- los `partial` históricos sin `sourceFoodItemCount` no se ocultan sólo por ausencia de ese metadato, porque ya están fuera de promedios comparables y el contrato legacy no siempre permite reconstruir `unquantifiedRelevantItemCount` de forma exacta;
- si la prueba lower-level falla, Vida sólo degrada/suprime la presentación; nunca recalcula el nutriente ni asciende un `partial` a `complete`;
- una señal de atención requiere al menos 3 días evaluables, al menos 2 días con la señal y presencia en al menos 50% de los días evaluables;
- las referencias se resuelven por `Nutrient Summary.targetDecisionId` cuando existe y, si no existe lineage, por fecha desde `Nutrient Targets`; una decisión histórica `superseded` puede seguir describiendo sus días pasados, pero nunca revive como referencia actual;
- una RDA/AI se interpreta como adecuación, un UL como límite superior y un rango como rango; una misma decisión puede contener adecuación + UL y ambos extremos se evalúan;
- si `Nutrient Targets` no está disponible, Vida no adivina la semántica a partir de una copia de `targetAmount` en el resumen;
- estas señales describen ingesta estimada repetida y nunca diagnostican deficiencia, toxicidad o estado clínico.

`Nutrient Targets` aporta la referencia activa aun cuando todavía no exista consumo cuantificado. Vida resuelve por `nutrientKey` la fila activa más reciente cuyo rango de vigencia incluya el día actual.

`Nutrient Summary` aporta una fila materializada por fecha/nutriente con campos compatibles con:

```text
date
nutrientKey
nutrientName
group
amount
amountLow
amountHigh
unit
targetAmount
lowerTarget
upperTarget
confidence
sourceCoverage
sourceFoodItemCount
unquantifiedRelevantItemCount
qualityFlags
notes
updatedAt
summaryVersion
targetDecisionId
```

Cuando una referencia activa existe en `Nutrient Targets`, Vida la usa directamente para target/límites y evita depender de una copia potencialmente vieja dentro de `Nutrient Summary`. Si todavía no existe cantidad, muestra `Sin dato` contra la referencia cargada.

Mientras falten valores diarios, o una fila de `Nutrient Summary` quede suprimida por una contradicción de lineage, Vida solo deriva honestamente de `Food Items` los subtotales ya presentes allí (actualmente fibra y sodio cuando estén cuantificados) y deja el resto desconocido.

Claves visuales soportadas están en `lib/nutrition/nutrient-catalog.ts` y deben permanecer alineadas con el contrato de Nutrition Intelligence.

## Análisis IA

Vida no infiere por su cuenta potencial antioxidante, perfil antiinflamatorio, mejoras ni patrones. Solo muestra conclusiones persistidas por Nutrition Intelligence en `AI Insights`.

Además, una conclusión persistida no se considera automáticamente vigente para siempre:

- el insight debe tener `createdAt` parseable y una ventana auditable (`today-so-far`, `day-closed` o `Nd`);
- Vida compara ese `createdAt` con mutaciones posteriores de Meals, Food Items, Food Nutrients, Daily Summary, Nutrient Summary, Targets y Nutrient Targets que intersecten la ventana;
- si existe evidencia material más nueva, el insight queda `stale` y no se renderiza hasta que Nutrition Intelligence lo refresque;
- si la vigencia no puede verificarse por ventana/timestamp contractual faltante, falla cerrado y tampoco se presenta como conclusión actual;
- `sourceSummaryVersion` conserva lineage/versionado del contrato de derivación; no se usa como contador de frescura porque `summaryVersion` no representa el número de correcciones.

Vida no regenera ni reescribe el insight al detectar staleness: sigue siendo una capa read-only.

Contrato consumido:

```text
insightId
date
category
tone
title
detail
evidence
window
confidence
status
createdAt
sourceSummaryVersion
limitations
```

Categorías soportadas:

- `antioxidants`
- `anti-inflammatory`
- `improvement`
- `pattern`

Tonos: `positive | watch | neutral`.

La evidencia debe distinguir hechos del store, estimaciones y recomendaciones. No se guardan diagnósticos ni causalidad inventada.

## Diseño

La vista toma ideas de trackers nutricionales de alta densidad informativa (energía, macros, reportes de micronutrientes y tendencias), pero usa el sistema visual propio de Vida 2.0 y prioriza:

1. **Hoy** como superficie operativa de baja carga, no como dashboard enciclopédico;
2. incertidumbre visible y `unknown ≠ zero`;
3. **Tendencias** longitudinales 7D / 28D / 90D, con 28D por defecto;
4. **Nutrientes** longitudinales con promedios sólo sobre días comparables;
5. semántica explícita de adecuación, rango y upper limit;
6. una sola señal de mayor valor en Hoy; interpretación más amplia queda en períodos/revisiones;
7. **Plan** separado de consumo real y conservando Notion como autoridad;
8. freshness visible cuando el resumen derivado queda detrás del intake crudo;
9. mobile-first.

## Escrituras

Este slice de Vida es read-only. No crea comidas, objetivos, nutrientes, catálogo ni insights y no habilita ninguna escritura desde la web.

La producción de `Food Nutrients`, `Nutrient Summary`, `AI Insights` y del catálogo reusable pertenece a Nutrition Intelligence y su store privado.
