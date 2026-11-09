# España en movimiento

Una experiencia cartográfica de **Cercanías / Rodalies y alta velocidad de Renfe**, con coordenadas publicadas por la operadora. Mapa dominante, selección, cámara de seguimiento, pausa visual y vista limpia para presentar. Interfaz en español. Cercanías conserva sus trazados GTFS; alta velocidad muestra puntos y estaciones, **sin inventar vías ni horarios animados**.

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

Producción local: `http://127.0.0.1:4173/`. **No basta con servir `dist` desde un servidor estático**: se necesita `server.mjs`, `data\renfe-trips.json` y `data\renfe-high-speed-trips.json` para los endpoints `/api/positions` y `/api/high-speed/positions`. El servidor se vincula a `127.0.0.1`, no expone la aplicación públicamente y no requiere claves.

El JSON oficial se pudo consultar sin autenticación, pero su respuesta no incluyó `Access-Control-Allow-Origin`; la consulta directa desde el navegador falló por CORS. El pequeño servidor del repositorio hace una solicitud HTTP normal a la fuente oficial. **No desactiva la seguridad del navegador**, no usa un proxy externo y no emplea ESIOS.

Cada proceso comparte consultas en curso y cachés independientes por fuente: **20 segundos para Cercanías y 15 segundos para AV/LD**, también para errores. Solo se consulta la vista elegida; cambiar de servicio no evita la caché compartida del servidor. El navegador no consulta más frecuentemente que esa cadencia mientras está activo; no se garantiza que un navegador en segundo plano la mantenga. Una descarga tiene un límite de 12 segundos; el cliente, 15 segundos. Un error devuelve HTTP 503, no una respuesta de éxito con posiciones antiguas.

## Alta velocidad: qué está verificado

El selector **Servicio → Alta velocidad · Renfe** mantiene la vista original de Cercanías y añade una vista nacional con filtros **AVE, AVLO, AVANT, AVE INT y AVANT EXP**. Son los nombres exactos de producto presentes en `routes.txt`, no clasificaciones deducidas de velocidades. Se une `tripId` exactamente al GTFS AV/LD y se excluyen otros productos de ese feed: ALVIA, Intercity, MD, regionales, etc. Sin GTFS no se atribuye un punto desconocido a alta velocidad. La elección de núcleo/producto se conserva al volver a cada servicio; las respuestas tardías de la fuente anterior no contaminan la nueva vista.

Comprobación de fuentes del **3 de noviembre de 2026**:

| Tipo de dato | Evidencia oficial y semántica |
|---|---|
| Coordenadas publicadas | Catálogo [`posicion-vehiculos-av-ld-md`](https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md), JSON `https://gtfsrt.renfe.com/vehicle_positions_LD.json`, **CC BY 4.0**, cadencia declarada **15 s**. HTTP 200 sin credenciales; no habilitó CORS. Muestra de 221 entidades: 221 enlaces exactos al GTFS estático. |
| Hora individual | **0/221** entidades de la muestra tenían `vehicle.timestamp`. Sí había `header.timestamp`, `tripId`, `position.latitude/longitude`, `currentStatus`, `stopId`, identificador y etiqueta. No se convierte la hora del header en una observación GPS individual. |
| GTFS estático | [`Horarios AV/LD/MD`](https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia), [ZIP oficial](https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip), **CC BY 4.0**. 8.225 viajes, 670 rutas, 1.006 estaciones. Agencia: RENFE OPERADORA. Horarios/estaciones no son GPS. |
| Geometría AV | El ZIP comprobado **no incluye `shapes.txt`**. No se dibujan vías estimadas ni segmentos entre estaciones. El mapa base es contexto, no un trazado observado del tren. |
| Predicciones/actualizaciones de viaje | El catálogo declara `trip_updates_LD.json`, cadencia 30 s. Su existencia no prueba posiciones; no se integra ni se usa para inferirlas. Tampoco se calculan retrasos, velocidades o llegadas. |
| Adif | Las páginas oficiales de datos abiertos e información al viajero consultadas devolvieron **HTTP 403**. No se eludió el bloqueo ni se verificó un recurso reutilizable de GPS/licencia; **no se incorporan datos Adif**. Esto no afirma que no exista otro servicio suyo. |
| Otras operadoras | No se ha verificado una fuente de iryo u Ouigo; no se añaden ni se les atribuyen posiciones de Renfe. |

En alta velocidad el contador principal y el selector de producto cuentan las **posiciones publicadas en el mapa**, incluidas las antiguas o conservadas tras un error. El aviso indica por separado cuántas pertenecen a un feed reciente; un contador de recientes a cero no significa que el mapa esté vacío. Las antiguas mantienen puntos grises de alto contraste, sin seguimiento. El reloj está identificado como **hora del feed, no GPS individual** y se indica cuántos puntos carecen de hora propia. Su antigüedad individual es desconocida: un header reciente no certifica que cada punto lo sea. Los colores por producto son una **paleta visual propia**, no colores medidos ni los colores de ruta blancos del GTFS.

