# Antecedentes y hoja de ruta

Documento vivo. Registra por qué la herramienta es como es, dónde estamos y qué conviene hacer después. Última revisión: 31-10-2026.

Convención: **medido** = comprobado con una prueba o medición en esta sesión; **por verificar** = viene de fuentes de terceros o de memoria y hay que confirmarlo antes de apoyarse en ello.

## 1. Propósito y principios

**Propósito.** Generar carruseles de Instagram con continuidad entre diapositivas: un lienzo ancho que se corta en imágenes de 1080 px, con plantillas de celdas y control total sobre cada foto. Herramienta gratuita, no comercial, que el autor (fotógrafo) quiere liberar.

**Principios acordados**

1. **El carrusel manda.** Todo lo que no ayude a hacer un carrusel creativo para Instagram queda fuera o al final.
2. **Mantener el rendimiento.** Hoy la app va fluida; cualquier función nueva se mide contra la línea base (sección 3).
3. **Todo en el navegador.** Sin servidor, cuentas ni subida de fotos. Mantiene el coste de operar cerca de cero y es un argumento de privacidad verificable.
4. **SCRL es referencia, no modelo a copiar.** Se estudia cómo se diseñan estas funciones para decidir qué encaja; no se copian código, plantillas, assets ni marca. "SCRL" nunca se usa como nombre.
5. **Nombre provisional.** "Lienzo continuo" puede cambiar; aparece en `README.md`, `LICENSE` e `index.html`.

## 2. Estado actual (medido)

| Área | Estado |
|---|---|
| Lienzo continuo, 3 formatos (1:1, 4:5, 1,91:1), 1 a 20 diapositivas | Hecho |
| Capas libres: mover, escalar, rotar, orden | Hecho |
| Celdas con recorte: encuadre por arrastre, zoom (rueda y control), espacio y esquinas | Hecho |
| 11 plantillas (9 con celdas que cruzan cortes, 2 con diagonales) | Hecho |
| Exportación JPG por diapositiva y hoja de compartir del móvil | Hecho |
| Interfaz "mesa de luz": claro y oscuro, miniaturas, fuentes locales | Hecho |
| Repositorio privado en GitHub, licencia MIT, README | Hecho |
| 19 pruebas automáticas (geometría y plantillas) | En verde |
| Guardar proyectos, deshacer/rehacer | Sin empezar |
| Texto, fondo editable, formato personalizado | Sin empezar |
| Ajustes de foto, stickers | Sin empezar |
| Despliegue público | Sin empezar |

## 3. Rendimiento: línea base y riesgos

**Carga inicial (medido, build de producción)**: unos 288 KB transferidos: 176 KB de JS y CSS comprimidos (React 64, Konva 105, app 9, CSS 4) y 112 KB de fuentes latinas.

**Uso, antes de la etapa A**: la app decodificaba cada foto a resolución completa y la retenía. Con 12 fotos de 4000×3000, eso son ~549 MB de píxeles decodificados (cálculo: ancho × alto × 4 bytes; no se puede medir desde la página). Exportar 3 diapositivas tardó 1,5 s en una ejecución, en desarrollo.

**Etapa A, hecho (módulo `src/images.ts`)**
- El editor retiene una copia de hasta 1920 px de lado mayor; el original (el `File`) no se decodifica hasta exportar.
- La exportación decodifica cada original de uno en uno, ya reducido al tamaño al que se va a dibujar, lo dibuja en las diapositivas que toca y lo libera. Respeta la orientación EXIF (probado con una foto con orientación 6).
- La memoria de una foto se libera al quitarla de la celda o capa. Ya no hay URLs de objeto de las fotos.
- Las fotos que no se pueden abrir se informan por nombre sin detener las demás.
- Resultado: retención de ~549 MB a ~127 MB con 12 fotos de 12 Mpx (**−77 %**, cálculo).

**Coste de esa decisión (medido, mismas condiciones, 12 fotos de 4000×3000, 3 diapositivas)**: dibujar desde fotos ya decodificadas a resolución completa (método anterior) 363 ms; decodificar al tamaño necesario y dibujar (método nuevo) 547 ms. Son ~0,2 s más de cómputo al exportar.

**Aviso sobre las mediciones de tiempo total**: en el entorno de pruebas actual cada `toBlob` tarda ~1 s incluso con un lienzo en blanco (la ventana de pruebas no tiene el foco), mientras que en una sesión anterior tardaba ~0,3 s. Por eso no se pueden comparar tiempos totales entre sesiones; solo comparaciones controladas dentro de una misma sesión. Falta medir el tiempo real en un teléfono.

