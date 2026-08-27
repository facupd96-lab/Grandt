# Cómo se juega realmente el Gran DT — y cómo quedó el motor

**19/08/2026** · Calibrado sobre 776 jugadores del torneo pasado (17 fechas completas) y los 60 partidos jugados del Clausura 2026.

---

## Parte 1 — Lo que dicen tus datos

Todo lo que sigue está medido sobre tus planillas. Nada es supuesto.

### 1. Para el arquero, la valla invicta ES el puntaje

Correlación entre tasa de valla invicta y puntaje promedio del arquero, torneo pasado: **0.708**. Es altísima. Tu regla no es una intuición: es prácticamente la definición del puesto.

Los mejores del torneo pasado, por tasa de valla: Gill (San Lorenzo) 60% → 7.40 de promedio · Cardozo (Belgrano) 56% → 6.67 · Beltrán (River) 50% → 7.56. Los peores: Ledesma (Rosario Central) 23% → 5.92 · Lastra (Estudiantes RC) 18% → 5.00. **Dos puntos y medio de diferencia por fecha, todo explicado por la valla.**

Y la localía, sobre los 60 partidos de este torneo:

| | Valla invicta |
|---|---|
| Local | **43.3%** |
| Visitante | **28.3%** |

En puntos: arquero local promedio `3×0.433 − 0.917 = +0.38`. Visitante: `3×0.283 − 1.133 = −0.28`. **La localía sola vale 0.66 puntos.** Y entre el mejor y el peor emparejamiento de la fecha hay **2.2 puntos de diferencia**.

Conclusión operativa: en el arquero **casi todo el margen está en elegir el partido, no el jugador**. Por eso el motor ahora ordena arqueros por probabilidad de valla invicta pura, y la ficha solo desempata.

### 2. El gol de volante vale mucho más de lo que dice la tabla

Regresión sobre el torneo pasado: cuánto sube la probabilidad de ser figura por cada gol que mete un jugador en un partido.

| Posición | Sube la chance de figura | Valor extra | **Gol efectivo** |
|---|---|---|---|
| Defensor | +21.1 pp | +0.84 pts | **9.84** (11.84 de visitante) |
| **Volante** | **+44.2 pp** | **+1.77 pts** | **7.77** (9.77 de visitante) |
| Delantero | +23.7 pp | +0.95 pts | **4.95** (6.95 de visitante) |

**El volante que mete gol es figura casi la mitad de las veces.** El delantero que mete, solo una de cada cuatro. Tiene toda la lógica: si el delantero mete, compite con todos los que metieron; el volante que mete gol es casi siempre el que manejó el partido.

Eso reescribe la comparación: la tabla dice que el gol de volante vale 6 y el de delantero 4 (diferencia 2), pero en la realidad la diferencia es **2.8 puntos**. El motor ahora usa el valor efectivo.

### 3. El volante es el puesto más de todo o nada

| Puesto | Puntaje medio | Desvío | Techo | Brecha techo−media |
|---|---|---|---|---|
| ARQ | 6.03 | 0.81 | 7.56 | 1.53 |
| DEF | 5.99 | 0.99 | 9.00 | 3.01 |
| **VOL** | **5.56** | **1.20** | **10.69** | **5.13** |
| DEL | 5.92 | 1.21 | 10.17 | 4.25 |

**El volante tiene la mediana más baja de las cuatro posiciones y el techo más alto.** Tu instinto de "hay que ser cuidadosos con los volantes" es exactamente correcto: el volante promedio es el peor negocio del juego, y el volante top es el mejor. No hay término medio. Por eso el motor ahora muestra **piso y techo** por separado en cada volante, no un solo número.

### 4. Reparto de las figuras (247 figuras, 255 partidos — los datos cierran)

| Puesto | % de todas las figuras | Tasa por jugador-partido |
|---|---|---|
| VOL | 36.4% | 4.32% |
| DEL | 31.2% | 5.00% |
| DEF | 16.6% | 1.89% |
| **ARQ** | 15.8% | **7.98%** ← la más alta |

Dato contraintuitivo: **el arquero es, individualmente, el jugador con más chance de ser figura** (hay uno solo por equipo, contra cuatro o cinco defensores). Son 0.32 puntos por fecha. Vos dijiste que en el arquero la figura no importa y lo respeté en el ranking — pero quiero que sepas que no es cero: equivale casi al valor neto promedio de toda la valla invicta del arquero (0.35).

