import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './App.css'

import { VideoUploader } from './components/VideoUploader'
import { FrameTimeline } from './components/FrameTimeline'
import { StageEditor } from './components/StageEditor'
import { useFfmpeg, fetchFile } from './hooks/useFfmpeg'
import { blobToDataUrl, loadImageElement } from './utils/imageHelpers'
import { generateOutlineMask } from './utils/outline'
import { clearProject, loadProject, saveProject } from './utils/storage'
import type {
  AnimatorProject,
  DrawingLayer,
  DrawingStroke,
  DrawingTool,
  FrameData,
} from './types'

const createLayer = (name: string): DrawingLayer => ({
  id: uuidv4(),
  name,
  visible: true,
  strokes: [],
})

function App() {
  const { loadFfmpeg, isLoading: isFfmpegLoading } = useFfmpeg()
  const [project, setProject] = useState<AnimatorProject | null>(null)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Idle')
  const [tool, setTool] = useState<DrawingTool>('brush')
  const [brushColor, setBrushColor] = useState('#ff0066')
  const [brushSize, setBrushSize] = useState(6)
  const [onionSkin, setOnionSkin] = useState(true)

  useEffect(() => {
    const restoreProject = async () => {
      const saved = await loadProject()
      if (saved && saved.frames.length) {
        setProject(saved)
        setActiveFrameId(saved.frames[0].id)
        setStatusMessage('Restored project from IndexedDB')
      }
    }
    restoreProject()
  }, [])

  useEffect(() => {
    if (!project || !project.frames.length) return
    if (!activeFrameId) {
      setActiveFrameId(project.frames[0].id)
    }
  }, [project, activeFrameId])

  const activeFrame = useMemo(() => {
    if (!project) return null
    return project.frames.find((frame) => frame.id === activeFrameId) ?? null
  }, [project, activeFrameId])

  const activeFrameIndex = useMemo(() => {
    if (!project || !activeFrameId) return -1
    return project.frames.findIndex((frame) => frame.id === activeFrameId)
  }, [project, activeFrameId])

  const prevFrame =
    activeFrameIndex > 0 && project ? project.frames[activeFrameIndex - 1] : null
  const nextFrame =
    activeFrameIndex >= 0 && project && activeFrameIndex < project.frames.length - 1
      ? project.frames[activeFrameIndex + 1]
      : null

  const composeFrames = async (names: string[], ffmpegInstance: Awaited<ReturnType<typeof loadFfmpeg>>): Promise<FrameData[]> => {
    const frames: FrameData[] = []
    for (const [index, name] of names.entries()) {
      const frameFile = ffmpegInstance.FS('readFile', name)
      const frameCopy = new Uint8Array(frameFile.length)
      frameCopy.set(frameFile)
      const blob = new Blob([frameCopy], { type: 'image/png' })
      const imageUrl = await blobToDataUrl(blob)
      const image = await loadImageElement(imageUrl)
      const baseLayer = createLayer('Layer 1')
      frames.push({
        id: uuidv4(),
        frameNumber: index,
        imageUrl,
        layers: [baseLayer],
        activeLayerId: baseLayer.id,
        width: image.width,
        height: image.height,
      })
      ffmpegInstance.FS('unlink', name)
    }
    return frames
  }

  const handleVideoSelected = useCallback(
    async (file: File) => {
      setIsProcessing(true)
      setStatusMessage('Preparing ffmpeg…')
      try {
        const ffmpegInstance = await loadFfmpeg()
        const inputName = `input-${Date.now()}.${file.name.split('.').pop() || 'mp4'}`
        ffmpegInstance.FS('writeFile', inputName, await fetchFile(file))
        setStatusMessage('Extracting frames at 12 FPS…')
        await ffmpegInstance.run(
          '-i',
          inputName,
          '-vf',
          'fps=12,scale=720:-1:flags=lanczos',
          '-qscale:v',
          '2',
          'frame_%04d.png',
        )
        ffmpegInstance.FS('unlink', inputName)

        const files = ffmpegInstance
          .FS('readdir', '/')
          .filter((name: string) => name.startsWith('frame_') && name.endsWith('.png'))
          .sort()

        if (!files.length) {
          throw new Error('No frames produced. Try a different video file.')
        }

        setStatusMessage('Loading frames into canvas memory…')
        const frames = await composeFrames(files, ffmpegInstance)

        setStatusMessage('Generating outlines (TensorFlow.js)…')
        for (const frame of frames) {
          frame.outlineUrl = await generateOutlineMask(frame.imageUrl)
        }

        const newProject: AnimatorProject = {
          frames,
          updatedAt: Date.now(),
        }
        setProject(newProject)
        setActiveFrameId(frames[0].id)
        await saveProject(newProject)
        setStatusMessage(`Ready • ${frames.length} frames @ 12 FPS`)
      } catch (error) {
        console.error(error)
        setStatusMessage('Processing failed')
        alert('Unable to process this file. Please check the console for details.')
      } finally {
        setIsProcessing(false)
      }
    },
    [loadFfmpeg],
  )

  const handleCommitStroke = useCallback(
    (frameId: string, layerId: string, stroke: DrawingStroke) => {
      setProject((current) => {
        if (!current) return current
        const frames = current.frames.map((frame) => {
          if (frame.id !== frameId) return frame
          const layers = frame.layers.map((layer) =>
            layer.id === layerId
              ? { ...layer, strokes: [...layer.strokes, stroke] }
              : layer,
          )
          return { ...frame, layers }
        })
        const updated = { frames, updatedAt: Date.now() }
        void saveProject(updated)
        return updated
      })
    },
    [],
  )

  const handleClearProject = useCallback(async () => {
    await clearProject()
    setProject(null)
    setActiveFrameId(null)
    setStatusMessage('Cleared project')
  }, [])

  const isBusy = isProcessing || isFfmpegLoading

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Flipaclip-style web animator</p>
          <h1>Trace, stylize, and animate fully in the browser.</h1>
          <p className="lede">
            Import a reference video, auto-generate outlines with TensorFlow.js, draw in layers,
            and manage a 12 FPS timeline using Konva.
          </p>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={handleClearProject} disabled={!project}>
            Clear project
          </button>
          <span className={`status-chip ${isBusy ? 'busy' : ''}`}>{statusMessage}</span>
        </div>
      </header>

      <main className="main-grid">
        <section className="left-column">
          <VideoUploader disabled={isBusy} onVideoSelected={handleVideoSelected} />

          <div className="panel tools-panel">
            <div className="panel-header">
              <h2>2. Drawing tools</h2>
              <p>Brush freestyle animation layers with onion skin context.</p>
            </div>
            <div className="panel-body">
              <div className="tool-row">
                <span>Tool</span>
                <div className="tool-buttons">
                  <button
                    className={tool === 'brush' ? 'active' : ''}
                    onClick={() => setTool('brush')}
                  >
                    Brush
                  </button>
                  <button
                    className={tool === 'eraser' ? 'active' : ''}
                    onClick={() => setTool('eraser')}
                  >
                    Eraser
                  </button>
                </div>
              </div>

              <div className="tool-row">
                <label htmlFor="brush-color">Color</label>
                <input
                  id="brush-color"
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                />
              </div>

              <div className="tool-row">
                <label htmlFor="brush-size">Brush size ({brushSize}px)</label>
                <input
                  id="brush-size"
                  type="range"
                  min={1}
                  max={40}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
              </div>

              <div className="tool-row">
                <span>Onion skin</span>
                <button className="toggle" onClick={() => setOnionSkin((value) => !value)}>
                  {onionSkin ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          <FrameTimeline
            frames={project?.frames ?? []}
            activeFrameId={activeFrameId}
            onSelectFrame={setActiveFrameId}
          />
        </section>

        <section className="right-column">
          <StageEditor
            frame={activeFrame}
            prevFrame={onionSkin ? prevFrame : null}
            nextFrame={onionSkin ? nextFrame : null}
            brushColor={brushColor}
            brushSize={brushSize}
            tool={tool}
            onionSkin={onionSkin}
            onCommitStroke={handleCommitStroke}
          />
        </section>
      </main>
    </div>
  )
}

export default App
