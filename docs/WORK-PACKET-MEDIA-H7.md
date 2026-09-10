# Media H7 — Work Execution Packet

## OBJECTIVE

Certificar la única frontera externa pendiente de Hito 7: que el Preview de `vida-2.0` para la rama `feature/media-v1-dashboard` lea en `/media` datos reales desde el Google Sheet canónico dedicado `Vida 2.0 — Media`.

## CURRENT STATE

- PR canónico: #29, `feat(media): add read-only Media V1 dashboard`.
- Rama: `feature/media-v1-dashboard`.
- Último head validado por ChatGPT al preparar este packet: `a135636036c77c102e73690e4d14b841ead4875a`; revalidarlo antes de actuar.
- GitHub Actions `Quality` sobre ese candidato: PASS completo, incluido `npm run verify` y build de producción.
- Vercel generó un Preview READY para ese mismo candidato; revalidar SHA/estado en vivo antes de usarlo.
- `/media` ya está implementado como vista derivada read-only. Google Sheets sigue siendo la única fuente de verdad.
- El lector de Media exige `GOOGLE_MEDIA_SPREADSHEET_ID` y reutiliza las credenciales server-side existentes `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`.
- El conector Vercel disponible a ChatGPT no expone administración de variables de entorno; ése es el blocker exacto.
- El valor real del spreadsheet ID no debe escribirse en este archivo, commits, logs, screenshots ni retorno.
- Production permanece fuera de alcance.

## BOUNDARY

Únicamente:

1. proyecto Vercel `vida-2-0`;
2. entorno Preview;
3. rama `feature/media-v1-dashboard`;
4. variable `GOOGLE_MEDIA_SPREADSHEET_ID`;
5. redeploy Preview del mismo head sólo si Vercel lo requiere para incorporar la variable;
6. smoke funcional read-only de `/media`.

## DO

1. Revalidar que PR #29 siga abierto, que la rama siga siendo `feature/media-v1-dashboard`, que el head esperado no haya cambiado inesperadamente y que el Preview asociado corresponda a ese head.
2. Resolver de forma inequívoca el Google Sheet titulado exactamente `Vida 2.0 — Media`. Obtener su spreadsheet ID sin imprimirlo, copiarlo a logs, guardarlo en archivos ni devolverlo.
3. En Vercel, agregar `GOOGLE_MEDIA_SPREADSHEET_ID` sólo al entorno Preview. Si Vercel permite scope por rama, limitarlo a `feature/media-v1-dashboard`.
4. No modificar `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` ni ninguna otra variable existente.
5. Si la nueva variable no aplica retroactivamente al deployment actual, provocar un único redeploy Preview del mismo head. No crear otra rama ni cambiar código.
6. Abrir el Preview y navegar a `/media` usando la autenticación ya soportada por el proyecto. Si una autenticación humana existente puede reutilizarse, preservarla; no rehacer OAuth por rutina.
7. Verificar evidencia observable mínima:
   - `/media` carga sin banner de fuente no configurada/read-error;
   - Películas y Series muestran datos reales no vacíos;
   - se puede alternar Películas/Series;
   - búsqueda devuelve un título existente;
   - al menos un filtro de género o país reduce/modifica resultados;
   - Banco/Vistas-Terminadas funciona sin modificar el Sheet;
   - no aparecen Media ID, TMDB ID, IMDb ID, provenance ni source URLs en la UI;
   - no hay HTTP 5xx atribuible a `/media` durante el smoke.
8. No repetir `npm test` ni `npm run verify`: ya están certificados para el candidato salvo evidencia de regresión.
9. Al terminar, devolver sólo el resultado mínimo definido abajo. No devolver valores de variables, IDs internos ni credenciales.

## DO NOT

- No tocar Production.
- No mergear PR #29.
- No cambiar código, dependencias, ramas ni arquitectura.
- No escribir Google Sheets, Notion, Calendar, OpenClaw, n8n ni otras fuentes.
- No cambiar, rotar ni volver a crear credenciales existentes.
- No hardcodear el spreadsheet ID.
- No reutilizar `GOOGLE_SHEETS_PROD_ID`, `GOOGLE_SHEETS_DEV_ID` ni otro Sheet como sustituto.
- No abrir Journaling.
- No ampliar el alcance a arreglar OAuth general, SSO u otra infraestructura si el smoke queda bloqueado por esa frontera.
- No hacer múltiples redeploys o reintentos ciegos.

## SUCCESS

PASS sólo si, sobre un Preview cuyo SHA fue revalidado, `/media` lee el Sheet canónico real y pasan todos los checks funcionales mínimos sin escrituras ni exposición de identificadores internos.

## STOP CONDITIONS

Detenerse y devolver BLOCKED/FAIL si ocurre cualquiera de estos casos:

- el head/Preview ya no corresponde al candidato esperado y la diferencia no es puramente documental conocida;
- el Sheet exacto no puede resolverse de manera inequívoca;
- la cuenta de servicio no tiene acceso al Sheet;
- completar la tarea requeriría cambiar credenciales existentes, OAuth global, código o Production;
- aparece un error distinto tras una única reparación focal dentro de la frontera autorizada;
- no puede verificarse que el smoke sea read-only.

## RETURN

```text
RESULT: PASS / FAIL / BLOCKED
EVIDENCE: <SHA revalidado; Preview READY; /media real; Movies/Series; búsqueda/filtro; sin 5xx; sin IDs internos>
CHANGES: <sólo GOOGLE_MEDIA_SPREADSHEET_ID en Preview + redeploy del mismo head si fue necesario>
FAILED BOUNDARY: <vacío si PASS; frontera exacta si no>
NEXT DECISION: <si PASS: ChatGPT puede preparar integración, pero Production sigue requiriendo autorización explícita>
```