### 5. El gran dilema del defensor, con números

Para el defensor promedio de la liga, por fecha:

| Fuente | Puntos |
|---|---|
| Valla invicta (2 × 35.8%) | **+0.72** |
| Gol (0.0392 × 9.84) | **+0.39** |
| Figura | +0.08 |

**La valla invicta le da al defensor promedio casi el doble de puntos que el gol.** Pero acá está la trampa: la correlación entre tasa de valla invicta y puntaje promedio del defensor es apenas **0.248**, mientras que la correlación entre goles y puntaje es **0.830**.

Cuidado con leer mal ese 0.830: **no significa que el gol sea predecible.** Significa que el gol ya ocurrido está metido dentro del promedio — es una correlación mecánica, mirando para atrás. Solo el **30% de los defensores metió algún gol en 17 fechas**. Perseguir goles de defensor es perseguir la cola de una distribución.

La forma correcta de leer las dos cosas juntas:

- La **valla invicta** mueve menos (0.76 pts entre el mejor y el peor emparejamiento) pero es **predecible**: depende del partido, y el partido lo sabés de antemano.
- El **gol** mueve más (hasta 1.3 pts entre el defensor más y menos amenazante) pero es **mucho menos predecible**.

Por eso el motor arma el puntaje del defensor en dos capas: **el partido pone el piso, el jugador pone el techo.** Es literalmente lo que describiste.

### 6. El esquema importa mucho menos de lo que parece

Sumando los mejores N de cada posición del torneo pasado:

| Esquema | Total |
|---|---|
| 1-4-4-2 | 103.98 |
| 1-3-5-2 | 103.97 |
| 1-3-4-3 | 103.55 |
| … | … |
| 1-5-2-3 | 101.19 |
| 1-4-2-4 | 101.17 |

**Entre el mejor y el peor esquema hay 2.8 puntos sobre 104.** El esquema no es una decisión estratégica: es una consecuencia de elegir bien a los once. El motor evalúa los diez esquemas y te da el mejor, pero no te vuelvas loco con eso — el margen está en los jugadores.

### 7. Cuánto es "bueno"

Puntaje promedio por fecha, torneo pasado, jugadores con 8+ partidos:

| Puesto | p50 | p75 | p90 | p95 | máximo del torneo |
|---|---|---|---|---|---|
| ARQ | 5.92 | 6.67 | 7.41 | 7.41 | 7.56 |
| DEF | 6.00 | 6.50 | 7.38 | 7.85 | 9.00 |
| VOL | 5.25 | 6.29 | 6.86 | 7.27 | 10.69 |
| DEL | 5.75 | 6.92 | 7.33 | 7.93 | 10.17 |

Tu referencia de "arquero con 8 o 9 puntos es muy bueno" queda confirmada: **el mejor arquero de todo el torneo pasado promedió 7.56**. Un 8 en una fecha te pone por encima del mejor promedio de la liga.

---

## Parte 2 — Cómo puntúa ahora cada posición

Dos números por jugador, y hay que entender la diferencia:

- **EP (puntos esperados)** — la verdad matemática. Cuántos puntos espero que haga. Es la suma de los términos del reglamento, cada uno auditable.
- **Score DT (0-100)** — el ranking según **tu** criterio de decisión. No es el EP normalizado: en arqueros y defensores el criterio que pediste no es "el que más puntos hace en promedio" sino "el que más seguro me deja la valla".

### 🧤 Arqueros — valla invicta y nada más

Ranking = **percentil puro de P(valla invicta)**. La ficha aporta 6 puntos de desempate y nada más. Nada de figura, nada de penales atajados. Justificación: correlación 0.708, y un solo gol te convierte un 8 en un 4.

```
EP(ARQ) = ficha + 3·P(VI) − (goles esperados en contra)
```

### 🛡️ Defensores — el partido pone el piso, el jugador pone el techo

```
Score = piso_del_equipo  +  aporte_individual  −  castigo_por_tarjetas

piso_del_equipo   = 32 + 44 × percentil de P(VI) del equipo   →  32 a 76
                    (IDÉNTICO para todos los defensores del equipo)
aporte_individual = hasta 32 pts:  55% amenaza de gol
                                   30% ficha
                                   15% figura
castigo_tarjetas  = hasta 6 pts
```

