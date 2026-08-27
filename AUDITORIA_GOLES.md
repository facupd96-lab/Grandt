# Auditoría del modelo de goles — 27/08/2026

Todo lo que sigue está medido. Donde no pude medir, lo digo.

---

## 0. Lo primero: encontré un dato envenenado

Auditando aparecí con **"Florián Monzón, 21 goles en un partido"**. Era el bug viejo del parser
de 365Scores: los valores compuestos vienen como `"2 (1)"` —dos goles, uno de penal— y al borrar
los no-dígitos quedaba `21`. Ese bug lo arreglé el 23/08 en `SYNC_365.ps1` y en
`SYNC_365_HISTORICO.ps1`.

El problema es otro: **`data365_historico.json` es del 22/08 y nunca se vuelve a generar**, porque
`SYNC_365_HISTORICO` no está en `ACTUALIZAR_TODO` (tarda 15 minutos). Así que el archivo quedó con
el bug adentro para siempre.

**46 filas de 9015.** Con ellas, el torneo anterior figuraba con **3,76 goles por partido**.
Sin ellas: **1,99**. El patrón es reversible sin ambigüedad (11 = "1 (1)", 21 = "2 (1)"), así que
ahora `armar.cjs` lo repara al vuelo y avisa por consola. Igual conviene correr
`SYNC_365_HISTORICO.bat` una vez para tenerlo limpio de origen.

### Lo que esto cambia de lo que te dije la semana pasada

Te dije que el arbitraje posicional —defensores con llegada— era **la palanca más grande del juego,
+1,26 puntos por fecha por defensor**. Con los datos limpios eso es falso. Los números reales,
mismo método, 5+ partidos previos y 60+ minutos jugados:

| puesto | goles/fecha del promedio | del top 25% en amenaza | vale el gol | diferencia real |
|---|---|---|---|---|
| DEF | 0,043 | 0,053 | +9 | **+0,10 pts** |
| VOL | 0,078 | 0,148 | +6 | **+0,42 pts** |
| DEL | 0,218 | 0,315 | +4 | **+0,39 pts** |

O sea: elegir defensores por su llegada al gol **no sirve para nada** (+0,10 por fecha). En volantes
y delanteros sí sirve, pero es +0,4, no +1,6. Perdón por eso — la conclusión venía de las 46 filas
envenenadas, que estaban concentradas justo donde más ruido hacían.

---

## 1. Goles a favor y en contra — esto está bien

Se construyen desde el **fixture**: esqueleto de `data.js` (240 partidos, 16 fechas) con los
resultados de 365Scores encima, y los goles de 365Scores se validan contra los eventos de gol del
partido, no contra la suma de estadísticas individuales (hay goleadores que no figuran en ninguna
ficha individual — Cingolani convirtió a los 51' en Gimnasia (M) 3-1 Talleres y no aparece en las
estadísticas de nadie).

**Control cruzado: 30 equipos, 0 descuadres** entre el fixture y la tabla de posiciones que muestra
la app. 187 goles en 90 partidos = **2,08 por partido**.

**Ventaja de local, medida en este torneo:**

| | local | visitante |
|---|---|---|
| goles por partido | 1,16 | 0,92 (+25%) |
| valla invicta | 42% | 29% |
| ganó | 48% | 30% (22% empates) |

Coincide con el torneo anterior (1,11 vs 0,88). Es sólido.

---

## 2. Probabilidad de gol de cada equipo

**Fuente principal: el mercado.** Se toman 1X2 y Over/Under de las casas, se les descuenta el
margen (11,9% promedio esta fecha) y se resuelve por búsqueda en grilla el par de λ de Poisson que
reproduce esas probabilidades. Los goles esperados de la fecha 7 salen así:

- suma 38,8 goles en 15 partidos = **2,59 por partido** (contra 2,08 real del torneo — las casas
  esperan una fecha más abierta, o el torneo viene por debajo de lo normal)
- local: entre 0,95 y 1,92, medio 1,57 · visitante: entre 0,61 y 1,46, medio 1,01
- coherencia interna: r(prob. de ganar el local, goles esperados del local) = **0,863**;
  r(goles esperados del rival, prob. de valla invicta) = **−0,991**. No hay contradicciones.

**Fuente de respaldo (si fallan las cuotas): nivel del equipo.** Es `base_liga × ataque_propio ×
defensa_rival`, con encogimiento K=6. Medido de forma prospectiva —los niveles se calculan sólo con
los partidos anteriores a cada uno— sobre el torneo anterior, 452 partidos:

