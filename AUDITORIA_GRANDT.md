# Auditoría del algoritmo Gran DT + plan de reconstrucción

**Fecha:** 19/08/2026 · Torneo Clausura 2026, fecha 5 jugada, fecha 6 el 21/08
**Base auditada:** carpeta `Grandt` (app.js, algorithmEngine.js, learningEngine.js, sync.js, data.js)

---

## Resumen en tres frases

El problema no son los datos: los datos que juntaste son buenos y suficientes. El problema es que el algoritmo **no está midiendo puntos de Gran DT** — está calculando un índice inventado, mezclando unidades distintas, y encima lo aplasta contra un techo de 99 que hace que catorce volantes empaten. Y la mitad del sistema que creías que estaba funcionando (los sliders de pesos, el motor de aprendizaje) **no toca el resultado: es decorado**.

---

## 1. Los siete errores que explican todo lo que te molesta

### 1.1 Los pesos y el "aprendizaje" no hacen nada 🔴

`STATE.positionWeights` (los sliders: cleanSheet 50%, avgRating 25%…) se guarda, se muestra, se ajusta solo después de cada fecha con `computeAdaptiveWeightNudges`… y **nunca entra al cálculo**. `calculateScoreDT()` ni lo recibe como parámetro. `evaluateBestFormations()` lo recibe como `activeWeights` y no lo usa en ninguna línea.

Consecuencia: podés mover los sliders todo lo que quieras y el ranking no cambia ni un decimal. El motor de aprendizaje lleva un mes "calibrando" un número que no está conectado a nada.

### 1.2 `avgRating` NO es la nota de Clarín — son puntos 🔴

Este es el error madre. En `app.js:2141`:

```js
player.avgRating = totalRatingSum / ratedMatches;  // promedio de las columnas F1..F18
```

Las columnas F1, F2… de Planeta Gran DT son **el puntaje Gran DT de cada fecha** (nota + goles + valla invicta + figura − tarjetas). No son la nota periodística. Por eso en `data.js` hay jugadores con `avgRating: 13.5`, `10.67`, `10`.

Y después, en `app.js:1762`, el algoritmo lo trata como si fuera una nota de 1 a 10 y la recorta a mano:

```js
const cleanNotaClarin = Math.max(4.5, Math.min(7.0, rawRating - goles*1.5 - figuras*1.0 ...))
```

Dos desastres en una línea:

1. **El techo de 7.0 satura a todos los buenos en el mismo valor.** Por eso en tus capturas Lanzini, Tissera y Prieto —tres posiciones, tres equipos, tres contextos distintos— muestran los tres exactamente **6.20** de "Ficha Base Clarín Limpia". Ese término es el más pesado de la fórmula y es prácticamente una constante. El algoritmo se quedó sin señal de calidad individual.
2. **Los coeficientes (1.5 para VOL, 1.2 para DEL, 0.9 para DEF, 3.0 por valla invicta) son inventados.** El reglamento dice 6, 4 y 9. No hay razón para usar otros números: los goles, figuras, vallas y tarjetas de cada jugador **están todos en la planilla**, columna por columna.

**La solución existe y es exacta**, no aproximada:

```
nota_promedio = (AcT − bonos_conocidos) / CT
```

donde `bonos_conocidos = 9·GT_def + 6·GT_vol + 4·GT_del + 3·GP + 2·GV + 5·GO + 4·VF + 3·VI(arq) + 2·VI(def) + 4·PA − 1·GR − 2·GE − 2·TA − 4·TR − 4·PE`.

Eso te devuelve la nota periodística pura de cada jugador, que es exactamente el "piso" que vos querés medir. Está implementado en `motorV3.js` (`notaLimpia()`), con un control de sanidad: si más del 8% de los jugadores queda con nota fuera de 1–10, alguna constante del reglamento está mal y te avisa.

### 1.3 El puntaje 0–100 aplasta la cima 🔴

`app.js:2314-2322`:

```js
finalScore = Math.min(99.0, Math.max(30.0, 50.0 + ((ep - 4.00) / 3.00) * 45.0));  // VOL
```

