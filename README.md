# Studia 🎓

App web de estudio interactiva basada en HTML puro y la **File System Access API**, con soporte nativo para **Gemini** (Google AI).

## Características principales
- **Panel izquierdo (Fuentes)**: Explora la carpeta `fuentes/` con carpetas anidadas. Permite transcribir documentos PDF a Markdown manteniendo marcas de página (`<!-- page: N -->`).
- **Consola central**: Chat interactivo con el **Agente Tutor** educable (configurable en `agentes/tutor.md`). Todas las afirmaciones se vinculan directamente al documento PDF original y su página concreta mediante chips de referencia interactivos.
- **Panel derecho (Tests y Análisis)**:
  - Generación de tests tipo test con 4 opciones usando el **Agente Examinador** (`agentes/examinador.md`).
  - Posibilidad de realizar tests, guardar exámenes, repetirlos y repetir **únicamente los fallos**.
  - Registro de errores e intentos en `.studia/resultados/intentos.json`.
- **Visor de PDF integrado**: Permite inspeccionar en paralelo la página exacta del PDF original sin salir de la aplicación.
- **Sin servidores ni bundles complejos**: Abre directamente `index.html` en Google Chrome o Microsoft Edge.

## Requisitos
- Navegador moderno compatible con la **File System Access API** (Google Chrome, Microsoft Edge, Brave, etc.).
- Clave de API de Google Gemini ([Google AI Studio](https://aistudio.google.com/)).

## Uso rápido
1. Abre `index.html` en Chrome o Edge (o sirve la carpeta con cualquier servidor local).
2. Haz clic en **"Abrir carpeta del proyecto"** y selecciona la raíz de este repositorio (`Studia`).
3. Ve a **Ajustes** (icono de engranaje) e introduce tu **Gemini API Key**.
4. Añade tus apuntes o libros en formato PDF dentro de la carpeta `fuentes/` (puedes crear subcarpetas temáticas).
5. En la interfaz, pulsa **"Transcribir"** sobre cualquier PDF para procesarlo.
6. Marca las fuentes con el checkbox y empieza a preguntar al Tutor o a crear Tests.
