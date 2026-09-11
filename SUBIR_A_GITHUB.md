# Subir a GitHub

Pasos para correr en PowerShell, parados en la carpeta `Grandt`.

\---

## La clave de las cuotas: ya está resuelta, no hagas nada

`SYNC\\\_CUOTAS.ps1` tiene la clave de the-odds-api escrita adentro. Lo dejé así
porque es lo más cómodo, y en su lugar puse **ese archivo en `.gitignore`**: no
se sube a GitHub y la clave se queda en tu máquina.

Podés borrar el `clave\\\_cuotas.txt` vacío que creaste, no se usa.

### Lo único que conviene chequear una vez

```powershell
git log --oneline -S "8a6d8b4c" -- SYNC\\\_CUOTAS.ps1
```

* **No devuelve nada** → nunca se subió. Listo.
* **Devuelve algún commit** → quedó en el historial. No hace falta reescribir
nada: entrá a the-odds-api.com, generá una clave nueva, pegala en la línea del
`$clave` y la vieja queda muerta. Un minuto.

\---

## 1\. Mirá qué hay antes de tocar nada

```powershell
git status
```

Fijate que NO aparezcan: `node.exe`, `node\\\_modules/`, los `data\\\*.json`,
`salida.json`, `datos.js`, ni `clave\\\_cuotas.txt`. Si alguno aparece, el
`.gitignore` no se aplicó (o ya estaba trackeado de antes — ver el punto 4).

Cuántos archivos van a entrar:

```powershell
git add -A --dry-run | Measure-Object -Line
```

\---

## 2\. Si `node.exe` ya estaba trackeado de antes

Pesa 92 MB y GitHub rechaza archivos de más de 100 MB. Si `git status` lo
muestra como trackeado:

```powershell
git rm --cached node.exe
git rm --cached -r node\\\_modules
```

Eso lo saca del repo pero **no borra el archivo de tu disco**.

\---

## 3\. El commit

```powershell
git add -A
git commit -m "Motor v29: minutos reales de titular, confianza por remates, tarjetas recalibradas

- Minutos: se usa el flag de titular real de 365Scores en vez de inferir por
  'jugo 60 o mas'. Regla hibrida medida sobre 5615 predicciones (7.86 de error
  contra 8.02 del criterio anterior). Se descartan los arranques cortados
  antes de los 25 minutos: son lesion o roja, no plan del tecnico.
- Amenaza de gol: la confianza se mide en REMATES y no en minutos. Un xG alto
  armado con un solo tiro rinde despues 0.074 goles/90, por debajo del
  promedio de la liga; con 7 tiros o mas rinde 0.209. Asimetrica: el que pinta
  arriba del prior lo prueba con remates, el que pinta abajo con minutos.
- Tarjetas: pseudo-conteo de 4 a 10. Con 4, el historial metia mas ruido que
  senal (0.2015 de error contra 0.1934 de ignorar al jugador).
- Once arriesgado: prueba los 10 esquemas y no 7. Faltaba 1-4-5-1, que es el
  mejor para la cola. P(fecha de 140) pasa de 0.007% a 0.026%.
- Pases a mano (pases.json): mueve de club al que se transfirio y las fuentes
  todavia no reflejan. Cambia rival y condicion.
- App: ningun jugador queda sin etiqueta de estado (eran 444 de 742), columna
  'Del gol', puesto en PUNTOS dentro de Oportunidades, etiqueta TRANSFERIDO
  fuera.
- Tercer auditor (auditar\\\_motor.cjs) y RECALCULAR.bat, que rehace las cuentas
  sin volver a bajar datos.
- La clave de la API de cuotas sale del script y va a clave\\\_cuotas.txt."
```

\---

## 4\. Subir

```powershell
git push
```

Si es la primera vez desde esta máquina te va a pedir usuario y token de
GitHub. **El token lo ponés vos, yo no lo veo ni lo necesito.**

\---

## 5\. Comprobar que no se coló nada

```powershell
git ls-files | Select-String "node.exe|clave\\\_cuotas|salida.json|datos.js"
```

Tiene que devolver **vacío**. Si devuelve algo, avisame antes de seguir.

