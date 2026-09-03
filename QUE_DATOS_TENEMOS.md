# Qué datos tenemos, qué falta y qué se puede conseguir — 28/08/2026

---

## 1. Lo que tenemos hoy

### De Planeta Gran DT (la planilla oficial, 1.000 jugadores)
Puntaje fecha por fecha · cotización · partidos calificados · **goles totales, de jugada, de
penal, de visitante, de oro** · **penales errados** · **penales atajados** · vallas invictas ·
figuras · amarillas · rojas · goles recibidos · goles en contra.

Esto es lo que Gran DT usa para puntuar, así que es la fuente de la verdad para los puntos.
De acá sale la **ficha Clarín reconstruida**: `(puntos acumulados − bonos conocidos) ÷ partidos`.

### De 365Scores (720 jugadores cruzados, 98%)
**Por jugador y por partido**: minutos · goles · asistencias · tiros · tiros al arco · xG ·
faltas cometidas · faltas recibidas · penales cometidos · penales atajados · salvadas ·
goles recibidos · xG evitado · grandes chances.

**Por partido**: eventos con minuto (gol, amarilla, roja, cambio) y el subtipo del gol
(jugada / penal). **Formaciones**, con estado "Sin confirmar" o "Confirmado".

**Calendario de copas** de los 30 equipos: de qué torneo viene, cuántos días de descanso,
qué juega después.

### De the-odds-api (25 casas)
1X2 y Over/Under de cada partido, con el margen descontado.

---

## 2. Lo que arreglé hoy con esto

**El xG del penal.** 365Scores le suma ~0,79 de xG a cada penal que un jugador **patea**.
El motor descontaba sólo por los **convertidos**, así que a los que erraron uno les quedaba
0,79 de xG fantasma. En la fecha 7 eran 8 jugadores:

| jugador | xG antes | xG real | puesto antes | ahora |
|---|---|---|---|---|
| Barbona (Def. y Just.) | 1,97 | **1,18** | #4 | #10 |
| Lencioni (Gimnasia M) | 2,24 | **1,45** | #8 | #18 |
| Matías Fernández (Ind. Riv.) | 2,13 | **1,34** | #4 | #15 |
| Marcelo Torres (Gimnasia LP) | 0,79 | **0** | — | — |

Marcelo Torres es el caso extremo: **todo su xG del torneo era un penal errado**. Exactamente
el jugador que patea uno de casualidad y no es el pateador del equipo.

**El pateador de penales.** Ahora aparece una pastilla `⚫ PENALES 2` en la tabla y una fila en
la ficha con convertidos y errados. En el torneo van **23 penales pateados: 15 convertidos y
8 errados** (65%, bastante bajo). Los que patearon más de uno: Sepúlveda (Banfield) y Módica
(Gimnasia M), 2 cada uno.

Un penal convertido paga **3 puntos fijos** (+2 de visitante) y es la única fuente de gol que
no depende del juego, así que saber quién patea vale.

---

## 3. Lo que se podría conseguir y todavía no usamos

Ordenado por lo que realmente movería la aguja:

### a) Formaciones confirmadas — YA ESTÁ, falta que las publiquen
El código ya las lee. Cuando 365Scores marca "Confirmado" (una hora antes del partido), la
chance de jugar salta a 97% y los minutos salen del once real. Hoy el estimador tiene **28
minutos de error cuadrático medio**; con la formación confirmada, cero.

**Es la mejora más grande que le queda al modelo y no cuesta nada: correr `SYNC_365.bat` una
hora antes de cerrar el equipo.**

### b) Lesionados y suspendidos
Hoy sólo detectamos **suspensión por tarjetas** (5 amarillas o roja en la fecha anterior),
que salen de los eventos. **No tenemos lesionados.** 365Scores tiene una sección de bajas en
la ficha del partido que no estamos leyendo. Vale la pena mirarlo: un lesionado hoy aparece
como titular con 85 minutos esperados hasta que se publica la formación.

### c) Datos que 365Scores ya nos da y no usamos
- **Asistencias** — en Gran DT no pagan, así que sirven sólo como señal de "está enchufado"
- **Grandes chances** — las tenemos guardadas y no entran en ningún cálculo. Podrían ser mejor
  predictor de gol que el xG crudo
- **Faltas recibidas** — medí que transfieren de un torneo al otro (r = 0,54, de lo más alto que
  encontré). No pagan puntos, pero son las que generan los penales
- **xG evitado del arquero** — medido, no transfiere (r = 0,09). No sirve

### d) Lo que NO existe o no vale la pena
- **Cuotas de "marca gol" por equipo**: the-odds-api no las da en el plan que usamos. Las
  calculamos con Poisson y está verificado: predice 63,1% y la realidad da 62,6%
- **Alineación probable de fuentes argentinas** (Promiedos, TyC): habría que scrapear HTML y se
  rompe cada vez que cambian la página. Y 365Scores ya nos da lo confirmado
- **Datos de entrenamiento o partes médicos**: no hay fuente pública confiable

---

## 4. Lo que se puede mejorar sin buscar nada nuevo

**El backtest.** Es lo único que puede decir si el modelo sirve. Ya están guardadas las fotos
de las fechas 6 y 7 en `historial/`. Cuando termine la fecha 7, `BACKTEST.bat` compara lo
recomendado contra lo que pasó, y contra cinco criterios de referencia. **Sin eso, todo lo
demás es teoría.**

**Lo que ya está medido y conviene no volver a probar a ciegas:**

| idea | resultado |
|---|---|
| Pesar más las últimas fechas para la ficha | **empeora** (r 0,038 plano vs 0,033 con recencia) |
| Defensores elegidos por llegada al gol | vale +0,10 pts por fecha. Casi nada |
| Apilar compañeros del mismo equipo | **empeora la cola** (P≥140 baja de 0,053% a 0,005%) |
| Subirle el peso al gol convertido sobre el xG | no se pudo demostrar que convenga |
| Goles concedidos según la posición del goleador | 0% de señal, p = 1,000 |
| Corte local/visitante por equipo | no se traslada de un torneo a otro (r = 0,26) |

**La verdad incómoda:** el 72% del puntaje esperado es la ficha Clarín, y la ficha de la
próxima fecha correlaciona **0,038** con las anteriores. Donde el modelo sí tiene señal es en
los **minutos** (r = 0,51) y en la **amenaza de gol**.

Por eso la prioridad no es buscar más datos individuales: es **saber quién juega y cuánto**.
Y eso se resuelve el viernes a la noche, corriendo el sync una hora antes.
