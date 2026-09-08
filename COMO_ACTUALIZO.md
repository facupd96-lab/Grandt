# Qué correr y cuándo

Los `.bat` se ejecutan con doble clic. Ninguno pisa nada del otro.

---

## Los cuatro archivos, en criollo

| archivo | qué trae | cada cuánto |
|---|---|---|
| `SYNC_GRANDT.bat` | **Posible titular · En duda · Lesionado · Juega Copa · Expulsado.** Es el "Ayudante de campo" del Gran DT oficial | cambia todos los días |
| `SYNC_365.bat` | Tiros, xG, minutos, quién arrancó, la nota de cada partido. **Y las formaciones confirmadas** | los datos, después de cada fecha; las formaciones, ~1 hora antes de cada partido |
| `SYNC_PLANETA.bat` | La ficha de Clarín, los puntos y la cotización | después de que se juegue la fecha |
| `SYNC_CUOTAS.bat` | Las cuotas de la próxima fecha (de ahí salen todos los goles esperados) | cuando salen, y de nuevo cerca del cierre |

Después de cualquiera de ellos: **`RECALCULAR.bat`**. Rehace las cuentas en
segundos sin volver a bajar nada, y corre los tres auditores.

`ACTUALIZAR_TODO.bat` hace los cuatro sync seguidos y después recalcula. Tarda
unos 40 minutos. Sirve una vez por semana, no para un retoque.

---

## La rutina de la semana

**Lunes o martes, cuando terminó la fecha** — en ESTE orden, que importa:

```
1)  SYNC_VIVO.bat        baja los puntajes de los últimos partidos (2 segundos)
2)  abrí index.html      con Ctrl+F5, y andá a "Revisión"
3)  ACTUALIZAR_TODO.bat  recién ahora: pasa el motor a la fecha siguiente
```

### Por qué ese orden y no otro

`ACTUALIZAR_TODO` mueve el motor a la fecha que viene, y en esa cuenta **se
pierde todo lo de la fecha que terminó**: lo que el motor esperaba de cada
jugador esa semana no queda guardado en ningún lado.

El paso 2 lo arregla. Cuando abrís el index con los 15 partidos publicados, la
app saca sola la **foto de la fecha** —lo que sacó cada uno, lo que se esperaba
de cada uno, cómo salió el torneo— y la guarda. Después podés actualizar
tranquilo: la pestaña **Revisión** sigue mostrando la fecha 8 aunque el motor ya
esté en la 9.

Si te salteás el paso 2, esa fecha queda sin foto y **no se puede recuperar**.
La app te lo avisa en Revisión cuando pasa, pero es un aviso, no un arreglo.

**Cualquier día que quieras mirar cómo viene la próxima:**

```
SYNC_GRANDT.bat      (los estados cambian todos los días)
RECALCULAR.bat
```

**El día del partido, una hora antes de que cierre el juego** — esto es lo que
más cambia el resultado:

```
SYNC_GRANDT.bat      lesionados y suspendidos de último momento
SYNC_365.bat         las formaciones confirmadas
RECALCULAR.bat
```

Cuando 365Scores publica el once (más o menos una hora antes de cada partido),
el modelo deja de estimar: al que está confirmado le pone 97% de chance de
jugar, y al que quedó afuera lo manda al banco. Es la diferencia más grande que
vas a ver en todo el proceso, y solo aparece si corrés `SYNC_365` cerca del
partido.

---

## La pestaña Revisión

Es la única pantalla que no lee `datos.js`: lee las fotos guardadas. Muestra,
para cada fecha terminada:

- **Los tres onces**: el del motor, el tuyo y el que ganó el torneo, con lo que
  sacaron y lo que se esperaba de cada uno.
- **El once del motor jugador por jugador**: esperado contra real. La diferencia
  es el error del modelo en ese jugador.
- **Tu once contra el del motor**: los que compartían no mueven nada; abajo, los
  que pusiste vos y él no, los que él tenía y no pusiste, y cuánto te costó o te
  sumó cada decisión.
- **El torneo en esa fecha**, y en qué puesto habrían terminado el motor y el
  tuyo si hubieran jugado.
- **Qué tan bien le pegó el motor** sobre los ~400 jugadores que puntuaron: el
  sesgo medio, el error medio por jugador, y los que reventaron o defraudaron el
  pronóstico.

Las fotos viven en el navegador, igual que los equipos del torneo. Ocupan unos
50 KB por fecha.

---

## Cómo saber si algo quedó viejo

`RECALCULAR.bat` te lo dice solo, en la auditoría de datos:

- *"el ayudante de campo tiene 18 horas"* → corré `SYNC_GRANDT.bat`
- *"la planilla de Planeta está al día (fecha 7)"* → todo bien
- *"formaciones: ninguna confirmada todavía"* → normal hasta 1 hora antes

Y arriba de todo, la huella del motor:

```
MOTOR v29 · 03/09/2026 — motorV3.cjs  62380 bytes · 3/9, 06:33 p. m.
```

Si esos números vuelven para atrás solos, avisame: es OneDrive revirtiendo
archivos, y ya nos pasó una vez.

---

## Compartir el torneo de amigos

Los equipos que cargás viven **en tu navegador**, no en un archivo. Un amigo que
abre la app no ve ninguno, por más que le pases todos los archivos.

Para que los vea, en **Torneo de amigos → compartir**:

1. Poné tu nombre donde dice cómo se va a publicar tu equipo (por defecto dice
   «El mío», que a tus amigos no les dice nada).
2. **Bajar dataLiga.js** y dejá el archivo en esta carpeta.
3. `SUBIR_A_GITHUB.bat`

A partir de ahí, cualquiera que entre a
**https://facupd96-lab.github.io/Grandt/** ve todos los equipos y los puntajes,
sin importar nada ni tocar un botón.

Cuando cambies algo (un equipo nuevo, un cambio de once), volvés a bajar
`dataLiga.js`, lo pisás y subís de nuevo. A los que ya la tenían les aparece un
cartel de «hay una versión más nueva» con un botón para traerla — **no se les
pisa sola** lo que hayan tocado.

Dos cosas que conviene saber:

- **Nadie te puede romper la versión publicada.** Lo que cada uno edite queda en
  su navegador. El archivo que subís vos es la referencia.
- **Cada uno conserva su propio equipo.** «El mío» nunca viaja como el equipo de
  otro: el tuyo se publica con tu nombre, y el de cada amigo sigue siendo el suyo.

### Los puntajes en vivo

Se actualizan cuando **vos** los subís, no solos. El domingo:

```
SYNC_VIVO.bat        (baja los puntajes, 2 segundos)
SUBIR_A_GITHUB.bat   (los publica)
```

Y tus amigos recargan con Ctrl+F5 y ven la fecha al día.
