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

**Lunes o martes, después de que termine la fecha** — una sola vez:

```
ACTUALIZAR_TODO.bat
```

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