Un volante top llega a EP ≈ 8.9 → 50 + (4.9/3)·45 = **123 → recortado a 99**. Todos los que superan EP 7.3 quedan pegados arriba. **Ahí están tus catorce volantes con 96.** No es un problema de ponderaciones: es el mapeo.

En `motorV3.js` el score es 50% percentil dentro de la posición (garantiza que no haya empates) + 50% escala absoluta anclada en puntos (garantiza que el número siga significando algo). En el test contra tus datos, **los 10 primeros de cada posición dieron 10 valores distintos**.

Pero además: **el número principal debería ser el EP en puntos, no un 0–100.** Vos pensás en puntos ("un arquero que te sume 9 es hermoso"). Que el ranking diga "Marchiori · 6.8 pts esperados" y no "Marchiori · 94" te va a servir diez veces más, porque podés sumar los once y ver si el equipo apunta a 90 o a 75.

### 1.4 Términos inventados que ensucian la fórmula 🟠

En `calculateScoreDT` hay sumandos que no salen ni del reglamento ni de un dato medido:

```js
const COPA_SERIES_TEAMS = new Set(['independiente rivadavia','river plate','talleres', ...]);
const EP_copa_rival = isFacingCopaRival ? 0.12 : 0;   // +0.12 puntos, porque sí
const winProbBonus = (teamWinProb - 0.35) * 0.60;
const rivalPressurePenalty = (rivSotFor - 4.0) * 0.06;
const viPerformance = (viRate * 0.45) - (gcPerMatch * 0.15);
```

Esa lista de equipos de copa está **hardcodeada a mano** y ya está desactualizada. Y los otros tres términos son el problema del que te quejás cuando decís "no todos los favoritos tienen que tener 20% de bonus": el favoritismo entra **cuatro veces** en el mismo cálculo del arquero — una vez adentro de `P_VI_combinada` (que ya lleva 10% de winProb), otra en `winProbBonus`, otra en `− rivalExpG·0.90`, y otra en `rivalPressurePenalty`. Cada vez con un coeficiente distinto elegido a ojo. Por eso el resultado no responde a la lógica: cuando movés una cosa, se mueve cuatro veces con signos y magnitudes que nadie controla.

### 1.5 La probabilidad de gol individual está topeada y no está normalizada 🟠

```js
let P_gol_individual = Math.min(0.28, ...);  // DEF
let P_gol_individual = Math.min(0.48, ...);  // VOL
let P_gol_individual = Math.min(0.65, ...);  // DEL
```

Tres problemas:

- **Los topes son arbitrarios** y aplanan justo a los que te interesa distinguir.
- **No hay normalización por equipo.** Si sumás la probabilidad de gol de los once de un equipo, no da los goles esperados de ese equipo. Da cualquier cosa. Por eso los números no son coherentes entre sí.
- **Se usa P(gol) en vez de λ (goles esperados).** Los puntos son lineales en goles: el 9 que puede meter dos vale el doble. Usar la probabilidad de "meter al menos uno" te castiga sistemáticamente a los goleadores. Con λ el problema desaparece y de paso no hace falta ningún tope.

Lo que hace `motorV3.js` es lo que vos pedís textualmente: **λ_jugador = (cuota de ataque del jugador) × (goles esperados del equipo)**. Las cuotas suman 1 dentro del equipo, así que la suma de los once da exactamente los goles esperados del equipo. Dos defensores de Vélez comparten la misma base de valla invicta pero tienen techos de gol distintos según su xG y sus tiros. Es exactamente el comportamiento que describiste.

### 1.6 La figura no está normalizada 🟠

Hay **una sola figura por partido**, y hoy el cálculo no lo respeta: cada jugador calcula su probabilidad por separado y las de un mismo equipo pueden sumar cualquier cosa. En `motorV3.js`: el equipo se lleva la figura con probabilidad `pGanar + 0.5·pEmpate` (tu regla), y adentro del equipo se reparte por nota + amenaza de gol, sumando 1. Individualizado y coherente al mismo tiempo.

### 1.7 Las fechas del fixture son adivinadas 🟠