Tres propiedades que te importaban, verificadas contra tus datos:

1. **Coherencia por equipo.** En la prueba, los seis defensores de Atlético Tucumán (mejor emparejamiento de la fecha) quedaron entre **86.9 y 100**. Ninguno "mal puntuado". Imposible que pase.
2. **El defensor goleador de un equipo flojo no se cuela arriba.** El aporte individual tiene tope absoluto de 32 puntos: no escala con el hueco que queda hasta 100. Un defensor con amenaza máxima en un equipo con valla improbable llega a ~64: aparece en el ranking, pero no en el top-5. Que es lo correcto.
3. **Todo continuo, sin cubetas.** La amenaza entra por percentil de goles esperados individuales, que se construye con xG/90 y tiros/90 sin ningún umbral. 5 tiros siempre vale menos que 6, y 6 menos que 8. No existe ningún "si patea, +5 a todos".

Y la amenaza de gol del defensor ya incorpora las cuatro cosas que pediste: sus tiros y su xG (individual), el poderío ofensivo de su equipo (los goles esperados del equipo) y la fragilidad del rival (que está dentro de esos goles esperados, vía cuotas y xG concedido).

### 🪄 Volantes — piso y techo separados

```
EP(VOL) = ficha + λ_gol·(6 u 8) + 4·P(figura)
```

Con `P(figura) = 1.81% + 44.2% × λ_gol`, la fórmula medida. Se muestra el **piso** (lo que hace si no pasa nada) y el **techo** (si mete). Con la dispersión que tiene el puesto, un volante con piso 5.9 y techo 15.9 es una decisión completamente distinta a uno con piso 6.2 y techo 9.

### ⚽ Delanteros — el gol arrastra la figura

```
EP(DEL) = ficha + λ_gol·(4 o 6) + 4·P(figura)
```

Con `P(figura) = 1.08% + 23.7% × λ_gol`. El gol y la figura no son dos apuestas: son la misma apuesta. Por eso el gol efectivo del delantero es 4.95 y no 4.

### 🎖️ Capitán

Duplica **solo la ficha**. El motor elige al de mayor ficha esperada de los once, no al de mayor EP. Elegir al goleador de capitán es un error clásico: si mete gol no te duplica el gol, te duplica la nota.

---

## Parte 3 — Qué falta para que los números sean confiables

El motor está terminado. Los rankings que produce **todavía no**, por dos cosas concretas:

1. **`AcT` no llega a `data.js`.** El sync lo lee pero no lo persiste en disco. Sin `AcT` no hay ficha limpia y todo el piso del cálculo queda simulado. **Es el único bloqueo real.**
2. **`xg365` y `shots365` están en 0** para 472 de 473 jugadores en el archivo del repo. Sin eso, la amenaza individual del defensor cae al prior por posición — que es exactamente la generalización que odiás. En la prueba, los tiros de todos los defensores dieron 0.

Una nota honesta sobre la separación de emparejamientos: con las cuotas actuales, el P(valla invicta) sale entre **25% y 44%** entre los 30 equipos, cuando la realidad de la liga va de ~20% a ~58%. El modelo está comprimiendo. La razón es que con solo 4-5 fechas jugadas el suavizado bayesiano tira todo hacia el promedio, que es lo correcto: todavía no hay evidencia para separar más. Se va a abrir solo a medida que avancen las fechas.

**Lo que sigue sin modelarse y probablemente sea tu mayor fuente de error: quién juega.** Recomendar al mejor defensor de Vélez no sirve de nada si va al banco. Con los minutos de 365Scores se puede estimar razonablemente.

---

## Parte 4 — Dos cosas que necesito

1. **¿Existen el gol de oro y el penal atajado?** No los mencionaste en el reglamento que me pasaste, pero las columnas `GO` y `PA` están en la planilla de Planeta Gran DT. Los dejé configurados en +5 y +4 porque figuran en la tabla oficial publicada, pero si ya no existen hay que ponerlos en 0 — afectan la reconstrucción de la ficha.
2. **¿Cuántos esquemas hay exactamente?** Vos dijiste "como 15", la app tenía 9, yo cargué 10. Pasame la lista y la clavo.
