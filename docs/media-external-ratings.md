# Media — notas externas

Vida muestra notas externas únicamente como una vista derivada dentro del detalle de películas y series. No persiste estas puntuaciones en Google Sheets ni las usa como reemplazo de la nota personal, Afinidad para mí, Prioridad de visionado, Valor cinéfilo o Presencia cultural.

## Proveedor

La primera versión usa MDBList como agregador server-side porque permite recuperar en una sola consulta puntuaciones normalizadas de varias fuentes. Vida selecciona únicamente:

- IMDb;
- Letterboxd;
- Rotten Tomatoes (crítica / Tomatometer);
- Metacritic;
- TMDB.

FilmAffinity queda fuera de esta primera versión mientras no exista una integración estable equivalente; no se incorpora scraping de HTML como dependencia del producto.

## Promedio

El panel calcula un promedio aritmético simple con las fuentes disponibles para ese título. Cada score de MDBList llega normalizado a escala 0–100 y Vida lo presenta en escala 0–10. El promedio es sólo una síntesis visual de fuentes externas; no se trata como causalidad, afinidad personal ni score canónico del sistema.

## Seguridad y privacidad

- `MDBLIST_API_KEY` es server-only y nunca debe entrar al bundle del cliente, logs, commits o documentación con su valor real.
- El navegador llama a `/api/media/external-ratings` sólo con la key pública ya usada por `/media`.
- La ruta resuelve IMDb/TMDB del lado servidor desde el Sheet canónico y no devuelve esos identificadores al cliente.
- La respuesta de MDBList se valida contra la identidad esperada antes de mostrar ratings.
- No se escriben Google Sheets, Notion, Calendar ni otros stores.

## Configuración

Variable requerida en el runtime de Vida:

```text
MDBLIST_API_KEY=<server-only>
```

Si la variable está ausente, el panel se degrada sin afectar el resto del detalle de Media.
