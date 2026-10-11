# Benchmark público de modelos en Herramientas (snapshot 2026-10-11)

## Fuente y alcance

- **Autoridad de los números:** [LiveBench](https://livebench.ai/), release `2026-06-25`, resultados observados el `2026-10-11`.
- **Derivado solamente:** `data/generated/professional-ai-benchmark-livebench.json`. Datos públicos resumidos, no fuente canónica de precios/planes ni evaluación personal.
- **Métrica:** promedio publicado por categoría (0–100) para cada configuración de modelo/effort. Los ocho modelos son una selección acotada, no todos los evaluados.
- **Comparabilidad:** comparar únicamente dentro de la misma edición y columna. No mezclar con SWE-bench, Terminal-Bench, precios de suscripción, resultados API por token o distintos entornos.
- **Precaución:** las configuraciones/effort de los modelos pueden diferir; puntuaciones cercanas no demuestran superioridad causal de una marca.

## Relevancia por tarea

- `coding` → columna **Coding**, categoría directamente relacionada.
- `data` → columna **Data Analysis**, categoría directamente relacionada.
- `debug`, `backend`, `frontend` → **Agentic Coding**, solo indicador indirecto; no eval específica de debugging, APIs o diseño visual.
- `research`, `study` → **Reasoning**, solo indicador indirecto; no eval de investigación con fuentes ni aprendizaje pedagógico.
- `browser` → **sin puntuación**. Evitar transferir un benchmark de terminal/código a navegador web autónomo.

## Seguridad, costo y mantenimiento

- El gráfico compara **configuraciones de modelos**. El listado siguiente compara **producto + plan + canal + límite principal** de PAS; nunca afirmar que un plan incluye necesariamente un modelo evaluado sin una fuente vigente.
- `V09`: referencia pública de descubrimiento, no veredicto personal. `V10`: costo por tarea completada sigue pendiente de pruebas propias; no convertir precio mensual en USD/tarea resuelta.
- El snapshot se marca histórico después de 45 días sin revalidar; los resultados siguen visibles como registro histórico, nunca como ranking vigente.
- Los precios/cuotas vencidos se ocultan por el contrato de ofertas actual **sin ocultar el benchmark**, evitando confundir obsolescencia comercial con invalidez histórica.
- Para reemplazar la edición o las filas: verificar cifras contra la misma fuente, actualizar fecha/proveniencia y ejecutar pruebas; no inferir modelos o valores faltantes.
- Producción y OAuth fuera de alcance de esta mejora.
