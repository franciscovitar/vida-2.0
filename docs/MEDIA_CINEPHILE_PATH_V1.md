# Camino del cinéfilo v1

## Objetivo

Convertir el historial de Media en una señal positiva de cultura audiovisual acumulada, sin transformar el Banco en una lista infinita de pendientes.

`100%` representa un hito deliberado de **cultura audiovisual amateur muy formada**. No representa dominio profesional, haber visto todo el canon ni completar todo el catálogo.

## Principios

- El progreso celebra lo visto; lo no visto son opciones, no deuda.
- Agregar nuevos títulos al catálogo nunca reduce el porcentaje actual.
- La nota personal no altera el progreso cultural: una obra puede no gustar y aun así haber ampliado el mapa audiovisual.
- Las obras con mayor `Valor cinéfilo` y `Presencia cultural` aportan bastante más que obras marginales.
- También suma la amplitud histórica y de géneros para evitar que cantidad dentro de un único nicho domine el recorrido.
- Películas, Series y Global tienen caminos separados.
- Las series activas reciben crédito parcial; terminarlas no se presupone.
- `Reveer` ya cuenta como obra vista y no genera progreso nuevo por defecto.

## Modelo v1

Cada camino combina:

- 75%: obras fundamentales, usando una transformación no lineal de `Valor cinéfilo` (60%) y `Presencia cultural` (40%), renormalizando si una dimensión falta;
- 15%: recorrido histórico por etapas;
- 10%: diversidad de géneros.

Los objetivos de puntos son fijos por versión y no dependen del tamaño actual del catálogo. Global combina Películas (65%) y Series (35%).

Los próximos saltos se calculan exclusivamente sobre títulos `Por ver` del Banco y muestran el aumento marginal estimado en el camino del medio y en Global.

## Niveles

- 0–24,9: Explorador
- 25–44,9: Explorador con mapa
- 45–64,9: Cinéfilo en formación
- 65–84,9: Cinéfilo sólido
- 85–99,9: Cultura audiovisual amplia
- 100: Cinéfilo amateur muy formado

## Notas por temporada

`Mi nota general` y `Mi nota` de cada temporada son observaciones distintas. Una temporada sin nota histórica queda explícitamente como `Sin registrar`; nunca se copia la nota general ni se inventa una nota de temporada. La UI permite registrar varias temporadas consecutivas sin cerrar el detalle después de cada guardado.

## Evolución

Cuando el sistema de scoring externo se actualiza o aparecen nuevas obras relevantes, pueden cambiar las recomendaciones futuras. Una revisión de esta versión no debe hacer retroceder silenciosamente el progreso ya alcanzado: si cambia el contrato, debe versionarse y explicarse.
