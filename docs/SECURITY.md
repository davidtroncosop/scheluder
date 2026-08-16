# Seguridad de Scheduler Pro

## Controles implementados

- Autenticación productiva con contraseñas PBKDF2-SHA256, sal aleatoria y el máximo de 100.000 iteraciones admitido por Cloudflare Workers. Para elevar el nivel de resistencia se recomienda migrar a un proveedor de identidad con passkeys o MFA.
- JWT HS256 estándar, con expiración, `iat` y secreto obligatorio en producción.
- Validación del usuario activo contra D1 en cada solicitud autenticada.
- Autorización por rol y carrera en cada recurso; los usuarios normales solo pueden consultar su propio perfil mediante `/api/auth/me`.
- Identificadores UUID generados exclusivamente por el servidor.
- Rate limiting con contadores atómicos D1: combinado por cuenta y cliente para login, por usuario y ruta para la API autenticada, y un límite separado para operaciones costosas.
- Bootstrap del primer administrador protegido por secreto, disponible solo mientras la tabla de usuarios esté vacía.
- CORS explícito por entorno y encabezados HTTP de seguridad.
- Las respuestas de usuarios nunca incluyen `password_hash`.

## Registro y aprobación de cuentas

`POST /api/auth/register` recibe solicitudes públicas con límites por cliente y correo. La contraseña se almacena con PBKDF2, la cuenta nace con rol `viewer`, estado `pending` y `is_active = 0`, y no puede autenticarse hasta que un administrador la aprueba. Tanto correos nuevos como existentes reciben la misma respuesta para impedir enumeración de cuentas.

La aprobación es manual porque Scheduler Pro todavía no tiene un proveedor de correo autenticado. El administrador debe verificar la identidad institucional antes de aprobar una solicitud desde **Configuración → Usuarios y Permisos**.

Scheduler Pro no expone recuperación de contraseña ni tokens de verificación por correo. No se debe agregar ninguno de esos endpoints sin cumplir todos estos requisitos:

1. Generar tokens con un CSPRNG y al menos 128 bits de entropía.
2. Guardar solamente el hash SHA-256 del token, nunca el token en texto plano.
3. Devolver una respuesta genérica; el token se entrega exclusivamente por correo.
4. Expirar el token en un máximo de 15 minutos y marcarlo como usado de forma atómica.
5. Aplicar rate limiting por cuenta y cliente a solicitud y validación.
6. Invalidar sesiones anteriores después de recuperar una contraseña.

## Correo transaccional

El envío de correo debe permanecer deshabilitado hasta que el dominio utilizado tenga:

- SPF limitado a los proveedores autorizados.
- DKIM activo con claves de 2048 bits y rotación documentada.
- DMARC inicialmente en `p=none` para observación y luego en `p=quarantine` o `p=reject`.
- Dirección `From` alineada con SPF o DKIM y dominio de retorno controlado.
- TLS obligatorio hacia el proveedor, webhooks firmados y secretos almacenados en Cloudflare.

La comprobación de SPF, DKIM y DMARC es una tarea de DNS y del proveedor de correo; no puede garantizarse solo desde el código de la aplicación.

## Despliegue

- Revocar o rotar cualquier secreto que haya sido versionado anteriormente; eliminar el archivo del commit actual no lo borra del historial Git.
- Configurar `JWT_SECRET` y `BOOTSTRAP_TOKEN` como secretos de Cloudflare; deben ser distintos y tener al menos 32 caracteres aleatorios.
- Eliminar `BOOTSTRAP_TOKEN` después de crear el primer administrador.
- Configurar `CORS_ORIGINS` únicamente si existe un frontend en otro origen.
- Mantener reglas WAF adicionales para login y endpoints futuros de OTP.
- Revisar logs de respuestas 401, 403 y 429 y crear alertas por anomalías.