En `sync.js:353-383`, ESPN no devuelve el número de fecha, así que el código lo infiere con una heurística: ordena por fecha del calendario y va metiendo partidos en la fecha N mientras ningún equipo se repita. Revisé Aldosivi y las 8 primeras fechas dan bien, y el partido de fecha 6 (Aldosivi–Unión, 21/08) coincide con lo que devuelve la API de cuotas. **Pero es frágil**: un partido postergado o adelantado descoloca todo el bloque siguiente. Con dos zonas de 15 y fechas interzonales, es cuestión de tiempo.

---

## 2. Qué pasa con los datos (tus preguntas puntuales)

| Pregunta tuya | Respuesta verificada |
|---|---|
| ¿Funciona la API de cuotas? | **Sí.** La key `8a6d…d564b` (the-odds-api) responde hoy con **16 partidos** de Primera. Está hardcodeada en `sync.js:582` — 500 requests/mes en el plan gratis. |
| ¿Tenemos "cuánto paga el gol de cada equipo"? | **No.** Pedí los mercados `btts` y `team_totals` y la API devuelve **422** (no disponibles con esa key). Hoy el "gol del equipo" se **deriva** de Over/Under con esta fórmula inventada: `expectedGoals = línea + (P(over) − P(under)) · 1.5`. No tiene respaldo. |
| ¿Las probabilidades del mercado están bien calculadas? | **No del todo.** Se usa `1/cuota` sin quitar el margen de la casa (las tres suman ~1.06, no 1.00), así que todo queda inflado ~6%. |
| ¿Los datos de 365Scores son inventados o hardcodeados? | Ni una cosa ni la otra: **se descargan**, pero en el `data.js` que está en la carpeta **472 de 473 jugadores tienen `xg365 = 0` y `shots365 = 0`**. Los xG que ves en la app salen de lo que quedó guardado en el localStorage del navegador, no del archivo del repo. Eso es frágil: si limpiás el navegador, perdés la base. |
| ¿Están mal los nombres de equipos? | **No.** Lo verifiqué: los 30 equipos resuelven bien entre planilla, fixture, tabla y cuotas. Este no es el problema. |
| ¿El algoritmo calcula la figura? | Sí pero mal, ver 1.6. |

**Reglamento oficial** (lo verifiqué, no lo asumí): Clarín 1–10 · Figura +4 · Gol: DEL +4, VOL +6, DEF +9, ARQ +12 · Gol de visitante +2, de penal +3, de oro +5 · Valla invicta ARQ +3, DEF +2 · Penal atajado +4 · Gol recibido −1, gol en contra −2, amarilla −2, roja −4, penal errado −4 · Califica con 20+ minutos · **el capitán duplica solo la calificación Clarín, no el puntaje total**.

Ese último punto importa: si la app elige capitán por puntaje total esperado, está eligiendo mal. El capitán tiene que ser **el de mayor nota Clarín esperada** (el que juega bien siempre), no el que más chances de gol tiene.

---

## 3. Lo que dicen tus datos (y confirma tu instinto)

Sobre los 60 partidos jugados del Clausura 2026:

| Métrica | Valor |
|---|---|
| Goles por partido | **2.05** (liga muy cerrada) |
| Goles del local / del visitante | 1.13 / 0.92 |
| **Valla invicta del local** | **43.3%** |
| **Valla invicta del visitante** | **28.3%** |
| Valla invicta global | 35.8% |

Tres conclusiones duras:

1. **Tu regla de "arquero local siempre" es correcta y ahora tiene número: 1.53× más chances de valla invicta.** En puntos: un arquero local promedio saca `3·0.433 − 0.917 = +0.38` del bloque valla/goles; el visitante saca `3·0.283 − 1.133 = −0.28`. **La localía sola vale 0.66 puntos** para un arquero.
2. **El rango entre el mejor y el peor contexto de arquero es de ~2.2 puntos.** Buen partido (λ recibido 0.55, VI 58%): `+1.19`. Mal partido (λ 1.60, VI 20%): `−1.00`. Eso es enorme y el algoritmo actual lo estaba comprimiendo a nada.
3. **Un defensor con gol vale lo mismo que un defensor con el mejor contexto defensivo del país.** Un defensor con λ de gol 0.10 aporta `0.10 × 9 = 0.90 pts`; la diferencia de valla invicta entre el mejor y el peor emparejamiento es `2 × (0.58 − 0.20) = 0.76 pts`. Tu intuición de que "hay que encontrar las dos cosas" es literalmente correcta: valen parecido, y el que tiene las dos vale el doble.

