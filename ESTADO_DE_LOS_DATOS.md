# Dónde estamos parados con los datos + tres correcciones

**19/08/2026**

---

## Parte 1 — Tenés razón en las tres cosas. Las tres están corregidas.

### 1. El arquero figura: tenías razón, y ahora lo puedo probar

Medí la correlación entre la tasa de figura de un arquero y su tasa de valla invicta, sobre el torneo pasado: **−0.003**. Cero. Son cosas completamente independientes.

Eso significa dos cosas, y las dos te dan la razón:

- **Perseguir la figura del arquero no te ayuda a encontrar vallas invictas.** No hay señal ahí. Cero.
- **Ignorarla no te cuesta nada**, porque no está correlacionada con lo que sí importa.

Comparado: la correlación entre tasa de valla invicta y puntaje del arquero es **0.708**, y la de figura con puntaje es 0.520 — pero esa segunda es de arrastre (los arqueros de equipos buenos hacen las dos cosas).

Tu razonamiento de que "el arquero figura es el que recibe muchos tiros" no aparece en los datos (por eso da −0.003 y no negativo). Pero tu **decisión** es correcta igual, y por una razón mejor que la que dabas: **no es que la figura sea mala, es que es ruido puro que no podés anticipar.** Ir a los 8-9 seguros es lo correcto.

**Corregido:** el ranking de arqueros ahora ignora la figura por completo. Sigue sumando dentro del EP porque son puntos reales (~0.3 por fecha), pero no ordena nada.

### 2. Lo del techo: la tabla estaba mal etiquetada. Mi error.

Tenés toda la razón y me expliqué pésimo. Esa columna que decía "techo" era **el mejor promedio de todo el torneo**, no el techo de una fecha. Dos cosas distintas:

**Techo en UNA fecha (que es lo que vos decís):**

| Puesto | Máximo posible | Cómo |
|---|---|---|
| **DEF** | **27** | 10 ficha + 2 valla + 11 gol de visitante + 4 figura |
| VOL | 22 | 10 + 8 gol de visitante + 4 |
| DEL | 20 | 10 + 6 gol de visitante + 4 |
| ARQ | 17 | 10 + 3 valla + 4 |

**El defensor tiene el techo más alto del juego, largamente. Tenías razón.**

**Mejor promedio sostenido en 17 fechas (lo que yo había puesto mal):**

| Puesto | Mejor promedio | Quién |
|---|---|---|
| VOL | 10.69 | Di María — 5 goles y **5 figuras** en 13 PJ |
| DEL | 10.17 | David Romero — 7 goles, 3 figuras en 12 |
| DEF | 9.00 | Montiel — 4 goles, 2 figuras en 15 |
| ARQ | 7.56 | Beltrán — 2 figuras en 18 |

La diferencia entre las dos tablas es la explicación de todo: **el defensor tiene el premio más grande, el volante lo cobra más seguido.** Di María sacó figura el 38% de las fechas. Montiel, el 13%. El defensor pega más fuerte y menos veces.

Y fijate el dato que sale de ahí: Montiel promedió 9.00 cuando la mediana de los defensores es 6.00. **Tres puntos por fecha de ventaja, todo por meter 4 goles.** Un defensor goleador es la ventaja individual más grande que existe en este juego. Confirmado.

### 3. El defensor de riesgo: te lo había cerrado y estaba mal

Tenías razón en el reclamo. Yo había puesto un tope de 32 puntos al aporte individual, y con eso un defensor con amenaza de gol máxima en un equipo con valla improbable llegaba a 64 — se quedaba afuera del top. Eso contradice lo que decís, y tu cuenta es correcta: **un gol de defensor vale 9.84 efectivos, o sea 4.9 vallas invictas.** Es una apuesta que vale hacer.

**Corregido:**

```
piso del equipo    = 30 a 70   (idéntico para todos los defensores del equipo)
aporte individual  = hasta 45  (65% amenaza de gol · 25% ficha · 10% figura)
castigo tarjetas   = hasta -6
```

Ahora los dos carriles conviven:

