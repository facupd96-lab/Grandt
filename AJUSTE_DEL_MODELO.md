# Qué retocar en el modelo — 14/10/2026

Tres cosas que pediste: revisar el cierre de fecha, ver qué se le agrega o se le
saca a la medida de puntaje, y buscar señales nuevas en los datos. Esto es lo
que salió, todo medido.

---

## 0. Antes que nada: te di un número mal el 2/10

El 2/10 te dije que el top 20 del motor había sacado 7,45 puntos contra 5,87 del
campo, +1,6 por jugador. **Ese número estaba contaminado y lo doy de baja.**

`armar.cjs` guarda lo que el motor espera de cada jugador en
`historial/fecha_N.json`, y **lo reescribe en cada corrida**. Si volvés a correr
el motor mientras la fecha objetivo sigue siendo la N pero la N ya se jugó, la
predicción guardada se reemplaza por una calculada con los resultados de esa
misma fecha ya dentro de los datos.

| fecha | se jugó | predicción guardada el | |
|---|---|---|---|
| 9 | 11–14/09 | 14/09 22:23 | **CONTAMINADA** (3 días después del arranque) |
| 10 | 18–21/09 | 18/09 16:42 | limpia (1h18 antes del primer partido) |
| 11 | 02–05/10 | 08/10 20:02 | **CONTAMINADA** (3 días después) |
| 12 | 09–12/10 | 08/10 20:22 | limpia (18 h antes) |

Y se ve en los números. Mismo motor, mismas cuentas:

| | top 11 por esperado | contra el promedio del campo |
|---|---|---|
| fecha 9 (contaminada) | 8,09 | **+2,29** |
| fecha 11 (contaminada) | 10,64 | **+4,60** |
| **fecha 10 (limpia)** | **5,82** | **−0,22** |

En la única fecha limpia que tenemos, **el top 11 del motor rindió peor que el
promedio de los que jugaron.** La capacidad de ordenar la tabla entera es
parecida en las tres (Spearman 0,18 / 0,20 / 0,29), pero el premio de la punta
del ranking se desarma cuando la predicción no vio el resultado.

**Arreglo, y es el primero de todos:** que `armar.cjs` NO sobreescriba
`historial/fecha_N.json` si el primer partido de la fecha N ya arrancó. Son unas
seis líneas. Sin esto, cualquier cambio que hagamos de acá en adelante va a
parecer una mejora y no vamos a poder saber si lo es.

---

## 1. Qué anda bien: "¿va a jugar?"

Armé un panel de **3.776 observaciones jugador-fecha** (fechas 6 a 11), con cada
variable calculada usando **sólo** fechas anteriores a la que se predice.

El `pJuega` del motor acierta quién llega a los 20 minutos con **AUC 0,86** y
está bien calibrado:

```
pJuega predicho    real
   17%              17%
   40%              47%
   59%              63%
   82%              86%
   91%              93%
```

Y le gana a cualquier variable suelta: la mejor es los minutos acumulados
(AUC 0,757), después los minutos del último partido (0,715), el promedio de
minutos (0,713), la nota de 365 (0,687) y la proporción de arranques (0,683).

**Esta parte no hay que tocarla. Es la buena.**

---

## 2. Qué no se puede: "¿cuántos puntos hace si juega?"

Entre los 2.109 jugador-fecha que sí calificaron, esto es lo que predice el
puntaje (Spearman, fuera de muestra):

```
su propia ficha promedio ....... 0,113
nota de 365 .................... 0,093
xG del equipo por partido ...... 0,090
goles por 90 ................... 0,087
ficha de las últimas 3 ......... 0,087
goles que recibe el rival ..... -0,082
tiros por 90 ................... 0,071
local .......................... 0,059
minutos ........................ 0,039
```

Nada llega a 0,15. El motor saca ~0,20, o sea que **ya extrae más que cualquier
variable sola**: no hay una variable que nos esté faltando.

