# Verificación de datos contra fuentes externas — 8/10/2026

Hasta ahora todos los controles del proyecto eran internos: el pipeline
chequeándose a sí mismo. Esto es lo primero que compara contra afuera.

Fuentes usadas:

| # | Fuente | Qué aporta | ¿Independiente? |
|---|--------|-----------|-----------------|
| 1 | Planeta Gran DT (`dataPlaneta.json`) | goles, tarjetas, fichas, penales, vallas | copia la planilla del juego |
| 2 | Ayudante de campo Gran DT (`dataGranDT.json`) | tarjetómetro oficial, estados | el juego mismo |
| 3 | 365Scores (`data365.json`) | minutos, tiros, xG, eventos gol por gol | sí |
| 4 | ESPN (`dataEspn.json`) | goles, tiros, corners, posesión, tarjetas por equipo | sí |
| 5 | futbolargentino.com | tabla de posiciones y goleadores | sí, 100% externa |

---

## 1. Equipos

### Tabla de posiciones — 210 de 210 valores correctos

Los 30 equipos, PJ · G · E · P · GF · GC · Pts calculados desde ESPN contra la
tabla publicada de futbolargentino.com: **idénticos, equipo por equipo, sin una
sola diferencia.** Incluye el detalle fino: Sarmiento y River con 10 PJ (el
Sarmiento–River va el 14/10) y los otros 28 con 11.

Primeros y últimos, para que se vea:

```
Instituto        11  8 1 2  17  8  25      Banfield      11  2 4 5  12 17  10
Vélez            11  5 6 0  17 11  21      Platense      11  2 4 5  11 17  10
Argentinos       11  6 3 2  15 10  21      Central Cba   11  2 3 6   8 14   9
Defensa          11  6 3 2  16 11  21      Aldosivi      11  2 2 7  12 17   8
Boca             11  5 5 1  17 11  20      Talleres      11  2 2 7  11 18   8
...                                        Estudiantes RC 11 1 3 7   6 15   6
```

### Goles por equipo — 30 de 30

ESPN suma 370 goles en el torneo. El feed de eventos de 365Scores suma 370.
**Equipo por equipo coinciden los 30, exacto.** Las dos fuentes no se hablan
entre sí.

### Tiros por equipo — desvío medio 0,2%

ESPN contra el bloque de equipos de 365Scores: 24 de 30 equipos con el número
idéntico, el resto con 1 tiro de diferencia sobre ~150. Tiros al arco, lo mismo.
Partido por partido (los 86 que pude cruzar por fecha + rivales): **diferencia
media de 0,02 tiros por equipo-partido, cero casos con más de 5 de diferencia.**

### Tarjetas por equipo

| | ESPN | Planeta | 365Scores |
|---|---|---|---|
| amarillas | 710 | 717 | 735 |
| rojas | **32** | **32** | 36 |

ESPN y Planeta coinciden exacto en rojas y quedan a 1% en amarillas.
365Scores se va para arriba en las dos (cuenta otras competencias).

---

## 2. Jugadores

### Goles — 99,5%, y el 0,5% que falta no es un error

Planeta contra 365Scores: coinciden **774 de 778** jugadores cruzados.
Los 4 que no: Augusto Fernández (Aldosivi), Ezequiel Godoy (Atl. Tucumán),
Dariel Sánchez Ganly (Riestra) y Gastón Hernández (San Lorenzo) — los cuatro
tienen **0 fechas jugadas** en la planilla; son falsos positivos de mi propio
cruce de nombres, no datos mal cargados.

La cuenta cierra sola:

```
Planeta: 359 goles de jugadores + 11 en contra = 370
365 eventos: 370        ESPN: 370
```

### Goles en contra — 11 de 11, mismo jugador, misma fecha, mismo beneficiado

| jugador | club | fecha | goles a favor de |
|---|---|---|---|
| Nicolás Zalazar | Aldosivi | 4 | Rosario Central |
| Renzo Malanca | Banfield | 8 | Aldosivi |
| Facundo Miño | Riestra | 7 | Vélez |
| Gonzalo Maffini | Estudiantes RC | 8 | Sarmiento |
| Tomás Bottari | Ind. Rivadavia | 5 | Belgrano |
| Marcos Ledesma | Instituto | 9 | Estudiantes RC |
| Nicolás Otamendi | River | 3 | Rosario Central |
| Jeremías Ledesma | Rosario Central | 7 | Gimnasia LP |
| Ezequiel Unsain | Talleres | 10 | Instituto |
| Tomás Fagioli | Unión | 1 | Platense |
| Thiago Silvero | Vélez | 6 | River |

Las dos fuentes, por separado, dan la misma lista.

### Penales — 29 y 29

Planeta `GP` = 29. Eventos de penal de 365Scores = 29.

### Goleadores contra la fuente 100% externa — 70 de 79

De los 9 que no cruzaron, revisé cada uno gol por gol:

- **4 son errores del sitio externo.** R. Hernandes (Belgrano): el sitio le pone
  3, nuestras dos fuentes le ponen 2 y los 12 goles de Belgrano cierran sin el
  tercero. T. Molina (Argentinos) 2 vs 1 nuestro: los 15 de Argentinos cierran
  con 1. L. Suárez (Instituto) 2 vs 1: los 17 de Instituto cierran con 1.
  "M. Isla" (Sarmiento, 2 goles) **no existe**: los 17 de Sarmiento cierran sin él.
