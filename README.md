# España respira energía · Planeta vivo

Una experiencia cinematográfica sobre la energía de **España peninsular**. Un mapa 3D reconocible respira con la demanda horaria; el anillo muestra la generación diaria solar, eólica, hidráulica, nuclear y demás tecnologías. Reproduce un día real en 30 segundos, con fecha y reloj visibles. No es un dashboard de red ni telemetría en tiempo real.

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

Las pruebas end-to-end usan las fuentes reales y necesitan Internet. También verifican fallos de actualización y observaciones ausentes mediante respuestas de prueba explícitas, nunca incorporadas a la aplicación. Stack: Vite, TypeScript y Three.js. Sin backend, claves, cuentas ni ESIOS.

## Qué se ve y qué cambia

- **Demanda de la hora:** potencia media equivalente, en GW. El valor corresponde al intervalo indicado, no a un instante. La curva utiliza escalones de horas reales; las cifras no se interpolan.
- **Generación sin emisiones CO₂ eq. de la hora:** porcentaje de las series horarias clasificadas por Red Eléctrica. Incluye nuclear. **No significa porcentaje renovable**, ni emisiones de ciclo de vida.
- **Mix por tecnología:** energía total del día en GWh y porcentaje sobre la generación diaria publicada. Solar agrupa fotovoltaica y térmica; «Otras» conserva y permite inspeccionar todas las tecnologías restantes disponibles.
- **El anillo es diario y fijo.** No cambia al reproducir las horas. La API verificada no admite aquí `time_trunc=hour` para el mix por tecnología; no inventamos una curva de solar o eólica distribuyendo totales diarios.
- El brillo del mapa refleja la demanda normalizada dentro de ese mismo día. Los colores y puntos son recursos gráficos agregados; **no son centrales, sensores, producción regional ni flujos entre ciudades**.
- La luz y el botón «Ir al amanecer» usan una aproximación astronómica para Madrid (40,4° N, 3,7° O). No son mediciones solares, ni prueban producción fotovoltaica a esa hora.

Selecciona una tecnología en la leyenda o en su arco para ver componentes, energía diaria y porcentaje. Arrastra suavemente o acerca el mapa; «Vista de España» recupera la composición inicial. Se respeta `prefers-reduced-motion` en los efectos y el movimiento.

## Reloj, fecha y disponibilidad

Buscamos el **día completo más reciente entre los tres días anteriores**, empezando por ayer en `Europe/Madrid`. Se comprueba que existan todas las horas de demanda y de generación con/sin emisiones, y el mix diario del mismo día. Si se elige un día anterior, el modal de fuentes explica los intentos y errores; no se oculta la elección.

La fecha y el retraso respecto al final de ese día aparecen en pantalla. **No se presenta como hoy ni como tiempo real.** El resumen abre a mitad del día; reproducir desde ese resumen reinicia a las 00:00 y recorre el día completo en 30 segundos. El final queda en pausa a las 24:00. Pausa, desliza el reloj, salta al amanecer o vuelve al resumen. Al ocultar la pestaña se pausa el avance efectivo.

Si ninguno de los tres días tiene todas las capas principales, se usa el que conserva más capas reales válidas (y, en igualdad, el más reciente). Las capas ausentes permanecen identificadas como no disponibles. Así un fallo de demanda no destruye un mix diario válido de otro día; nunca se mezclan fechas entre capas.

Los límites del día se calculan con la zona peninsular, incluyendo días de cambio de hora de **23 o 25 horas**. Se mantienen los offsets de las observaciones y se muestran CET/CEST en cada intervalo; las dos horas repetidas no se colapsan. Si faltan horas, la capa queda no disponible en lugar de rellenarse.

«Actualizar fuentes» vuelve a consultar el mismo día y pausa la reproducción. Se mantienen fecha, ámbito y sincronización; si una capa falla, se conserva su última descarga válida identificada y se muestra el error. El modal distingue la hora del producto de la última descarga válida y del último intento de consulta. Un archivo de más de 72 horas se señala como antiguo. Para buscar el nuevo día más reciente, recarga la aplicación.

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
| `demanda/evolucion` | `hour` | Demanda, indicador `10297` |
| `generacion/evolucion-estructura-generacion-emisiones-asociadas` | `hour` | Generación sin/con CO₂ eq., indicadores `1` y `2` |
| `generacion/estructura-generacion` | `day` | Tecnologías y generación total `10296` |
| `balance/balance-electrico` | `day` | Renovables, no renovables, almacenamiento, intercambios y demanda |

