# Guía técnica de IndieCreate

Esta guía describe cómo se conectan la interfaz, los scripts y la API, y cómo
ampliar el sitio conservando sus contratos actuales. La aplicación es una
página web sin framework: el navegador sirve `index.html` o `admin.html`, y
`server.py` entrega los archivos estáticos y atiende la API. Los datos
persistentes se guardan en Supabase.

## Arquitectura y responsabilidades

```text
index.html / admin.html
        │  IDs, formularios y contenedores que usa JavaScript
        ▼
js/index.js / js/admin.js
        │  fetch() a rutas relativas /api/...
        ▼
server.py
        │  cliente de Supabase
        ├── tabla publicaciones
        ├── tabla settings (registro id="global")
        └── bucket Storage "Media"
```

Las rutas de API empiezan por `/api/`, por lo que el navegador debe abrir el
sitio desde el servidor y no mediante `file://`. Las rutas relativas permiten
que el frontend y la API usen el mismo host.

| Archivo o directorio | Responsabilidad |
| --- | --- |
| `index.html` | Estructura y contenido inicial de la portada, formulario y contenedores dinámicos. |
| `admin.html` | Estructura del inicio de sesión y controles del panel. |
| `js/index.js` | Configuración visible, publicaciones, paginación, votos, multimedia, eliminación y sincronización periódica. |
| `js/admin.js` | Inicio de sesión del panel, controles de ajustes y guardado de configuración. |
| `server.py` | Servidor HTTP, validación de solicitudes, API y persistencia/archivos en Supabase. |
| `css/index.css`, `css/admin.css` | Reglas CSS propias; actualmente la portada define una animación y el panel no necesita reglas adicionales. |
| `js/tailwind-config-index.js`, `js/tailwind-config-admin.js` | Extensiones del tema Tailwind usadas por las clases de cada HTML. |
| `img/` | Iconos e imágenes de la interfaz. `img/game/` contiene los iconos de juegos. |
| `settings.json` | Archivo JSON presente en el repositorio; el servidor actual guarda la configuración activa en Supabase, no en este archivo. |
| `publicaciones/` | Datos/archivos locales existentes. Las rutas actuales de API consultan Supabase; no asumas que editar este directorio cambia los datos en producción. |
| `requirements.txt` | Dependencias Python del servidor, incluido el cliente de Supabase. |

## Flujo de configuración y hero

La configuración global tiene este formato:

```json
{
  "gameIcon": "/img/game/gameminecraft.png",
  "deleteEnabled": true,
  "hero": {
    "eyebrow": "Lo ma duro pa",
    "description": "Wow Minecraft y el Dont!!!"
  }
}
```

`server.py` define estos valores en `DEFAULT_SETTINGS`, fusiona los ajustes
leídos con los predeterminados y restringe `hero` a las claves conocidas.
`save_settings()` limita `eyebrow` a 100 caracteres y `description` a 500.
Supabase almacena el objeto en la fila `id="global"` de la tabla `settings`.

En el panel, `js/admin.js` carga `/api/config`, relaciona los controles con
`HERO_FIELD_IDS` y manda el objeto completo mediante `POST /api/config`.
`index.html` define los elementos que presenta la portada y `js/index.js`
relaciona sus IDs con `HERO_ELEMENT_IDS`; `applyHeroSettings()` escribe el
contenido con `textContent`. Actualmente solo `eyebrow` y `description` se
editan desde el panel. Los otros datos visibles de la hero permanecen en el
HTML, salvo que se añadan explícitamente como ajustes.

