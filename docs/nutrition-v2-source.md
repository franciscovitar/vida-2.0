# Nutrition V2 — fuente y contrato visual

## Fuente de verdad

- Plan, meal prep y criterios operativos: Notion (`health.diet`).
- Ingesta cuantitativa real: Google Sheet dedicado de Nutrition Intelligence.
- Vida Web: vista derivada; no duplica comidas, alimentos del catálogo ni objetivos.

El spreadsheet se resuelve solo en servidor con `GOOGLE_NUTRITION_SPREADSHEET_ID` junto con la cuenta de servicio existente. El código no contiene el ID real y no hace fallback al Sheet general de hábitos ni al de Gimnasio.

## Tabs leídos por Vida

- `Meals`
- `Food Items`
- `Daily Summary`
- `Targets`
- `Nutrient Targets`
- `Nutrient Summary`
- `AI Insights`

`Meals` + `Food Items` son autoridad de ingesta. `Daily Summary` y `Nutrient Summary` son vistas materializadas derivadas. `Targets` contiene decisiones fechadas de energía/macros. `Nutrient Targets` contiene referencias fechadas por nutriente. `AI Insights` contiene interpretación persistida por Nutrition Intelligence.

`Food Catalog`, `Food Catalog Nutrients` y `Food Nutrients` pertenecen al runtime/store de Nutrition Intelligence. Vida no necesita leer el catálogo reusable: consume sus resultados materializados sin convertir la web en otra base de datos.

## Macros

La UI muestra proteína, carbohidratos, grasas y fibra.

- con cobertura completa: el valor puede mostrarse como total del día;
- con cobertura parcial: Vida suma únicamente valores conocidos y los etiqueta como `conocidos/parcial`;
- desconocido nunca se convierte en cero.

Los objetivos activos de `Targets` tienen prioridad para energía/macros. En particular, la meta personal activa de fibra prevalece visualmente sobre una referencia dietaria genérica de `Nutrient Targets`.

## Micronutrientes

La pantalla contiene un catálogo visual amplio de vitaminas, minerales y otros nutrientes. Ese catálogo define nombres/unidades de presentación, no cantidades personales ni recomendaciones.

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

Mientras falten valores diarios, Vida solo deriva honestamente de `Food Items` los subtotales ya presentes allí (actualmente fibra y sodio cuando estén cuantificados) y deja el resto desconocido.

Claves visuales soportadas están en `lib/nutrition/nutrient-catalog.ts` y deben permanecer alineadas con el contrato de Nutrition Intelligence.

## Análisis IA

Vida no infiere por su cuenta potencial antioxidante, perfil antiinflamatorio, mejoras ni patrones. Solo muestra conclusiones persistidas por Nutrition Intelligence en `AI Insights`.

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

1. lectura rápida del día;
2. incertidumbre visible;
3. tendencias de 7 días;
4. micronutrientes por divulgación progresiva;
5. referencias visibles aunque todavía falte consumo cuantificado;
6. análisis IA separado de datos observados;
7. mobile-first.

## Escrituras

Este slice de Vida es read-only. No crea comidas, objetivos, nutrientes, catálogo ni insights y no habilita ninguna escritura desde la web.

La producción de `Food Nutrients`, `Nutrient Summary`, `AI Insights` y del catálogo reusable pertenece a Nutrition Intelligence y su store privado.