Ejemplo efectivo:

```text
https://apidatos.ree.es/es/datos/balance/balance-electrico?start_date=2026-10-30T00:00&end_date=2026-10-30T23:59&time_trunc=day&geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741
```

En la verificación del 30/10/2026 hubo 24 observaciones horarias completas. Demanda horaria sumada: **642.367,2 MWh**. Generación horaria con/sin emisiones sumada: **700.633,9 MWh**, igual al mix diario publicado. Estas comprobaciones establecen la correspondencia energética: MWh por intervalo horario equivale numéricamente a MW medios durante esa hora; dividimos entre 1.000 para GW. Los agregados diarios se convierten de MWh a GWh, no se suman potencias como si fueran energías.

El navegador pudo consultar las fuentes directamente mediante CORS. La API documenta **GET**; no se asume que HEAD u otras operaciones estén permitidas. Se consultan bajo demanda con un máximo de 22 segundos por widget. `estructura-generacion`, `balance-electrico` y otros widgets diarios probados devolvieron HTTP 400 con `hour`; no se da por hecho que todos admitan todas las resoluciones enumeradas por la API.

Las respuestas pueden contener `magnitude: null`; por eso las unidades no se deducen de ese campo ni de un porcentaje aislado. Se valida la resolución, los sumatorios horarios frente al día, los tipos y las horas. Los `percentage` de la fuente pueden referirse a subgrupos (especialmente en balance); **no se suman**. El mix se calcula usando los valores de las tecnologías y el total diario verificado.

## Balance, almacenamiento y signos

El balance observado se cumple como:

```text
generación renovable + generación no renovable
+ saldo almacenamiento + saldo internacional + enlace Península–Baleares
= demanda en barras de central
```

El total del mix tecnológico **excluye almacenamiento** en este producto. La turbinación de bombeo (`1445`) es positiva y el consumo de bombeo (`1472`) negativo; su suma es el saldo (`10483`). No se cuenta a la vez una categoría total y sus componentes. No se etiqueta la turbinación como renovable ni se mete el consumo negativo en un gráfico de porcentajes de generación.

Saldo internacional (`1474`) y enlace Península–Baleares (`1473`): positivo aporta al sistema peninsular; negativo sale de él. No se confunden saldo neto y flujos brutos. Los mostramos separados en el modal, sin atribuir al mix de Baleares el agregado peninsular ni simular rutas geográficas.

Se comprueba el cierre de balance, la suma de tecnologías y la correspondencia entre capas. Tolerancia de redondeo: 2 MWh. Un desacuerdo invalida visiblemente la capa afectada, no se fuerza la suma ni se cambia el signo.

## Ámbito e imágenes

El mapa representa **España peninsular**; Portugal es contexto geográfico, sin datos eléctricos portugueses. Canarias, Baleares, Ceuta y Melilla **no forman parte del agregado**. No hay supuestas centrales, flujos entre ciudades, series autonómicas ni mediciones locales.

Contornos: **Made with Natural Earth**, dominio público, escala 1:110 millones. [Condiciones](https://www.naturalearthdata.com/about/terms-of-use/) · [archivo vectorial de origen](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). Los archivos locales en `public/maps` conservan las geometrías de España y Portugal; para la vista se selecciona el mayor polígono continental. La extrusión es decorativa, no elevación real.

Los datos energéticos se atribuyen a Red Eléctrica/REData; su publicación en esta demo no implica respaldo institucional. Three.js, Vite y Vitest: MIT; TypeScript: Apache-2.0; Playwright: Apache-2.0. Los avisos se mantienen en las dependencias. DM Sans y Manrope: SIL Open Font License; si Google Fonts no está disponible se usa la tipografía del sistema.

La aplicación no recoge telemetría propia. El navegador contacta REData y Google Fonts. No hay claves, servicios de pago ni datos sintéticos de sustitución.