Para cambiar los dos textos actuales, usa el panel y «Guardar hero». Para
incorporar un campo configurable nuevo, sigue el procedimiento de [añadir un
campo de configuración](#añadir-un-campo-de-configuración).

## Descripción técnica de los scripts

### `js/index.js`

El orden del archivo agrupa responsabilidades; al añadir código, mantenlo junto
a la sección correspondiente.

1. **Título aleatorio de la pestaña:** `motds` contiene las frases y
   `randomMOTD` elige una al cargar la página.
2. **Constantes y referencias al DOM:** `API_URL`, `ITEMS_PER_PAGE` y las
   referencias a formulario, lista, paginación y entradas. Si se cambia o
   agrega un ID en el HTML que JavaScript necesita, actualiza ambas partes.
3. **Estado de navegador y hero:** consulta `localStorage` para ciertos ajustes
   de presentación y controla los IDs de la hero. `loadSettings()` obtiene los
   ajustes desde `/api/config`.
4. **Estado del juego y permisos de interfaz:** `updateGameStatusBadge()`
   refleja el icono/estado del juego; `canDeletePublications()` decide si se
   presenta el botón de borrado. La comprobación visual del navegador no
   sustituye la autorización que debe hacer el servidor.
5. **Utilidades de formato y validación:** fecha, mensajes, escape de HTML,
   URLs de imagen/vídeo, URLs de YouTube y MIME de vídeo. Reutilízalas en vez de
   introducir interpolaciones inseguras en HTML.
6. **Lectura y operaciones de publicaciones:** `loadPublications()` consulta
   `GET /api/publicaciones`; `removePublication()` usa la ruta de publicación
   con método `DELETE`; `renderPagination()` crea los botones de página.
7. **Normalización y renderizado:** `normalizePublication()` completa valores
   esperados, las funciones de snapshot/firma detectan cambios y
   `createPublicationArticle()` crea una tarjeta. `renderPublications()`
   conserva el orden y los nodos visibles para no reconstruir innecesariamente
   toda la lista.
8. **Visor multimedia:** las imágenes se abren al pulsarlas; los vídeos locales
   y de YouTube conservan sus controles y tienen un botón para abrirlos en el
   visor modal de pantalla completa. `openMediaViewer()` usa un `<dialog>` y
   limpia los elementos al cerrar para detener la reproducción.
9. **Votos:** cada tarjeta asocia eventos a los botones y envía la reacción a
   la ruta de publicación. La respuesta actualiza la caché y los contadores.
10. **Alta de publicaciones:** el evento `submit` valida datos y extensiones,
   arma un `FormData` y manda `POST /api/publicaciones`. Los límites de tamaño
   actuales del navegador son 5 MB para imágenes y 20 MB para vídeos; el
   servidor también debe validar los datos que recibe.
11. **Sincronización:** `refreshLiveContent()` recarga configuración y
    publicaciones cada 1500 ms. Tenlo en cuenta al sumar peticiones: evita
    crear intervalos adicionales o solicitudes que se acumulen.

El modelo que espera el frontend por publicación contiene `id`, `publisher`,
`title`, `description`, `image`, `video`, `createdAt`, `likes`, `dislikes` y
`votes`. `publisher` contiene opcionalmente el nombre (hasta 60 caracteres);
cuando falta, la publicación se muestra como «Anónimo».
`votes` es un objeto indexado por identificador de usuario con valores
`"like"` o `"dislike"`. `image` y `video` pueden estar ausentes o ser `null`.
Las publicaciones se ordenan por fecha descendente y se muestran 6 por página.

### `js/admin.js`

1. **Claves e IDs:** constantes de `localStorage`, la clave de propietario y el
   mapa de entradas de la hero. Los IDs deben corresponder con `admin.html`.
2. **Estado del panel:** `setSettingsControlsEnabled()` bloquea controles
   mientras falta cargar configuración. `showStatus()` comunica éxito o error.
3. **Lectura y escritura de ajustes:** `loadSettings()` usa
   `GET /api/config`; `saveSettings()` serializa JSON y usa
   `POST /api/config`. Las acciones de los controles conservan y envían también
   los demás valores para evitar reemplazar parte de la configuración.
4. **Reflejo de valores:** `applyHeroSettings()`, `readHeroSettings()` y
   `applyGameSelection()` transfieren datos entre controles, navegador y
   servidor.
5. **Acceso y eventos:** `loginAdmin()` actualiza el estado local y
   `showAdminPanel()` muestra el panel. Los eventos de cambio guardan el
   interruptor de borrado y el juego; el botón de hero guarda sus campos.

Si se añade un control, además de su ID y evento hay que decidir cómo validar y
guardar su valor en el servidor. No guardes un valor en `localStorage` como
única fuente si debe compartirse entre usuarios o persistir entre dispositivos.

### `server.py`

1. **Configuración:** define el directorio servido, extensiones permitidas,
   variables de entorno y cliente de Supabase. `DEFAULT_SETTINGS` es la fuente
   de valores iniciales de la configuración.
2. **Configuración persistente:** `load_settings()` lee la fila global;
   `save_settings()` valida/normaliza los campos conocidos y hace un `upsert`.
3. **Formulario multipart y archivos:** `parse_multipart_form()` extrae
   campos/archivos; `upload_to_supabase_storage()` genera un nombre único y
   carga medios al bucket `Media`.
4. **Publicaciones:** `load_publications()`, `save_publication()` y
   `vote_publication()` leen, guardan y actualizan los contadores/votos en la
   tabla `publicaciones`.
5. **Eliminación:** `delete_publication()` elimina los medios del bucket cuando
   reconoce sus URLs y borra la fila. `extract_storage_path()` resuelve la ruta
   del archivo en el bucket.
6. **Rutas HTTP:** `PublicationHandler` despacha solicitudes a `/api/config` y
   `/api/publicaciones`; las demás rutas GET se sirven como archivos estáticos.
   El servidor se inicia en `PORT` (8000 por defecto).

La validación del navegador mejora la experiencia, pero no es una frontera de
confianza. Cada dato que cambie estado debe validarse en `server.py`, y los
errores de persistencia deben responder con un estado HTTP de error. Si una
operación nueva requiere una tabla o bucket, documenta también su esquema y
políticas de acceso en el entorno de Supabase.

## Contratos de la API y datos

| Método y ruta | Uso actual | Formato/respuesta |
| --- | --- | --- |
| `GET /api/config` | Obtener configuración compartida. | JSON con `gameIcon`, `deleteEnabled` y `hero`. |
| `POST /api/config` | Guardar configuración del panel. | JSON en el cuerpo; cabecera `X-Admin-Key`; devuelve la configuración guardada. |
| `GET /api/publicaciones` | Obtener publicaciones. | Array JSON con los campos descritos arriba. |
| `POST /api/publicaciones` | Crear publicación. | `multipart/form-data` con `title`, `description` y, opcionalmente, `publisher` (máximo 60 caracteres), `image`, `imageUrl`, `video` y `videoUrl`; devuelve la publicación creada. |
| `DELETE /api/publicaciones/{id}` | Votar si incluye `reaction` y `userId`; borrar si incluye una clave válida. | JSON de la publicación actualizada o confirmación de borrado. |

La ruta `DELETE` se comparte actualmente entre votos y borrado. Si se cambia
este diseño, actualiza a la vez los dos clientes y el despachador del servidor;
no cambies solo el método o los parámetros en un extremo.

## Añadir funcionalidades sin romper lo existente

### Añadir un campo de configuración

Usa este recorrido completo para que la opción persista y se vea en las dos
páginas:

1. **Define el contrato:** nombre de propiedad, tipo, valor predeterminado,
   longitud/rango permitido y comportamiento cuando falta o llega un valor
   inválido. Mantén nombres de propiedades consistentes en todo el flujo.
2. **HTML del panel:** agrega etiqueta y control con un ID único en
   `admin.html`.
3. **Cliente del panel:** incorpora el ID en `HERO_FIELD_IDS` si pertenece a la
   hero, o crea una referencia equivalente. Lee el valor, carga el valor
   recibido y envíalo junto con los demás campos al guardar.
4. **Servidor:** agrega el valor a `DEFAULT_SETTINGS` y a la normalización de
   `save_settings()`. Valida tipo y límites en el servidor; no confíes en
   `maxlength`, `type` ni en la validación JavaScript.
5. **Portada:** define el elemento y su ID en `index.html`, y agrega el ID al
   mapa `HERO_ELEMENT_IDS` (o al controlador que corresponda) para actualizarlo
   desde `/api/config`.
6. **Prueba las rutas completas:** cargar valor existente, valor
   predeterminado, guardar valor válido, rechazar/normalizar valor inválido,
   refrescar la portada y comprobar que los otros ajustes se conservan.

Para datos que no sean configuración global, no fuerces su inclusión en
`settings`; define el modelo y la API adecuada.

### Añadir un juego o icono

Agrega el recurso bajo `img/game/` y un radio con un `value` que sea una ruta
válida en `admin.html`. Revisa también el valor predeterminado del servidor y
`getSelectedGameIcon()` en `js/index.js` para que carga, selección y estado
inicial coincidan. Prueba el estado `offline` y una selección normal: `offline`
es un valor especial y no una ruta de imagen.

### Añadir un campo a las publicaciones

Define primero cómo se guarda y valida en `server.py`; luego actualiza el
formulario y su serialización `FormData`, la respuesta de la API, la
normalización (`normalizePublication()`), la firma/snapshot si el campo debe
reflejar actualizaciones, y `createPublicationArticle()` para presentarlo.
Al añadir `publisher`, la tabla `publicaciones` de Supabase necesita la columna
`publisher` de tipo `text`. Ejecuta una vez en el SQL Editor de Supabase:

```sql
ALTER TABLE publicaciones
ADD COLUMN IF NOT EXISTS publisher text;
```

Sin esa columna, Supabase rechazará las nuevas publicaciones y la API responderá
con error en lugar de confirmar un guardado fallido. Comprueba alta, validación
de longitud, paginación, refresco y datos antiguos que no tengan el campo.

Si la API devuelve un error de RLS, revisa que la tabla permita `INSERT` al rol
usado por el servidor; si subes archivos, verifica además el bucket `Media` y
sus políticas de carga. No abras permisos públicos de escritura para resolverlo:
las políticas deben limitarse al acceso necesario para la aplicación.

### Añadir una ruta de API

Añade la ruta en el manejador correspondiente (`do_GET`, `do_POST` o
`do_DELETE`), comprueba método, tipo y contenido del cuerpo, valida y limita la
entrada, responde con JSON/estado HTTP coherentes y maneja errores de Supabase.
Después añade el cliente en el script que corresponda, comprueba `response.ok`
y muestra un estado útil si falla. No cambies rutas ya usadas sin actualizar y
probar todos sus consumidores.

## Seguridad, compatibilidad y persistencia

- **No coloques secretos en HTML o JavaScript.** Todo valor que se envía al
  navegador puede inspeccionarse. La clave que el cliente presenta como
  `X-Admin-Key` está actualmente definida también en los scripts del navegador;
  por tanto, no debe considerarse un secreto ni una autenticación segura. Para
  proteger acciones administrativas en un despliegue real, usa autenticación
  validada exclusivamente por el servidor y guarda secretos solo en variables
  de entorno.
- Configura `SUPABASE_URL`, `SUPABASE_KEY`, `OWNER_DELETE_KEY` y, si hace falta,
  `PORT` en el entorno del servidor. Usa credenciales de mínimo privilegio y
  políticas de Supabase apropiadas; una clave publicable no debe dar permisos
  de escritura/borrado sin políticas que lo autoricen.
- La autorización del borrado debe seguir en el backend aunque el botón no se
  muestre en el navegador. `deleteEnabled` controla el comportamiento del sitio,
  pero no reemplaza el control de acceso.
- Usa `textContent` para texto no confiable. Si el contenido se interpola en
  `innerHTML`, escápalo con la utilidad existente y valida las URLs y protocolos
  permitidos.
- Los archivos y columnas persistentes deben respetar los tipos, nombres,
  límites y políticas existentes. Los cambios de estructura de datos necesitan
  una estrategia para registros antiguos y valores ausentes.
- Al cambiar identificadores HTML, busca sus referencias en ambos scripts.
  Evita reutilizar IDs y conserva los nombres de campos multipart que el
  servidor espera.

## Estilos y contenido

- Cambia textos estáticos directamente en el HTML sin quitar IDs que usan los
  scripts.
- Cambia estilos propios en `css/index.css` o `css/admin.css`; las clases
  Tailwind están principalmente en los atributos `class` del HTML.
- Añade colores, tipografías u otros valores compartidos en el objeto
  `tailwind.config` de la página correspondiente. Se carga después de Tailwind
  y antes del contenido que usa esas clases.
- La animación `fadeIn` de `css/index.css` se utiliza al crear tarjetas de
  publicación. Si cambias su nombre, actualiza también la clase de animación en
  `js/index.js`.
- Si cambias imágenes, conserva rutas correctas y texto alternativo (`alt`);
  añade opciones de iconos en el HTML y la lógica de selección, no solo el
  archivo de imagen.

## Desarrollo y lista de verificación

1. Instala las dependencias con `pip install -r requirements.txt` en el entorno
   Python del proyecto y configura las variables de entorno necesarias sin
   incluir credenciales en el repositorio.
2. Inicia el servidor con `python server.py` y abre `http://localhost:8000/`.
   El frontend depende de las rutas `/api/...`, por eso no basta con abrir el
   HTML como archivo local.
3. Abre las herramientas de desarrollo del navegador y revisa consola, red,
   respuesta y código HTTP de cada solicitud.
4. Prueba tanto el camino correcto como errores: entrada vacía/inválida,
   rechazo del servidor, datos antiguos, fallo de conexión y refresco.
5. Recorre las partes relacionadas: inicio, panel, guardar configuración,
   crear publicación, multimedia, votos, paginación y borrado (cuando esté
   habilitado).
6. Revisa el diff antes de integrar: confirma que no cambiaste claves de datos,
   IDs, rutas ni comportamientos fuera del alcance. No se deben subir archivos
   con credenciales.
