# España respira energía · Planeta vivo

Una experiencia cinematográfica sobre **cómo cambia la generación eléctrica de España peninsular**. El gráfico temporal es el protagonista: áreas apiladas solares, eólicas, hidráulicas, nucleares y de otras fuentes. Recorre varias semanas reales en 30 segundos, con fechas visibles, cantidades y cambios por tecnología. No hay mapa ornamental ni un mix fijo presentado como evolución.

## Ejecutar

Node.js 20.19+ o 22.12+ y npm:

```sh
npm install
npm run dev
```

Producción y pruebas:

```sh
npm run build
npm run preview
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas end-to-end usan las fuentes reales y necesitan Internet. Contrastan las cifras y sus cambios con la respuesta pública, miden la reproducción y comprueban la interfaz. También verifican errores y días ausentes mediante respuestas de prueba explícitas, nunca incorporadas a la aplicación. Stack: Vite, TypeScript y SVG nativo; sin biblioteca de gráficos, backend, claves, cuentas ni ESIOS.

## Qué se ve y qué cambia

- **Gráfico dominante:** valores de generación publicados por tecnología en áreas apiladas, con referencia cero, eje en GWh y fechas. Cada escalón corresponde a un día completo publicado. Si un grupo es negativo va bajo cero y una línea discontinua indica el total firmado.
- **Seis colores consistentes:** solar (fotovoltaica + térmica), eólica, hidráulica, nuclear, ciclo combinado y Otras. Esta última conserva los componentes publicados para consultarlos en fuentes.
- **Cursor y reproducción:** la columna iluminada y la fecha indican el agregado seleccionado. El cursor recorre la gráfica; las cifras cambian únicamente al entrar en otro día, sin interpolación numérica.
- **Magnitudes y cambios:** el panel muestra GWh y porcentaje del día, más la diferencia en GWh frente al día calendario anterior. Si falta un día, no se calcula una comparación atravesando el hueco.
- **Barras comparables:** las seis usan una misma escala máxima absoluta fija para el período, manteniendo el signo en las cifras. No se renormalizan cada día para aparentar crecimiento. Su transición visual conecta dos valores reales, no crea nuevas medidas.
- **No hay generación horaria por tecnología en esta vista.** El desglose público verificado es diario. No se fabrican amaneceres ni curvas solares/eólicas a partir de totales diarios.

Selecciona una fuente para destacar su franja; vuelve a pulsarla o usa «Ver todas las fuentes» para recuperar el conjunto. Explora con el ratón, el deslizador, los botones anterior/siguiente o las flechas del teclado sobre el gráfico. Explorar detiene la reproducción. Se respeta `prefers-reduced-motion` en las transiciones de las barras.

## Reloj, fecha y disponibilidad

Consultamos **los 30 días anteriores a hoy**, empezando por ayer como fecha final, en `Europe/Madrid`. Un único GET obtiene las series diarias por tecnología. La gráfica termina en el último día válido; fechas externas aún no publicadas o no validadas se identifican en el modal.

La apertura muestra el último día válido. Reproducir inicia el recorrido completo, de izquierda a derecha, en 30 segundos de pestaña visible. Puedes pausar, explorar o ir al inicio. Al ocultar la pestaña se pausa. El final queda detenido en el último agregado, no en una fecha futura.

**Resolución diaria, no tiempo real.** La fecha histórica, el período, el último producto, la descarga válida y la antigüedad respecto al final del último día aparecen en pantalla o en fuentes. Un archivo de más de 72 horas se señala como antiguo.

Un día interno sin total o sin una tecnología principal se representa como **hueco rayado**, con cifras no disponibles. No se conecta por interpolación ni se reemplaza por cero. Cada día se valida por separado; un sumatorio incoherente no destruye los otros días. Si no hay al menos dos días válidos, la aplicación muestra que no puede comparar generación.

Los días de **23 o 25 horas** conservan la energía diaria real, sin normalizarla a 24 horas. Cada fecha ocupa una columna: es un eje de días calendario, no de horas uniformes.

«Actualizar» consulta el mismo período y pausa. Si falla, se conserva la última serie válida identificada y se muestra el error. El modal distingue hora del producto, descarga válida e intento fallido. Recarga la página para buscar un nuevo período.

## REData: fuentes efectivas y resolución

[Documentación oficial](https://www.ree.es/es/datos/apidatos). Servicio público de Red Eléctrica, distinto de ESIOS:

```text
GET https://apidatos.ree.es/{lang}/datos/{category}/{widget}
    ?start_date=YYYY-MM-DDTHH:MM
    &end_date=YYYY-MM-DDTHH:MM
    &time_trunc=hour|day|month|year