| Caso | Score |
|---|---|
| Equipo con valla casi asegurada + defensor flojo | ~77 |
| Equipo con valla casi asegurada + defensor goleador | 100 |
| **Equipo con valla improbable + defensor goleador top** | **~75** ← el carril de riesgo |
| Equipo con valla improbable + defensor común | ~35 |

Y cada defensor sale etiquetado: `SÓLIDO`, `RIESGO GOLEADOR`, `SÓLIDO + GOLEADOR` o `COMÚN`. Para que veas de un vistazo qué estás comprando.

---

## Parte 2 — Dónde estamos parados con los datos

Revisé fuente por fuente y probé las que se pueden probar. Sin vueltas:

| Dato | Fuente | Estado | Detalle |
|---|---|---|---|
| Puntajes, goles, figuras, vallas, tarjetas por jugador | Planeta Gran DT (CSV publicado) | ✅ **Perfecto** | Es tu fuente de verdad. Todas las columnas, todas las fechas. |
| Fixture y resultados | ESPN | ✅ Funciona | Las fechas se infieren con una heurística; revisé Aldosivi y da bien |
| Tabla de posiciones | ESPN | ✅ **Está bien** | La verifiqué contra los resultados del fixture: **0 de 30 equipos con discrepancia**. Lo que viste raro es que `data.js` quedó congelado el 10/08 (fecha 4) |
| Cuotas 1X2 y Over/Under | the-odds-api | ✅ Funciona | 16 partidos hoy. Key gratis, 500 consultas/mes |
| Cuota de "gol del equipo" / ambos marcan | the-odds-api | ❌ **No disponible** | Devuelve 422. Hoy se deriva del Over/Under con una fórmula inventada |
| xG y xGC por equipo | xgscore.io | ✅ **Funciona y está a fecha 5** | Lo bajé hoy, tabla completa de los 30 |
| Tiros a favor/contra por equipo | ya está en `data.js` (`teamStats`) | ⚠️ Bien pero con un bug | Los datos son coherentes (a favor 13.15 vs concedidos 13.13 — perfecto), pero **Central Córdoba está partido en 6 entradas distintas** y ninguna tiene los partidos contados |
| **Tiros y xG por JUGADOR** | 365Scores | 🔴 **El problema real** | ver abajo |
| Minutos por jugador (rotación) | 365Scores | 🔴 Igual | Nunca se cargó |
| SofaScore (xG individual) | api.sofascore.com | ❌ **Bloqueado** | Devuelve 403. La función `tryEnrichWithSofaScore` falla en silencio desde siempre |
| FBref | fbref.com | ❌ Bloqueado | 403 también |

### El problema de los datos individuales, concreto

Busqué en todo el código:

```
xg365       →  se lee 23 veces  ·  se escribe 0 veces
shots365    →  se lee 16 veces  ·  se escribe 0 veces
matches365  →  se lee 31 veces  ·  se escribe 0 veces
minutes365  →  se lee  1 vez    ·  se escribe 0 veces
stats365    →  ni se lee ni se escribe: 0 menciones en todo el proyecto
```

**Los tiros y el xG por jugador se leen en veinte lugares del algoritmo y no se escriben en ninguno.**

Y acá está lo que más bronca da: en `data.js` hay un objeto `stats365` con **463 jugadores, 337 de ellos con tiros y xG reales, con el detalle partido por partido** (game id, fecha, rival, minutos, tiros, xG). Está ahí, completo. **Y no hay una sola línea de código en todo el proyecto que lo lea.** Quedó huérfano de alguna versión anterior.

Mientras tanto, el alert de sincronización te dice "365Scores: xG, Tiros y Minutos actualizados". Nunca actualizó nada de eso.

### La buena noticia: la fuente funciona y es gratis

Probé hoy la API de 365Scores. **Responde y trae, jugador por jugador y partido por partido:**

minutos · goles · asistencias · **tiros totales** · **tiros al arco** · **xG** · pases · toques · faltas · duelos aéreos ganados · intercepciones · despejes · ranking individual

Sin key, sin límite mensual. Estructura verificada: `game.homeCompetitor.lineups.members[].stats[]`, competencia 72.

