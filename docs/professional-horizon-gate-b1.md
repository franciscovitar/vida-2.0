# Profesional — Gate B1: comparación por horizontes (V17)

Fecha: 2026-10-10. Alcance: /professional/mercado, sin modificación de Producción.

## Fuente canónica

- PAS: `AI/projects/professional-intelligence/FORECAST_CURRENT_V1.json`, commit `08ae01c509111438cb77f0f9582b9966013ae4a2`, observado 2026-09-18.
- Política: `FORECASTING_POLICY_V1.md`.
- Derivado para Vida: `data/generated/professional-forecast-horizons.json` con seis familias, tres horizontes y respaldo textual original (inglés) junto a traducción fiel a español para la interfaz.

## Qué aparece en QA

- Matriz de seis áreas y `NEAR_12_24M`, `MID_3_5Y`, `LONG_5_10Y`.
- Cada celda ofrece juicio DIRECCIONAL y confianza, nunca un `score` de empleabilidad o probabilidad de sustitución.
- Al seleccionar se ven interacción de IA, señales observables a seguir, condiciones que cuestionarían el escenario y acción contingente traducida.
- Los gráficos de empleo BLS 2025–2035 de Gate A permanecen separados y comparables solamente dentro de su ámbito estadounidense.
- Diseño accesible mediante tabla semántica, botones operables por teclado, estados textuales y desplazamiento horizontal móvil.

## Límites de la inferencia

- «Favorable» NO significa carrera ganadora para el usuario, salario alto ni facilidad de entrada.
- Los horizontes de forecast (12–24 meses, 3–5 años, 5–10 años) NO equivalen a Y1/Y5/Y10 del Career Resilience Runtime.
- El horizonte 20 años y los tres índices heurísticos de resiliencia corresponden a V16, aún no expuestos en esta vista.
- PAS declara BASE, FASTER_AI_CAPABILITY_AND_ADOPTION y SLOWER_OR_CONSTRAINED_ADOPTION como escenarios a considerar, pero el forecast actual no contiene una tabla de resultados individuales por escenario; por eso la UI muestra solo BASE_DIRECTIONAL_ONLY y NO simula resultados para variantes.
- Las traducciones son presentación derivada, no nueva inteligencia canónica; conservan el enunciado original para revisar fidelidad y procedencia.
- Todas las señales son hipótesis/indicadores para monitorear, no pruebas actuales de que un rol desaparecerá.
- No inferir demanda actual Argentina con proyecciones globales o estadounidenses.

## Actualización y tests

- Si cambia el forecast canónico, derivar nuevamente desde PAS main con commit/ref explícitos y revisar traducciones contra el original. No refrescar cambiando solo la fecha.
- Validator fail-closed exige seis IDs conocidos, 18 celdas válidas y fuente canónica. Dato inválido o faltante: mostrar un estado informativo, no inventar cifras.
- Tests focalizados PRO-HORIZON-01–06 y QA global npm test, npm run check y npm run build. Revisión de captura móvil y escritorio autenticados por el dueño después del despliegue QA.
- `vida-qa` es Preview autenticado; el merge a `main` de Vida dispararía Producción y queda excluido sin autorización.
