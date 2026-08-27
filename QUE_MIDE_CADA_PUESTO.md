# Qué se mide en cada puesto, y cuánto pesa cada cosa

**20/08/2026** · Medido sobre los 331 titulares de la fecha 6.

---

## Antes de los números: por qué no hay una columna de "peso %"

La app vieja te mostraba `P(Valla Invicta) — 35%`, `P(Gol) — 15%` y así hasta 100. **Esos porcentajes no existían**: estaban escritos a mano y no entraban en ningún cálculo.

El motor nuevo no funciona con pesos. **Suma los términos del reglamento, cada uno en puntos.** Si un defensor da 6,20, es porque:

```
ficha 5,10  +  valla invicta 0,88  +  gol 0,61  +  figura 0,06  −  tarjetas 0,45  =  6,20
```

No hay nada que ponderar: los puntos ya vienen ponderados por el reglamento. Un gol de defensor vale 9 porque el reglamento dice 9.

**Pero tu pregunta es buena igual**, y tiene respuesta. Solo que hay que separarla en dos, porque son cosas distintas y confundirlas es lo que rompía el algoritmo viejo:

- **Cuánto APORTA un término** — qué parte del puntaje total representa.
- **Cuánto SEPARA un término** — cuánta diferencia hace entre un jugador y otro.

**No son lo mismo, y la que decide el ranking es la segunda.** La ficha aporta entre el 68% y el 83% de los puntos en las cuatro posiciones, pero como es parecida en todos (casi todos entre 4,8 y 5,8), decide poco. Lo que decide es lo que más varía.

---

## 🧤 Arqueros

```
Puntos esperados = ficha Clarín  +  3 × P(valla invicta)  −  goles esperados en contra
                   + 4 × P(figura)  −  2 × tasa amarilla  −  4 × tasa roja
```

| Término | Aporte medio | % del puntaje | Va de … a … | **% de lo que separa** |
|---|---|---|---|---|
| Goles recibidos | −1,13 | 14,2% | −1,51 a −0,77 | **30,7%** |
| Valla invicta | +1,00 | 12,7% | +0,66 a +1,39 | **30,3%** |
| Ficha Clarín | +5,42 | 68,6% | 5,17 a 5,79 | 25,7% |
| Tarjetas | −0,15 | 1,9% | −0,33 a −0,10 | 9,5% |
| Figura | +0,20 | 2,5% | +0,16 a +0,25 | 3,7% |

**Los goles recibidos y la valla invicta juntos son el 61% de lo que separa a un arquero de otro**, siendo apenas el 27% de los puntos. La ficha es el 69% del puntaje y decide un cuarto.

Por eso el ranking de arqueros **se ordena por probabilidad de valla invicta y nada más**, con la ficha como desempate. Es la traducción exacta de tu regla, y el número la respalda.

**Cómo se mide la valla invicta:** `P(VI) = e^(−goles esperados en contra)`. Y los goles esperados en contra salen de mezclar tres fuentes con pesos explícitos:

| Fuente | Peso | Qué es |
|---|---|---|
| Mercado | 55% | Se resuelven los goles esperados de cada lado para que reproduzcan las cuotas 1X2 y Over/Under, **después de quitarles el margen de la casa** (10,5% promedio) |
| xG del equipo | 30% | xG concedido propio + xG generado del rival, separado local/visitante |
| Goles reales | 15% | Goles recibidos por condición, suavizados hacia la media de liga |

Sin cuotas, se renormaliza a 65% xG / 35% goles reales.

---

## 🛡️ Defensores

```
Puntos esperados = ficha  +  2 × P(valla invicta)  +  goles esperados × (9 local / 11 visitante)
                   + 4 × P(figura)  −  2 × tasa amarilla  −  4 × tasa roja
```

| Término | Aporte medio | % del puntaje | Va de … a … | **% de lo que separa** |
|---|---|---|---|---|
| Ficha Clarín | +5,20 | 76,5% | 4,79 a 5,56 | **30,7%** |
| Gol propio | +0,34 | 5,0% | +0,07 a +0,81 | **29,5%** |
| Tarjetas | −0,52 | 7,6% | −0,76 a −0,28 | **19,1%** |
| Valla invicta | +0,69 | 10,1% | +0,50 a +0,96 | 18,3% |
| Figura | +0,05 | 0,7% | +0,03 a +0,09 | 2,4% |

Dos cosas acá que valen oro:

**El gol es el 5% de los puntos y el 30% de la diferencia.** Es el término más volátil del puesto. Un defensor que llega vale mucho más de lo que sugiere su promedio.

**Las tarjetas separan más que la valla invicta: 19,1% contra 18,3%.** Un defensor que se hace amonestar seguido pierde más de lo que gana con la valla. Eso no lo tenía ningún algoritmo anterior y es plata sobre la mesa.

**Cómo se mide el gol del defensor** — que es lo que más te importaba:

`goles esperados del jugador = su cuota del ataque × goles esperados del equipo`

Su cuota sale de `0,62 × xG/90 + 0,023 × tiros/90 + 0,15 × goles/partido`, y **las cuotas de todos los jugadores del equipo suman 1**. Por eso la suma de los once da exactamente los goles esperados del equipo, y por eso dos defensores del mismo club comparten la valla pero tienen techos de gol distintos.