Y el default del algoritmo actual era `cleanSheetProb = 0.30`, cuando la realidad de la liga es 0.36 y para un local 0.43. **Venía subestimando la valla invicta de entrada.**

---

## 4. El motor nuevo: `motorV3.js`

Regla de oro: **todo se mide en puntos de Gran DT y todo término sale del reglamento o de un dato medido. Si no, no entra.**

```
EP(ARQ) = nota + 3·P(VI) − λ_recibidos + 4·P(figura) + 4·P(penal atajado)
          − 2·tasa_amarilla − 4·tasa_roja

EP(DEF) = nota + 2·P(VI) + λ_gol·(9 o 11) + 4·P(figura)
          − 2·tasa_amarilla − 4·tasa_roja − 2·tasa_gol_en_contra

EP(VOL) = nota + λ_gol·(6 u 8) + 4·P(figura) − 2·tasa_amarilla − 4·tasa_roja
EP(DEL) = nota + λ_gol·(4 o 6) + 4·P(figura) − 2·tasa_amarilla − 4·tasa_roja

todo × P(califica, 20+ minutos)
```

Cada pieza:

**`nota`** — reconstruida exacta desde la planilla (§1.2), con ajuste bayesiano hacia la media de liga: con 1 o 2 partidos la nota individual es ruido, así que se la tira hacia el promedio hasta que haya muestra. Sin techos artificiales.

**`λ_recibidos` y `λ_convertidos`** — goles esperados del partido, de tres fuentes con pesos explícitos:
- **Mercado (55%)**: en vez de la fórmula inventada, se **resuelven** λ_local y λ_visitante para que un modelo Poisson reproduzca las cuotas 1X2 y el Over/Under, **después de quitar el margen de la casa**. Devuelve un error residual: si es alto, no te fíes de esa cuota.
- **xG del equipo (30%)**, separado local/visitante.
- **Goles reales (15%)**, por condición, con shrinkage a la media de liga (4 partidos de prior — con 2 partidos de local no se puede concluir nada).

Sin cuotas, se renormaliza a 65/35. Nada de defaults mágicos.

**`P(VI) = exp(−λ_recibidos)`** — Poisson. Contra tus 60 partidos: Poisson predice 40.0% de valla invicta local y la realidad da 43.3%; predice 32.2% de visitante y da 28.3%. Subestima un poco la ventaja de localía, con n=60 (ruido alto). Está bien para arrancar y se recalibra solo cada fecha con `recalibrarLiga()`.

**`λ_gol` individual** — cuota de ataque del jugador × goles esperados del equipo, normalizada (§1.5). La cuota sale de xG/90 + tiros/90 de 365Scores, con caída a goles reales + prior posicional cuando falta el dato, y **la confianza baja el peso del dato flojo** en vez de fingir que existe.

**`P(figura)`** — normalizada dentro del equipo, tu regla (§1.6).

**Tarjetas** — con shrinkage: 1 amarilla en 4 partidos **no** es "25% de tasa", es ruido. Prior por posición.

**Lo que te devuelve, por jugador**, es el desglose completo en puntos, línea por línea:

```
Nota Clarín limpia (piso)   5.71   cruda 5.83 · 4 PJ · ajustada a liga
Valla invicta               1.11   55.4% × 2 pts
Gol propio                  0.83   0.092 goles esperados (6.1% del ataque) × 9 pts
Figura                      0.26   6.4% × 4 pts
Tarjetas                   -0.54   27% amarilla · 1.6% roja
                            ────
                       EP = 7.37 pts
```

Eso es auditable de verdad. Si algo no te cierra, ves exactamente qué término lo está causando.

### Estado del código

`motorV3.js` corre contra tus datos reales y produce rankings sin empates. **Pero todavía no son rankings confiables**, por dos razones que hay que arreglar antes:

