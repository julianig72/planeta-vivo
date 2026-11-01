# España en movimiento

Una experiencia cartográfica de Cercanías / Rodalies con **posiciones GPS realmente publicadas por Renfe**, colores de línea, estaciones y trazados del GTFS oficial. Mapa dominante, selección, cámara de seguimiento, pausa visual y vista limpia para presentar. Interfaz en español.

El repositorio conserva su nombre `planeta-vivo`; las anteriores experiencias de terremotos y energía quedan en el historial de Git. No hay un selector de aplicaciones ni datos energéticos en esta versión.

## Ejecutar

Node.js **22.12 o superior**, npm y un navegador con WebGL.

```powershell
npm ci
npm run dev
```

Desarrollo: `http://127.0.0.1:5173/`.

```powershell
npm run build
npm run preview -- --port 4173
```

Producción local: `http://127.0.0.1:4173/`. **No basta con servir `dist` desde un servidor estático**: se necesita `server.mjs` y `data\renfe-trips.json` para `/api/positions`. El servidor se vincula a `127.0.0.1`, no expone la aplicación públicamente y no requiere claves.

El JSON oficial se pudo consultar sin autenticación, pero su respuesta no incluyó `Access-Control-Allow-Origin`; la consulta directa desde el navegador falló por CORS. El pequeño servidor del repositorio hace una solicitud HTTP normal a la fuente oficial. **No desactiva la seguridad del navegador**, no usa un proxy externo y no emplea ESIOS.

Cada proceso del servidor comparte una única consulta en curso y una caché de al menos **20 segundos**, también para errores, entre todos sus clientes. El navegador consulta como máximo una vez cada 20 segundos mientras está activo; no se garantiza que un navegador en segundo plano mantenga esa cadencia. Una descarga tiene un límite de 12 segundos; el cliente, 15 segundos. Un error devuelve HTTP 503, no una respuesta de éxito con posiciones antiguas.

## Qué se muestra

El encuadre inicial elige el núcleo con más posiciones recientes disponibles. Puedes cambiar de red; tu elección no cambia automáticamente si ese núcleo queda vacío. «Ajustar a posiciones» encuadra los GPS publicados; si no hay trenes, usa los trazados GTFS de ese núcleo, **sin inventar actividad**.

Seleccionar un tren muestra su línea y núcleo enlazados, identificador, estado GTFS, estación relacionada, hora de observación, antigüedad y andén solo cuando está publicado en la etiqueta. Inicia el seguimiento si la posición puede considerarse reciente. Arrastrar, hacer zoom o pulsar un control de navegación lo detiene. No se infieren velocidad, rumbo, retraso, ocupación, llegada ni identidad persistente del material rodante.

La hora se presenta en `Europe/Madrid`, con zona horaria. Hay tres tiempos distintos: **timestamp del feed**, **timestamp GPS de cada tren** y **momento de descarga del servidor**. Que el feed sea reciente no convierte todas sus observaciones en actuales.

- Feed de 90 segundos o más: antiguo.
- GPS de 120 segundos o más, o sin timestamp propio: no se cuenta como reciente.
- Error de conexión: las últimas observaciones se conservan **grises**, con aviso y contador de posiciones recientes a cero; no se presentan como directo.
- Nueva lista completa: las entidades ausentes se eliminan. Se rechazan feeds diferenciales en vez de interpretarlos como listas completas.
- Feed vacío o núcleo sin posiciones: estado vacío explícito, también de noche. No hay datos de sustitución.

**La animación no es una medición**. Solo interpola durante cinco segundos entre dos GPS recibidos del mismo identificador y viaje, con timestamp creciente, intervalo de hasta 120 segundos y separación menor de 5 km. Interpola en línea recta; no afirma que el tren siguió ese segmento ni ajusta GPS a las vías. No extrapola después del último punto y respeta `prefers-reduced-motion`.

**Pausa congela el último conjunto real recibido** y lo etiqueta con su hora. Las consultas continúan y la antigüedad sigue visible. Al reanudar se muestran las últimas observaciones, no un historial inventado. No se ofrece reproducción histórica.

## Fuentes y licencias

