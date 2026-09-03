# Subir a GitHub

Todo lo que sigue se pega en PowerShell, parado en la carpeta `Grandt`.
Si no sabés abrir PowerShell ahí: entrá a la carpeta, clic derecho en un lugar
vacío → "Abrir en Terminal".

---

## Los 3 comandos

```powershell
git rm -r --cached .
git add -A
git status
```

El primero no borra nada de tu disco: solo le dice a git "olvidate de lo que
tenías anotado". El segundo vuelve a anotar, ahora respetando el `.gitignore`.
El tercero te muestra la lista para que la mires antes de confirmar.

**Fijate que en esa lista NO aparezcan:** `node.exe`, `data365.json`,
`datos.js`, `salida.json`, `SYNC_CUOTAS.ps1`, ni ningún `.png`.

Si está todo bien:

```powershell
git commit -m "Motor v29: minutos reales de titular, confianza por remates, valla por minutos en cancha"
git push
```

En el `push` te va a pedir usuario y token de GitHub.

---

## Los 57 archivos que suben

**El motor (lo que hace las cuentas)**
```
armar.cjs
motorV3.cjs
riesgo.cjs
construir.cjs
teamsRegistry.js
```

**La app**
```
appV3.js
styles.css
index.fuente.html
index.html
server.cjs
```

**Los auditores**
```
auditar.cjs
auditar_numeros.cjs
auditar_motor.cjs
auditar_pantallas.mjs
backtest.cjs
```

**Los sync (bajan los datos)**
```
SYNC_365.ps1            SYNC_365.bat
SYNC_365_HISTORICO.ps1  SYNC_365_HISTORICO.bat
SYNC_PLANETA.ps1        SYNC_PLANETA.bat
SYNC_COPAS.ps1          SYNC_COPAS.bat
SYNC_GRANDT.ps1         SYNC_GRANDT.bat
                        SYNC_CUOTAS.bat
EXPLORAR_PLANILLA.ps1   EXPLORAR_PLANILLA.bat
VER_STATS.ps1           VER_STATS.bat
```
`SYNC_CUOTAS.ps1` NO está: adentro lleva la clave de la API.

**Los lanzadores**
```
ACTUALIZAR_TODO.ps1     ACTUALIZAR_TODO.bat
RECALCULAR.ps1          RECALCULAR.bat
                        AUDITAR.bat
                        BACKTEST.bat
                        INICIAR_SERVIDOR.bat
                        CREAR_ENLACE_CASA.bat
```

**Datos que cargás a mano (chicos y necesarios)**
```
suspendidos.json
pases.json
planilla.json
```

**Configuración**
```
package.json
package-lock.json
vercel.json
.gitignore
```

**Documentación**
```
README.md
COMO_ACTUALIZO.md
SUBIR_A_GITHUB.md
MODELO_v3.md
QUE_MIDE_CADA_PUESTO.md
QUE_DATOS_TENEMOS.md
FUENTES_DE_DATOS.md
ESTADO_DE_LOS_DATOS.md
AUDITORIA_GOLES.md
AUDITORIA_GRANDT.md
AUDITORIA_INDEX.md
REVISION_APP.md
```

Más la carpeta `historial/` con las fotos de cada fecha para el backtest.

---

## Lo que NO sube, y por qué

| qué | por qué |
|---|---|
| `node.exe` | 92 MB. GitHub rechaza archivos de más de 100 MB |
| `data365.json`, `dataPlaneta.json`, `dataCuotas.json`, `dataCopas.json`, `dataFixture.json`, `dataGranDT.json`, `data365_historico.json` | 23 MB que se rebajan solos con los sync |
| `salida.json`, `datos.js` | los genera `armar.cjs` en segundos |
| `SYNC_CUOTAS.ps1` | lleva la clave de the-odds-api adentro |
| los `.png` | 40 capturas de pantalla de las pruebas |
| `app.js`, `app2.js`, `sync.js`, `armar.js`, `motorV3.js`, `algorithmEngine.js`, `backtester.js`, `learningEngine.js`, `tournamentOptimizer.js`, `dataSanitizer.js`, `previousTournament.js`, `pagina.js`, `data.js` | código viejo de antes del motor v3. No corre nada de eso |
| `armar_1.cjs`, `motorV3_1.cjs`, `auditar_motor_1.cjs`, `QUE_SUBO_A_GITHUB_1.md` | copias que dejó OneDrive por un conflicto |
| `node_modules/`, `planilla_tabs/`, `Claude outputs/` | carpetas de trabajo |

---

## Podés borrar estos, no sirven para nada

```
clave_cuotas.txt
data365.json.fusionado
armar_1.cjs
motorV3_1.cjs
auditar_motor_1.cjs
QUE_SUBO_A_GITHUB_1.md
```

Los `_1` son basura de OneDrive. El `.fusionado` fue el archivo con el que
reparé data365 y ya está aplicado.
