# Google Calendar real — activación read-only

La integración de código ya está preparada para leer eventos reales mediante OAuth y
`events.list`. Esta guía documenta la activación externa sin guardar secretos en Git.

## Alcance

- Solo lectura (`calendar.events.readonly`).
- Sin creación, actualización ni eliminación de eventos.
- Sin descubrimiento automático de calendarios.
- Los IDs/correos configurados permanecen en el servidor y no se envían a la UI.
- Ante un fallo real, Agenda queda vacía con un aviso; nunca se mezclan mocks silenciosos.

## Variables de servidor

Configurar únicamente en el entorno correspondiente:

- `GOOGLE_CALENDAR_DATA_SOURCE=google`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_IDS` (por ejemplo `primary`, o una lista separada por comas)
- `GOOGLE_CALENDAR_TIMEZONE=America/Argentina/Cordoba`

`GOOGLE_CALENDAR_REDIRECT_URI` se usa solamente para el flujo local de obtención inicial del
refresh token. Las rutas OAuth están bloqueadas en Vercel y fuera de localhost.

## Modo del consentimiento local (`GOOGLE_CALENDAR_OAUTH_MODE`)

El flujo local `/api/calendar/oauth/start` resuelve el conjunto de scopes con una única variable
de servidor, nunca desde la query string ni el navegador:

- vacía, ausente, con typo o cualquier otro valor => `readonly`: solo
  `calendar.events.readonly`, idéntico al comportamiento actual.
- exactamente `hold-write` => opt-in local y manual para Calendar Hold. Solicita SOLO:
  1. `https://www.googleapis.com/auth/calendar.events.readonly`
  2. `https://www.googleapis.com/auth/calendar.events.owned`
  3. `https://www.googleapis.com/auth/calendar.calendars.readonly`

`readonly` es el default. El modo `hold-write` no se infiere de `WRITE_ACTIONS_ENABLED`, de
`GOOGLE_CALENDAR_WRITE_ID` ni del entorno Production/Preview, y no se configura en Vercel. El
runtime de lectura y el runtime de Calendar Hold no cambian: siguen usando solo el
refresh token. El scope general `calendar` y `calendar.events` quedan explícitamente fuera.

## Verificación segura

1. Mantener Production sin cambios.
2. Configurar primero un entorno local o Preview controlado.
3. Abrir `/agenda` y verificar que la fuente indique Google Calendar.
4. Confirmar que se vean eventos reales y que el contador de calendarios sea correcto.
5. Verificar Hoy: evento actual, próximo evento y bloques libres.
6. Forzar temporalmente una credencial inválida y confirmar que la agenda quede vacía con aviso.
7. Restaurar la credencial y volver a validar.

La UI muestra únicamente etiquetas sanitizadas como `Principal` o `Calendario 2`; nunca muestra
los IDs o correos configurados ni los IDs originales de eventos del proveedor.