- **3 son transferidos.** Bruno Sepúlveda (4 goles en Banfield, hoy en Platense),
  Tiziano Perrotta (2 en Banfield, hoy en Defensa), Ronaldo Martínez
  (7 goles, 1 en Talleres y 6 en Vélez; la planilla le cuenta los 7 en Vélez,
  que es como lo cuenta el juego). Esto explica el único desfasaje grande de la
  tabla de goles por club: Banfield 12 goles de equipo contra 6 de sus jugadores
  en la planilla = Sepúlveda 4 + Perrotta 2.
- **2 son límites de mi matcher**, no de los datos (los dos Palacios de
  Estudiantes, que juntos suman los 2 que da el sitio).

### Amarillas: tres fuentes y un ganador claro

Sobre los 387 jugadores que tienen las tres:

```
Planeta == Ayudante de campo    385 / 387   (99,5%)
Planeta == 365Scores            362 / 387   (93,5%)
Ayudante de campo == 365Scores  364 / 387   (94,1%)
```

365Scores es el que se desvía, en los dos sentidos. **El motor ya usa el orden
correcto** (`armar.cjs`: Ayudante de campo → planilla → 365Scores), así que el
riesgo de suspensión que muestra la app está bien.

### Cobertura de datos individuales — 164 de 164 partidos completos

Control nuevo: si 365Scores tiene el partido completo, los dos equipos juntos
tienen que sumar ~1980 minutos y 22 titulares.

```
fecha  partidos  minutos (prom)
  1       15        1980            11      14        1976
  ...                               (el 15º es Sarmiento-River, 14/10)
partidos con datos individuales: 164   ·   incompletos: 0
```

Todos con 22 titulares, todos con tiros y nota en el 100% de los jugadores.
Y solo **3 jugadores de 778** tienen menos partidos en 365 que fechas
calificadas en la planilla (Rodríguez Pagano, Giovanni González, Pasquini).

---

## 3. Un bug encontrado y medido

**El xG y los tiros por equipo se le atribuyen al club actual del jugador, no al
club con el que jugó ese partido.** `armar.cjs` hace
`anota(l.gid, j.equipo, l.xg, l.local)` usando `j.equipo` — la etiqueta de club
de 365Scores, que para un transferido queda vieja.

Medido contra ESPN, sumando los tiros de los jugadores por equipo en el torneo:

```
error absoluto medio:   método actual 2,93 tiros/equipo   ·   arreglado 0,27
```

Y en el xG del equipo, que es lo que el motor usa como contexto:

| equipo | tiros ESPN | tiros actual | arreglado | xG actual | xG arreglado |
|---|---|---|---|---|---|
| Vélez | 124 | 115 | **124** | 8,8 | **11,3** |
| Talleres | 166 | 180 | **166** | 17,3 | **14,6** |
| San Lorenzo | 131 | 117 | **131** | 8,5 | 8,2 |
| Newell's | 101 | 95 | **101** | 8,5 | **9,6** |
| Instituto | 163 | 168 | **163** | 17,7 | 16,8 |
| Racing | 155 | 159 | **155** | 14,0 | 13,5 |
| Estudiantes LP | 175 | 181 | **175** | 16,5 | 16,5 |
| River | 152 | 148 | **152** | 13,3 | 13,6 |
| Banfield | 140 | 148 | **141** | 13,0 | 13,1 |

Vélez aparece con un 28% menos de xG del que generó y Talleres con un 16% más.

**El arreglo son 4 líneas** y no necesita bajar nada nuevo: los dos lados reales
de cada partido salen del propio campo `vs` de los logs (los 164 partidos dan
exactamente 2 lados), así que el equipo de un jugador en ese partido es el lado
que *no* es su rival. No se toca `j.equipo` para nada.

---

## 4. Lo que NO se puede verificar (y hay que decirlo)

- **xG: fuente única.** ESPN no publica xG, ni futbolargentino. Lo único que
  pude verificar es que es internamente consistente (0 de 788 jugadores con el
  agregado distinto de la suma de su log) y que los tiros que lo acompañan
  coinciden con ESPN al 0,2%. Si 365Scores tiene un sesgo en su modelo de xG,
  no tenemos con qué detectarlo.
- **Ficha de Clarín (1–10): fuente única.** Planeta copia al Gran DT. El control
  interno da 723 de 726 dentro del rango.
- **Asistencias, grandes chances, xG evitado: fuente única** (365Scores).

## 5. Otras dos cosas que vi de paso

- `dataFixture.json` solo trae de la fecha 4 a la 16 (365Scores sirve una
  ventana, no el torneo entero). Las fechas 1 a 3 no están. Hoy no molesta
  porque la tabla sale de ESPN y la fecha objetivo sale del Ayudante de campo,
  pero es la razón de fondo por la que la lógica de "primera fecha sin partidos
  jugados" se rompió dos veces.
- `data365_historico.json` (torneo anterior, para la ley del ex y la ventana
  anual) tiene 36 días. `SYNC_365_HISTORICO.bat`, ~15 minutos.

---

## Veredicto

Los datos de equipos están **verificados contra una fuente totalmente externa y
coinciden al 100%**. Los datos individuales de goles, goles en contra, penales y
tarjetas están **verificados cruzando tres o cuatro fuentes y coinciden entre el
99,5% y el 100%**, y cada diferencia que quedó tiene explicación concreta
(cuatro errores del sitio externo, tres transferidos, dos límites de mi cruce de
nombres). La cobertura de datos individuales es completa: 164 de 164 partidos.

Lo que no tiene segunda fuente es el xG y la ficha. Ahí no estamos verificando
nada, estamos confiando — y conviene decirlo así en la página cuando salga.