**Presupuesto de rendimiento (vigente)**: carga inicial por debajo de ~300 KB (hoy ~290 KB); exportación de un carrusel típico en pocos segundos en un móvil de gama media (sin medir); no regresar en ninguno.

**Limitaciones conocidas de la copia reducida**: al hacer mucho zoom en una celda (hasta 4×), la vista previa se ve más suave que el resultado exportado, que usa el original. Los límites de memoria de iOS Safari con 20 diapositivas simultáneas en la exportación (unos 117 MB de lienzos) no están medidos.

## 4. Despliegue

La app es un sitio estático. Lo que importa es que no tenga cortes por tráfico y que los términos admitan una herramienta gratuita.

| Opción | Veredicto | Motivo |
|---|---|---|
| **Cloudflare, Workers Static Assets** | **Recomendada** | Según fuentes de terceros, Cloudflare recomienda esta vía para proyectos nuevos y las peticiones estáticas no se cuentan en el plan gratuito. Sin tarjeta ni facturación sorpresa. |
| Cloudflare Pages | Válida | Sigue funcionando, pero una fuente la describe como en mantenimiento. Es lo que documenta el `README` hoy. |
| GitHub Pages | Alternativa simple | Permitido para uso no comercial; límite blando de 100 GB al mes (documentación oficial). |
| Vercel Hobby | Posible | Solo uso personal y no comercial (términos oficiales). Una fuente interpreta que un botón de donaciones podría contar como comercial: no confirmado. |
| Netlify | No recomendada | Muchos reportes de usuarios con sitios que quedan pausados aunque los créditos se hayan renovado. |

**Por verificar antes de publicar:** términos y límites vigentes en la documentación oficial de Cloudflare; que Workers Static Assets respete `public/_headers` para la caché; actualizar `README.md` si se elige Workers en vez de Pages.

**Pendientes de publicación:** nombre del titular en `LICENSE`; el correo visible en el historial de git si el repositorio se hace público; nombre definitivo; dominio propio (opcional, unos 10 USD al año, estimación).

## 5. Calidad de interfaz: escritorio y móvil

Principio: el uso principal será el teléfono, aunque se diseñe en escritorio. Revisar en cada postura, no solo "en móvil".

Medido con el emulador del navegador integrado (geometría de los elementos), con un carrusel de 3 diapositivas y la plantilla "Puentes".

| Postura | Estado | Resultado |
|---|---|---|
| Escritorio (1280×720) | Revisado | Lienzo, panel lateral y acciones visibles; sin desbordamiento. |
| Tablet vertical (768×1024) | Revisado | Una columna, sin desbordamiento; el panel de herramientas queda debajo del lienzo. |
| Tablet horizontal (1024×768) | Revisado | Dos columnas, sin desbordamiento. |
| Móvil vertical (375×812) | Revisado | Sin desbordamiento; barra de acciones fija abajo. |
| **Móvil horizontal** (844×390, 667×375, 568×320) | **Rediseñado y revisado** | Antes: una columna con el lienzo de ~220 px y las herramientas fuera de pantalla (había que desplazar la página). Ahora: lienzo a la izquierda y herramientas a la derecha con desplazamiento propio; la página no se desplaza y todo está a la vista. Lienzo de 523×217, 399×166 y 300×125 px respectivamente. |
| Teléfono pequeño vertical (320×568) | **No fiable** | El emulador devolvió un tamaño alterado; sin verificar. |
| Táctil | Parcial | Se añadió el mínimo de 44 px en botones, pasos y deslizadores en dispositivos con puntero grueso; el emulador lo activa (botones de 44 px). Arrastrar y hacer zoom con el dedo no se ha probado. |
| Aspecto visual del móvil horizontal | **Sin revisar** | Las capturas no estuvieron disponibles (panel oculto); solo hay mediciones. |

**Hallazgo técnico**: el tamaño del lienzo se mide con un `ResizeObserver`, que al girar el teléfono llega con retraso; se añadió también la medición en el evento `resize`.

**Cómo cerrarlo:** al menos un teléfono iOS y uno Android reales, porque la emulación no reproduce los límites de memoria, la barra del navegador que cambia la altura ni el comportamiento táctil.

## 6. Investigación de referencias con REA

