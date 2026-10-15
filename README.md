# Lienzo continuo

Editor web gratuito para crear carruseles de Instagram con **continuidad entre diapositivas**: un único lienzo ancho que se corta en N imágenes de 1080 px, con plantillas de celdas que pueden cruzar los cortes.

- Todo se ejecuta en el navegador. No hay servidor, cuenta ni subida de archivos: **las fotos nunca salen del dispositivo**.
- Formatos: 1:1 (1080×1080), 4:5 (1080×1350) y 16:9 (1080×566), de 1 a 20 diapositivas.
- Plantillas de celdas con recorte, espacio y esquinas ajustables; capas libres con arrastre, escala y rotación.
- Exporta una imagen JPG por diapositiva, o abre la hoja de compartir del móvil.

> "Lienzo continuo" es un nombre provisional.

## Desarrollo

Requiere Node.js 20.19 o superior (o 22.12+), por Vite 8.

```bash
npm install
npm run dev      # http://localhost:5174
npm test         # pruebas de geometría y plantillas
npm run build    # comprueba tipos y genera dist/
```

## Estructura

| Archivo | Contenido |
|---|---|
| `src/geometry.ts` | Modelo de coordenadas: lienzo continuo, ventanas de corte, encuadre de fotos en celdas. Funciones puras, compartidas por la vista previa y la exportación. |
| `src/templates.ts` | Plantillas de celdas (funciones puras que devuelven rectángulos). |
| `src/export.ts` | Renderiza cada diapositiva a su tamaño final; descarga y hoja de compartir. |
| `src/App.tsx` | Editor (React + Konva). |

Para añadir una plantilla, agrega un objeto a `TEMPLATES` en `src/templates.ts`. Las pruebas comprueban automáticamente que cubra el lienzo sin huecos ni solapes.

## Publicar en Cloudflare Pages

El resultado es un sitio estático (`dist/`), sin funciones de servidor.

1. Sube el repositorio a GitHub.
2. En Cloudflare, crea un proyecto de **Pages** conectado al repositorio.
3. Comando de build: `npm run build`. Directorio de salida: `dist`.

`public/_headers` define la caché de larga duración para `/assets/*` y cabeceras de seguridad básicas. Revisa los límites y términos vigentes de Cloudflare antes de publicar.

## Licencia

MIT, ver [LICENSE](LICENSE). Dependencias principales: React, Konva y react-konva (todas MIT).
