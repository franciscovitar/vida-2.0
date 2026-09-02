# Nutrition V2 — fuente y contrato visual

## Fuente de verdad

- Plan, meal prep y criterios operativos: Notion (`health.diet`).
- Ingesta cuantitativa real: Google Sheet dedicado de Nutrition Intelligence.
- Vida Web: vista derivada; no duplica comidas ni objetivos.

El spreadsheet se resuelve solo en servidor con `GOOGLE_NUTRITION_SPREADSHEET_ID` junto con la cuenta de servicio existente. El código no contiene el ID real y no hace fallback al Sheet general de hábitos ni al de Gimnasio.

## Tabs actuales leídos

- `Meals`
- `Food Items`
- `Daily Summary`
- `Targets`

`Meals` + `Food Items` son autoridad de ingesta. `Daily Summary` es una vista materializada derivada. `Targets` contiene decisiones fechadas de objetivos; si no existe una decisión activa, Vida muestra el objetivo como pendiente en vez de inventarlo.

## Macros

La UI muestra proteína, carbohidratos, grasas y fibra.

- con cobertura completa: el valor puede mostrarse como total del día;
- con cobertura parcial: Vida suma únicamente valores conocidos y los etiqueta como `conocidos/parcial`;
- desconocido nunca se convierte en cero.

## Micronutrientes

La pantalla ya contiene un catálogo visual amplio de vitaminas, minerales y otros nutrientes. El catálogo define nombres/unidades de presentación, no valores ni recomendaciones personales.

Para poblarlos sin ensanchar `Food Items`, Nutrition Intelligence puede agregar el tab opcional `Nutrient Summary` con una fila por fecha/nutriente:

```text
date
nutrientKey
nutrientName
group
amount
unit
targetAmount
lowerTarget
upperTarget
confidence
sourceCoverage
notes
```

Claves visuales soportadas están en `lib/nutrition/nutrient-catalog.ts`.

Mientras el tab no exista, Vida solo muestra micronutrientes que puedan derivarse honestamente de los campos ya presentes en `Food Items` (actualmente fibra y sodio cuando estén cuantificados) y marca el resto `Sin dato`.

## Análisis IA

Vida no infiere por su cuenta el potencial antioxidante, perfil antiinflamatorio ni mejoras de dieta. Solo muestra conclusiones persistidas por Nutrition Intelligence.

Contrato opcional propuesto para `AI Insights`:

```text
insightId
date
window
category
tone
title
detail
evidence
status
createdAt
```

Categorías soportadas:

- `antioxidants`
- `anti-inflammatory`
- `improvement`
- `pattern`

Tonos: `positive | watch | neutral`.

La evidencia debe distinguir hechos del store, estimaciones y recomendaciones. No se deben guardar diagnósticos ni causalidad inventada.

## Diseño

La vista toma ideas de trackers nutricionales de alta densidad informativa (energía, macros, reportes de micronutrientes y tendencias), pero usa el sistema visual propio de Vida 2.0 y prioriza:

1. lectura rápida del día;
2. incertidumbre visible;
3. tendencias de 7 días;
4. micronutrientes por divulgación progresiva;
5. análisis IA separado de datos observados;
6. mobile-first.

## Escrituras

Este slice es read-only. No crea comidas, objetivos, nutrientes ni insights y no habilita ninguna escritura desde Vida.
