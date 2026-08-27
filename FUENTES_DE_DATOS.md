# Estado de los datos: qué tenemos, qué no, y qué alternativas hay

**20/08/2026** · Investigado y probado, no supuesto.

---

## La respuesta corta

**Ya tenemos casi todo lo que pediste, y funcionando.** Lo que falta es una sola cosa (la cuota de gol como precio de mercado) y un problema que no se arregla con datos nuevos sino con tiempo (el tamaño de la muestra) — aunque para eso sí hay una solución, y te la dejo lista.

---

## Lo que YA tenemos resuelto

| Dato | Fuente | Cobertura real |
|---|---|---|
| **Tiros por jugador** | 365Scores | 75 partidos · 484 jugadores con tiros registrados · **98% de cruce** con la planilla de Planeta Gran DT (621 de 636) |
| **xG por jugador** | 365Scores | mismo |
| **Minutos y titularidad por jugador** | 365Scores | mismo — de acá sale la chance de jugar |
| **Tiros generados y concedidos por equipo** | 365Scores | Derivados de lo anterior: los tiros a favor de uno son los concedidos del otro. **Control de coherencia: 13,20 a favor contra 13,20 en contra. Clavado.** |
| **xG generado y concedido por equipo** | 365Scores | mismo |
| **Todo eso separado local / visitante** | 365Scores | ✅ calculado |
| **Cuotas 1, X, 2** | the-odds-api | 30 partidos, promedio de todas las casas, **con el margen descontado** (10,5% promedio) |
| **Over / Under con su línea** | the-odds-api | ✅ |
| **Fixture, resultados, tabla** | ESPN | ✅ verificado: 30 de 30 equipos coherentes |
| **Calendario de Libertadores y Sudamericana** | ESPN | ✅ |
| **Planilla oficial completa** | Planeta Gran DT | 636 jugadores, todas las columnas, cotizaciones incluidas |

Cobertura de tiros entre los jugadores que cruzan: **defensores 77%, volantes 85%, delanteros 89%**, arqueros 0% (no patean). Los que faltan son suplentes que casi no jugaron.

---

## Lo único que NO conseguimos: la cuota de gol por equipo

Probé el mercado `btts` (ambos marcan) con tu clave:

- Primera División argentina → **error 422**
- Premier League → **error 422**

Que falle también en la Premier significa que **no es el torneo, es la clave**: los mercados adicionales no están en el plan gratis.

**Los planes pagos** de the-odds-api arrancan en **US$30/mes** (20.000 consultas) y siguen en US$59 (100.000). En su página no aclaran qué mercados incluye cada plan, así que **antes de pagar habría que preguntarles si `btts` y `team_totals` están cubiertos para la liga argentina** — puede que sí y puede que no.

**Mi opinión: todavía no lo pagaría.** No porque no sirva, sino por lo poco que agregaría. Hoy la probabilidad de gol de cada equipo la calculamos resolviendo un Poisson contra el 1X2 y el Over/Under ya limpios de margen. Tener el BTTS del mercado sumaría una restricción más, que ajustaría sobre todo la correlación entre los goles de los dos equipos. La mejora en la probabilidad de valla invicta sería de unos pocos puntos porcentuales. Por treinta dólares al mes, y con todo lo que todavía tenemos por calibrar, hay lugares mejores donde poner el esfuerzo.

Si en algún momento lo querés, se enchufa en veinte minutos: el motor ya tiene el lugar donde entraría.

---

## El problema real: la muestra es chica

Esto es más importante que la cuota que falta.

Con 5 fechas jugadas, **cada equipo lleva 2 o 3 partidos de local y 2 o 3 de visitante**. Cuando decís "me encantaría saber si un equipo patea mucho de local y nada de visitante", la respuesta honesta es: con dos partidos por condición no se puede afirmar. Por eso todos los splits que ves salen suavizados hacia el efecto de localía de la liga —que sí tiene 75 partidos detrás y es sólido— y lo que se muestra es cuánto se aparta cada equipo de ese promedio, no su número crudo.

**Esto no se arregla con una fuente nueva. Se arregla con más partidos.** Y hay dos maneras:

**La lenta:** esperar. En la fecha 10 vas a tener 5 partidos por condición; en la 16, 8.

**La rápida:** bajar el torneo anterior. Los identificadores de partido de 365Scores son globales y se asignan cuando se arma el fixture, así que el torneo pasado está en un bloque de números más bajo. Verifiqué que los datos históricos siguen ahí (probé un partido de octubre de 2025 y responde con todo).

Te dejé **`SYNC_365_HISTORICO.bat`**. Lo corrés **una sola vez** y tarda entre 5 y 15 minutos: primero hace un barrido grueso para encontrar dónde vive el torneo anterior, después uno fino alrededor. Sale `data365_historico.json`.

**Qué te compra eso, siendo honesto:**

- **Los splits local/visitante por equipo pasan de 2-3 partidos a 9 o 10.** Ahí sí se puede hablar de cómo juega cada uno según la condición. Es el que más gana.
- **Los tiros y el xG por jugador triplican la muestra.** La mayoría de los jugadores siguió en el mismo club, así que sirve — con menos peso que lo reciente, pero sirve.
- **Y lo más importante: se puede probar el algoritmo.** Con el torneo anterior completo, más los puntajes fecha por fecha de la planilla vieja, se puede correr el motor hacia atrás y ver si acertaba. Eso es lo único que convierte "me parece que está bien" en "sé que está bien".

**Qué NO te compra:** los equipos cambiaron de plantel y de técnico entre torneos. Los datos viejos entran con menos peso, no reemplazan a los nuevos.

---

## Otras fuentes que probé y no sirven

| Fuente | Qué pasó |
|---|---|
| **SofaScore** (`api.sofascore.com`) | **403.** Bloquea todo lo que no sea un navegador. La función que la usaba en tu app falla en silencio desde siempre. |
| **FBref** | **403.** Bloquea scrapers. |
| **the-odds-api, mercados btts / team_totals** | **422** con la clave gratis, incluso en la Premier. |
| **ESPN, Copa Argentina** | El slug que probé devuelve error. El script prueba varios candidatos y saltea el que falla, así que si algún día aparece se engancha solo. |

Y una que sí funciona y ya estamos usando: **xgscore.io**, con el xG por equipo actualizado a la fecha 5.

---

## Qué haría yo, en orden

1. **Correr `SYNC_365_HISTORICO.bat` una vez.** Es el mayor salto de calidad disponible hoy y es gratis.
2. **Esperar la fecha 6 y medir.** Guardamos lo recomendado, lo cruzamos contra los puntajes reales, y por primera vez sabemos si el motor acierta.
3. **Recién después**, si hace falta, evaluar si vale pagar por la cuota de BTTS.

El orden importa: pagar por más datos antes de saber si el modelo funciona es gastar a ciegas.