Objetivo: entender cómo se resuelven estas funciones, no replicarlas.

**SCRL**
- **iOS**: el `.ipa` de la App Store está cifrado (FairPlay); REA necesita uno descifrado, que requiere un iPhone con jailbreak o una Mac con Apple Silicon.
- **Android (nueva vía, por verificar)**: según agregadores, la app existe en Google Play como `com.appostrophe.scrl`. Un APK no tiene el cifrado de iOS. Si hay un teléfono o emulador Android, REA tiene herramientas para instalar la app desde Play y extraer el paquete (`list_adb_packages`, `pull_adb_package`) y analizarlo (`inspect_android_package`, `decode_android_resources`, `project_android_application_graph`). Hay que comprobar que la versión de Android corresponde a la de iOS, y el código puede estar ofuscado.
- Descargar un APK de un sitio de terceros no es la vía: requiere tu aprobación expresa por archivo y su origen no es confiable.

**Otras referencias**
- *Herramientas web de corte de panoramas* (InstaPanoramic ya analizada; Supaslides, Image Splitter Online): matemática de corte y solape. El solape sigue sin entenderse.
- *miniPaint* (MIT, según su repositorio): implementación abierta de filtros y capas en canvas; referencia para el bloque de ajustes de foto.
- *Polotno* (comercial) y *Konva*: estructura de plantillas como JSON.
- Prerrequisito de REA para analizar webs: las herramientas `analyze_web_bundle` e `inspect_web_page` necesitan un endpoint CDP local, que el navegador integrado no expone; habría que abrir Chrome con depuración remota.

**Preguntas que debe responder la investigación (en orden de valor)**
1. ¿Cómo hacen "más de 10 fotos en una publicación"? (¿varias publicaciones enlazadas, una por tanda?)
2. ¿Cómo definen y distribuyen las plantillas? (formato, catálogo remoto o local)
3. ¿Qué resolución interna usan al editar y cómo exportan sin agotar memoria?
4. ¿Cómo implementan el solape o margen de seguridad en el corte?
5. ¿Qué ajustes de foto ofrecen y con qué tecnología (Core Image, Metal, GL)?
6. ¿Cómo guardan los proyectos y cuánto espacio ocupan? (una reseña se queja del almacenamiento)

**Reglas.** Analizar para entender; registrar hallazgos como observación, inferencia o desconocido; no copiar plantillas, assets, marca ni código; cada descarga la aprueba el usuario.

## 7. Hoja de ruta propuesta

**Etapa A. Cimientos (antes de publicar)**: en gran parte hecha.
1. ~~Copia reducida para editar y originales solo al exportar; liberar memoria.~~ Hecho (sección 3). *Falta la salida:* comprobar que 12 fotos de 12 Mpx van fluidas en un móvil de gama media.
2. ~~Revisión responsiva~~ Hecho con emulación (sección 5). *Falta:* aspecto visual del móvil horizontal, el teléfono de 320 px y el táctil real.
3. **Pendiente:** medir en producción y en un teléfono real; registrar las cifras aquí.

**Etapa B. Publicar**
4. Decidir titular, nombre y visibilidad; limpiar el historial si hace falta.
5. Desplegar en Cloudflare Workers Static Assets; actualizar el `README`.

**Etapa C. Que sirva de principio a fin**
6. Guardar y retomar proyectos (IndexedDB), con deshacer y rehacer. Medir el espacio por proyecto.
7. Texto, fondo editable y formato personalizado.

**Etapa D. Investigación (en paralelo, en su propia sesión)**
8. Análisis de SCRL en Android con REA y de 2 o 3 herramientas web; responder las preguntas de la sección 6.

**Etapa E. Diferenciadores (según lo aprendido en D)**
9. Más plantillas, cuadrículas de feed, ajustes de foto, stickers con contenido propio o licenciado.

Fuera de alcance mientras la herramienta sea gratuita y local: cuentas, sincronización, publicación vía API de Meta, suscripciones, vídeo y reels.

## 8. Decisiones abiertas

- ¿Dispones de un teléfono o emulador Android para el análisis de SCRL, o conseguir un `.ipa` descifrado?
- ¿Qué teléfonos reales hay para probar (modelo y sistema)?
- ¿Titular de la licencia y nombre definitivo?
- ¿El repositorio se hará público, y cuándo?
- ¿Se aceptarán donaciones? Afecta a qué plataformas de hosting son válidas.
