import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './App.css'

import { VideoUploader } from './components/VideoUploader'
import { FrameTimeline } from './components/FrameTimeline'
import { StageEditor } from './components/StageEditor'
import { AppHeader } from './components/AppHeader'
import { BrushRail } from './components/BrushRail'
import { VideoFileInput, type VideoFileInputHandle } from './components/VideoFileInput'
import { ProcessingOverlay } from './components/ProcessingOverlay'
import { WorkspaceView } from './components/WorkspaceView'
import { GettingStartedPanels } from './components/GettingStartedPanels'
import { useFfmpeg, fetchFile } from './hooks/useFfmpeg'
import { applyImageLayerToFrames, cloneVisibleImageLayers, createLayer } from './utils/project'
import { composeFrames, createBlankCanvasFrame } from './utils/images'
import { generateOutlineMask } from './utils/outline'
import { clearProject, loadProject, saveProject } from './utils/storage'
import type {
  AnimatorProject,
  DrawingLayer,
  DrawingStroke,
  DrawingTool,
  FrameData,
} from './types'

function App() {
  const { loadFfmpeg, isLoading: isFfmpegLoading } = useFfmpeg()
  const [project, setProject] = useState<AnimatorProject | null>(null)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Idle')
  const [tool, setTool] = useState<DrawingTool>('pencil')
  const [brushColor, setBrushColor] = useState('#ff0066')
  const [brushSize, setBrushSize] = useState(6)
  const [onionSkin, setOnionSkin] = useState(true)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [isClearConfirmVisible, setIsClearConfirmVisible] = useState(false)
  const [redoStacks, setRedoStacks] = useState<Record<string, DrawingStroke[]>>({})
  const pendingImageScopeRef = useRef<'frame' | 'all'>('frame')

  useEffect(() => {
    const restoreProject = async () => {
      const saved = await loadProject()
      if (saved && saved.frames.length) {
        setIsRestoring(true)
        setRestoreProgress(0)
        // Animate progress smoothly (at least 2s, cap at 4s)
        const baseDuration = saved.frames.length * 5
        const duration = Math.max(2000, Math.min(baseDuration, 4000))
        const steps = 20
        const stepTime = duration / steps
        for (let i = 1; i <= steps; i++) {
          await new Promise((resolve) => setTimeout(resolve, stepTime))
          setRestoreProgress(Math.round((i / steps) * 100))
        }
        setProject(saved)
        setActiveFrameId(saved.frames[0].id)
        setStatusMessage('Restored project from IndexedDB')
        setIsRestoring(false)
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

  const activeLayer = useMemo(() => {
    if (!activeFrame) return null
    return activeFrame.layers.find((layer) => layer.id === activeFrame.activeLayerId) ?? null
  }, [activeFrame])

  const activeRedoKey = activeFrame && activeLayer ? `${activeFrame.id}:${activeLayer.id}` : null
  const canUndo = Boolean(activeLayer?.strokes.length)
  const canRedo = activeRedoKey ? Boolean(redoStacks[activeRedoKey]?.length) : false

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

  const handleVideoSelected = useCallback(
    async (file: File) => {
      setIsProcessing(true)
      setStatusMessage('Preparing ffmpeg…')
      try {
        const ffmpegInstance = await loadFfmpeg()
        const inputName = `input-${Date.now()}.${file.name.split('.').pop() || 'mp4'}`
        await ffmpegInstance.writeFile(inputName, await fetchFile(file))
        setStatusMessage('Extracting frames at 12 FPS…')
        await ffmpegInstance.exec([
          '-i',
          inputName,
          '-vf',
          'fps=12,scale=720:-1:flags=lanczos',
          '-qscale:v',
          '2',
          'frame_%04d.png',
        ])
        await ffmpegInstance.deleteFile(inputName)

        const files = (
          await ffmpegInstance.listDir('/')
        )
          .map((entry) => entry.name)
          .filter((name) => name.startsWith('frame_') && name.endsWith('.png'))
          .sort()

        if (!files.length) {
          throw new Error('No frames produced. Try a different video file.')
        }

        setStatusMessage('Loading frames into canvas memory…')
        const frames = await composeFrames(files, ffmpegInstance)
        frames.forEach((frame) => {
          const videoLayer = {
            ...createLayer('Video Layer 1'),
            imageUrl: frame.imageUrl,
            visible: true,
          }
          frame.layers = [videoLayer, ...frame.layers]
        })

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
      const stackKey = `${frameId}:${layerId}`
      setRedoStacks((prev) => ({ ...prev, [stackKey]: [] }))
    },
    [],
  )

  const handleUndoStroke = useCallback(() => {
    if (!activeFrame || !activeLayer) return
    const frameId = activeFrame.id
    const layerId = activeLayer.id
    const stackKey = `${frameId}:${layerId}`
    let removedStroke: DrawingStroke | null = null

    setProject((current) => {
      if (!current) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === frameId)
      if (frameIndex === -1) return current
      const frame = current.frames[frameIndex]
      const layerIndex = frame.layers.findIndex((layer) => layer.id === layerId)
      if (layerIndex === -1) return current
      const targetLayer = frame.layers[layerIndex]
      if (!targetLayer.strokes.length) return current
      removedStroke = targetLayer.strokes[targetLayer.strokes.length - 1]
      const updatedLayer: DrawingLayer = {
        ...targetLayer,
        strokes: targetLayer.strokes.slice(0, -1),
      }
      const updatedLayers = frame.layers.map((layer, idx) => (idx === layerIndex ? updatedLayer : layer))
      const updatedFrame: FrameData = { ...frame, layers: updatedLayers }
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })

    if (removedStroke) {
      setRedoStacks((prev) => ({
        ...prev,
        [stackKey]: [...(prev[stackKey] ?? []), removedStroke!],
      }))
    }
  }, [activeFrame, activeLayer])

  const handleRedoStroke = useCallback(() => {
    if (!activeFrame || !activeLayer) return
    const frameId = activeFrame.id
    const layerId = activeLayer.id
    const stackKey = `${frameId}:${layerId}`
    let strokeToRestore: DrawingStroke | null = null

    setRedoStacks((prev) => {
      const stack = prev[stackKey]
      if (!stack || !stack.length) {
        strokeToRestore = null
        return prev
      }
      strokeToRestore = stack[stack.length - 1]
      return {
        ...prev,
        [stackKey]: stack.slice(0, -1),
      }
    })

    if (!strokeToRestore) return

    setProject((current) => {
      if (!current) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === frameId)
      if (frameIndex === -1) return current
      const frame = current.frames[frameIndex]
      const layerIndex = frame.layers.findIndex((layer) => layer.id === layerId)
      if (layerIndex === -1) return current
      const targetLayer = frame.layers[layerIndex]
      const updatedLayer: DrawingLayer = {
        ...targetLayer,
        strokes: [...targetLayer.strokes, strokeToRestore!],
      }
      const updatedLayers = frame.layers.map((layer, idx) => (idx === layerIndex ? updatedLayer : layer))
      const updatedFrame: FrameData = { ...frame, layers: updatedLayers }
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })
  }, [activeFrame, activeLayer])

  const handleDeleteLayer = useCallback((layerId: string) => {
    if (!activeFrameId) return

    let deleted = false
    setProject((current) => {
      if (!current) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === activeFrameId)
      if (frameIndex === -1) return current

      const frame = current.frames[frameIndex]
      if (frame.layers.length <= 1) {
        setStatusMessage('Cannot delete the last layer')
        return current
      }

      const layerIndex = frame.layers.findIndex((layer) => layer.id === layerId)
      if (layerIndex === -1) return current

      const remainingLayers = frame.layers.filter((layer) => layer.id !== layerId)
      const fallbackIndex = Math.max(layerIndex - 1, 0)
      const nextActiveLayerId = frame.activeLayerId === layerId
        ? remainingLayers[fallbackIndex].id
        : frame.activeLayerId

      const updatedFrame: FrameData = {
        ...frame,
        layers: remainingLayers,
        activeLayerId: nextActiveLayerId,
      }

      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )

      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      deleted = true
      return updatedProject
    })

    if (deleted) {
      setStatusMessage('Deleted layer')
      setRedoStacks((prev) => {
        const key = `${activeFrameId}:${layerId}`
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }, [activeFrameId])

  const requestClearProject = useCallback(() => {
    setIsClearConfirmVisible(true)
  }, [])

  const cancelClearProject = useCallback(() => {
    setIsClearConfirmVisible(false)
  }, [])

  const confirmClearProject = useCallback(async () => {
    await clearProject()
    setProject(null)
    setActiveFrameId(null)
    setStatusMessage('Cleared project')
    setIsClearConfirmVisible(false)
  }, [])

  const handleAddLayer = useCallback(() => {
    setProject((current) => {
      if (!current || !activeFrameId) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === activeFrameId)
      if (frameIndex === -1) return current

      const frame = current.frames[frameIndex]
      const newLayer = createLayer(`Layer ${frame.layers.length + 1}`)
      const updatedFrame: FrameData = {
        ...frame,
        layers: [...frame.layers, newLayer],
        activeLayerId: newLayer.id,
      }
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      setStatusMessage('Added new layer')
      return updatedProject
    })
  }, [activeFrameId])

  const handleSelectLayer = useCallback((layerId: string) => {
    setProject((current) => {
      if (!current || !activeFrameId) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === activeFrameId)
      if (frameIndex === -1) return current
      const frame = current.frames[frameIndex]
      if (frame.activeLayerId === layerId) return current
      const updatedFrame: FrameData = { ...frame, activeLayerId: layerId }
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })
  }, [activeFrameId])

  const applyImageToFrames = useCallback(
    (dataUrl: string, scope: 'frame' | 'all') => {
      setProject((current) => {
        if (!current || !activeFrameId) return current

        const updatedFrames = applyImageLayerToFrames(current.frames, activeFrameId, dataUrl, scope)
        const updatedProject: AnimatorProject = {
          frames: updatedFrames,
          updatedAt: Date.now(),
        }
        void saveProject(updatedProject)
        return updatedProject
      })
      setStatusMessage(scope === 'all' ? 'Image applied to all frames' : 'Image applied to this frame')
    },
    [activeFrameId],
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<VideoFileInputHandle | null>(null)

  const handleAddImageRequest = useCallback((scope: 'frame' | 'all') => {
    if (!fileInputRef.current) return
    pendingImageScopeRef.current = scope
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }, [])

  const handleImageFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please select an image file')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      if (!result) return
      applyImageToFrames(result, pendingImageScopeRef.current)
    }
    reader.readAsDataURL(file)
  }, [applyImageToFrames])

  const handleAddVideo = useCallback(() => {
    videoInputRef.current?.open()
  }, [])

  const handleAutoTrace = useCallback(async () => {
    if (!activeFrame) {
      setStatusMessage('Load or select a frame to Auto Trace')
      return
    }

    const visibleImageLayer = activeFrame.layers.find((layer) => layer.visible && layer.imageUrl)
    const fallbackImageLayer = activeFrame.layers.find((layer) => layer.imageUrl)
    const sourceImageUrl = visibleImageLayer?.imageUrl ?? fallbackImageLayer?.imageUrl ?? activeFrame.imageUrl

    if (!sourceImageUrl) {
      setStatusMessage('Add an image layer or base frame to Auto Trace')
      return
    }

    const targetFrameId = activeFrame.id

    setIsProcessing(true)
    setStatusMessage('Tracing outlines for current frame…')
    try {
      const outlineUrl = await generateOutlineMask(sourceImageUrl)
      setProject((current) => {
        if (!current) return current

        const frameIndex = current.frames.findIndex((frame) => frame.id === targetFrameId)
        if (frameIndex === -1) return current

        const frame = current.frames[frameIndex]
        const duplicateCount = frame.layers.filter((layer) => layer.name.startsWith('Auto Trace')).length
        const outlineLayer = {
          ...createLayer(`Auto Trace ${duplicateCount + 1}`),
          imageUrl: outlineUrl,
          visible: true,
        }

        const updatedFrame: FrameData = {
          ...frame,
          outlineUrl,
          layers: [...frame.layers, outlineLayer],
        }
        const updatedFrames = current.frames.map((frame, idx) =>
          idx === frameIndex ? updatedFrame : frame,
        )
        const updatedProject: AnimatorProject = {
          frames: updatedFrames,
          updatedAt: Date.now(),
        }
        void saveProject(updatedProject)
        return updatedProject
      })
      setStatusMessage('Auto Trace applied to current frame')
    } catch (error) {
      console.error(error)
      setStatusMessage('Auto Trace failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }, [activeFrame])

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setProject((current) => {
      if (!current || !activeFrameId) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === activeFrameId)
      if (frameIndex === -1) return current

      const frame = current.frames[frameIndex]
      const updatedLayers = frame.layers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      )
      const updatedFrame: FrameData = { ...frame, layers: updatedLayers }
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? updatedFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })
  }, [activeFrameId])

  const handleCreateBlankCanvas = useCallback(async () => {
    setIsProcessing(true)
    setStatusMessage('Creating blank canvas…')
    try {
      const frame = createBlankCanvasFrame()
      const newProject: AnimatorProject = {
        frames: [frame],
        updatedAt: Date.now(),
      }
      setProject(newProject)
      setActiveFrameId(frame.id)
      await saveProject(newProject)
      setStatusMessage('Canvas ready • start drawing!')
    } catch (error) {
      console.error(error)
      setStatusMessage('Failed to create canvas')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const handleInsertFrame = useCallback((frameId: string, direction: 'left' | 'right') => {
    let newFrameId: string | null = null
    setProject((current) => {
      if (!current || !current.frames.length) return current

      const sourceIndex = current.frames.findIndex((frame) => frame.id === frameId)
      if (sourceIndex === -1) return current

      const sourceFrame = current.frames[sourceIndex]
      const imagePalette = cloneVisibleImageLayers(current.frames)

      const blankLayer = createLayer('Layer 1')
      const imageLayers = imagePalette.map((layer) => ({
        ...createLayer(layer.name),
        imageUrl: layer.imageUrl,
        visible: false,
      }))
      const newFrame: FrameData = {
        id: uuidv4(),
        frameNumber: sourceIndex,
        imageUrl: sourceFrame.imageUrl,
        layers: [blankLayer, ...imageLayers],
        activeLayerId: blankLayer.id,
        width: sourceFrame.width,
        height: sourceFrame.height,
      }

      newFrameId = newFrame.id
      const insertIndex = direction === 'left' ? sourceIndex : sourceIndex + 1
      const frames = [...current.frames]
      frames.splice(insertIndex, 0, newFrame)
      const renumbered = frames.map((frame, index) => ({
        ...frame,
        frameNumber: index,
      }))
      const updated: AnimatorProject = {
        frames: renumbered,
        updatedAt: Date.now(),
      }
      void saveProject(updated)
      return updated
    })

    if (newFrameId) {
      setActiveFrameId(newFrameId)
    }
  }, [])

  const handleDeleteFrame = useCallback((frameId: string) => {
    setProject((current) => {
      if (!current || current.frames.length <= 1) return current

      const frameIndex = current.frames.findIndex((frame) => frame.id === frameId)
      if (frameIndex === -1) return current

      const frames = current.frames.filter((frame) => frame.id !== frameId)
      const renumbered = frames.map((frame, index) => ({
        ...frame,
        frameNumber: index,
      }))

      const updated: AnimatorProject = {
        frames: renumbered,
        updatedAt: Date.now(),
      }
      void saveProject(updated)

      // If we deleted the active frame, select a nearby one
      if (frameId === activeFrameId) {
        const newActiveIndex = Math.min(frameIndex, frames.length - 1)
        setActiveFrameId(frames[newActiveIndex]?.id || null)
      }

      return updated
    })
  }, [activeFrameId])

  const isBusy = isProcessing || isFfmpegLoading

  const processingSteps = [
    { id: 'ffmpeg', label: 'Preparing ffmpeg runtime', keyword: 'ffmpeg' },
    { id: 'extract', label: 'Extracting frames at 12 FPS', keyword: 'extract' },
    { id: 'load', label: 'Loading frames into canvas memory', keyword: 'loading frames' },
    { id: 'outline', label: 'Generating TensorFlow outlines', keyword: 'outline' },
    { id: 'ready', label: 'Finalizing Flipaclip workspace', keyword: 'ready' },
  ]

  const normalizedStatus = statusMessage.toLowerCase()
  const detectedIndex = processingSteps.findIndex((step) =>
    normalizedStatus.includes(step.keyword),
  )
  const activeProcessingIndex = Math.min(
    Math.max(detectedIndex, 0),
    processingSteps.length - 1,
  )
  const progressPercent = Math.round(
    (activeProcessingIndex / (processingSteps.length - 1 || 1)) * 100,
  )
  const activeStepTitle = processingSteps[activeProcessingIndex]?.label ?? statusMessage

  const hasProject = Boolean(project?.frames.length)

  const brushRail = (
    <BrushRail
      brushColor={brushColor}
      brushSize={brushSize}
      tool={tool}
      onionSkin={onionSkin}
      onToolChange={setTool}
      onBrushSizeChange={setBrushSize}
      onBrushColorChange={setBrushColor}
      onToggleOnionSkin={() => setOnionSkin((value) => !value)}
      onAutoTrace={handleAutoTrace}
    />
  )

  const stageEditorWithTimeline = (
    <StageEditor
      frame={activeFrame}
      prevFrame={onionSkin ? prevFrame : null}
      nextFrame={onionSkin ? nextFrame : null}
      brushColor={brushColor}
      brushSize={brushSize}
      tool={tool}
      onionSkin={onionSkin}
      onCommitStroke={handleCommitStroke}
      onUndoStroke={handleUndoStroke}
      onRedoStroke={handleRedoStroke}
      canUndo={canUndo}
      canRedo={canRedo}
      onAddLayer={handleAddLayer}
      onAddImage={handleAddImageRequest}
      onAddVideo={handleAddVideo}
      onToggleLayerVisibility={handleToggleLayerVisibility}
      onSelectLayer={handleSelectLayer}
      onDeleteLayer={handleDeleteLayer}
      totalFrames={project?.frames.length ?? 0}
    >
      <FrameTimeline
        layout="rail"
        frames={project?.frames ?? []}
        activeFrameId={activeFrameId}
        onSelectFrame={setActiveFrameId}
        onInsertFrame={handleInsertFrame}
        onDeleteFrame={handleDeleteFrame}
      />
    </StageEditor>
  )

  const workspaceContent = (
    <WorkspaceView
      brushRail={brushRail}
      stageContent={<div className="stage-wrapper panel full-stage">{stageEditorWithTimeline}</div>}
    />
  )

  const gettingStartedStage = (
    <StageEditor
      frame={activeFrame}
      prevFrame={onionSkin ? prevFrame : null}
      nextFrame={onionSkin ? nextFrame : null}
      brushColor={brushColor}
      brushSize={brushSize}
      tool={tool}
      onionSkin={onionSkin}
      onCommitStroke={handleCommitStroke}
      onUndoStroke={handleUndoStroke}
      onRedoStroke={handleRedoStroke}
      canUndo={canUndo}
      canRedo={canRedo}
      onAddLayer={handleAddLayer}
      onAddImage={handleAddImageRequest}
      onAddVideo={handleAddVideo}
      onToggleLayerVisibility={handleToggleLayerVisibility}
      onSelectLayer={handleSelectLayer}
      onDeleteLayer={handleDeleteLayer}
    />
  )

  return (
    <div className="app-shell">
      {isRestoring && (
        <ProcessingOverlay
          eyebrow="Welcome back"
          title="Restoring your previous project…"
          progressLabel="Loading frames into memory"
          progressPercent={restoreProgress}
          statusLine="Found saved project in IndexedDB"
        />
      )}

      {isProcessing && (
        <ProcessingOverlay
          eyebrow="Processing reference video"
          title="Building your frame workspace…"
          progressLabel={activeStepTitle}
          progressPercent={progressPercent}
          statusLine={statusMessage}
        />
      )}

      <AppHeader
        statusMessage={statusMessage}
        isBusy={isBusy}
        canClearProject={Boolean(project)}
        onClearProject={requestClearProject}
      />

      {hasProject ? (
        workspaceContent
      ) : (
        <GettingStartedPanels
          isBusy={isBusy}
          onCreateBlankCanvas={handleCreateBlankCanvas}
          videoUploader={
            <VideoUploader
              disabled={isBusy}
              onVideoSelected={handleVideoSelected}
              title="2. Add a reference video"
              description="Drop in MOV, MP4, or WebM footage to extract 12 FPS frames locally."
            />
          }
          stagePreview={gettingStartedStage}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFileChange}
      />
      <VideoFileInput ref={videoInputRef} onVideoSelected={handleVideoSelected} />

      {isClearConfirmVisible && (
        <div className="dialog-overlay">
          <div className="confirm-dialog">
            <h3>Clear project?</h3>
            <p>This will remove all frames and cannot be undone.</p>
            <div className="dialog-actions">
              <button className="ghost" onClick={cancelClearProject}>
                Cancel
              </button>
              <button className="danger" onClick={confirmClearProject}>
                Yes, clear it
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
