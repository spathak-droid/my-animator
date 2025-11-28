import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './App.css'

import { VideoUploader } from './components/VideoUploader'
import { FrameTimeline } from './components/FrameTimeline'
import { StageEditor, preloadImages } from './components/StageEditor'
import { AppHeader } from './components/AppHeader'
import { BrushRail } from './components/BrushRail'
import { VideoFileInput, type VideoFileInputHandle } from './components/VideoFileInput'
import { ProcessingOverlay } from './components/ProcessingOverlay'
import { WorkspaceView } from './components/WorkspaceView'
import { GettingStartedPanels } from './components/GettingStartedPanels'
import { MovieGenerator } from './components/MovieGenerator'
import { useFfmpeg, fetchFile } from './hooks/useFfmpeg'
import { applyImageLayerToFrames, cloneVisibleImageLayers, createLayer } from './utils/project'
import { composeFrames, createBlankCanvasFrame, createBackgroundImage } from './utils/images'
import { loadImageElement } from './utils/imageHelpers'
import { generateOutlineMask } from './utils/outline'
import logo from './assets/logo.png'
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
  const [isStageFullscreen, setIsStageFullscreen] = useState(false)

  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [isClearConfirmVisible, setIsClearConfirmVisible] = useState(false)
  const [redoStacks, setRedoStacks] = useState<Record<string, DrawingStroke[]>>({})
  const [autoTraceProgress, setAutoTraceProgress] = useState({ current: 0, total: 0 })
  const [restorePrompt, setRestorePrompt] = useState<AnimatorProject | null>(null)
  const [backgroundColorPrompt, setBackgroundColorPrompt] = useState(false)
  const [showMovieGenerator, setShowMovieGenerator] = useState(false)
  const autoTraceCancelledRef = useRef(false)

  useEffect(() => {
    const updateFavicon = () => {
      let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
      if (!favicon) {
        favicon = document.createElement('link')
        favicon.rel = 'icon'
        document.head.appendChild(favicon)
      }
      favicon.href = logo
      favicon.type = 'image/png'
    }
    updateFavicon()
  }, [])

  useEffect(() => {
    console.log('showMovieGenerator changed to:', showMovieGenerator)
  }, [showMovieGenerator])
  
  // Preload all frame images for smooth playback
  useEffect(() => {
    if (project?.frames) {
      const urls: string[] = []
      project.frames.forEach(frame => {
        if (frame.imageUrl) urls.push(frame.imageUrl)
        if (frame.outlineUrl) urls.push(frame.outlineUrl)
        frame.layers.forEach(layer => {
          if (layer.imageUrl) urls.push(layer.imageUrl)
        })
      })
      preloadImages(urls)
    }
  }, [project?.frames])
  
  const pendingImageScopeRef = useRef<'frame' | 'all'>('frame')

  useEffect(() => {
    const checkForSavedProject = async () => {
      const saved = await loadProject()
      if (saved && saved.frames.length) {
        setRestorePrompt(saved)
      }
    }
    checkForSavedProject()
  }, [])

  const handleRestoreProject = useCallback(async () => {
    if (!restorePrompt) return
    setRestorePrompt(null)
    setIsRestoring(true)
    setRestoreProgress(0)
    // Animate progress smoothly (at least 2s, cap at 4s)
    const baseDuration = restorePrompt.frames.length * 5
    const duration = Math.max(2000, Math.min(baseDuration, 4000))
    const steps = 20
    const stepTime = duration / steps
    for (let i = 1; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, stepTime))
      setRestoreProgress(Math.round((i / steps) * 100))
    }
    setProject(restorePrompt)
    setActiveFrameId(restorePrompt.frames[0].id)
    setStatusMessage(`Restored "${restorePrompt.name || 'Untitled project'}" from IndexedDB`)
    setIsRestoring(false)
  }, [restorePrompt])

  const handleDeclineRestore = useCallback(() => {
    setRestorePrompt(null)
    setStatusMessage('Starting fresh')
  }, [])

  const handleProjectNameChange = useCallback((name: string) => {
    setProject((current) => {
      if (!current) return current
      const updatedProject: AnimatorProject = {
        ...current,
        name,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })
  }, [])

  const handleClearFrame = useCallback(() => {
    if (!activeFrameId) return
    setProject((current) => {
      if (!current) return current
      const frameIndex = current.frames.findIndex((frame) => frame.id === activeFrameId)
      if (frameIndex === -1) return current

      // Use saved background color, or try to detect it from the current frame
      let backgroundColor = current.backgroundColor
      
      // If project doesn't have backgroundColor saved, we need to detect it
      if (!backgroundColor) {
        // Since we can't easily detect the actual color from the imageUrl data URL,
        // we'll check if there are any existing frames with the same background
        // and use a default that matches common selections
        backgroundColor = '#0f172a' // Default to dark blue
        
        // If the user has drawn on this frame, we should preserve the original background
        // by not changing it - just create a new frame with the same imageUrl
        if (current.frames[frameIndex].imageUrl) {
          // Keep the same background by using the existing imageUrl
          const freshFrame: FrameData = {
            ...createBlankCanvasFrame(backgroundColor),
            id: activeFrameId,
            frameNumber: current.frames[frameIndex].frameNumber,
            imageUrl: current.frames[frameIndex].imageUrl, // Preserve existing background
            width: current.frames[frameIndex].width,
            height: current.frames[frameIndex].height,
          }

          const updatedFrames = current.frames.map((existing, idx) =>
            idx === frameIndex ? freshFrame : existing,
          )
          const updatedProject: AnimatorProject = {
            ...current,
            frames: updatedFrames,
            updatedAt: Date.now(),
          }
          void saveProject(updatedProject)
          return updatedProject
        }
      }

      // Create a completely fresh frame with the background color
      const freshFrame: FrameData = {
        ...createBlankCanvasFrame(backgroundColor),
        id: activeFrameId,
        frameNumber: current.frames[frameIndex].frameNumber,
      }

      // Update project to save the background color for future clears
      const updatedFrames = current.frames.map((existing, idx) =>
        idx === frameIndex ? freshFrame : existing,
      )
      const updatedProject: AnimatorProject = {
        ...current,
        backgroundColor,
        frames: updatedFrames,
        updatedAt: Date.now(),
      }
      void saveProject(updatedProject)
      return updatedProject
    })
    setStatusMessage('Frame cleared to blank canvas')
  }, [activeFrameId])

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

  const handleGenerateMovie = useCallback(() => {
    console.log('handleGenerateMovie called')
    console.log('Project:', project)
    console.log('Project frames length:', project?.frames.length)
    console.log('Setting showMovieGenerator to true')
    setShowMovieGenerator(true)
    console.log('showMovieGenerator should now be true')
  }, [project])

  const handleMovieGenerate = useCallback(async (layerSettings: Record<string, boolean>) => {
    if (!project || project.frames.length === 0) {
      setStatusMessage('No frames to generate movie')
      return
    }

    setShowMovieGenerator(false)
    setIsProcessing(true)
    setStatusMessage('Generating movie...')

    try {
      const ffmpegInstance = await loadFfmpeg()
      
      // Create frames with specified layer visibility and save to ffmpeg
      const frameFileNames: string[] = []
      
      for (let i = 0; i < project.frames.length; i++) {
        const frame = project.frames[i]
        
        // Create canvas with frame content
        const canvas = document.createElement('canvas')
        canvas.width = frame.width || 720
        canvas.height = frame.height || 405
        const ctx = canvas.getContext('2d')
        
        if (ctx) {
          // Clear canvas with white background
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          
          // Draw layers based on layer name settings
          // Layers are drawn in order (first layer is bottom, last is top)
          for (const layer of frame.layers) {
            const isVisible = layerSettings[layer.name] ?? layer.visible
            if (!isVisible) {
              console.log(`Skipping layer "${layer.name}" (not visible in settings)`)
              continue
            }
            
            // Draw layer image if exists (this includes Video Layer and Auto Trace)
            if (layer.imageUrl) {
              console.log(`Drawing layer "${layer.name}" with imageUrl (${layer.imageUrl.substring(0, 50)}...)`)
              const layerImg = await loadImageElement(layer.imageUrl)
              
              // For Auto Trace layers, we need to extract the alpha channel as black lines
              // because the image stores outlines in the alpha channel with white RGB
              if (layer.name.startsWith('Auto Trace')) {
                // Create a temporary canvas to process the alpha channel
                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = layerImg.width
                tempCanvas.height = layerImg.height
                const tempCtx = tempCanvas.getContext('2d')
                if (tempCtx) {
                  tempCtx.drawImage(layerImg, 0, 0)
                  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
                  const data = imageData.data
                  // Convert alpha channel to black lines on white background
                  for (let p = 0; p < data.length; p += 4) {
                    const alpha = data[p + 3] / 255
                    // Invert: low alpha = black outline, high alpha = white background
                    const gray = Math.round(alpha * 255)
                    data[p] = gray     // R
                    data[p + 1] = gray // G
                    data[p + 2] = gray // B
                    data[p + 3] = 255  // Full opacity
                  }
                  tempCtx.putImageData(imageData, 0, 0)
                  ctx.drawImage(tempCanvas, 0, 0)
                }
              } else {
                ctx.drawImage(layerImg, 0, 0)
              }
            } else {
              console.log(`Layer "${layer.name}" has no imageUrl, checking strokes...`)
            }
            
            // Draw layer strokes
            for (const stroke of layer.strokes) {
              ctx.save()
              ctx.lineJoin = 'round'
              ctx.lineCap = 'round'
              ctx.lineWidth = stroke.size
              if (stroke.mode === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out'
                ctx.strokeStyle = 'rgba(0,0,0,1)'
              } else {
                ctx.globalCompositeOperation = 'source-over'
                ctx.strokeStyle = stroke.color
              }
              ctx.beginPath()
              const [firstX, firstY, ...rest] = stroke.points
              ctx.moveTo(firstX, firstY)
              for (let j = 0; j < rest.length; j += 2) {
                ctx.lineTo(rest[j], rest[j + 1])
              }
              ctx.stroke()
              ctx.restore()
            }
          }
        }
        
        // Save frame to ffmpeg
        const frameFileName = `frame_${i.toString().padStart(4, '0')}.png`
        const frameDataUrl = canvas.toDataURL('image/png')
        const frameResponse = await fetch(frameDataUrl)
        const frameBuffer = await frameResponse.arrayBuffer()
        await ffmpegInstance.writeFile(frameFileName, new Uint8Array(frameBuffer))
        frameFileNames.push(frameFileName)
      }
      
      // Generate video using ffmpeg
      // Use vf scale to ensure even dimensions (required for h264/yuv420p)
      const outputFileName = `movie_${Date.now()}.mp4`
      const tempVideoName = 'temp_video.mp4'
      
      // First create video without audio
      await ffmpegInstance.exec([
        '-framerate', '12',
        '-i', 'frame_%04d.png',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        tempVideoName
      ])
      
      // If we have audio, merge it with the video
      let finalVideoName = tempVideoName
      if (project.audioUrl) {
        try {
          // Convert audio data URL to file
          const audioResponse = await fetch(project.audioUrl)
          const audioBuffer = await audioResponse.arrayBuffer()
          await ffmpegInstance.writeFile('audio.mp3', new Uint8Array(audioBuffer))
          
          // Merge video and audio
          await ffmpegInstance.exec([
            '-i', tempVideoName,
            '-i', 'audio.mp3',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',  // End when shortest stream ends
            outputFileName
          ])
          
          finalVideoName = outputFileName
          await ffmpegInstance.deleteFile('audio.mp3')
          await ffmpegInstance.deleteFile(tempVideoName)
        } catch (audioError) {
          console.log('Failed to add audio, exporting video only:', audioError)
          finalVideoName = tempVideoName
        }
      }
      
      // Get the video data
      const videoData = await ffmpegInstance.readFile(finalVideoName) as Uint8Array
      console.log('Video data size:', videoData.length, 'bytes')
      
      if (videoData.length === 0) {
        throw new Error('FFmpeg produced empty video file')
      }
      
      const videoDataCopy = new Uint8Array(videoData)
      const videoBlob = new Blob([videoDataCopy], { type: 'video/mp4' })
      const videoUrl = URL.createObjectURL(videoBlob)
      
      // Download the video
      const a = document.createElement('a')
      a.href = videoUrl
      a.download = outputFileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(videoUrl)
      
      // Clean up frame files
      for (const fileName of frameFileNames) {
        await ffmpegInstance.deleteFile(fileName)
      }
      try {
        await ffmpegInstance.deleteFile(finalVideoName)
      } catch { /* ignore cleanup errors */ }
      
      setStatusMessage('Movie generated successfully!')
    } catch (error) {
      console.error('Error generating movie:', error)
      setStatusMessage('Failed to generate movie')
    } finally {
      setIsProcessing(false)
    }
  }, [project])

  const handleVideoSelected = useCallback(
    async (file: File) => {
      setIsProcessing(true)
      setStatusMessage('Preparing ffmpeg…')
      try {
        const ffmpegInstance = await loadFfmpeg()
        const inputName = `input-${Date.now()}.${file.name.split('.').pop() || 'mp4'}`
        await ffmpegInstance.writeFile(inputName, await fetchFile(file))
        
        // Extract audio first
        setStatusMessage('Extracting audio…')
        let audioUrl: string | undefined
        try {
          await ffmpegInstance.exec([
            '-i', inputName,
            '-vn',           // No video
            '-acodec', 'libmp3lame',
            '-q:a', '4',     // Quality (0-9, lower is better)
            'audio.mp3',
          ])
          const audioData = await ffmpegInstance.readFile('audio.mp3') as Uint8Array
          if (audioData.length > 0) {
            const audioBlob = new Blob([new Uint8Array(audioData)], { type: 'audio/mp3' })
            audioUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(audioBlob)
            })
            console.log('Audio extracted:', audioData.length, 'bytes')
          }
          await ffmpegInstance.deleteFile('audio.mp3')
        } catch (audioError) {
          console.log('No audio track found or extraction failed:', audioError)
        }
        
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
        
        // Use existing project's background color, or default to white
        const backgroundColor = project?.backgroundColor || '#ffffff'
        
        frames.forEach((frame) => {
          const videoLayer = {
            ...createLayer('Video Layer 1'),
            imageUrl: frame.imageUrl,
            visible: true,
          }
          frame.layers = [videoLayer, ...frame.layers]
          // Set background image so it shows when video layer is hidden
          frame.imageUrl = createBackgroundImage(backgroundColor, frame.width, frame.height)
        })

        const newProject: AnimatorProject = {
          name: project?.name || 'Untitled project',
          backgroundColor,
          frames,
          audioUrl,
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
    [loadFfmpeg, project?.backgroundColor, project?.name],
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

  const handleDeleteLayer = useCallback((layerId: string, scope: 'frame' | 'all' = 'frame', layerName?: string) => {
    let deleted = false
    setProject((current) => {
      if (!current) return current

      if (scope === 'all') {
        // Delete from all frames
        let removedAny = false
        const updatedFrames = current.frames.map((frame) => {
          // Skip frames with only one layer
          if (frame.layers.length <= 1) return frame

          const layerIndex = frame.layers.findIndex((layer) =>
            layer.id === layerId || (layerName ? layer.name === layerName : false),
          )

          if (layerIndex === -1) return frame

          removedAny = true
          const targetLayerId = frame.layers[layerIndex].id
          const remainingLayers = frame.layers.filter((_, idx) => idx !== layerIndex)
          const fallbackIndex = Math.max(layerIndex - 1, 0)
          const nextActiveLayerId = frame.activeLayerId === targetLayerId
            ? remainingLayers[fallbackIndex]?.id ?? remainingLayers[0]?.id ?? null
            : frame.activeLayerId

          return {
            ...frame,
            layers: remainingLayers,
            activeLayerId: nextActiveLayerId ?? undefined,
          }
        })

        if (!removedAny) {
          setStatusMessage('No matching layers found to delete')
          return current
        }
        const updatedProject: AnimatorProject = {
          ...current,
          frames: updatedFrames,
          updatedAt: Date.now(),
        }
        void saveProject(updatedProject)
        deleted = true
        return updatedProject
      } else {
        // Delete from current frame only
        if (!activeFrameId) return current
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
      }
    })

    if (deleted) {
      setStatusMessage(`Deleted layer${scope === 'all' ? ' from all frames' : ''}`)
      if (scope === 'frame') {
        setRedoStacks((prev) => {
          const key = `${activeFrameId}:${layerId}`
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
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
    if (!project || project.frames.length === 0) {
      setStatusMessage('Load frames to Auto Trace')
      return
    }

    autoTraceCancelledRef.current = false
    setIsProcessing(true)
    setAutoTraceProgress({ current: 0, total: project.frames.length })
    setStatusMessage('Tracing outlines for all frames…')
    try {
      const updatedFrames: FrameData[] = []
      for (let i = 0; i < project.frames.length; i++) {
        if (autoTraceCancelledRef.current) {
          setStatusMessage('Auto Trace cancelled')
          break
        }

        const frame = project.frames[i]
        setAutoTraceProgress({ current: i + 1, total: project.frames.length })
        setStatusMessage(`Tracing frame ${i + 1} of ${project.frames.length}…`)

        // Find source image - only from actual image layers, not base frame image
        const visibleImageLayer = frame.layers.find((layer) => layer.visible && layer.imageUrl)
        const sourceImageUrl = visibleImageLayer?.imageUrl

        if (!sourceImageUrl) {
          updatedFrames.push(frame)
          continue
        }

        const outlineUrl = await generateOutlineMask(sourceImageUrl)
        console.log('Auto trace using white background with black outlines')
        
        // Check if this frame already has an auto trace layer to avoid duplicates
        const hasExistingAutoTrace = frame.layers.some((layer) => layer.name.startsWith('Auto Trace'))
        if (hasExistingAutoTrace) {
          // Skip adding auto trace if one already exists
          updatedFrames.push(frame)
          continue
        }
        
        const outlineLayer = {
          ...createLayer('Auto Trace 1'),
          imageUrl: outlineUrl,
          visible: true,
        }

        updatedFrames.push({
          ...frame,
          layers: [...frame.layers, outlineLayer],
        })
      }

      if (!autoTraceCancelledRef.current && updatedFrames.length > 0) {
        const updatedProject: AnimatorProject = {
          frames: updatedFrames,
          updatedAt: Date.now(),
        }
        setProject(updatedProject)
        void saveProject(updatedProject)
        setStatusMessage(`Auto Trace applied to ${updatedFrames.length} frames`)
      }
    } catch (error) {
      console.error(error)
      setStatusMessage('Auto Trace failed. Please try again.')
    } finally {
      setIsProcessing(false)
      setAutoTraceProgress({ current: 0, total: 0 })
    }
  }, [project])

  const handleCancelAutoTrace = useCallback(() => {
    autoTraceCancelledRef.current = true
  }, [])

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

  const handleCreateBlankCanvas = useCallback(async (backgroundColor?: string) => {
    setIsProcessing(true)
    setStatusMessage('Creating blank canvas…')
    try {
      const frame = createBlankCanvasFrame(backgroundColor)
      const newProject: AnimatorProject = {
        name: 'Untitled project',
        backgroundColor: backgroundColor || '#0f172a',
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

  const handleCreateBlankCanvasWithColor = useCallback(() => {
    setBackgroundColorPrompt(true)
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

  useEffect(() => {
    if (!hasProject && isStageFullscreen) {
      setIsStageFullscreen(false)
    }
  }, [hasProject, isStageFullscreen])

  useEffect(() => {
    const className = 'app-fullscreen'
    document.body.classList.toggle(className, isStageFullscreen)
    return () => {
      document.body.classList.remove(className)
    }
  }, [isStageFullscreen])

  const handleToggleFullscreen = useCallback(() => {
    setIsStageFullscreen((value) => !value)
  }, [])

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
      brushColor={brushColor}
      brushSize={brushSize}
      tool={tool}
      onionSkin={onionSkin}
      onCommitStroke={handleCommitStroke}
      onGenerateMovie={handleGenerateMovie}
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
      projectName={project?.name ?? 'Untitled project'}
      onProjectNameChange={handleProjectNameChange}
      toolPanel={brushRail}
      isFullscreen={isStageFullscreen}
      onToggleFullscreen={handleToggleFullscreen}
      onClearFrame={handleClearFrame}
    >
      <FrameTimeline
        layout="rail"
        frames={project?.frames ?? []}
        activeFrameId={activeFrameId}
        onSelectFrame={setActiveFrameId}
        onInsertFrame={handleInsertFrame}
        onDeleteFrame={handleDeleteFrame}
        audioUrl={project?.audioUrl}
        fps={12}
      />
    </StageEditor>
  )

  const workspaceContent = (
    <WorkspaceView
      brushRail={isStageFullscreen ? null : brushRail}
      stageContent={<div className="stage-wrapper panel full-stage">{stageEditorWithTimeline}</div>}
    />
  )

  const gettingStartedStage = (
    <StageEditor
      frame={activeFrame}
      prevFrame={onionSkin ? prevFrame : null}
      brushColor={brushColor}
      brushSize={brushSize}
      tool={tool}
      onionSkin={onionSkin}
      onCommitStroke={handleCommitStroke}
      onGenerateMovie={handleGenerateMovie}
      projectName={project?.name ?? 'Untitled project'}
      onProjectNameChange={handleProjectNameChange}
      onClearFrame={handleClearFrame}
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
      {restorePrompt && (
        <div className="dialog-overlay">
          <div className="confirm-dialog">
            <h2>Welcome back!</h2>
            <p>Found project "{restorePrompt.name || 'Untitled project'}" with {restorePrompt.frames.length} frames. Would you like to restore it?</p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={handleDeclineRestore}>
                Start Fresh
              </button>
              <button className="btn-primary" onClick={handleRestoreProject}>
                Restore Project
              </button>
            </div>
          </div>
        </div>
      )}

      {backgroundColorPrompt && (
        <div className="dialog-overlay">
          <div className="confirm-dialog">
            <h2>Choose Background Color</h2>
            <p>Select a background color for your canvas:</p>
            <div className="color-options">
              <button
                className="color-option"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#0f172a')
                }}
                style={{ background: '#0f172a' }}
              />
              <button
                className="color-option"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#ffffff')
                }}
                style={{ background: '#ffffff' }}
              />
              <button
                className="color-option"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#1e293b')
                }}
                style={{ background: '#1e293b' }}
              />
              <button
                className="color-option"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#fef3c7')
                }}
                style={{ background: '#fef3c7' }}
              />
              <button
                className="color-option"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#dbeafe')
                }}
                style={{ background: '#dbeafe' }}
              />
              <button
                className="color-option gradient"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#0f172a,#1a1f3b')
                }}
                style={{ background: 'linear-gradient(135deg, #0f172a, #1a1f3b)' }}
              />
              <button
                className="color-option gradient"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#ff6b6b,#4ecdc4')
                }}
                style={{ background: 'linear-gradient(135deg, #ff6b6b, #4ecdc4)' }}
              />
              <button
                className="color-option gradient"
                onClick={() => {
                  setBackgroundColorPrompt(false)
                  void handleCreateBlankCanvas('#667eea,#764ba2')
                }}
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn-primary" onClick={() => setBackgroundColorPrompt(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
          eyebrow={autoTraceProgress.total > 0 ? 'Auto Trace' : 'Processing reference video'}
          title={autoTraceProgress.total > 0 ? 'Generating outlines…' : 'Building your frame workspace…'}
          progressLabel={autoTraceProgress.total > 0 ? `Frame ${autoTraceProgress.current} of ${autoTraceProgress.total}` : activeStepTitle}
          progressPercent={autoTraceProgress.total > 0 ? Math.round((autoTraceProgress.current / autoTraceProgress.total) * 100) : progressPercent}
          statusLine={statusMessage}
          onCancel={autoTraceProgress.total > 0 ? handleCancelAutoTrace : undefined}
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
          onCreateBlankCanvas={handleCreateBlankCanvasWithColor}
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

      {showMovieGenerator && project && (() => {
        console.log('Render check - showMovieGenerator:', showMovieGenerator, 'project:', !!project)
        return true
      })() && (
        <MovieGenerator
          frames={project.frames}
          onClose={() => setShowMovieGenerator(false)}
          onGenerate={handleMovieGenerate}
        />
      )}

    </div>
  )
}

export default App