```

Filtros geográficos opcionales de la API: `geo_trunc`, `geo_limit`, `geo_ids`. En esta aplicación se envían **siempre explícitamente**:

```text
lang=es
geo_trunc=electric_system
geo_limit=peninsular
geo_ids=8741
```

| Widget verificado | Resolución utilizada | Contenido |
| --- | --- | --- |
| `generacion/estructura-generacion` | `day` | Series temporales de tecnologías y generación total `10296` |

Ejemplo efectivo:

```text
https://apidatos.ree.es/es/datos/generacion/estructura-generacion?start_date=2026-10-02T00:00&end_date=2026-10-31T23:59&time_trunc=day&geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741
```

En la verificación del 01/11/2026, ese rango devolvió **29 días reales, del 02 al 30 de octubre**; el 31 aún no tenía total publicado. Solar cambió de **139.445,86 MWh** a **162.270,1 MWh** y eólica de **157.420,33 MWh** a **44.040,6 MWh**. El total del 30 fue **700.633,9 MWh**, comprobado previamente contra su suma horaria publicada. Las cifras diarias se dividen entre 1.000 para GWh: son energía, no potencia instantánea.

El navegador consulta directamente mediante CORS, con un máximo de 22 segundos por GET. Se revisó la lista real de widgets de la documentación oficial y se probaron con `hour`: `estructura-generacion`, `estructura-renovables`, `evolucion-renovable-no-renovable`, `estructura-generacion-emisiones-asociadas` y `no-renovables-detalle-emisiones-CO2`. Todos devolvieron HTTP 400 para el día verificado. Las categorías con/sin emisiones horarias de la versión anterior no aportan ese desglose y ya no protagonizan la experiencia. No se da por hecho que todos los widgets admitan todas las resoluciones enumeradas por la API.

Las respuestas pueden contener `magnitude: null`; las unidades no se deducen de ese campo ni de un porcentaje aislado. Se validan tipos numéricos finitos, fechas con zona, medianoches peninsulares, duplicados y sumas diarias. Los `percentage` de la fuente **no se suman**: el mix usa valores tecnológicos y el total diario publicado.

## Sumas, componentes ausentes y clasificación

El apilado se valida como:

```text
solar + eólica + hidráulica + nuclear + ciclo combinado + otras
= generación tecnológica total publicada del día
```

El total tecnológico **excluye almacenamiento** en el producto verificado. No añadimos bombeo consumidor, turbinación ni intercambios a las franjas. No se cuenta un total junto con sus componentes. Nuclear no se etiqueta como renovable. Esta vista no afirma que generación sea igual a demanda.

Se conservan **valores negativos reales**: carbón fue −13 MWh el 17/10, −120 MWh el 18/10 y negativo en otros tres días del período. La suma publicada cierra con esos signos, y Otras conserva su contribución firmada. No se borran fechas, se cambia el signo ni se recorta a cero. Si un grupo agregado resulta negativo se dibuja bajo cero, sin confundirlo con producción positiva. La API no explica aquí la causa física de esos signos; no inventamos una interpretación ni afirmamos que sean cifras brutas.

Una tecnología principal sin dato invalida ese día. Algunos componentes menores no tienen registro individual en ciertas fechas: por ejemplo, «Turbina de vapor» no apareció el 03 y 04 de octubre. Se muestran como **sin valor publicado**, no se crean registros cero. Otras suma los componentes disponibles solo si el conjunto sigue cerrando contra el total publicado. El modal conserva esta limitación y los componentes reales del día.

Tolerancia de redondeo: 2 MWh. Un desacuerdo invalida visiblemente el día afectado, sin forzar sumas, completar medidas ni cambiar signos.

## Ámbito y licencias

Los datos corresponden a **España peninsular**. Canarias, Baleares, Ceuta y Melilla **no forman parte del agregado**. No se representan centrales, flujos, series autonómicas ni mediciones locales.

La gráfica es SVG original. El mapa 3D anterior se conserva en el historial Git, pero no se descarga ni se renderiza en esta experiencia. Se han retirado los contornos y la dependencia 3D de la versión activa.

Los datos se atribuyen a Red Eléctrica/REData; esta demo no implica respaldo institucional. Vite y Vitest: MIT; TypeScript y Playwright: Apache-2.0. Los avisos se mantienen en las dependencias. DM Sans y Manrope: SIL Open Font License; si Google Fonts no está disponible se usa la tipografía del sistema.

La aplicación no recoge telemetría propia. El navegador contacta REData y Google Fonts. No hay claves, servicios de pago ni datos sintéticos de sustitución.
