# Mentidero

Juego diario de palabras poco conocidas del español. Cada día se publican tres
palabras raras, pero reales, con tres definiciones cada una: una verdadera y dos
bulos. El nombre viene de los mentideros del Madrid del Siglo de Oro, donde la
gente se reunía a propagar rumores.

Es una web estática (HTML, CSS y JavaScript, sin frameworks ni servidor), lista
para publicar en GitHub Pages.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estética de papel antiguo, modo oscuro automático, animaciones |
| `app.js` | Lógica del juego: reto diario, racha, estadísticas, compartir, cuenta atrás |
| `words.json` | Contenido: 10 días × 3 palabras |
| `reiniciar/index.html` | Página para borrar el progreso guardado |
| `icons/` | Logo de la app: SVG (favicon y portada), PNG de 32 px y `apple-touch-icon` de 180 px |
| `tests/logic.test.js` | Pruebas de la lógica (Node, sin dependencias) |

## Probar en local

`app.js` carga `words.json` con `fetch`, así que hace falta un servidor (abrir
`index.html` con doble clic no funciona):

```sh
python3 -m http.server 8000
# o bien: npx serve .
```

Y abre <http://localhost:8000>.

### Simular otra fecha

Añade `?fecha=AAAA-MM-DD` a la URL para jugar como si fuera ese día, por
ejemplo `http://localhost:8000/?fecha=2026-10-05`. Sirve para probar la racha
(juega días consecutivos) o el mensaje de fin del prototipo (cualquier fecha a
partir del día 11). La cabecera indica «(simulado)».

### Reiniciar el juego

Visita `/reiniciar/` (por ejemplo `http://localhost:8000/reiniciar/`) y pulsa
«Borrar mi progreso». Borra partidas, racha y estadísticas de ese navegador
(la clave `mentidero:v1` del `localStorage`) y te devuelve al juego, que
empieza de nuevo con la pantalla de bienvenida.

Antes de publicar la versión definitiva, puedes desactivarlo poniendo
`ALLOW_DATE_OVERRIDE: false` en `app.js`.

### Pruebas automáticas

```sh
node --test tests/logic.test.js
```

Comprueban el contenido de `words.json`, la selección diaria, que el orden de
las opciones sea estable, la racha, que no se pueda rejugar, el texto de
compartir y la cuenta atrás.

## Configuración

En la parte superior de `app.js`:

```js
var CONFIG = {
  START_DATE: '2026-10-01',   // día 1 del reto
  ...
};
```

El día del reto se calcula con la fecha local del jugador: el `START_DATE` es el
pliego n.º 1, el día siguiente el n.º 2, etc. Antes de esa fecha se muestra un
aviso de «próximamente» y, cuando se agotan los días de `words.json`, un mensaje
de fin del prototipo.

## Contenido (`words.json`)

Cada entrada tiene:

```json
{
  "palabra": "zascandil",
  "categoria": "sustantivo masculino, coloquial",
  "verdadera": "Definición fiel al DLE, con palabras propias",
  "falsas": ["Bulo verosímil 1", "Bulo verosímil 2"],
  "curiosidad": "Origen, uso o anécdota",
  "verificar": true,
  "nota_verificar": "Qué dato conviene revisar"
}
```

Las entradas con `"verificar": true` tienen algún dato (casi siempre de la
curiosidad: etimologías, anécdotas, citas) que conviene contrastar con el
[DLE](https://dle.rae.es) antes de publicar. `nota_verificar` explica qué.

Para añadir días, agrega objetos `{ "palabras": [ … tres entradas … ] }` al
final de `dias`. El orden de las opciones se baraja con una semilla basada en la
fecha de inicio, el día y la palabra, así que es igual para todos los jugadores.
Si cambias `START_DATE`, cambiará también ese orden.

## Publicar en GitHub Pages

1. Sube los archivos a la rama `main` del repositorio.
2. En GitHub: **Settings › Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**, rama `main` y
   carpeta `/ (root)`. Guarda.
4. En uno o dos minutos estará en `https://<usuario>.github.io/Mentidero/`.

No requiere ningún paso de compilación. Las fuentes se cargan desde Google Fonts.

## Datos del jugador

Todo se guarda en el `localStorage` del navegador (clave `mentidero:v1`):
partidas por día, días jugados, racha actual y máxima, aciertos y distribución
de resultados. No se envía nada a ningún servidor.
