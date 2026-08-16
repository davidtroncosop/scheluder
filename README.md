# Scheduler Pro

Aplicación web para administrar docentes, asignaturas, salas y planificación académica. El frontend usa React y Vite; la API usa Hono sobre Cloudflare Pages Functions y persiste en Cloudflare D1.

## Requisitos

- Node.js 22.12 o posterior (`nvm use` lee `.nvmrc`).
- npm.
- Una cuenta de Cloudflare para desplegar.

## Desarrollo local

```bash
npm ci
cp .dev.vars.example .dev.vars
cp .env.example .env.local
npm run db:setup
npm run pages:dev
```

`db:setup` aplica las migraciones y carga datos exclusivamente de demostración desde `seed/demo_data.sql`. Las cuentas locales son `admin@scheduler.pro` y `coordinador@kine.edu`, con contraseña `DemoLocal2026!`. No ejecutes `npm run db:seed` sobre producción.

El modo demo solo puede activarse en un build de desarrollo. En producción, `DEMO_AUTH=false` y las contraseñas se verifican mediante PBKDF2.

## Planificación asistida

La ruta `/#/assistant` ofrece el flujo recomendado para coordinadores y administradores:

1. Seleccionar carrera y período.
2. Cargar un CSV con `nrc`, `codigo`, `nombre`, `nivel` y `horas`. Las filas prácticas (`LAB`, `TAL` o `SIM`) incluyen además `nrc_teorico`.
3. Generar una propuesta automática respetando disponibilidad docente, salas y capacidad.
4. Revisar excepciones y publicar cuando la cobertura sea completa.

El modo `Agregar y actualizar` conserva el backlog existente. El modo `Reemplazar período` elimina primero las secciones y asignaciones de la carrera/período seleccionados. El planificador tradicional permanece disponible en `/#/scheduler` para ajustes manuales.

Las prácticas se vinculan a una sección teórica padre. Dos prácticas hermanas pueden ejecutarse en paralelo cuando usan docentes y salas distintos; la teoría y cualquiera de sus prácticas nunca pueden compartir día y bloque.

## Preparación de producción

1. Crea la base D1 si aún no existe y copia su `database_id` a `wrangler.toml`:

```bash
npm run db:create
```

2. Aplica las migraciones productivas, sin cargar el seed demo:

```bash
npx wrangler d1 migrations apply scheduler-pro-db --remote
```

3. Genera dos secretos diferentes y aleatorios, de al menos 32 caracteres, y guárdalos sin incluirlos en archivos versionados:

```bash
openssl rand -base64 48
npx wrangler pages secret put JWT_SECRET --project-name scheduler-pro

openssl rand -base64 48
npx wrangler pages secret put BOOTSTRAP_TOKEN --project-name scheduler-pro
```

4. Despliega y crea el primer administrador una sola vez:

```bash
npm run deploy

curl -X POST 'https://TU-DOMINIO/api/auth/bootstrap' \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: TU_BOOTSTRAP_TOKEN' \
  --data '{"email":"admin@tu-dominio.cl","name":"Administrador","password":"UNA_CLAVE_UNICA_DE_12_O_MAS_CARACTERES"}'
```

5. Elimina inmediatamente `BOOTSTRAP_TOKEN` de los secretos del proyecto después de recibir una respuesta `201`. Luego inicia sesión y crea la primera carrera desde **Configuración → Carreras** antes de registrar coordinadores.

Si el frontend se sirve desde otro origen, configura `CORS_ORIGINS` con una lista explícita separada por comas. Las claves opcionales de IA también se almacenan como secretos:

```bash
npx wrangler pages secret put OPENAI_API_KEY --project-name scheduler-pro
npx wrangler pages secret put GEMINI_API_KEY --project-name scheduler-pro
```

## Controles de seguridad

- Los IDs de usuarios y recursos nuevos son UUID generados por el servidor.
- Un usuario accede a su perfil mediante `/api/auth/me`; la colección `/api/users` y sus mutaciones son solo para administradores.
- Cada consulta y mutación valida rol y carrera en el servidor.
- El usuario activo se vuelve a comprobar en D1 en cada solicitud autenticada.
- Hay límites separados para login, API general y operaciones costosas, implementados mediante contadores atómicos en D1 para mantener compatibilidad con Cloudflare Pages.
- Los JWT expiran, requieren un secreto productivo y nunca incluyen la contraseña.
- La creación pública genera una cuenta `pending` e inactiva; un administrador debe verificar la identidad y aprobarla. No se genera ni devuelve ningún token de verificación.
- La aplicación envía encabezados CSP, anti-framing, MIME sniffing y política de permisos.

La política completa, incluido el procedimiento exigido antes de habilitar correo y SPF/DKIM/DMARC, está en [docs/SECURITY.md](docs/SECURITY.md).

## Comandos principales

```bash
npm run typecheck   # Verificación TypeScript
npm test            # Pruebas automatizadas
npm run build       # Build productivo
npm run check       # Typecheck + pruebas + build
npm audit           # Dependencias vulnerables conocidas
```

La integración continua ejecuta `npm ci`, `npm run check` y bloquea vulnerabilidades de severidad alta.

Los procedimientos de monitoreo, respaldo diario, recuperación D1 y reversión de versiones están documentados en [docs/OPERATIONS.md](docs/OPERATIONS.md).

## API principal

| Método | Endpoint | Acceso |
|---|---|---|
| `POST` | `/api/auth/login` | Público, limitado por tasa |
| `POST` | `/api/auth/register` | Solicitud pública limitada por cliente y correo |
| `GET` | `/api/auth/registration-options` | Carreras disponibles para el registro |
| `POST` | `/api/auth/bootstrap` | Secreto de un solo uso y base vacía |
| `GET` | `/api/auth/me` | Usuario autenticado |
| `GET/POST/PUT/DELETE` | `/api/users` | Administrador |
| `POST` | `/api/users/:id/approve` | Aprobación administrativa de cuentas pendientes |
| `GET` | `/api/teachers`, `/api/subjects`, `/api/sections` | Filtrado por carrera; las secciones también por período (`period_id`) |
| `POST` | `/api/import/horarios` | Importa secciones aisladas por carrera y período (`career_id`, `period_id`) |
| `POST/PUT/DELETE` | Recursos académicos | Administrador o coordinador de la carrera |
| `GET/POST/PUT/DELETE` | `/api/schedule` | Autorización por carrera |
| `POST` | `/api/schedule/publish` | Horario completo y sin conflictos críticos |

## Despliegue

Antes de publicar:

```bash
npm run check
npm audit --audit-level=high
npx wrangler d1 migrations apply scheduler-pro-db --remote
npm run deploy
```

La configuración DNS de correo no forma parte del despliegue actual porque el producto no envía emails. No debe habilitarse correo hasta verificar SPF, DKIM y DMARC con el proveedor elegido.
