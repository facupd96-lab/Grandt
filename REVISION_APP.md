# Revisión completa de la app (index.html + app.js)

**20/08/2026** · Repasé pantalla por pantalla y crucé cada número con su fuente.

---

## Lo primero: la app está bien pensada. El problema no es el diseño.

La estructura que armaste es la correcta y no la tiraría: fixture con cuotas al costado, tabla de posiciones con filtro local/visitante, rankings por posición con buscador, modal de auditoría por jugador, mejor once con esquema y capitán, líderes por métrica, optimizador de presupuesto. Eso es exactamente lo que necesita un grandetero y no le sobra nada.

**Lo que está roto es lo que hay adentro de las cajas, no las cajas.**

---

## 1. La lupita — qué te está mostrando en realidad

Esta es la pantalla que más te importa y la que más te está mintiendo. Tres cosas:

### La columna "Peso %" no existe en ningún cálculo

Cuando abrís un defensor ves `1. P(Valla Invicta) Combinada — 35%`, `2. P(Gol) — 15%`, y así hasta 100%. **Esos porcentajes no se usan en ninguna parte.** Están escritos a mano en el HTML del modal (`app.js:2869`). El ranking se ordena con otra fórmula que no los mira.

### La fórmula que te muestra abajo no es la que ordena la lista

Al pie del modal te muestra:

```
EP = (ficha × 0.75) + (P_VI × 2.0) + (P_gol × bonus) − (amarillas × 0.25)
```

Pero el ranking se ordena con `rawEP`, que además de eso suma un término de figura, uno de forma, uno de racha reciente y un `+0.12 por enfrentar a un rival de copa` sacado de una lista de equipos escrita a mano. **Son dos fórmulas distintas.** Por eso mirás el desglose, hacés la cuenta, y no te da.

Y esa fórmula del modal tiene un error propio: `− amarillas × 0.25` usa el **total** de amarillas, no la tasa. Un jugador con 2 amarillas en 5 fechas resta lo mismo que si las hubiera sacado en 2 fechas.

### Los percentiles y puestos sí están bien calculados

`P97 (Top 3% - #5/154)` se calcula de verdad, contra el pool real de la posición. **Eso lo conservaría tal cual** — es la mejor parte del modal y es justo lo que pedís: ver dónde está parado el jugador contra todos los demás.

**Veredicto:** la vitrina es excelente, la mercadería está vencida. Hay que reemplazar las 9 filas por los términos reales del reglamento, en puntos, sumando exactamente el EP que ordena la lista.

---

## 2. Las cuotas de gol del fixture están inventadas

En el fixture ves, al lado de cada partido:

```
1: 1.63   X: 3.36   2: 5.64   ⚽ Gol Vélez: 1.22   ⚽ Gol River: 1.76
```

**Las tres primeras son reales.** Las dos de gol, no. Esta es la cadena completa de cómo nace ese `1.22`:

1. Se toma la cuota Over/Under 2.5 y se calcula `goles = línea + (P(over) − P(under)) × 1.5` ← fórmula inventada, sin respaldo
2. Ese total se reparte entre los dos equipos según quién es favorito en el 1X2
3. `P(valla invicta) = e^(−goles del rival)` ← Poisson, razonable
4. `P(gol) = 1 − P(valla invicta del rival)`
5. `cuota de gol = 1 / P(gol)`

Cuatro derivaciones encima de una fórmula sin fundamento, y sin quitarle el margen de la casa en ningún paso. Después se muestra con el mismo formato y el mismo color que las cuotas reales, así que parece un dato de mercado. **No lo es.**

Peor: pedí los mercados `btts` y `team_totals` a la API con tu clave y devuelve error 422. **La cuota de "gol de tal equipo" no está disponible en el plan gratis.** No hay forma de traerla real hoy.

**Qué haría:** calcular esa probabilidad bien —resolviendo los goles esperados de cada lado contra el 1X2 y el Over/Under sin margen, que es lo que ya hace el motor nuevo— y mostrarla **como probabilidad, no como cuota**, con una marca de "estimada". Que un número calculado por nosotros no se disfrace de precio de mercado.

---

## 3. Qué es real y qué no, dato por dato

