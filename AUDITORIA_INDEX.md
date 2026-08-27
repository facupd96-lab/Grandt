# Auditoría de la página — 27/08/2026

Abrí la app en un navegador de verdad, apreté cada botón y revisé qué hace cada
uno por dentro. Esto es lo que encontré, lo que ya saqué y lo que falta.

---

## 1. La mitad del archivo era código muerto

`index.html` tenía **722 líneas**. Ahora tiene **368**. Nada de lo que saqué hacía
absolutamente nada: eran restos de la versión de Gemini que nunca se conectaron.

| Lo que saqué | Qué era | Por qué |
|---|---|---|
| `backtest-modal` | "Laboratorio de Backtesting" con tabla de fechas y cards de resultados | El botón que lo abría estaba desconectado desde hace días. El backtest de verdad es `BACKTEST.bat` |
| `learning-modal` | "IA / Aprendizaje automático", con historial y un check de "auto-aprendizaje" | Ningún dato lo llenaba nunca. Cero referencias en el código |
| `tournament-modal` | Tres pestañas: presupuesto, transferencias, gangas | Cero referencias. El botón "Equipos" abre otro modal distinto |
| Tarjeta "Equipos Guardados" | Panel en la barra lateral | Decía "No hay equipos guardados aún" para siempre. No hay nada que guarde |
| Botón "💾 Guardar Equipo" | En el pie del Mejor 11 | Sin handler. No guardaba nada |
| Slider "Mín. partidos calificados" + "Restaurar valores" | En Qué mide el modelo | Movías el slider y no pasaba nada |

Eso es lo que te hacía ruido: **la app prometía cosas que no existían**. Un
laboratorio de backtesting, una IA que aprende, un gestor de transferencias.
Ninguna andaba.

---

## 2. Tres cosas que se veían mal y ya están arregladas

**"El promedio de la liga es s/d tiros de local y s/d de visitante"** en el modal
Equipos. El código leía `liga.locTiros` y `liga.visTiros`, que nunca existieron —
el motor guarda xG, no tiros. Ahora promedia los equipos: **14,9 de local y 11,9
de visitante**, más el xG que ya estaba.

**Las etiquetas COPA rompían la fila** en las tablas de ranking. Era una sola
línea de texto con todo pegado: "Talleres · Local vs Central Córdoba (SdE) · COPA
· rival de copa" se partía en dos renglones y las etiquetas quedaban tiradas en el
medio. Ahora el partido va en su renglón sin cortarse y las etiquetas abajo, como
pastillas.

**"P100 (Top 1% · #1/530)"** en Líderes: tres formas de decir lo mismo, una al
lado de la otra. Quedó **#1 de 530**, y el percentil pasó al tooltip.

---

## 3. La cabecera

Tenías razón cuando me preguntaste qué eran todos esos datos. Eran tres chips
diciendo lo mismo —que los datos están bien— ocupando media cabecera:

```
🛡️ Ficha reconstruida: 653/653   📅 Datos hasta la fecha 6   👥 734 jugadores · 520 con tiros medidos
```

Ahora es **uno**: `🛡️ Datos OK · fecha 6`. Los números no se perdieron: están
adentro del modal que abre, con una sección nueva de cobertura arriba de todo.

---

## 4. Qué se salva y por qué

| Pantalla | Veredicto |
|---|---|
| **Fixture** (barra izquierda) | **Se salva.** Es lo primero que mirás. Ya lo rehice: una fila por equipo, nombres que no se cortan, gol / valla / cuota alineados |
| **Rankings ARQ · DEF · VOL · DEL** | **El corazón de la app.** Todo lo demás es apoyo |
| **Mejor 11** | **Se salva**, y ahora tiene dos modos que sirven de verdad |
| **Contexto de la fecha** | **La mejor pantalla que tenés.** Valla invicta ordenada, goles que recibe, nivel contra el promedio, quién juega copa. Está bien hecha y bien explicada |
| **Equipos** | Se salva. Tiros a favor y concedidos con corte local/visitante |
| **Ficha de jugador** (click en un nombre) | Se salva. Desglosa el puntaje esperado término por término del reglamento |
| **Qué mide el modelo** | Se salva, pero es documentación, no herramienta. Va a la cola |
| **Posiciones + Tabla completa** | Se salva. Es contexto, se mira poco |
| **Líderes** | Se salva. Sirve para descubrir jugadores que el ranking por puntaje esperado esconde |

---

## 5. Lo que falta de verdad

Todo lo de arriba es limpieza. Esto es lo importante:

**La app no responde la pregunta que le hacés.** Vos entrás para saber a quién
poner esta fecha. Para armar tu equipo hoy tenés que: abrir ARQ, anotar; abrir
DEF, anotar; abrir VOL; abrir DEL; abrir Contexto de la fecha para ver qué
defensas están sólidas; abrir Equipos; abrir Mejor 11. Siete pantallas para una
sola decisión.

Falta una **pantalla de la fecha**: lo que importa, arriba, sin abrir nada.

- Los **avisos** que hoy están escondidos: quién está suspendido, quién está a una
  amarilla (Vega y Pellegrini ahora mismo), qué equipos rotan por copa. Eso hoy
  hay que ir a buscarlo jugador por jugador.
- Los **partidos de la fecha ordenados por cuánto te importan**: dónde hay valla
  invicta barata, dónde hay goles.
- El **top 3 de cada puesto** con su dato decisivo, sin entrar a la tabla.
- Cuando 365Scores confirme las formaciones: **quién de los recomendados quedó
  afuera del once**. Esa alerta sola vale la pantalla.

**Mi recomendación:** que eso sea lo primero que ves al abrir, y que las tablas
de ranking pasen a ser la segunda pantalla — el lugar donde vas a profundizar,
no donde empezás.

---

## 6. Orden que propongo

1. **La pantalla de la fecha** ← lo único que cambia cómo usás la app
2. Alertas de formación confirmada, cuando 365Scores las publique
3. Ficha de jugador: hoy es un modal denso de tablas; se puede leer mucho mejor
4. Modo mobile — hoy la app es de escritorio y punto
5. Gráficos: nada de gráficos hasta que las pantallas digan lo que tienen que decir

---

## 7. Detalle técnico

- **Cero errores de JavaScript** en consola, en las cuatro pestañas y los cinco
  modales que quedan.
- Las cabeceras de tabla y las celdas coinciden en las cuatro posiciones (8 y 8).
  Esto ya había fallado antes: 8 columnas de encabezado contra 5 celdas emitidas.
- Los cinco modales que quedan (`audit`, `best11`, `weights`, `team-detail`,
  `full-standings`) tienen todos su botón y todos abren.
