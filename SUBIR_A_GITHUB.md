# Subir a GitHub, y qué ve cada uno

## Cómo se sube

Doble clic en **`SUBIR_A_GITHUB.bat`**. Eso es todo.

El script hace tres cosas que antes no hacía, y son las que importan:

1. **Rehace `index.html` antes de subir.** `index.html` no es un archivo que se
   edite: lo arma `construir.cjs` metiendo adentro `styles.css`,
   `teamsRegistry.js` y `appV3.js`. Si no se rehace, sube el index de la última
   vez que alguien lo armó a mano. **Esto era lo que fallaba.**
2. **Avisa si hay dos ramas** en GitHub. Con dos ramas es fácil subir a una y
   que la página se sirva de la otra: se ve todo viejo y no se entiende por qué.
3. **Comprueba que subió.** Cuando termina, se baja el `index.html` publicado y
   compara la huella con el de tu carpeta. Si no coinciden, lo dice. No hay más
   «LISTO» de fe.

### El sello del build

Cada `index.html` lleva adentro una huella de los cuatro archivos con los que se
armó, tipo `805ce17c0d87 · 2026-09-08 20:07`. Se ve en el menú **⋯** de arriba a
la derecha, abajo de todo.

Para saber si lo publicado está al día: abrís la página, mirás ese número y lo
comparás con el de tu carpeta (está en `BUILD.txt`). Si son iguales, es la misma
versión. Sin discutir.

### La caché

GitHub sirve el `index.html` guardado **hasta 10 minutos**. Si subís y entrás
enseguida, es normal ver el sello viejo. Esperá un rato y recargá con
**Ctrl + F5**. Los otros archivos (`datos.js`, `dataVivo.js`, …) no tienen ese
problema: la página los pide con un número distinto cada vez.

---

## Qué ve cada uno: la respuesta corta

| Pregunta | Respuesta |
|---|---|
| ¿Si subo mi equipo, lo ven los demás? | **Sí**, si bajás `dataLiga.js` y lo subís. |
| ¿Si un amigo carga su equipo, lo vemos los demás? | **No.** Queda en su navegador. |
| ¿Si alguien tilda un jugador con la ✕, se bloquea para todos? | **No.** Es sólo suyo. |
| ¿Los puntajes de la fecha se actualizan solos? | **No.** Se actualizan cuando **vos** los subís. |

---

## Cómo funciona, en detalle

### La regla que explica todo

**La página es de sólo lectura para el que entra.** GitHub sirve archivos; no
recibe nada. Nadie más que vos puede escribir en el repositorio.

Todo lo que alguien toca en la app —cargar un equipo, tildar un jugador,
cambiar el once— se guarda en el **localStorage de su propio navegador**. Eso no
viaja a ningún lado. Es de él, en esa computadora, en ese navegador.

Lo que ven todos es lo que está **en los archivos que subiste vos**.

### Los archivos que hacen que se vea algo

| archivo | qué hace que se vea | quién lo genera |
|---|---|---|
| `index.html` | la app entera | `construir.cjs` |
| `datos.js` | jugadores, puntajes esperados, fixture, cuotas | `ACTUALIZAR_TODO.bat` |
| `dataVivo.js` | los puntos **reales** de la fecha que se está jugando | `SYNC_VIVO.bat` |
| `dataHist.js` | lo que el motor esperaba en fechas anteriores (Revisión) | `RECALCULAR.bat` |
| `dataLiga.js` | **los equipos del torneo de amigos** | el botón *Compartir* |

Si `dataLiga.js` no está, el que entra ve el Torneo de amigos **vacío**, por más
que vos tengas los siete cargados. Es el archivo que más se olvida.

### Cómo publicar los equipos del torneo

1. En la app: **Torneo de amigos → ⋯ → Compartir el torneo**.
2. Poné tu nombre donde dice cómo se va a publicar tu equipo (por defecto dice
   «El mío», que a tus amigos no les dice nada).
3. **Bajar `dataLiga.js`** y dejá el archivo en esta carpeta.
4. `SUBIR_A_GITHUB.bat`.

Hay que repetirlo cada vez que cambie algo: un equipo nuevo, un cambio de once,
la tabla del campeonato.

### Si un amigo carga su equipo

Queda **sólo en su navegador**. Para que lo vean los demás tiene que pasártelo:
en *Compartir el torneo* hay un cuadro de texto que se copia y se pega. Vos lo
pegás en **importar**, bajás `dataLiga.js` de nuevo y lo subís.

Es incómodo, y es la única forma con una página de GitHub: para que cada uno
suba lo suyo haría falta un servidor que reciba datos, y esto no lo es.

### Lo que nunca viaja

- **La ✕** («este no juega»). Es tuya, de tu navegador y de esa fecha. Si vos
  tildás a alguien, tus amigos lo siguen viendo. Y al revés.
- **Las fotos de Revisión.** Son de cada navegador.
- **El equipo propio de cada uno.** Cuando publicás, tu equipo viaja como uno
  más de la lista y con el nombre que le pusiste; a tu amigo le aparece como el
  equipo *tuyo*, no como el suyo. El de él sigue siendo el de él.

### Nadie te puede romper lo publicado

Lo que cada uno edite queda en su navegador. Cuando subís una versión nueva, al
que ya la tenía le aparece un cartel de **«hay una versión más nueva»** con un
botón para traerla: **no se le pisa sola** lo que haya tocado. Y su propio
equipo no se toca ni aunque acepte.