El techo es bajo por una razón física, no por el modelo:

| puesto | puntaje real: media | desvío | ficha previa: desvío |
|---|---|---|---|
| ARQ | 5,33 | 3,11 | 1,27 |
| DEF | 5,81 | 3,00 | 1,24 |
| VOL | 5,90 | 3,28 | 1,57 |
| DEL | 6,02 | 3,50 | 1,90 |

Un puntaje de fecha se mueve ±3 y lo que sabemos del jugador se mueve ±1,3. La
diferencia es un gol que entra o no entra. **No es ruido del modelo: es ruido
del fútbol.**

### Y la ficha está bien encogida

Revisé el encogimiento, que era mi principal sospechoso de "comprimir todo":
`ficha = (cruda × CT + media × K) / (CT + K)` con K de 11,2 (DEF), 10,7 (VOL),
13,6 (DEL) y 60 (ARQ). **No son números inventados**: están medidos en
`calibracion.json` con 4.000 remuestreos e intervalos de confianza. Para ARQ el
K llegó al tope porque la persistencia medida de la ficha de un arquero es 0,3
por partido con intervalo [0 ; 6,4] — o sea, **no se puede distinguir un arquero
de otro por su ficha**, y el modelo lo dice bien. Eso coincide exactamente con
lo que medí yo: en ARQ ninguna variable predice nada (n=166, todo entre −0,15 y
+0,08).

Lo único pendiente ahí: la calibración es del **11/09**, con el torneo anterior
más las fechas 1 a 8. Ya hay 12 fechas. `CALIBRAR.bat` y listo.

---

## 3. El agujero grande, y tiene número

El once se arma ordenando por **EPsiJuega** —lo que el tipo suma si entra a la
cancha— **sin mirar en absoluto la chance de que entre**. Es la regla que me
pediste explícito: *"que no me penalice jugadores porque crea que no va a jugar,
eso lo veo yo"*.

Lo que no estaba medido es cuánto cuesta. El Gran DT da **un suplente por
puesto**: si fallan dos delanteros, uno de los dos vale cero y no hay vuelta.

```
                    E[titulares sin cubrir]       pJuega medio del once
fecha  9                   0,88                          0,71
fecha 10                   0,37                          0,83
fecha 11                   0,82                          0,70
fecha 12  (el publicado)   1,14                          0,65
```

El once que tenés publicado para la fecha 12 tiene **1,14 titulares que se
esperan en cero y sin reemplazo**. Un titular descubierto cuesta su puntaje
entero, ~6 puntos.

### La alternativa medida

Ordenar por **EPsiJuega × √pJuega** en vez de EPsiJuega solo:

| | fecha 9 | fecha 10 (limpia) | fecha 11 |
|---|---|---|---|
| como está hoy | 72 | **51** | 96 |
| con × √pJuega | **79** | **71** | **107** |
| EP puro (× pJuega) | 81 | 55 | 86 |
| al azar entre los de pJuega ≥ 0,6 | 57 | 59 | 46 |
| el mejor once posible, visto después | 200 | 204 | 215 |

Gana en las tres, y en la limpia por 20 puntos. El mecanismo también cierra sin
mirar resultados: el E[titulares sin cubrir] baja de 0,88 / 0,37 / 0,82 / 1,14 a
**0,23 / 0,17 / 0,15 / 0,15**, y el EPsiJuega sumado del once sólo baja de
82,5 / 79,5 / 78,8 / 81,0 a 80,2 / 78,8 / 76,3 / 75,7. **Resignás 2 a 5 puntos
de techo y te ahorras ~5 de agujero esperado.**

**Importante: la raíz no excluye a nadie.** √0,38 = 0,62, así que un apostado con
techo 7,4 sigue valiendo 4,6 y le gana a un titular seguro de techo 4,5. Lo
único que evita es apilar cuatro apuestas en el mismo puesto, que es justo lo
que pasó en la 12 (Almada 0,38 + Correa 0,63 + Cóccaro 0,89 + Verón 0,85 en el
mismo puesto).

