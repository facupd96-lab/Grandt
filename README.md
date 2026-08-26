# Gran DT — análisis de la próxima fecha

App para decidir el equipo de cada fecha del Gran DT de Clarín (Liga Profesional
argentina). No hace pronósticos a largo plazo: mira **solo la fecha que viene**.

## Ver la app

Abrir `index.html`. Con eso alcanza — no necesita servidor ni instalar nada.

La página se arma con cuatro archivos:

| Archivo | Qué es |
|---|---|
| `index.html` | la página |
| `styles.css` | los estilos |
| `teamsRegistry.js` | los nombres canónicos de los 30 equipos |
| `datos.js` | **todos los datos ya calculados** |
| `appV3.js` | lo que dibuja la página |

`datos.js` es el que hay que actualizar cada fecha. Los demás casi no cambian.

## Actualizar los datos

Doble clic en **`ACTUALIZAR_TODO.bat`**. Tarda unos minutos y hace todo:

1. `SYNC_PLANETA` — la planilla oficial: puntos, cotizaciones, goles, tarjetas.
2. `SYNC_365` — tiros, xG y minutos por jugador; tarjetas con fecha; goles con minuto.
3. `SYNC_CUOTAS` — cuotas 1X2 y Over/Under, promediadas entre casas y sin margen.
4. `SYNC_COPAS` — calendario de liga y copas, fixture y rotación por copa.
5. Recalcula el motor y reescribe `datos.js`.

La primera vez baja `node.exe` (portable, no instala nada) porque el motor
corre en Node. Después de eso ya no vuelve a bajarlo.

## De dónde sale cada dato

- **Planeta Gran DT** (planilla pública) → puntajes por fecha, cotizaciones,
  goles, tarjetas, vallas invictas. Es la fuente de la ficha de Clarín, que se
  reconstruye porque la planilla no la publica: `ficha = (puntos − bonos) / partidos`.
- **365Scores** → tiros, tiros al arco, xG y minutos jugador por jugador;
  tarjetas y goles con minuto; alineaciones probables; calendario de copas.
- **the-odds-api** → cuotas de las casas de apuestas.

Regla del proyecto: **ningún dato inventado**. Lo que es cálculo propio va
etiquetado como cálculo propio. Si un dato falta, dice "s/d" y no se rellena.

## Los archivos del motor

| Archivo | Qué hace |
|---|---|
| `armar.cjs` | junta las cuatro fuentes, corre el motor y escribe `datos.js` |
| `motorV3.cjs` | el motor: puntos esperados de cada jugador según el reglamento |
| `SYNC_*.ps1` / `.bat` | cada bajada de datos |
| `ACTUALIZAR_TODO.*` | corre todo lo anterior en orden |
| `VER_STATS.*` | diagnóstico: muestra qué campos trae 365Scores |
| `data*.json` | los datos crudos de cada fuente |

Van como `.cjs` y no `.js` porque `package.json` tiene `"type": "module"` y el
motor usa `require()`.
