# Calculadora de envíos — Vivero (versión completa con servidor)

Los vendedores cotizan envíos desde el celular o la compu:

1. Ingresan con **legajo y PIN**.
2. Eligen **de un toque** el tamaño de la carga (baúl de auto, utilitario, camioneta, camión).
3. Escriben la dirección del cliente y la **distancia se calcula sola** (Mapbox).
4. Tildan si lleva subida a domicilio.
5. Ven el precio del envío.

## Qué resuelve esta versión (frente a la versión de un solo HTML)

| | Versión simple | Esta versión |
|---|---|---|
| Tipos de carga y tarifas | Se guardan en cada dispositivo | **Compartidos**: lo que edita el administrador lo ven todos |
| Login | Solo una barrera en la pantalla | **Validado en el servidor**; PINs guardados con hash (scrypt), nunca en claro |
| Permisos | Visuales | **Reforzados en el servidor**: un vendedor no puede editar ni consultando la API |
| Mapbox | Token dentro del archivo | Token en **variables de entorno** del servidor |

## Archivos

```
index.html      → la pantalla
api/            → el servidor (funciones de Vercel): login, logout, me, config, users
package.json    → dependencia: @upstash/redis
.env.example    → qué variables hay que configurar
```
**Importante al subirlo a GitHub:** la carpeta `api/` tiene que quedar en la raíz del repositorio junto a `index.html` y `package.json`. Revisar el árbol de archivos antes de desplegar.

## Puesta en marcha en Vercel (≈20 minutos)

1. Subir esta carpeta a un repositorio de GitHub.
2. En Vercel: **Add New → Project** → importar el repositorio. En *Framework Preset* elegir **Other**; no hace falta comando de build.
3. En el proyecto: pestaña **Storage → Marketplace → Upstash (Redis)** → crear una base gratuita y conectarla al proyecto. Vercel agrega solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. En **Settings → Environment Variables** agregar `MAPBOX_TOKEN` y `VIVERO_ADDRESS` (ver abajo).
5. **Redeploy** (las variables nuevas solo toman efecto en un deploy nuevo).

Sin el paso 3 la página carga pero el login falla con el mensaje "Base de datos no conectada".

### Mapbox
1. Cuenta gratuita en mapbox.com → *Access tokens* → copiar un **token público** (empieza con `pk.`).
2. Cargarlo en `MAPBOX_TOKEN`. Ese token llega al navegador por diseño; por eso es **público** y conviene restringirlo en Mapbox a la URL del sitio.
3. Sin `MAPBOX_TOKEN` la app funciona en **modo demo** (direcciones y distancias simuladas, con aviso en pantalla).
4. Se usan Geocoding (buscar direcciones) y Directions (distancia por ruta). **Verificar límites y precios vigentes en mapbox.com/pricing.** Se usa el endpoint `geocoding/v5`; si Mapbox lo retirara, hay que pasar a la v6 (cambia la URL y el formato de respuesta, en `index.html`).

## Primer ingreso (hacer esto antes de compartir el link)

Usuarios de arranque: **0001 / 1234** (administrador) y **0002 / 1111** (vendedor). Esos PIN figuran en este documento, así que:

1. Ingresar como 0001, abrir **Usuarios** y cambiar el PIN (PIN nuevo + "Guardar usuarios").
2. Cambiar o eliminar el usuario 0002 y cargar al equipo real: legajo, PIN de 4 a 8 números y rol.

Mientras no se cambien, cualquiera que conozca la URL podría entrar.

## Cómo calcula el precio

El vendedor **no carga productos**: elige de un toque el **tamaño de la carga**. Por defecto hay cuatro: 🚗 Baúl de auto, 🚐 Utilitario, 🛻 Camioneta y 🚚 Camión. Cada tarjeta muestra ejemplos de qué entra y la tarifa por km, para que todos los vendedores elijan con el mismo criterio.

`precio = tarifa por km del tipo × km + subida a domicilio`

La subida a domicilio puede ser un monto fijo, un porcentaje extra sobre el costo del km, o ambos.

Los nombres, las descripciones y las tarifas ($150 / $220 / $320 / $450 por km; subida $1.500) **son de ejemplo**. El administrador los edita desde la app: cambia textos y precios, y agrega, quita y reordena tipos (▲ ▼).

**Cómo calibrar los tipos.** Lo más importante son las descripciones: tienen que ser concretas ("2 a 4 bolsas de tierra", "un árbol"). Para afinarlas, conviene preguntarle de a ratos a los vendedores y a los fleteros qué vehículo se usó realmente en cada envío y ajustar los ejemplos de cada tarjeta. Como referencia para pensar los cortes, las empresas de envío usan el peso volumétrico: largo × ancho × alto (cm) ÷ 5.000, y se factura el mayor entre el peso real y el volumétrico.

## Qué se probó y qué no

Probado con una base en memoria: 19 verificaciones del servidor (permisos, PIN incorrecto, bloqueo tras 5 intentos fallidos, usuarios, valores inválidos, que la config no exponga PINs) y 16 del recorrido de pantalla con un vendedor y un administrador en "dispositivos" distintos (elegir tamaño, distancia, subida, editar/agregar/reordenar tipos, y que el otro dispositivo vea los cambios).

**No se pudo probar** contra servicios reales: la base Upstash, el deploy en Vercel y Mapbox (requieren cuentas propias). Checklist para después de desplegar:

1. Entrar como administrador, cambiar una tarifa y confirmar "Guardado para todos".
2. Abrir el link en otro celular como vendedor y confirmar que ve la tarifa nueva.
3. Buscar 3 direcciones conocidas y comparar los km con Google Maps.
4. Probar un PIN incorrecto y confirmar que lo rechaza.

## Limitaciones a tener presentes

- Si dos administradores editan a la vez, gana el último en guardar.
- El bloqueo por intentos es por legajo: alguien podría bloquear a un usuario errando su PIN a propósito (se libera solo a los 10 minutos).
- La sesión dura 12 horas; los vendedores toman los precios nuevos al volver a abrir la pantalla.
- El plan gratuito de Vercel (Hobby) es formalmente para uso **no comercial**; para uso comercial corresponde un plan pago. Verificar condiciones vigentes de Vercel y Upstash.
- Para probar localmente sin Upstash: `USE_MEMORY_DB=1 INSECURE_COOKIES=1 npx vercel dev` (la base en memoria se pierde al reiniciar; **nunca usarla en producción**).
