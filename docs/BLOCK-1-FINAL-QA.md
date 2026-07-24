# Bloque 1 — QA final de Web interactiva

Este cierre valida la experiencia interactiva sin habilitar escrituras externas. El orden obligatorio es:

1. auditoría estática;
2. validación técnica completa;
3. prueba local en navegador;
4. Preview de Vercel;
5. revisión final antes del merge.

## 1. Validación automatizada

Desde `Vida2-WebInteractive`:

```powershell
npm run qa:block1
npm run verify
npm test
```

Criterio de aprobación:

- `qa:block1`: 14/14 controles;
- TypeScript, ESLint, Stylelint y Prettier: PASS;
- build de Next.js: PASS;
- tests: 684/684;
- ninguna importación de `runWriteAction` en los cinco workspaces interactivos.

## 2. Recuperación real de borradores

Repetir en Gimnasio, Tareas, Proyectos, Bandeja y Aprobaciones:

1. agregar contenido realista al plan local;
2. esperar hasta ver “Cambios guardados en este navegador”;
3. recargar la página;
4. confirmar el mensaje de recuperación y verificar todos los campos;
5. usar “Eliminar copia local”;
6. recargar otra vez y confirmar que no reaparece.

También comprobar:

- formularios vacíos no generan copias;
- contenido quitado por completo elimina la copia;
- una rutina de gimnasio incompatible no restaura una sesión anterior;
- una entrada corrupta o vencida se descarta sin romper la página.

## 3. Privacidad y aislamiento

En DevTools → Application → Local Storage deben existir únicamente claves con prefijo:

```text
vida2:web-draft:v1:
```

Confirmar que:

- no aparecen tokens, correos autorizados, IDs internos ni credenciales;
- los borradores no se sincronizan entre perfiles o navegadores;
- cerrar sesión no envía el contenido a Notion, Sheets o Calendar;
- el aviso indica que localStorage no está cifrado;
- `WRITE_ACTIONS_ENABLED=false`;
- `OPENCLAW_API_ENABLED=false`;
- `GOOGLE_SHEETS_TARGET=dev`;
- `GOOGLE_SHEETS_ALLOW_PROD_WRITES=false`.

## 4. Responsive y accesibilidad

Probar como mínimo:

- móvil: **390 × 844**;
- tablet: 768 × 1024;
- escritorio: 1440 × 900.

En cada tamaño:

- no hay scroll horizontal de la página;
- botones e inputs tienen un área táctil mínima de 44 px;
- los formularios se pueden recorrer con Tab;
- el foco es visible;
- mensajes de guardado y error se anuncian mediante `aria-live`;
- listas largas no rompen tarjetas ni ocultan botones;
- textos extensos y enlaces HTTPS no desbordan.

## 5. Fallos de almacenamiento

Simular en DevTools:

1. modificar la versión del envelope;
2. cambiar `expiresAt` por una fecha pasada;
3. reemplazar `payload` por un tipo inválido;
4. pegar JSON corrupto;
5. bloquear localStorage para el sitio.

Resultado esperado:

- la página sigue cargando;
- la copia inválida se elimina;
- aparece un estado seguro de error cuando el navegador bloquea almacenamiento;
- no se intenta ninguna escritura externa como alternativa.

## 6. Preview de Vercel

Desplegar únicamente la rama `feature/web-interactive-v1`.

Antes de probar:

```powershell
npm run preview:check
```

En el Preview de Vercel validar con una cuenta autorizada:

- `/gimnasio`;
- `/tareas`;
- `/proyectos`;
- `/bandeja`;
- `/aprobaciones`;
- `/ajustes`.

Repetir guardado, recarga y eliminación en el mismo navegador. Abrir el Preview en otro perfil y confirmar que los borradores no aparecen.

No promover a Production ni activar flags de escritura durante esta etapa.

## 7. Criterio de cierre

El Bloque 1 puede cerrarse cuando:

- todas las validaciones automáticas pasan;
- la recuperación funciona en local y Preview;
- los cinco módulos muestran estados vacíos, guardados, restaurados y de error;
- no hay escrituras a Notion, Sheets o Calendar;
- no hay errores de consola relevantes;
- móvil y escritorio quedan aprobados;
- el worktree está limpio después del commit.
