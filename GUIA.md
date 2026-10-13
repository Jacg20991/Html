# Guia sencilla para editar IndieCreate

La pagina esta dividida en archivos para que puedas encontrar cada tipo de
cambio sin tocar el resto:

| Archivo                       | Para que sirve                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| `index.html`                  | Texto, secciones, formularios y estructura de la pagina principal.       |
| `admin.html`                  | Estructura del panel de administracion.                                  |
| `css/index.css`               | Animaciones y estilos propios de la pagina principal.                    |
| `css/admin.css`               | Estilos propios del panel.                                               |
| `js/index.js`                 | Publicaciones, votos, formularios y actualizacion del juego.             |
| `js/admin.js`                 | Inicio de sesion y controles del panel.                                  |
| `js/tailwind-config-index.js` | Colores, tipografias y otros estilos disponibles en la pagina principal. |
| `js/tailwind-config-admin.js` | Colores disponibles en el panel.                                         |
| `img/`                        | Iconos e imagenes que aparecen en la pagina.                             |

## Cambiar textos

Abre `index.html` y busca el texto que quieras cambiar, por ejemplo el titulo de
bienvenida o la direccion del servidor. Edita solo el texto entre las etiquetas;
conserva las etiquetas HTML y sus atributos `id`, porque el JavaScript los usa
para encontrar los elementos.

Las historias se cargan desde el servidor. Para agregar una historia, utiliza el
formulario «Crear publicación» de la pagina.

## Cambiar colores o estilos

- En `css/index.css` y `css/admin.css` se escriben reglas CSS. Una regla tiene
  un selector y unas propiedades, por ejemplo:

  ```css
  .mi-estilo {
    color: white;
  }
  ```

- Muchos elementos usan clases de Tailwind directamente en el atributo `class`
  de los HTML. Puedes cambiar una clase de color o espaciado ahi.
- Los colores personalizados que se pueden usar como clases de Tailwind estan en
  los archivos `js/tailwind-config-*.js`.
- Para cambiar un icono o una imagen, reemplaza el archivo en `img/` o actualiza
  su ruta `src` en el HTML.

## Cambiar el comportamiento

La logica esta en `js/index.js` o `js/admin.js`. Al principio de `js/index.js`
encontraras la lista `motds` con los titulos aleatorios de la pestana;
`ITEMS_PER_PAGE` controla cuantas historias se muestran por pagina.

Los comentarios de esos archivos separan las tareas principales. Si solo quieres
cambiar textos o apariencia, normalmente no necesitas editar JavaScript.

## Consejos antes de guardar

1. Cambia una cosa cada vez y guarda el archivo.
2. Recarga la pagina en el navegador para comprobar el resultado.
3. Si algo deja de funcionar, revisa que no hayas borrado una etiqueta, una
   comilla o un `id`.
4. Para comprobar los estilos dinamicos, abre la pagina a traves del servidor
   del proyecto, no como un archivo local.