Todo continuo: 8 tiros siempre vale más que 5, y 5 más que 4. No hay ningún umbral ni cubeta.

Y ese "goles esperados del equipo" ya lleva adentro lo otro que pedías: el poderío ofensivo de su club y la fragilidad del rival, separados local/visitante.

Además cada defensor sale etiquetado: `SÓLIDO` (buena valla), `RIESGO GOLEADOR` (valla floja pero llega mucho), `SÓLIDO + GOLEADOR`, o `COMÚN`.

---

## ⚡ Volantes

```
Puntos esperados = ficha  +  goles esperados × (6 local / 8 visitante)
                   + 4 × P(figura)  −  2 × tasa amarilla  −  4 × tasa roja
```

| Término | Aporte medio | % del puntaje | Va de … a … | **% de lo que separa** |
|---|---|---|---|---|
| Gol propio | +0,46 | 7,2% | +0,10 a +0,97 | **37,7%** |
| Ficha Clarín | +5,38 | 83,1% | 5,06 a 5,79 | 31,6% |
| Tarjetas | −0,49 | 7,5% | −0,79 a −0,26 | 22,9% |
| Figura | +0,14 | 2,2% | +0,06 a +0,24 | 7,8% |

**El gol decide el 38% con el 7% de los puntos: es el término que más manda de las cuatro posiciones.** Por eso el volante es el puesto más de todo o nada, y por eso se muestran piso y techo separados.

Y acá está la corrección más importante que salió de los datos: **el volante que mete gol es figura el 44% de las veces** (el delantero, el 24%). Eso hace que su gol valga **7,77 puntos efectivos y no 6**. La figura del volante no es una apuesta aparte: es la misma apuesta que el gol.

`P(figura del volante) = 1,81% + 44,2% × sus goles esperados`, y después se reescala para que la suma de todo el equipo dé exactamente una figura por partido.

---

## 🎯 Delanteros

```
Puntos esperados = ficha  +  goles esperados × (4 local / 6 visitante)
                   + 4 × P(figura)  −  2 × tasa amarilla  −  4 × tasa roja
```

| Término | Aporte medio | % del puntaje | Va de … a … | **% de lo que separa** |
|---|---|---|---|---|
| Gol propio | +0,63 | 9,8% | +0,16 a +1,21 | **41,0%** |
| Ficha Clarín | +5,35 | 82,8% | 4,90 a 5,81 | 35,5% |
| Tarjetas | −0,35 | 5,4% | −0,62 a −0,18 | 17,2% |
| Figura | +0,13 | 1,9% | +0,05 a +0,21 | 6,3% |

El caso más extremo: **el gol decide el 41%**. El ranking de delanteros es, básicamente, quién tiene más chances de convertir. `P(figura) = 1,08% + 23,7% × goles esperados`, lo que lleva el gol efectivo a **4,95 y no 4**.

---

## Lo que se mide igual en las cuatro posiciones

**Ficha Clarín limpia.** No se estima: se despeja. `ficha = (AcT − bonos conocidos) / CT`. Se le restan al puntaje acumulado todos los bonus que están en la planilla (goles por tipo, visitante, penal, oro, figuras, vallas, tarjetas, penales atajados y errados) y queda la nota periodística pura. Control: **634 de 636 caen dentro de 1 a 10**. Con pocos partidos se tira hacia la media de liga, porque una ficha de un partido es ruido.

**Tarjetas.** Con suavizado: una amarilla en 5 fechas **no** es una tasa del 20%, es ruido. Se mezcla con la media del puesto usando 4 partidos de prior.

**Rotación por copa.** Un equipo que jugó entre semana reparte minutos y ataca menos; el rival que enfrenta suplentes ataca más. Ajusta los goles esperados del partido y la chance de jugar. **Las magnitudes de este ajuste son un supuesto declarado, no una medición** — están en un solo lugar del código para calibrarlas cuando haya fechas.

**Chance de jugar.** Sale de los minutos reales de 365Scores. **No descuenta puntos: es un dato al costado.** Los puntos esperados son los que hace *si juega*. Vos decidís qué hacer con un jugador al 48%.

---

## Lo que NO entra, y por qué

- **Ningún peso configurable a mano.** Los puntos ya vienen ponderados por el reglamento.
- **El precio.** No ordena, no filtra, no penaliza. Correlación con los puntos esperados: 0,08 en defensores.
- **La chance de jugar.** Se muestra, no descuenta.
- **Bonus por "enfrentar rival de copa" o listas de equipos escritas a mano.** Eso tenía el algoritmo viejo y no salía de ningún lado.
- **La figura del arquero.** Correlación con su valla invicta: −0,003. Es ruido que no se puede anticipar.
- **Topes y cubetas.** Nada de "si patea más de 3, +5 a todos".

---

## Una última cosa, sobre el número que más te importa

Un jugador promedio de la fecha da entre **5,4 y 5,8 puntos esperados** según el puesto. El rango entre el percentil 10 y el 90 es de **1,4 puntos en arqueros y defensores, y de 1,8 a 2,0 en volantes y delanteros**.

Eso es lo que el algoritmo puede realmente mover en una fecha: **dos puntos por jugador, veinte en el equipo**. Sobre una base de unos 60. No es magia, es margen — pero es exactamente el margen que separa una fecha de 65 de una de 90.
