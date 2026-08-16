# Operación productiva

## Monitoreo

`GET /api/health` comprueba tanto la función como la conexión de lectura a D1. Devuelve HTTP 200 con `status: ok`; una falla de base de datos devuelve HTTP 503 sin exponer detalles internos.

El workflow `Production monitor` consulta cada hora la portada y el health check. GitHub notifica a los responsables del repositorio cuando falla. También puede ejecutarse localmente:

```bash
npm run monitor:production
```

## Respaldo

Antes de migraciones o cargas masivas:

```bash
npm run db:backup
```

Los archivos se guardan en `.backups/d1/`, fuera de Git, y el comando imprime su SHA-256. Deben almacenarse en un repositorio cifrado con acceso restringido porque contienen datos personales.

El workflow `Production database backup` genera una exportación diaria y la conserva 14 días como artefacto privado de GitHub. Requiere configurar en el repositorio los secretos `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`, con un token limitado a lectura de D1. Cloudflare Time Travel complementa estas exportaciones y permite volver a un punto de los últimos 30 días.

## Recuperación

1. Identificar el instante UTC anterior al incidente o consultar el bookmark actual:

   ```bash
   npx wrangler d1 time-travel info scheduler-pro-db --timestamp 2026-08-16T15:00:00Z
   ```

2. Descargar y verificar el último respaldo SQL disponible.
3. Detener importaciones y publicaciones durante la recuperación.
4. Ejecutar el rollback. El script crea primero un nuevo respaldo y exige confirmación explícita:

   ```bash
   npm run db:rollback -- scheduler-pro-db 2026-08-16T15:00:00Z --confirm
   # También acepta un bookmark en lugar del timestamp.
   ```

5. Aplicar las migraciones que correspondan a la versión desplegada y validar:

   ```bash
   npx wrangler d1 migrations apply scheduler-pro-db --remote
   npm run monitor:production
   ```

6. Comprobar login, carrera/período activo, cantidad de secciones, asignaciones y conflictos antes de reabrir operaciones.

## Despliegue y reversión de código

Cada liberación productiva se etiqueta como `vX.Y.Z`. Para volver a una versión anterior, crear una rama desde la etiqueta, ejecutar `npm ci && npm run check` y desplegar esa revisión. La base de datos solo debe restaurarse si el esquema o los datos son incompatibles; un rollback de código no implica automáticamente un rollback de D1.
