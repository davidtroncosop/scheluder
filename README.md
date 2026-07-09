# 🗓️ Scheduler Pro

**Plataforma de gestión táctica para planificación académica inteligente**

Sistema que transforma el caos de la planificación de horarios en un proceso de toma de decisiones inteligente usando un motor de reglas en tiempo real.

## 🚀 Stack Tecnológico

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Cloudflare Workers + Hono
- **Base de Datos**: Cloudflare D1 (SQLite)
- **Despliegue**: Cloudflare Pages

## 📋 Requisitos

- Node.js 18+
- npm o pnpm
- Cuenta de Cloudflare (gratuita)

## 🛠️ Instalación Local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear base de datos D1 local
npm run db:migrate
npm run db:seed

# 3. Ejecutar en modo desarrollo (2 terminales)

# Terminal 1: Vite (Frontend)
npm run dev

# Terminal 2: Wrangler Pages (Backend + D1)
npm run pages:dev
```

La aplicación estará disponible en:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8788/api

## 🌐 Despliegue en Cloudflare

### 1. Crear la base de datos D1 en producción

```bash
npx wrangler d1 create scheduler-pro-db
```

Copia el `database_id` que te devuelve y actualiza `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "scheduler-pro-db"
database_id = "TU-DATABASE-ID-AQUI"
```

### 2. Aplicar migraciones en producción

```bash
npx wrangler d1 execute scheduler-pro-db --remote --file=./migrations/0001_initial_schema.sql
npx wrangler d1 execute scheduler-pro-db --remote --file=./migrations/0002_seed_data.sql
```

### 3. Configurar secretos

```bash
npx wrangler secret put JWT_SECRET
# Ingresa una clave secreta segura
```

### 4. Desplegar a Cloudflare Pages

```bash
npm run deploy
```

## 📊 Estructura del Proyecto

```
scheduler-pro/
├── functions/           # Cloudflare Pages Functions (API)
│   └── api/
│       └── [[route]].ts # Catch-all API route con Hono
├── migrations/          # Migraciones D1
│   ├── 0001_initial_schema.sql
│   └── 0002_seed_data.sql
├── hooks/               # React Hooks personalizados
│   ├── useScheduler.ts  # Estado del planificador
│   └── useAuth.tsx      # Autenticación
├── pages/               # Páginas de React
│   ├── LoginPage.tsx
│   ├── SchedulerPage.tsx
│   └── ...
├── services/            # Servicios
│   └── api.ts           # Cliente API
├── types.ts             # Tipos TypeScript compartidos
├── wrangler.toml        # Configuración Cloudflare
└── package.json
```

## 🧠 Motor de Reglas

### Reglas Críticas (Bloquean publicación)
| Código | Nombre | Descripción |
|--------|--------|-------------|
| TEACHER_DUPLICATE | Unicidad Docente | Mismo docente en dos lugares |
| ROOM_OCCUPIED | Sala Ocupada | Sala ya asignada |
| TEACHER_BLOCKED | Docente No Disponible | Horario bloqueado |

### Advertencias
| Código | Nombre | Impacto Score |
|--------|--------|---------------|
| LEVEL_CLASH | Choque de Nivel | -50 pts |
| ROOM_TYPE_MISMATCH | Tipo Incompatible | -30 pts |
| OVERCAPACITY | Sobrecapacidad | -20 pts |
| FRIDAY_LAST_MODULE | Viernes Tarde | -15 pts |

## 🔐 Seguridad (RLS Simulado)

El sistema implementa Row Level Security a nivel de aplicación:

- Cada coordinador solo ve datos de su carrera
- Las salas compartidas (`is_shared = true`) son visibles por todos
- Los administradores tienen acceso global

## 📈 Score de Idoneidad

El sistema calcula dinámicamente un score (0-100%) para cada slot:

```
Base: 100 pts
+ 30 pts: Tipo de sala coincide (LAB para LAB)
+ 20 pts: Preferencia del docente
+ 20 pts: Horario contiguo con mismo nivel
- 10 pts: Sala demasiado grande
- 15 pts: Viernes último módulo
- Penalización por warnings
```

## 🎯 Endpoints API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/auth/login | Autenticación |
| GET | /api/careers | Listar carreras |
| GET | /api/teachers | Listar docentes |
| GET | /api/rooms | Listar salas |
| GET | /api/sections | Listar secciones |
| GET | /api/schedule | Obtener horario |
| POST | /api/schedule/assign | Asignar sección |
| GET | /api/schedule/score | Calcular scores |
| GET | /api/conflicts | Listar conflictos |
| GET | /api/metrics/health | Métricas de salud |

## 👤 Credenciales de Prueba

| Email | Rol |
|-------|-----|
| admin@scheduler.pro | Administrador |
| coordinador@kine.edu | Coordinador Kinesiología |

> En desarrollo, cualquier contraseña funciona.

## 📝 Licencia

MIT
