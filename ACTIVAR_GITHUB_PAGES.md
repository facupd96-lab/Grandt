# Que la app se vea desde internet

Hoy el repositorio tiene los archivos, pero GitHub no los esta publicando como
pagina. Son dos cosas, una la hago yo y la otra la tenes que hacer vos porque
es una opcion de tu cuenta.

---

## 1. Lo que ya hice

`datos.js` ahora SI se sube. Era lo unico que faltaba: la pagina necesita dos
archivos, `index.html` y `datos.js`, y ese segundo estaba excluido. Por eso
GitHub mostraba el cartel rojo.

Son 2,3 MB que se actualizan cada fecha. El repositorio va a crecer un poco
cada vez, y esta bien: GitHub aguanta muchisimo mas que eso.

---

## 2. Lo que tenes que hacer vos, una sola vez

Son cinco clics en la web:

1. Entra a **https://github.com/facupd96-lab/Grandt**
2. Arriba de todo, hace clic en **Settings** (el engranaje, a la derecha)
3. En la columna de la izquierda, bien abajo, **Pages**
4. Donde dice **Source**, elegi **Deploy from a branch**
5. Debajo aparecen dos listas: en la primera elegi **main**, en la segunda
   **/ (root)**. Clic en **Save**

Esperá dos o tres minutos y entra a:

**https://facupd96-lab.github.io/Grandt/**

La primera vez tarda. Si te dice 404, esperá un minuto y recargá.

---

## Despues de cada fecha

Para que la version de internet se actualice:

1. `RECALCULAR.bat`  (rehace datos.js)
2. `SUBIR_A_GITHUB.bat`  (lo sube)

Y en dos minutos la pagina de internet muestra lo nuevo. Si no la ves
actualizada, recarga con Ctrl+F5: el navegador guarda la version vieja.

---

## Ojo con una cosa

El repositorio es **publico**: cualquiera con el link puede ver la pagina y el
codigo. Para este proyecto no hay problema —no hay nada privado adentro, y la
clave de la API quedo afuera— pero conviene que lo sepas.

Si algun dia lo queres privado, GitHub Pages deja de funcionar en la cuenta
gratis. Ahi la alternativa es Vercel, que ya tenes medio configurado con el
`vercel.json`.