Y la tabla de Jugadores sigue ordenada por EPsiJuega: **no se te esconde ni se
te descuenta nadie**, cambia sólo el once que el motor propone solo.

**Esto necesita tu OK porque es exactamente la regla que me diste, al revés.**

---

## 4. Lo que sí se puede agregar, por puesto

Los mejores predictores de cada puesto, medidos sobre el panel:

```
DEF (n=731):  xG del EQUIPO 0,142  >  su propia ficha 0,112  >  xG concedido -0,112
VOL (n=661):  nota de 365   0,154  ·  tiros/90 0,140  ·  nota ult.3 0,140
DEL (n=551):  ficha ult.3   0,156  >  ficha de todo el torneo 0,118  ·  min. último 0,127
ARQ (n=166):  nada. Todo entre -0,15 y +0,08.
```

Tres cosas concretas de acá:

1. **La nota de 365 no la usa el motor para nada.** Está en
   `data365.json` (`log[].nota`, 5.096 notas, una por jugador-partido) y sólo se
   usa para calibrar el K de la ficha. Para VOL es el mejor predictor que
   encontré (0,154) **y VOL es justo el puesto donde el motor anda peor**
   (r = 0,02 en la fecha 9, 0,07 en la 10). Vale la pena entrarla al cálculo de
   la ficha de los volantes.
2. **Para DEF, el contexto del equipo le gana al jugador.** El xG del equipo
   (0,142) predice mejor que la ficha propia del defensor (0,112). Tiene
   sentido: el defensor hace puntos por valla invicta y por pelota parada, dos
   cosas del equipo, no suyas.
3. **Para DEL, la forma reciente le gana al promedio del torneo** (0,156 contra
   0,118). Hoy la ficha usa todo el torneo por igual.

Nada de esto es grande por separado —estamos hablando de 0,15 de Spearman— pero
son las tres únicas direcciones donde encontré señal que el motor no esté ya
usando.

---

## 5. Qué NO buscar más

- **No falta una variable para el "cuánto".** Probé 21 candidatas, incluidas
  todas las combinaciones de contexto de equipo y rival que tenemos. Ninguna
  pasa 0,15 y el motor ya saca más que todas.
- **La ficha no está mal encogida.** Está medida con remuestreo e intervalos.
- **El presupuesto no es el problema.** El once deja sin gastar entre
  $13,5M y $23,9M en las cuatro fechas. Nunca ató nada.

---

## 6. Pendientes de las sesiones anteriores

- **xG por equipo mal atribuido**: usa el club actual del jugador y no el club
  con el que jugó ese partido. Error contra ESPN: 2,93 tiros por equipo; con el
  arreglo, 0,27. Vélez aparece con 8,8 de xG cuando generó 11,3.
- **Aviso del Versus**: cuando el once está editado y heredado de otra fecha, el
  cartel sale en *Mejor 11* pero no en el *Versus*, donde dice "El motor" sin
  aclarar que es tu once viejo.
- `data365_historico.json` tiene 36 días (`SYNC_365_HISTORICO.bat`, ~15 min).
- `CALIBRAR.bat` con las 12 fechas.

---

## Orden que propongo

1. **Congelar la predicción** (6 líneas en `armar.cjs`). Sin esto no se puede
   medir nada de lo demás.
2. **El xG por equipo** (4 líneas). Es un error, no una decisión.
3. **El aviso del Versus** (cosmético pero te costó una consulta entera).
4. **EPsiJuega × √pJuega en el once** — con tu OK, que es tu regla al revés.
5. `CALIBRAR.bat` y después medir de nuevo la fecha 13 con la predicción ya
   congelada.
6. La nota de 365 para VOL: lo dejo último porque es el único que requiere
   medir antes y después con el backtest, y para eso necesito el punto 1 andando.