1. `data.js` no trae `AcT` (puntaje acumulado en el torneo), así que para probarlo lo simulé. Sin `AcT` real no hay nota limpia real.
2. `xg365` y `shots365` están en 0 en el archivo del repo.

Traducción: **el motor está listo, la cañería no.** El paso 1 del plan es la cañería.

---

## 5. Plan, en orden, sin vueltas

**Ahora (antes de la fecha 6, sábado 21/08)**

1. **Arreglar el sync para que persista todo.** Que `syncPlanetaGranDTBrowser` guarde `AcT`, `CT`, `GV`, `GO`, `GR`, `GE`, `PA`, `PE`, `Cotización` y el array `F1..F18` **en `data.js` en disco**, no solo en localStorage. Sin esto no hay nota limpia, no hay backtest y no hay aprendizaje. Es el cuello de botella de todo lo demás.
2. **Cargar la planilla nueva** (la de fecha 5 que sacaste hoy) por ese pipeline arreglado.
3. **Correr `validarReconstruccion()`.** Tiene que dar verde (menos del 8% de notas fuera de 1–10). Si da rojo, la constante que está mal es casi seguro el gol de penal o el gol de oro — te aviso cuál en el reporte.
4. **Enchufar `motorV3` en el ranking**, mostrando EP en puntos como número principal.
5. **Sacar el margen de la casa de las cuotas** y guardar el error residual del ajuste por partido.

**Fecha 6 en adelante, cada semana**

6. **Guardar el snapshot antes de que se juegue** y compararlo contra los puntajes reales de las columnas F cuando salen. Métrica: error absoluto medio por posición, y "¿cuántos de mis 11 recomendados entraron en el top 30 real de su posición?".
7. **Calibrar sobre lo que se pueda calibrar de verdad.** Con 5 fechas no se pueden entrenar 20 pesos; sí se pueden calibrar 4 o 5 cosas: los pesos de las tres fuentes de λ (55/30/15), la fuerza del shrinkage de la nota, la corrección de valla invicta por localía, y el reparto de la figura. Eso es entrenable. Ajustar 20 ponderaciones con 5 fechas es sobreajustar ruido.
8. **Backtest sobre el torneo pasado** (776 jugadores en tu planilla vieja) recién cuando el motor esté estable. Antes es perder tiempo.

**Lo que hay que decidir (y no puedo decidir por vos)**

9. **Presupuesto.** Gran DT tiene tope de plata y la columna `Cotización` está en la planilla, pero la app la parsea mal (`"$ 1.500.000"` no se convierte a número) y el armado del 11 la ignora por completo. Elegir el mejor once sin restricción de presupuesto es un problema distinto —y mucho más fácil— que el que estás jugando. Esto puede estar cambiándote todo el equipo.
10. **Rotación, lesiones y suspensiones.** Hoy no se modelan (`hasRotationRisk` está fijado en `false` y nunca se calcula). Sospecho que **es la mayor fuente de error real** del sistema: recomendar al mejor defensor de Vélez no sirve de nada si no juega. Con las minutos de 365Scores se puede estimar decentemente.

---

## 6. Tres cosas que necesito de vos

1. **Gol de penal y gol de oro**: ¿el gol de penal vale **3 fijo** (reemplaza al valor por posición) o son **+3 encima** del valor de la posición? Lo mismo con el gol de oro (+5). Vos jugás hace 10 años, lo sabés al toque; yo puedo verificarlo con los datos pero tarda una fecha.
2. **Presupuesto**: ¿cuánto es el tope y querés que el 11 lo respete? Si sí, el armado del equipo cambia por completo (pasa a ser un problema de optimización con restricción, tipo mochila).
3. **La regla de la figura**: ¿es cierto que la figura nunca es de un equipo que perdió? Lo implementé como vos lo dijiste (gana → siempre del ganador; empate → 50/50; pierde → nunca), pero es una regla fuerte y quiero confirmarla antes de que quede clavada en el motor.

---

*Nada de lo que dice este documento sobre tu código fue asumido: cada punto está verificado sobre los archivos de la carpeta, los datos de `data.js`, la planilla publicada de Planeta Gran DT y una llamada real a la API de cuotas.*