Con esa sola fuente se resuelve **todo** lo que pediste: tiros por jugador, xG por jugador, tiros generados y concedidos por equipo (los tiros a favor de uno son los concedidos del otro), xG generado y concedido por equipo — y de yapa los **minutos**, que es lo que falta para saber quién juega.

Te dejo **`sync365.js`** y **`SYNC_365.bat`**. Doble clic al `.bat` y baja todo. Escribe `data365.json` con:

- Por jugador: partidos, minutos, tiros, tiros al arco, xG, todo por partido y por promedio, más un índice de titularidad (qué porcentaje de partidos jugó 60+ minutos)
- Por equipo, **separado local y visitante**: tiros generados, tiros concedidos, tiros al arco generados y concedidos, xG generado y concedido
- Un control de coherencia automático: los tiros generados de toda la liga tienen que igualar a los concedidos. Si no dan, te avisa

Corré eso y pasame el `data365.json`. Con eso el motor deja de estimar y empieza a medir.

---

## Parte 3 — Lo que encontré hoy y cambia cómo se elige la valla invicta

Bajé el xG por equipo de xgscore.io a fecha 5 y lo crucé con los goles realmente recibidos. La diferencia entre los dos es **cuánta suerte defensiva viene teniendo cada equipo**, y la suerte no se repite.

**Las trampas — reciben mucho menos de lo que merecen:**

| Equipo | Goles recibidos/p | xG concedido/p | Diferencia |
|---|---|---|---|
| **Vélez** | 0.60 | **1.74** | **+1.14** |
| Gimnasia (M) | 0.60 | 1.64 | +1.04 |
| Belgrano | 0.40 | 1.30 | +0.90 |
| Rosario Central | 0.60 | 1.36 | +0.76 |
| Banfield | 1.00 | 1.64 | +0.64 |

**Vélez es la trampa más grande de la liga.** Es puntero, tiene 3 goles en contra en 5 fechas, todo el mundo va a poner defensores de Vélez — y le están generando 1.74 goles esperados por partido, el tercer peor registro de la Zona A. Su xPTS es 4.9 contra 11 puntos reales. Eso se va a acomodar, y cuando se acomode te comés los goles con el equipo entero.

Es exactamente lo que decías vos sin tener el número: hay que mirar **cuánto le llegan**, no cuántos goles recibió.

**Las oportunidades — defienden mejor de lo que dice la tabla:**

| Equipo | Goles recibidos/p | xG concedido/p | Diferencia |
|---|---|---|---|
| **Boca** | 1.40 | **0.82** | **−0.58** |
| **Ind. Rivadavia** | 1.20 | **0.72** | **−0.48** |

Boca recibió 7 goles en 5 fechas y nadie va a poner un defensor de Boca. Pero le generan 0.82 por partido, el segundo mejor registro de la Zona A. Está defendiendo bárbaro y la tabla lo esconde.

**Los sólidos de verdad — pocos goles Y poco xG concedido:**

Instituto (0.40 / 0.72) · Atlético Tucumán (0.40 / 0.76) · Tigre (0.40 / 0.84) · Barracas Central (0.60 / 0.82).

Esos cuatro son valla invicta real, no suerte.

Detalle que me dejó tranquilo: el motor, **sin** este dato, ya había puesto a defensores de Instituto, Atlético Tucumán y Tigre en el top del ranking. Llegó a lo mismo por otro camino. Ahora además lo hace explícito: cada equipo sale etiquetado como `TRAMPA`, `OPORTUNIDAD` o `coherente`.

---

## Parte 4 — El orden de las cosas

1. **Corré `SYNC_365.bat`** y pasame el `data365.json`. Es el desbloqueo de todo lo individual.
2. **Arreglar que el sync guarde `AcT` en `data.js`** — sigue siendo el bloqueo para la ficha limpia.
3. Unificar las 6 entradas de Central Córdoba en `teamStats`.
4. Enchufar el motor con datos reales y sacar el once de la fecha 6.

Gol de oro y penal atajado quedan como están (+5 y +4) — tenés razón en que son marginales y que no vale la pena tocarlos ahora. Los diez esquemas quedan.
