# My Animator

Modern Flipnote-style drawing environment that lets you trace reference videos, sketch frame-by-frame animations, and manage Konva-based layers entirely in the browser.

## Why this was built

- Trace live-action footage and stylize it with TensorFlow-generated outlines.
- Provide a responsive canvas with multiple brush types, custom cursors, onion-skinning, and undo/redo history.
- Showcase how FFmpeg (WASM), TensorFlow.js, and Konva can power a production-ready animation tool without desktop installations.

## Feature highlights

1. **Video frame extraction** – FFmpeg WASM converts uploaded videos to 12 FPS PNG frames.
2. **TensorFlow outlines** – optional outline generation via `@tensorflow/tfjs` (FaceMesh, BodyPix).
3. **Layer management** – add/remove layers, toggle visibility, import images per frame or globally.
4. **Onion skinning** – previous/next frames rendered with adjustable transparency.
5. **Brush toolkit** – textured pencil, smooth brush, highlight, gradient, eraser, and custom brush cursor.
6. **Undo/redo stacks** – multi-step history per layer.
7. **Timeline rail** – insert/delete frames, view thumbnails, autosave ordering.
8. **Image import** – drop reference images that remain available on new frames (hidden by default).
9. **Autosave + dialogs** – project stored in IndexedDB with custom confirmation modals.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React 19, TypeScript, Vite |
| Canvas | Konva + react-konva |
| Video processing | @ffmpeg/ffmpeg, @ffmpeg/core, @ffmpeg/util (WASM) |
| ML | @tensorflow/tfjs (FaceMesh, BodyPix integration) |
| State/storage | React hooks, IndexedDB (idb-keyval) |
| Tooling | ESLint, TypeScript, Vite dev server |

## Getting started

```bash
npm install
npm run dev
# open http://localhost:5173
```

## Workflow

1. Create a blank canvas or upload a reference video.
2. Extract frames (FFmpeg) and optionally run TensorFlow outline generation.
3. Draw on Konva layers using the tool palette; toggle onion skin to reference adjacent frames.
4. Add image layers for extra references (per frame or globally).
5. Use the timeline rail to insert/delete frames and view thumbnails.
6. Keep drawing—autosave persists the project in IndexedDB.

## Screenshots

> Add your hosted image links below (example placeholders shown)

| View | Image |
| --- | --- |
| Layer panel & timeline | ![Layer panel](./src/assets/Screenshot%202025-11-26%20at%206.49.05%E2%80%AFPM.png) |
| Drawing workspace | ![Workspace](./src/assets/Screenshot%202025-11-26%20at%207.09.05%E2%80%AFPM.png) |
| Image layer import | ![Image import](./src/assets/Screenshot%202025-11-26%20at%207.09.17%E2%80%AFPM.png) |

## Directory overview

```
src/
  assets/          README screenshots & reference images
  components/      StageEditor, FrameTimeline, VideoUploader
  hooks/           useFfmpeg (FFmpeg WASM orchestration)
  utils/           color helpers, image helpers, outline helpers
  App.tsx          Global state, toolbars, dialogs, save logic
```

## Future roadmap

- Auto-trace button powered by TensorFlow models for full-scene outlines.
- Advanced export pipeline (GIF/MP4) via FFmpeg + Konva snapshots.
- Brush presets, animation preview, collaborative editing.

---

Built to demonstrate **browser-native animation tooling** combining FFmpeg WASM, TensorFlow inference, and Konva rendering—no desktop installs required.