| Capa | Fuente | Licencia / alcance |
|---|---|---|
| Posiciones | [Renfe: ubicación de vehículos](https://data.renfe.com/dataset/ubicacion-vehiculos), [JSON GTFS-RT](https://gtfsrt.renfe.com/vehicle_positions.json) | **CC BY 4.0**, atribución a Renfe. El catálogo declara actualización cada 20 s. |
| Rutas, estaciones y viajes | [Renfe: horarios Cercanías](https://data.renfe.com/dataset/horarios-cercanias), [ZIP GTFS oficial](https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip) | **CC BY 4.0**, atribución a Renfe. Descarga estática, no una medición de tráfico. |
| Mapa base | [OpenFreeMap](https://openfreemap.org/), estilo público `https://tiles.openfreemap.org/styles/dark` | OpenMapTiles y [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL para datos OSM. Atribución visible en el mapa. |
| Motor | MapLibre GL JS | BSD-3-Clause. |
| Tipografía | Google Fonts: DM Sans / Manrope | SIL Open Font License. Fuentes alternativas si la descarga falla. |
| Preparación ZIP | fflate | MIT. |

El navegador contacta el servidor local, OpenFreeMap (estilo, teselas, glifos y sprites) y Google Fonts. La aplicación no incorpora analítica ni credenciales. La cartografía base aporta contexto; **las rutas luminosas proceden exclusivamente de `shapes.txt`**, no de vías inferidas del mapa base.

Se unen `trip.tripId → trips.trip_id → route_id / shape_id` y `stopId → stops.stop_id` por igualdad exacta, preservando ceros iniciales. Se ordenan los vértices de cada shape por `shape_pt_sequence` sin inventar segmentos entre estaciones ni extrapolar horarios. Un enlace exacto no garantiza que el shape publicado cubra todo el servicio ni coincida con cada GPS; no se corrigen ni completan las geometrías del proveedor. Los estados `STOPPED_AT`, `INCOMING_AT` e `IN_TRANSIT_TO` describen la relación con la estación indicada, no una velocidad.

**C1 no identifica una línea nacional única**. Las redes se agrupan internamente por el prefijo de `route_id`, con nombres contrastados con las rutas reales: Madrid, Asturias, Sevilla, Cádiz, Málaga, Valencia, Murcia/Alicante, Cartagena, Ferrol, León, Rodalies Catalunya, Bilbao, San Sebastián, Cantabria y Zaragoza. Estas claves son agrupaciones de la aplicación, no códigos oficiales de núcleo. Un viaje sin enlace conserva su GPS en **«Sin red enlazada»**, sin inventarle línea, red o trazado. La proximidad de una estación a una vía no se usa para inferir su línea.

Solo se muestran entidades con GPS válido en el ámbito peninsular comprobado del feed. Se excluyen duplicados, coordenadas inválidas y rutas de autobús identificadas por `route_type=3`. No se promete cobertura de todos los trenes, de servicios insulares ni de AVE.

## Actualizar el GTFS estático

La geometría preparada y el índice de viajes se incluyen en el repositorio para una ejecución reproducible. Su metadata contiene URL, fecha de preparación, licencia y SHA-256 del ZIP fuente. La fecha y el número de enlaces efectivos aparecen en «Fuentes y límites»; tras siete días se recomienda regenerar.

```powershell
npm run prepare:renfe
npm run build
# Reiniciar el servidor después de regenerar.
npm run preview
```

También se puede procesar una descarga oficial local:

```powershell
npm run prepare:renfe -- 'C:\ruta\fomento_transit.zip'
```

El script extrae solo `routes.txt`, `trips.txt`, `shapes.txt` y `stops.txt`; no carga los aproximadamente 288 MB de `stop_times.txt`. Genera `public\rail\network.json` y `data\renfe-trips.json`. Una descarga fallida no se sustituye silenciosamente por un GTFS inventado. Los cambios posteriores del catálogo pueden dejar viajes sin enlace hasta regenerar y reiniciar.

## Errores y límites

Feed y cartografía son independientes. Si falla el mapa base, permanecen los GPS y trazados sobre fondo neutro con aviso. Si falla el GTFS preparado en el navegador, permanecen GPS sin atribución de red o ruta. Si no hay WebGL, se conserva la lista de posiciones y se muestra el bloqueo del mapa. La selección desaparecida se explica, y el seguimiento se detiene cuando no hay observación reciente.

Las posiciones son las publicadas por Renfe; no se garantiza exactitud GPS, cobertura continua ni disponibilidad del servicio externo. El catálogo estático llegó a informar fallos históricos de su archivador, pero la descarga HTTPS normal se verificó sin desactivar certificados.

## Comprobaciones

```powershell
npm test -- --pool=threads --minWorkers=1 --maxWorkers=1
npm run test:server
npm run build
npm run test:e2e
```

Pruebas unitarias del formato, coordenadas, timestamps, estado, redes, frescura e interpolación; pruebas del servidor para caché compartida y errores; pruebas de navegador para fuente real, evolución entre snapshots, selección, seguimiento, pausa, desaparición, estados vacíos/antiguos, recuperación y tamaños de pantalla. Los casos controlados solo viven en las pruebas y no se envían a la aplicación como sustitutos de datos actuales. Las comprobaciones reales dependen de conectividad y servicio publicado.
