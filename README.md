# Planeta vivo

Una ventana cinematográfica a la Tierra: globo 3D con iluminación día/noche, terremotos recientes de USGS y una capa de previsión de auroras de NOAA. Interfaz en español, sin cuentas, claves ni backend.

## Ejecutar

Requiere Node.js 20.19+ o 22.12+ y npm.

```sh
npm install
npm run dev
```

Abre la dirección local que indica Vite. Para generar y servir la versión de producción:

```sh
npm run build
npm run preview
```

`npm test` ejecuta las pruebas de interpretación de datos, ventanas temporales y reloj de reproducción. Para la comprobación end-to-end, ejecuta `npx playwright install chromium`, `npm run build` y `npm run test:e2e`. Estas pruebas verifican las fuentes reales (requieren Internet), WebGL, selección, reproducción, tamaños de pantalla y errores independientes; un caso usa respuestas de prueba explícitas para vacío/antigüedad, nunca en la aplicación. Stack: Vite, TypeScript y Three.js. No se necesita configuración secreta.

## Explorar y reproducir

- Arrastra el globo para girarlo y usa la rueda o un gesto de pinza para acercarte. Selecciona un punto o un evento de la lista: la cámara viaja a su ubicación y muestra magnitud, hora UTC, profundidad, coordenadas y enlace a USGS.
- Los interruptores controlan las capas sin afectar a los datos de las otras. «Explorar el polo norte» orienta la cámara hacia la previsión.
- «Ahora» muestra eventos **recientes**, no detección instantánea. El globo gira lentamente mientras no se interactúa con él.
- «Últimas 24 horas» reproduce una instantánea real de USGS, cronológicamente, en **30 segundos**. Muestra el reloj histórico, permite pausar y desplazar la posición; al terminar se detiene. Pulsa reproducir para repetir o «Ahora» para volver a los últimos datos.
- En reproducción se **oculta la capa de auroras**: una previsión actual no corresponde al pasado sísmico. La iluminación solar aproximada sigue el reloj de la escena.
- Los pulsos son un recurso gráfico para destacar eventos; **no representan ondas sísmicas**, energía, alcance ni velocidad. Tamaño y color de puntos orientativos según magnitud. Las estrellas son decorativas.
- La lista de eventos y los controles funcionan con teclado. Se respeta `prefers-reduced-motion` en giro automático, viajes de cámara y pulsos.

## Fuentes y semántica temporal

### USGS

[Documentación GeoJSON](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) · [Feed de las últimas 24 horas](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson).

Consulta directa desde el navegador cada **60 segundos**, con un tiempo máximo de 20 segundos. El feed oficial se actualiza cada minuto. Usamos `metadata.generated`, y `properties.time`, `updated`, `mag`, `place`, `url` junto con `geometry.coordinates` (longitud, latitud, profundidad en km). Solo se incluyen registros de tipo `earthquake`. El número de registros excluidos por tipo o formato se muestra, no se disimula.

Los eventos pueden llegar con retraso o ser revisados. La ventana de «Ahora» se calcula respecto al reloj del equipo. La reproducción se fija a la generación del feed (o al reloj local si es anterior), no cambia con descargas posteriores, y excluye registros futuros. «M —» significa magnitud no facilitada, no magnitud cero.

### NOAA SWPC / OVATION

[Producto Aurora 30-Minute Forecast](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) · [Cuadrícula JSON](https://services.swpc.noaa.gov/json/ovation_aurora_latest.json).

Consulta directa cada **5 minutos**. Interpretamos `Observation Time` y `Forecast Time` en UTC y `coordinates` como `[longitud 0–359, latitud, probabilidad 0–100]`. La capa se dibuja desde esas celdas reales; no se generan auroras artificiales. La escala de color es una representación visual de probabilidad modelada, no de brillo observado.

En la verificación inicial, ambos feeds devolvieron HTTP 200 con `Access-Control-Allow-Origin: *` y caché de 60 segundos. NOAA devolvió 65.160 celdas únicas (360 × 181), longitudes 0–359 y latitudes −90–90. La cadencia de consulta es nuestra decisión; no garantiza que haya datos nuevos en cada descarga.

OVATION ofrece una **previsión de corto plazo**, habitualmente 30–90 minutos según el viento solar. No es una observación de auroras ni una garantía de visibilidad desde el suelo, que también depende de luz, nubes y ubicación. Las horas de observación y previsión del producto aparecen en pantalla. No se sustituye el horizonte real por un «+30 min» fijo.

NOAA advierte que, si no hay datos de viento solar válidos, puede usar Kp como entrada y no ofrecer tiempo de anticipación. Por eso se aceptan horas de observación y previsión iguales y se muestran tal como llegan.

### Errores y antigüedad

La red puede fallar y las fuentes pueden no estar disponibles o impedir CORS. Cada capa informa de su error y permite reintentar independientemente. Si hay una descarga anterior, se conserva **identificada**; si no hay datos, la capa no se inventa. Un feed válido sin eventos se muestra como vacío.

USGS se marca antiguo a los **15 minutos** desde generación. NOAA se marca antiguo a los **45 minutos** desde observación o cuando su hora de previsión ya ha vencido. El modal «Fuentes y actualización» distingue generación, descarga, observación y previsión. El reloj del equipo debe ser correcto.

## Imágenes, atribución y licencias

Las texturas estáticas de la Tierra son imágenes NASA distribuidas en los [ejemplos de Three.js](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets): `earth_atmos_2048.jpg` y `earth_lights_2048.png`, guardadas localmente en `public/textures`. **No son imágenes de satélite en directo**. La luz solar se calcula aproximadamente a partir de fecha y hora UTC; no pretende precisión de efemérides.

- USGS: datos públicos del Gobierno de EE. UU.; [política de copyright](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).
- NOAA: producto público del Gobierno de EE. UU.; [disclaimer y condiciones](https://www.noaa.gov/disclaimer). La atribución no implica respaldo de NOAA o USGS.
- Imágenes NASA: [directrices de uso de medios](https://www.nasa.gov/nasa-brand-center/images-and-media/); sin logos ni respaldo institucional.
- Three.js: MIT. Vite: MIT. TypeScript: Apache-2.0. Vitest: MIT. Sus avisos se mantienen en las dependencias.
- Fuentes DM Sans y Manrope: SIL Open Font License, obtenidas de Google Fonts; si no están disponibles se utilizan fuentes del sistema.

La aplicación no recopila telemetría propia. El navegador contacta las fuentes públicas y Google Fonts. No hay datos sintéticos de sustitución, credenciales ni servicios de pago.
