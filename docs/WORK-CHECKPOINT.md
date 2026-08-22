# Vida 2.0 — Work checkpoint

Este archivo es el handoff durable para retomar setup externo y validaciones E2E sin depender de la
memoria del chat. **No es una fuente de verdad en vivo.** Todo dato volátil debe revalidarse antes de
actuar.

## Cómo usar este checkpoint

Al retomar trabajo:

1. leer este archivo antes de rehacer setup;
2. revalidar sólo los datos volátiles necesarios para el siguiente gate;
3. conservar los componentes ya verificados como correctos;
4. reparar el primer blocker real, no reconstruir el flujo completo;
5. ejecutar el E2E final únicamente cuando readiness vuelva a `PASS`;
6. actualizar este archivo al terminar o pausar, sin secretos ni datos sensibles.

Estados recomendados:

- `VERIFIED`: comprobado en la sesión actual mediante evidencia observable;
- `LAST_KNOWN`: último estado registrado, todavía no revalidado en la sesión actual;
- `BLOCKED`: hay un blocker conocido que impide avanzar;
- `DONE`: gate completado y no requiere repetición salvo que cambie una dependencia;
- `UNKNOWN`: falta evidencia actual.

## Último handoff operativo

> Registrado como continuidad de la sesión de setup previa. Revalidar los ítems marcados
> `LAST_KNOWN` antes de usarlos como hechos actuales.

| Componente / gate        | Estado       | Último dato conocido                                                                 | Regla al retomar                                                                                            |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Repositorio `main`       | `VERIFIED`   | `28b536667810268365b8d08cb47b9db90b1fe39f` al crear este checkpoint                  | No confundir este SHA con un SHA de Preview; volver a leer `main` si el trabajo depende del código actual.  |
| Preview                  | `LAST_KNOWN` | Se había reportado `READY` en la sesión de setup                                     | Verificar deployment y readiness reales antes de cualquier E2E.                                             |
| SHA/candidato de Preview | `LAST_KNOWN` | Se había trabajado con un candidato `8a401949…`                                      | Confirmar el SHA completo y que corresponda al Preview activo antes de usarlo.                              |
| Túnel                    | `LAST_KNOWN` | Tailscale configurado y elegido como transporte estable                              | Probar reachability. Si funciona, conservarlo; no volver a Cloudflare/ngrok por defecto.                    |
| Login/OAuth Google       | `LAST_KNOWN` | Autenticación humana completada en navegador del usuario                             | Verificar el efecto/autorización resultante; no reiniciar OAuth sólo por falta de sesión en otro navegador. |
| n8n                      | `LAST_KNOWN` | Proceso detenido al último cierre; se habían observado 15 ejecuciones                | Verificar proceso/workflow actual antes de iniciar o repetir ejecuciones.                                   |
| Store temporal / Upstash | `BLOCKED`    | El recurso temporal se había reportado expirado                                      | Restaurar o reemplazar sólo este recurso; después volver a ejecutar readiness.                              |
| Readiness global         | `BLOCKED`    | No debe considerarse `PASS` mientras el store temporal siga inválido o sin verificar | Resolver primer blocker y revalidar.                                                                        |
| E2E final                | `LAST_KNOWN` | No ejecutado todavía                                                                 | Ejecutar una sola cadena final cuando todos los gates requeridos estén en `PASS`.                           |
| Production               | `LAST_KNOWN` | No debía tocarse durante este setup                                                  | Mantener sin cambios salvo autorización explícita específica.                                               |
| Datos externos           | `LAST_KNOWN` | Sin cambios intencionales fuera del flujo de prueba                                  | Preservar; verificar efectos antes de repetir acciones con side effects.                                    |

## Próxima acción canónica

Mientras el estado anterior siga siendo válido, el orden es:

1. verificar que el blocker real siga siendo el store temporal;
2. restaurar o reemplazar el recurso temporal mínimo necesario;
3. ejecutar el readiness check completo;
4. si y sólo si devuelve `PASS`, ejecutar una única cadena E2E final;
5. registrar evidencia observable del resultado y actualizar este checkpoint.

Si al revalidar aparece un blocker anterior o diferente, **ese nuevo blocker pasa a ser la próxima
acción**. No continuar por inercia con los pasos de arriba.

## Evidencia mínima para marcar cierre

El setup/E2E puede considerarse cerrado sólo cuando quede evidencia actual de:

- Preview correcto y accesible;
- SHA/deployment esperado confirmado;
- túnel alcanzable si el flujo lo requiere;
- autenticaciones necesarias efectivas;
- servicios requeridos activos;
- store/dependencias temporales válidas;
- readiness en `PASS`;
- una ejecución E2E final completada con resultado observable;
- ausencia de cambios no autorizados en Production;
- checkpoint actualizado con el resultado final.

## Higiene del archivo

- No pegar secretos, tokens, cookies, credenciales, emails, payloads privados ni IDs sensibles.
- Los estados `LAST_KNOWN` caducan conceptualmente al comenzar una nueva sesión: primero se
  revalidan, después pueden promoverse a `VERIFIED`.
- Si una dependencia cambia de herramienta o arquitectura por decisión explícita, actualizar este
  documento y también `AGENTS.md` si la decisión pasa a ser una regla durable.
- Este archivo conserva estado operativo; las reglas permanentes viven en `AGENTS.md`.