| base del nivel | r | goles reales por quintil de esperado |
|---|---|---|
| su xG / xG recibido | **0,233** | 0,74 · 0,92 · 0,81 · 1,22 · 1,33 |
| sus goles / goles recibidos | 0,198 | 0,61 · 0,88 · 1,12 · 1,21 · 1,21 |
| sus tiros / goles recibidos | 0,126 | 0,90 · 0,90 · 0,97 · 1,04 · 1,22 |

El xG es la mejor base, y es la que usa el motor. Pero ojo con la magnitud: **r = 0,23 con un
torneo entero de datos.** Con las 6 fechas de este torneo el mismo test da **r = 0,024** — cero.
Traducción: hasta la fecha 10 u 11, sin cuotas el modelo está ciego. Por eso las cuotas pesan 1,00
y el nivel 0,00 cuando hay mercado.

---

## 3. Valla invicta

Calibración del modelo de niveles por xG sobre 452 partidos del torneo anterior:

| tramo | predicho | real |
|---|---|---|
| Q1 | 24,0% | 21,1% |
| Q2 | 31,7% | 33,3% |
| Q3 | 36,5% | 46,2% |
| Q4 | 41,2% | 41,1% |
| Q5 | 49,1% | 45,1% |

Global: predicho 36,5%, real 37,4%. **Bien calibrado en promedio y monótono**, aunque se pasa de
optimista en el quintil más alto (49% predicho, 45% real). r = 0,155.

---

## 4. Qué se mide en cada puesto

De qué está hecho el puntaje esperado, promediando los 40 mejores de cada puesto:

| puesto | ficha | valla invicta | goles recibidos | gol propio | figura | tarjetas |
|---|---|---|---|---|---|---|
| ARQ | 5,44 (69%) | +0,87 (11%) | −1,31 (17%) | — | 0,10 | −0,15 |
| DEF | 5,36 (72%) | +0,66 (9%) | — | +0,96 (13%) | 0,05 | −0,46 |
| VOL | 5,58 (75%) | — | — | +1,22 (16%) | 0,18 | −0,42 |
| DEL | 5,48 (74%) | — | — | +1,47 (20%) | 0,15 | −0,33 |

**El 70-75% del puntaje esperado de cualquier jugador es la ficha Clarín.** Y la ficha, medida, es
casi impredecible: condicionada a que juegue, la correlación entre el promedio previo y los puntos
de la fecha es −0,05 en ARQ, −0,05 en DEF, +0,10 en VOL, +0,10 en DEL.

Eso deja el margen real del modelo en el 25-30% restante: gol, valla y minutos. Es poco, y hay que
saberlo antes de esperar milagros.

---

## 5. Qué se puede mejorar, por orden de tamaño

1. **Alineaciones confirmadas.** 365Scores publica `lineups.status = "Confirmado"` una hora antes
   de cada partido. Los minutos esperados hoy salen de un promedio ponderado con **28,5 minutos de
   error cuadrático medio**. Una alineación confirmada lo lleva casi a cero para ese partido. Es,
   lejos, la mejora más grande disponible — y como la fecha 7 arranca el viernes, la vale.
2. **Regenerar `data365_historico.json`.** Es del 22/08 con el parser roto. Hoy se repara al vuelo,
   pero mejor tenerlo limpio.
3. **Sumar más fechas al modelo de niveles.** Con 6 fechas no predice nada (r = 0,024); con un
   torneo entero llega a r = 0,233. No hay atajo, es tiempo.
4. **Backtest de verdad.** La foto de la fecha 7 ya está guardada en `historial/`. Cuando termine,
   `BACKTEST.bat` compara contra los cinco criterios de referencia. Sin eso, todo esto es teoría.
5. **La ficha.** Es el 72% del puntaje y hoy se modela como un promedio con encogimiento. Si algo
   la predice mejor que su propio promedio, ahí hay más para ganar que en todo lo demás junto. No
   encontré nada todavía: ni la cotización, ni el rival, ni el local/visitante.

---

## 6. Lo que NO está modelado, para que no te sorprenda

- **Gol de oro** (+5). Raro y no lo sé predecir. El techo real es algo más alto que el simulado.
- **Penal atajado** (+4) y **penal errado** (−2): están en el reglamento del motor pero con tasas
  muy chicas; no los validé contra datos.
- **Gol en contra**: el subtipo 2 de los eventos de 365Scores es probablemente gol en contra, pero
  no lo verifiqué.
- **Pedro Troglio** aparece entre las tarjetas rojas. Es el técnico. Los eventos de 365Scores
  incluyen al cuerpo técnico y no los estoy filtrando.