| Lo que ves en pantalla | ¿Real? |
|---|---|
| Cuotas 1, X, 2 del fixture | ✅ Reales, promedio de casas |
| ⚽ Gol de cada equipo | 🔴 Derivada de una fórmula inventada |
| Tabla de posiciones | ✅ Real y coherente (la verifiqué contra los resultados: 30 de 30 sin errores) |
| Filtro Local / Visitante de la tabla | ✅ Real |
| Goles, figuras, vallas, tarjetas del jugador | ✅ Reales, de la planilla |
| "Ficha Base Clarín Limpia" | 🔴 Recortada a la fuerza entre 4,5 y 7,0 con coeficientes inventados. Por eso te daba 6,20 en tres jugadores distintos |
| xG y tiros individuales | 🔴 En cero. Se leen en 20 lugares del código y no se escriben en ninguno |
| Percentiles y puesto en la liga | ✅ Bien calculados |
| Vista "Líderes" (xG/partido, tiros/partido) | 🔴 Todo en cero, mismo motivo |
| Puntaje esperado del once | ⚠️ Suma scores 0-100, no puntos. El número no significa nada en puntos de Gran DT |
| Optimizador de presupuesto | ⚠️ La restricción está bien ($60M, máx 3 por club) pero optimiza sobre el score roto, y es búsqueda voraz aunque el comentario diga "Knapsack" |
| Sliders de pesos | 🔴 No tocan el resultado |
| Backtesting y Auto-Aprendizaje | 🔴 Calibran los pesos que no se usan |

---

## 4. El botón de cambiar jugador no hace nada

En el Mejor 11, cada jugador tiene un ícono `⇅` con el tooltip "Cambiar / Sustituir". **No tiene ningún handler.** Busqué en todo el proyecto: no hay una sola línea que lo escuche. El único click que funciona en esa tarjeta abre la auditoría.

Esto es justo lo que me pedís y es de lo más fácil de arreglar. Lo que armaría:

- Clic en el `⇅` → se abre la lista de esa posición ordenada por puntos esperados, con lo que gastás y lo que te queda de presupuesto
- Elegís uno y **el total del equipo se recalcula solo**, mostrando cuántos puntos ganás o perdés respecto del recomendado
- La restricción de 3 por club y el presupuesto se validan en vivo: si un jugador no entra, aparece en gris con el motivo
- Lo mismo con el selector de esquema: cambiás a 1-3-5-2 y se rearma respetando los que fijaste a mano

Eso convierte la app de "acá tenés mi recomendación" en "jugá vos, yo te digo cuánto te cuesta cada decisión". Que es lo que un grandetero de diez años necesita.

---

## 5. Una cosa que la app ya sabía y yo te venía preguntando

En `tournamentOptimizer.js` está escrito el reglamento del juego que yo te pedía:

- **Presupuesto: $60.000.000**
- **Máximo 3 jugadores por club**
- **4 cambios por semana**

Confirmame que sigue siendo así y lo meto en el motor. Con eso el armado del once deja de ser "los 11 mejores" y pasa a ser "los 11 mejores que entran en la plata", que es un problema distinto y bastante más interesante — y donde un defensor barato de un equipo sólido vale oro.

---

## 6. Lo que propongo hacer

**Conservar tal cual:** el layout entero, el fixture con cuotas, la tabla con filtro local/visitante, la estructura del modal con percentiles y puesto, la vista de líderes, el mejor 11 con esquema y capitán, el optimizador de presupuesto.

**Reemplazar por dentro:**

1. **La lupita.** Que las 9 filas sean los términos reales del reglamento y que **sumen exactamente** el puntaje esperado que ordena la lista. Sin columna de pesos falsos. Agregar el contexto que ahora sí tenemos: tiros y xG reales del jugador, minutos y titularidad, si su equipo viene de jugar copa, y si el rival es una trampa de valla invicta.
2. **Las cuotas de gol.** Calcularlas bien y mostrarlas como probabilidad estimada, no como cuota de casa.
3. **El puntaje del once.** Que muestre puntos de Gran DT, no una suma de índices.
4. **El botón de cambiar jugador.** Que funcione, con presupuesto y cupo por club en vivo.
5. **Enchufar las cuatro fuentes nuevas** (`dataPlaneta`, `data365`, `dataCuotas`, `dataCopas`) para que la vista de Líderes deje de mostrar ceros.

**Sacar:** los sliders de pesos y el módulo de auto-aprendizaje **en su forma actual**. No porque la idea esté mal —calibrar sobre resultados reales es exactamente lo que hay que hacer— sino porque hoy calibran algo desconectado y te dan una sensación de control que no existe. Cuando el motor nuevo esté midiendo, el aprendizaje se reconstruye sobre lo que sí mueve la aguja: los pesos de las tres fuentes de goles esperados, el suavizado de la ficha, y las constantes de rotación por copa. Eso son cinco números calibrables con cinco fechas, no veinte con cinco fechas.

---

## Una decisión que te toca a vos

¿Reformamos `index.html` por dentro, o armamos una pantalla nueva sobre el motor que ya funciona?

Reformar conserva todo lo que ya conocés y te ahorra reaprender la interfaz, pero `app.js` tiene 4.000 líneas con el motor viejo entreverado en las funciones de dibujo, así que hay que ir con cuidado. Empezar de cero es más limpio y más rápido, pero perdés la app que ya tenés armada.

Mi recomendación: **reformar por dentro, pantalla por pantalla, empezando por la lupita.** Es la que más usás, la que más te miente, y la que mejor te va a mostrar que el motor nuevo piensa distinto.