La selección muestra marca, número de tren, estado y estación enlazados, con «No publicada» / «Hora propia no publicada» cuando corresponda. El seguimiento mueve la cámara hacia coordenadas realmente recibidas, **sin interpolación de puntos AV ni extrapolación por horarios**. No se estiman posiciones. Las entidades repetidas por varios tramos de un mismo identificador se cuentan una sola vez. Un punto fuera del ámbito peninsular se omite aunque el producto sea internacional.

Una caída de AV/LD no cambia ni sustituye datos de Cercanías, y viceversa. Si falla el GTFS AV, se muestra el error y no se inventa una clasificación. Feed antiguo, pausa y fallos conservan las mismas distinciones visibles de la vista original.
Sin posiciones AV, el encuadre muestra la península como contexto geográfico, sin puntos de sustitución.

En una comprobación posterior, el header AV/LD avanzaba entre consultas pero llevaba aproximadamente una hora de retraso respecto al reloj UTC de descarga. Se conserva literalmente su timestamp: no se corrige suponiendo un error de huso horario. Esas posiciones se muestran grises, con «Feed antiguo», contador de publicaciones recientes a cero y seguimiento desactivado.

## Cercanías y semántica temporal común

El encuadre inicial elige el núcleo con más posiciones recientes disponibles. Puedes cambiar de red; tu elección no cambia automáticamente si ese núcleo queda vacío. «Ajustar a posiciones» encuadra los GPS publicados; si no hay trenes, usa los trazados GTFS de ese núcleo, **sin inventar actividad**.

Seleccionar un tren muestra su línea y núcleo enlazados, identificador, estado GTFS, estación relacionada, hora de observación, antigüedad y andén solo cuando está publicado en la etiqueta. Inicia el seguimiento si la posición puede considerarse reciente. Arrastrar, hacer zoom o pulsar un control de navegación lo detiene. No se infieren velocidad, rumbo, retraso, ocupación, llegada ni identidad persistente del material rodante.

La hora se presenta en `Europe/Madrid`, con zona horaria. Hay tres tiempos distintos: **timestamp del feed**, **timestamp GPS de cada tren** y **momento de descarga del servidor**. Que el feed sea reciente no convierte todas sus observaciones en actuales.

- Feed de 90 segundos o más: antiguo.
- GPS de 120 segundos o más, o sin timestamp propio: no se cuenta como GPS reciente. En AV se cuenta por separado como publicación del feed con antigüedad GPS desconocida, nunca como GPS reciente.
- Error de conexión: las últimas observaciones se conservan **grises**, con aviso y contador de posiciones recientes a cero; no se presentan como directo.
- Nueva lista completa: las entidades ausentes se eliminan. Se rechazan feeds diferenciales en vez de interpretarlos como listas completas.
- Feed vacío o núcleo sin posiciones: estado vacío explícito, también de noche. No hay datos de sustitución.

**La animación de Cercanías no es una medición**. Solo interpola durante cinco segundos entre dos GPS recibidos del mismo identificador y viaje, con timestamp creciente, intervalo de hasta 120 segundos y separación menor de 5 km. Interpola en línea recta; no afirma que el tren siguió ese segmento ni ajusta GPS a las vías. No extrapola después del último punto y respeta `prefers-reduced-motion`. La vista AV no interpola puntos.

**Pausa congela el último conjunto real recibido** y lo etiqueta con su hora. Las consultas continúan y la antigüedad sigue visible. Al reanudar se muestran las últimas observaciones, no un historial inventado. No se ofrece reproducción histórica.

## Fuentes y licencias

| Capa | Fuente | Licencia / alcance |
|---|---|---|
| Posiciones | [Renfe: ubicación de vehículos](https://data.renfe.com/dataset/ubicacion-vehiculos), [JSON GTFS-RT](https://gtfsrt.renfe.com/vehicle_positions.json) | **CC BY 4.0**, atribución a Renfe. El catálogo declara actualización cada 20 s. |
| Rutas, estaciones y viajes | [Renfe: horarios Cercanías](https://data.renfe.com/dataset/horarios-cercanias), [ZIP GTFS oficial](https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip) | **CC BY 4.0**, atribución a Renfe. Descarga estática, no una medición de tráfico. |
| Posiciones de alta velocidad | [Renfe: posición AV/LD/MD](https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md), [JSON LD](https://gtfsrt.renfe.com/vehicle_positions_LD.json) | **CC BY 4.0**, atribución a Renfe; se filtran productos por GTFS, no todas las entidades son AV. |
| Clasificación AV y estaciones | [Renfe: GTFS AV/LD/MD](https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia) | **CC BY 4.0**; sin shapes, sin estimar recorridos. |
| Mapa base | [OpenFreeMap](https://openfreemap.org/), estilo público `https://tiles.openfreemap.org/styles/dark` | OpenMapTiles y [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL para datos OSM. Atribución visible en el mapa. |
| Motor | MapLibre GL JS | BSD-3-Clause. |
| Tipografía | Google Fonts: DM Sans / Manrope | SIL Open Font License. Fuentes alternativas si la descarga falla. |
| Preparación ZIP | fflate | MIT. |

El navegador contacta el servidor local, OpenFreeMap (estilo, teselas, glifos y sprites) y Google Fonts. La aplicación no incorpora analítica ni credenciales. La cartografía base aporta contexto; **las rutas luminosas proceden exclusivamente de `shapes.txt`**, no de vías inferidas del mapa base.

Se unen `trip.tripId → trips.trip_id → route_id / shape_id` y `stopId → stops.stop_id` por igualdad exacta, preservando ceros iniciales. Se ordenan los vértices de cada shape por `shape_pt_sequence` sin inventar segmentos entre estaciones ni extrapolar horarios. Un enlace exacto no garantiza que el shape publicado cubra todo el servicio ni coincida con cada GPS; no se corrigen ni completan las geometrías del proveedor. Los estados `STOPPED_AT`, `INCOMING_AT` e `IN_TRANSIT_TO` describen la relación con la estación indicada, no una velocidad.

**C1 no identifica una línea nacional única**. Las redes se agrupan internamente por el prefijo de `route_id`, con nombres contrastados con las rutas reales: Madrid, Asturias, Sevilla, Cádiz, Málaga, Valencia, Murcia/Alicante, Cartagena, Ferrol, León, Rodalies Catalunya, Bilbao, San Sebastián, Cantabria y Zaragoza. Estas claves son agrupaciones de la aplicación, no códigos oficiales de núcleo. Un viaje sin enlace conserva su GPS en **«Sin red enlazada»**, sin inventarle línea, red o trazado. La proximidad de una estación a una vía no se usa para inferir su línea.

Solo se muestran entidades con coordenadas válidas en el ámbito peninsular comprobado del feed elegido. Se excluyen duplicados, coordenadas inválidas y rutas de autobús identificadas por `route_type=3`. No se promete cobertura de todos los trenes, de servicios insulares ni de todas las operadoras.

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

Alta velocidad se prepara por separado, con el mismo lector CSV (campos entrecomillados y padding), sin cargar horarios para animar trenes:

```powershell
npm run prepare:high-speed
# Alternativamente, usar el ZIP oficial previamente descargado:
npm run prepare:high-speed -- 'C:\ruta\google_transit.zip'
npm run build
# Reiniciar el servidor para recargar los dos índices.
npm run preview
```

Genera `public\rail\high-speed.json` y `data\renfe-high-speed-trips.json`. Conserva URL, fecha, licencia y SHA-256; no crea shapes. Ambos conjuntos preparados se incluyen en el repositorio.

Los `trip_id` AV/LD incluyen la fecha del viaje. Un índice de días anteriores puede dejar gran parte del feed sin enlace aunque tenga menos de siete días: si faltan trenes, regenerar el GTFS AV/LD y reiniciar el servidor antes de interpretar el vacío como ausencia de servicio. El 9 de noviembre de 2026 la regeneración elevó los enlaces exactos de una descarga de 28 a 192 de 193 registros AV/LD; solo los productos AV verificados se representan en esta vista. La fuente seguía publicando un reloj del feed aproximadamente una hora atrasado: se conserva y se advierte, sin corregirlo por conjeturas.

## Errores y límites

Feed y cartografía son independientes. Si falla el mapa base, permanecen los GPS y trazados sobre fondo neutro con aviso. Si falla el GTFS preparado en el navegador, Cercanías mantiene GPS sin atribución de red o ruta; alta velocidad no muestra puntos sin poder verificar su producto. Si no hay WebGL, se conserva la lista de posiciones y se muestra el bloqueo del mapa. La selección desaparecida se explica, y el seguimiento se detiene cuando no hay observación reciente.

Las posiciones son las publicadas por Renfe; no se garantiza exactitud GPS, cobertura continua ni disponibilidad del servicio externo. El catálogo estático llegó a informar fallos históricos de su archivador, pero la descarga HTTPS normal se verificó sin desactivar certificados.

## Comprobaciones

```powershell
npm test -- --pool=threads --minWorkers=1 --maxWorkers=1
npm run test:server
npm run build
npm run test:e2e
```

Pruebas unitarias del formato, coordenadas, timestamps, estado, redes, frescura e interpolación; pruebas del servidor para caché compartida y errores; pruebas de navegador para fuente real, evolución entre snapshots, selección, seguimiento, pausa, desaparición, estados vacíos/antiguos, recuperación y tamaños de pantalla. Los casos controlados solo viven en las pruebas y no se envían a la aplicación como sustitutos de datos actuales. Las comprobaciones reales dependen de conectividad y servicio publicado.
La prueba real AV también admite una franja sin productos publicados y verifica su estado vacío. La comprobación de movimiento real de Cercanías se omite explícitamente si deja de haber GPS recientes durante la prueba; no se genera tráfico para hacerla pasar.
