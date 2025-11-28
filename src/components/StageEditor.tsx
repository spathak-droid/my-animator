import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type { KonvaEventObject } from 'konva/lib/Node'
import { v4 as uuidv4 } from 'uuid'
import type { DrawingStroke, DrawingTool, FrameData } from '../types'
import { adjustHexBrightness, hexToRgba } from '../utils/color'

// Global image cache to prevent reloading
const imageCache = new Map<string, HTMLImageElement>()

// Preload images for smooth playback
export function preloadImages(urls: string[]) {
  urls.forEach(url => {
    if (url && !imageCache.has(url)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = url
      img.onload = () => {
        imageCache.set(url, img)
      }
    }
  })
}

const PROTECTED_LAYER_NAME = 'layer 1'

const isProtectedLayer = (name?: string) => (name ?? '').trim().toLowerCase() === PROTECTED_LAYER_NAME

const ImageLayerNode = memo(function ImageLayerNode({ imageUrl }: { imageUrl?: string }) {
  const [image] = useImage(imageUrl ?? '', 'anonymous')
  
  // Try cached image first for instant display
  const cachedImage = imageUrl ? imageCache.get(imageUrl) : null
  const displayImage = cachedImage || image
  
  // Cache the image once loaded
  useEffect(() => {
    if (image && imageUrl && !imageCache.has(imageUrl)) {
      imageCache.set(imageUrl, image)
    }
  }, [image, imageUrl])
  
  if (!displayImage) return null
  return <KonvaImage image={displayImage} listening={false} />
})

interface StageEditorProps {
  frame: FrameData | null
  prevFrame?: FrameData | null
  tool: DrawingTool
  brushColor: string
  brushSize: number
  onionSkin: boolean
  onCommitStroke: (frameId: string, layerId: string, stroke: DrawingStroke) => void
  onGenerateMovie?: () => void
  children?: ReactNode
  totalFrames?: number
  projectName?: string
  onProjectNameChange?: (name: string) => void
  onUndoStroke?: () => void
  onRedoStroke?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onAddLayer?: () => void
  onAddImage?: (scope: 'frame' | 'all') => void
  onAddVideo?: () => void
  onToggleLayerVisibility?: (layerId: string) => void
  onSelectLayer?: (layerId: string) => void
  onDeleteLayer?: (layerId: string, scope?: 'frame' | 'all', layerName?: string) => void
  onClearFrame?: () => void
}

const VisibilityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7zm0 11.5A4.5 4.5 0 1 1 12 8.5a4.5 4.5 0 0 1 0 9z"
      fill="currentColor"
    />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </svg>
)

const VisibilityOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 7a4.99 4.99 0 0 1 4.9 4.02l2.06-2.06C17.63 6.46 14.95 5 12 5c-2.01 0-3.9.62-5.57 1.69L8.1 8.36A5.01 5.01 0 0 1 12 7zm9.19-4.27L18.27 5.65C20.58 7.13 22.39 9.25 23 11.99c-1.28 5.01-6 8.51-11 8.51-2.14 0-4.16-.59-5.92-1.64l-2.27 2.27-1.41-1.41L19.78 1.32l1.41 1.41zM7.72 10.13 5.3 12.55A12.21 12.21 0 0 0 12 17c2.24 0 4.34-.69 6.05-1.86l-2.02-2.02A5 5 0 0 1 12 17a5 5 0 0 1-4.28-6.87z"
      fill="currentColor"
    />
  </svg>
)

const DeleteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      fill="#ff4d4f"
    />
  </svg>
)

const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M11.99 6 4.24 10.5l7.75 4.5 7.76-4.5L11.99 6zm7.76 6.5-1.53-.89-6.23 3.63-6.24-3.63-1.52.89 7.76 4.5 7.76-4.5zm0 3.5-1.53-.88-6.23 3.62-6.24-3.62-1.52.88 7.76 4.5 7.76-4.5z"
      fill="currentColor"
    />
  </svg>
)

type GradientConfig = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  stops: Array<number | string>
}

interface LineAppearance {
  strokeColor?: string
  strokeWidth: number
  tension: number
  globalCompositeOperation: GlobalCompositeOperation
  gradient?: GradientConfig
  opacity?: number
  dash?: number[]
}

const getLineAppearance = (stroke: DrawingStroke): LineAppearance => {
  const base: LineAppearance = {
    strokeColor: stroke.mode === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color,
    strokeWidth: stroke.size,
    tension: 0,
    globalCompositeOperation:
      stroke.mode === 'eraser' ? 'destination-out' : ('source-over' as GlobalCompositeOperation),
    opacity: 1,
  }

  switch (stroke.mode) {
    case 'pencil':
      return {
        ...base,
        strokeColor: hexToRgba(stroke.color, 0.8),
        strokeWidth: stroke.size * 0.9,
        tension: 0.2,
        globalCompositeOperation: 'multiply',
        opacity: 0.9,
        dash: stroke.size <= 2 ? [3, 1.5] : [stroke.size * 1.2, stroke.size * 0.8],
      }
    case 'smooth':
      return { ...base, tension: 0.45 }
    case 'highlight':
      return {
        ...base,
        strokeColor: hexToRgba(stroke.color, 0.35),
        strokeWidth: stroke.size * 1.35,
        globalCompositeOperation: 'lighter',
      }
    case 'gradient':
      return {
        ...base,
        strokeWidth: stroke.size * 1.1,
        gradient: {
          start: { x: -stroke.size, y: -stroke.size },
          end: { x: stroke.size, y: stroke.size },
          stops: [
            0,
            adjustHexBrightness(stroke.color, 0.3),
            1,
            adjustHexBrightness(stroke.color, -0.25),
          ],
        },
      }
    case 'eraser':
    default:
      return base
  }
}

export function StageEditor({
  frame,
  prevFrame,
  tool,
  brushColor,
  brushSize,
  onionSkin,
  onCommitStroke,
  onGenerateMovie,
  children,
  totalFrames = 0,
  projectName = 'Untitled project',
  onProjectNameChange,
  onUndoStroke,
  onRedoStroke,
  canUndo = false,
  canRedo = false,
  onAddLayer,
  onAddImage,
  onAddVideo,
  onToggleLayerVisibility,
  onSelectLayer,
  onDeleteLayer,
  onClearFrame,
}: StageEditorProps) {
  const [draftStroke, setDraftStroke] = useState<DrawingStroke | null>(null)
  const draftStrokeRef = useRef<DrawingStroke | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(1.4)
  const stageContainerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const layerPanelRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false)
  const [isDeleteLayersOpen, setIsDeleteLayersOpen] = useState(false)
  const [deleteScope, setDeleteScope] = useState<'frame' | 'all'>('frame')
  const [layersToDelete, setLayersToDelete] = useState<Set<string>>(new Set())

  const [baseImage] = useImage(frame?.imageUrl ?? '', 'anonymous')
  const [outlineImage] = useImage(frame?.outlineUrl ?? '', 'anonymous')

  const baseWidth = frame?.width ?? 720
  const baseHeight = frame?.height ?? 405
  const stageWidth = Math.round(baseWidth * scale)
  const stageHeight = Math.round(baseHeight * scale)

  useEffect(() => {
    const updateScale = () => {
      const containerWidth = stageContainerRef.current?.clientWidth
      if (!containerWidth) return
      const nextScale = Math.min(2.6, Math.max(1.2, containerWidth / baseWidth))
      setScale(nextScale)
    }

    updateScale()

    if (typeof ResizeObserver !== 'undefined' && stageContainerRef.current) {
      const resizeObserver = new ResizeObserver(() => updateScale())
      resizeObserver.observe(stageContainerRef.current)
      return () => resizeObserver.disconnect()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateScale)
      return () => window.removeEventListener('resize', updateScale)
    }

    return undefined
  }, [baseWidth])

  const updatePointerPosition = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) {
        setCursorPosition(null)
        return null
      }
      setCursorPosition({ x: pointer.x, y: pointer.y })
      return pointer
    },
    [],
  )

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!frame) return
      const pointer = updatePointerPosition(event)
      if (!pointer) return
      const x = pointer.x / scale
      const y = pointer.y / scale
      setIsDrawing(true)
      const nextStroke: DrawingStroke = {
        id: uuidv4(),
        points: [x, y],
        color: brushColor,
        size: brushSize,
        mode: tool,
      }
      draftStrokeRef.current = nextStroke
      setDraftStroke(nextStroke)
    },
    [frame, brushColor, brushSize, tool, scale, updatePointerPosition],
  )

  const handlePointerMove = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const pointer = updatePointerPosition(event)
      if (!pointer) return
      if (!isDrawing) return
      if (!pointer) return
      const x = pointer.x / scale
      const y = pointer.y / scale
      setDraftStroke((current) => {
        if (!current) return current
        const updatedStroke = {
          ...current,
          points: [...current.points, x, y],
        }
        draftStrokeRef.current = updatedStroke
        return updatedStroke
      })
    },
    [isDrawing, scale, updatePointerPosition],
  )

  const finishStroke = useCallback(() => {
    if (!frame) return
    setIsDrawing(false)
    const stroke = draftStrokeRef.current
    draftStrokeRef.current = null
    setDraftStroke(null)
    if (stroke && stroke.points.length > 2) {
      const commit = () => onCommitStroke(frame.id, frame.activeLayerId, stroke)
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        window.requestAnimationFrame(commit)
      } else {
        setTimeout(commit, 0)
      }
    }
  }, [frame, onCommitStroke])

  const handlePointerLeave = useCallback(() => {
    setCursorPosition(null)
    finishStroke()
  }, [finishStroke])

  const strokes = useMemo(() => {
    let index = 0
    return (
      frame?.layers
        .filter((layer) => layer.visible)
        .flatMap((layer) =>
          layer.strokes.map((stroke) => ({
            ...stroke,
            uniqueKey: `${layer.id}-${stroke.id}-${index++}`,
          })),
        ) ?? []
    )
  }, [frame])

  const renderStrokeLine = useCallback(
    (stroke: DrawingStroke, key?: string) => {
      const appearance = getLineAppearance(stroke)
      const jitteredPoints = (seed: number, amplitude: number) =>
        stroke.points.map((value, index) => {
          const pairIndex = Math.floor(index / 2)
          const noise = Math.sin((pairIndex + 1) * (seed + 1) * 12.9898) * 43758.5453
          const normalized = (noise - Math.floor(noise)) - 0.5
          return value + normalized * amplitude
        })
      const gradientProps = appearance.gradient
        ? {
            strokeLinearGradientStartPoint: appearance.gradient.start,
            strokeLinearGradientEndPoint: appearance.gradient.end,
            strokeLinearGradientColorStops: appearance.gradient.stops,
          }
        : {}
      const mainLine = (
        <Line
          key={`${key ?? stroke.id}-primary`}
          points={stroke.points}
          stroke={appearance.strokeColor}
          strokeWidth={appearance.strokeWidth}
          lineJoin="round"
          lineCap="round"
          globalCompositeOperation={appearance.globalCompositeOperation}
          tension={appearance.tension}
          listening={false}
          opacity={appearance.opacity}
          dash={appearance.dash}
          {...gradientProps}
        />
      )

      if (stroke.mode !== 'pencil') {
        return mainLine
      }

      const overlays = [0, 1, 2].map((seed) => (
        <Line
          key={`${key ?? stroke.id}-overlay-${seed}`}
          points={jitteredPoints(seed, appearance.strokeWidth * 0.6)}
          stroke={hexToRgba(stroke.color, 0.35)}
          strokeWidth={Math.max(1, appearance.strokeWidth * 0.6)}
          lineJoin="round"
          lineCap="round"
          globalCompositeOperation="multiply"
          tension={appearance.tension + 0.15}
          listening={false}
          opacity={0.35}
          dash={[2, appearance.strokeWidth * (1.2 + seed * 0.4)]}
        />
      ))

      return <Fragment key={key ?? stroke.id}>{overlays}</Fragment>
    },
    [],
  )

  if (!frame) {
    return (
      <div className="panel stage-placeholder">
        <h2>No frames yet</h2>
        <p>Upload a reference video to start extracting frames.</p>
      </div>
    )
  }

  const handleUndoClick = useCallback(() => {
    if (!canUndo || !onUndoStroke) return
    onUndoStroke()
  }, [canUndo, onUndoStroke])

  const handleRedoClick = useCallback(() => {
    if (!canRedo || !onRedoStroke) return
    onRedoStroke()
  }, [canRedo, onRedoStroke])

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((value) => !value)
  }, [])

  const closeMenu = useCallback(() => setIsMenuOpen(false), [])

  const toggleLayerPanel = useCallback(() => {
    setIsLayerPanelOpen((value) => !value)
  }, [])

  const openDeleteLayersDialog = useCallback(() => {
    setLayersToDelete(new Set())
    setDeleteScope('frame')
    setIsDeleteLayersOpen(true)
    setIsMenuOpen(false)
  }, [])

  const toggleLayerForDeletion = useCallback((layerId: string, layerName?: string) => {
    if (isProtectedLayer(layerName)) return
    setLayersToDelete((prev) => {
      const next = new Set(prev)
      if (next.has(layerId)) {
        next.delete(layerId)
      } else {
        next.add(layerId)
      }
      return next
    })
  }, [])

  const executeDeleteLayers = useCallback(() => {
    if (!onDeleteLayer || layersToDelete.size === 0 || !frame) return

    const targets = frame.layers.filter(layer => layersToDelete.has(layer.id) && !isProtectedLayer(layer.name))
    if (!targets.length) return

    targets.forEach((layer) => {
      onDeleteLayer(layer.id, deleteScope, layer.name)
    })

    setIsDeleteLayersOpen(false)
    setLayersToDelete(new Set())
  }, [onDeleteLayer, layersToDelete, deleteScope, frame])

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleMenuAction = useCallback(
    (action?: () => void) => {
      if (action) {
        action()
      }
      closeMenu()
    },
    [closeMenu],
  )

  useEffect(() => {
    if (!isLayerPanelOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!layerPanelRef.current) return
      if (!layerPanelRef.current.contains(event.target as Node)) {
        setIsLayerPanelOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isLayerPanelOpen])

  return (
    <div className="stage-panel">
      <div className="panel-header">
        <div>
          <input
            type="text"
            className="project-name-input"
            value={projectName}
            onChange={(e) => onProjectNameChange?.(e.target.value)}
            placeholder="Untitled project"
          />
          <p>
            Frame {frame.frameNumber + 1} • Canvas {frame.width} × {frame.height}px
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="stage-toolbar__btn"
            onClick={() => {
              console.log('Download button clicked')
              if (onGenerateMovie) {
                console.log('Calling onGenerateMovie')
                onGenerateMovie()
              } else {
                console.log('onGenerateMovie is not defined')
              }
            }}
            style={{ color: '#ff6b35' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7,10 12,15 17,10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <span className="frame-count">{totalFrames} frames</span>
        </div>
      </div>
      <div className="stage-canvas">
        <div
          ref={stageContainerRef}
          className="stage-canvas-inner"
          style={{ width: '100%', height: stageHeight }}
        >
          <div className="stage-toolbar">
            <button
              type="button"
              className="stage-toolbar__btn"
              onClick={handleUndoClick}
              disabled={!canUndo}
            >
              ↺
            </button>
            <button
              type="button"
              className="stage-toolbar__btn"
              onClick={handleRedoClick}
              disabled={!canRedo}
            >
              ↻
            </button>
          </div>
          <div className="stage-menu" ref={menuRef}>
            <button
              type="button"
              className="stage-toolbar__btn stage-menu__trigger"
              onClick={toggleMenu}
            >
              ⋮
            </button>
            {isMenuOpen && (
              <div className="stage-menu__panel">
                <button
                  type="button"
                  className="stage-menu__item"
                  onClick={() => handleMenuAction(() => onAddImage?.('frame'))}
                >
                  Add image to frame
                </button>
                <button
                  type="button"
                  className="stage-menu__item"
                  onClick={() => handleMenuAction(() => onAddImage?.('all'))}
                >
                  Add image to all frames
                </button>
                <button
                  type="button"
                  className="stage-menu__item"
                  onClick={() => handleMenuAction(onAddVideo)}
                >
                  Add video
                </button>
                <button
                  type="button"
                  className="stage-menu__item"
                  onClick={openDeleteLayersDialog}
                >
                  Remove layers
                </button>
                <button
                  type="button"
                  className="stage-menu__item danger"
                  onClick={() => handleMenuAction(onClearFrame)}
                >
                  Clear frame
                </button>
              </div>
            )}
          </div>
          <Stage
            className="drawing-stage"
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={finishStroke}
            onMouseLeave={handlePointerLeave}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerLeave}
          >
            {/* Always show base image (background) if it exists */}
            {baseImage && (
              <Layer listening={false}>
                <KonvaImage image={baseImage} listening={false} />
              </Layer>
            )}
            {outlineImage && (
              <Layer listening={false} opacity={0.8}>
                <KonvaImage image={outlineImage} listening={false} />
              </Layer>
            )}
            {frame.layers
              .filter((layer) => layer.visible && layer.imageUrl)
              .map((layer) => (
                <Layer key={`${layer.id}-image`} listening={false}>
                  <ImageLayerNode imageUrl={layer.imageUrl} />
                </Layer>
              ))}
            {(strokes.length > 0 || draftStroke) && (
              <Layer listening={false}>
                {strokes.map((stroke) => renderStrokeLine(stroke, stroke.uniqueKey))}
                {draftStroke ? renderStrokeLine(draftStroke, 'draft-stroke') : null}
              </Layer>
            )}
            {/* Onion skin layer - show previous frame content at 40% opacity */}
            {onionSkin && prevFrame && (
              <Layer opacity={0.2} listening={false}>
                {/* Show previous frame background image */}
                {(() => {
                  const visibleImageLayer = prevFrame.layers.find(layer => layer.visible && layer.imageUrl)
                  const imageUrl = visibleImageLayer?.imageUrl || prevFrame.imageUrl
                  return imageUrl && <ImageLayerNode imageUrl={imageUrl} />
                })()}
                {/* Show previous frame strokes */}
                {prevFrame.layers.filter(layer => layer.visible).map((layer, layerIndex) => (
                  layer.strokes.filter(stroke => stroke.mode !== 'eraser').map((stroke, strokeIndex) => (
                    <Line
                      key={`onion-stroke-${layer.id}-${layerIndex}-${stroke.id}-${strokeIndex}`}
                      points={stroke.points}
                      stroke={stroke.color}
                      strokeWidth={stroke.size}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  ))
                ))}
              </Layer>
            )}
          </Stage>
          <div className={`layer-panel ${isLayerPanelOpen ? 'open' : ''}`} ref={layerPanelRef}>
            <button
              type="button"
              className="layer-panel__trigger"
              onClick={toggleLayerPanel}
              aria-expanded={isLayerPanelOpen}
            >
              <LayersIcon />
            </button>
            {isLayerPanelOpen && (
              <div className="layer-panel__dropdown">
                <div className="layer-panel__header">
                  <span className="layer-panel__title">Layers</span>
                  <button
                    type="button"
                    className="layer-panel__add"
                    onClick={onAddLayer}
                    disabled={!onAddLayer}
                  >
                    +
                  </button>
                </div>
                <div className="layer-panel__list">
                  {frame.layers.map((layer) => {
                    const locked = isProtectedLayer(layer.name)
                    const rowClasses = [
                      'layer-row',
                      layer.id === frame.activeLayerId ? 'active' : '',
                      locked ? 'layer-row--locked' : '',
                    ].filter(Boolean).join(' ')

                    return (
                      <div
                        key={layer.id}
                        className={rowClasses}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectLayer?.(layer.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectLayer?.(layer.id)
                          }
                        }}
                      >
                        <button
                          type="button"
                          className={`layer-eye ${layer.visible ? 'on' : 'off'}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleLayerVisibility?.(layer.id)
                          }}
                        >
                          {layer.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                        </button>
                        <span className="layer-name">{layer.name}</span>
                        <button
                          type="button"
                          className={`layer-delete${locked ? ' layer-delete--disabled' : ''}`}
                          disabled={locked}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (locked) return
                            onDeleteLayer?.(layer.id, 'frame', layer.name)
                          }}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          {cursorPosition && (
            <div
              className="brush-cursor"
              style={{
                width: `${brushSize * scale}px`,
                height: `${brushSize * scale}px`,
                left: `${cursorPosition.x}px`,
                top: `${cursorPosition.y}px`,
                marginLeft: `-${(brushSize * scale) / 2}px`,
                marginTop: `-${(brushSize * scale) / 2}px`,
                borderColor: tool === 'eraser' ? '#ffffff' : brushColor,
              }}
            />
          )}
        </div>
      </div>

      {/* Delete Layers Dialog */}
      {isDeleteLayersOpen && (
        <div className="dialog-overlay">
          <div className="confirm-dialog" style={{ maxWidth: '450px' }}>
            <h2>Remove Layers</h2>
            <div className="delete-scope-toggle">
              <label>
                <input
                  type="radio"
                  value="frame"
                  checked={deleteScope === 'frame'}
                  onChange={() => setDeleteScope('frame')}
                />
                This frame only
              </label>
              <label>
                <input
                  type="radio"
                  value="all"
                  checked={deleteScope === 'all'}
                  onChange={() => setDeleteScope('all')}
                />
                All frames
              </label>
            </div>
            <div className="layers-list" style={{ maxHeight: '250px', overflowY: 'auto', margin: '1rem 0' }}>
              {frame?.layers.map((layer) => {
                const isSelected = layersToDelete.has(layer.id)
                const locked = isProtectedLayer(layer.name)
                return (
                  <button
                    key={layer.id}
                    type="button"
                    className={`layer-chip ${isSelected ? 'layer-chip--selected' : ''} ${locked ? 'layer-chip--locked' : ''}`.trim()}
                    onClick={() => {
                      if (locked) return
                      toggleLayerForDeletion(layer.id, layer.name)
                    }}
                    disabled={locked}
                  >
                    <span className="layer-chip__indicator" aria-hidden="true" />
                    <span className="layer-chip__text">
                      {layer.name || 'Layer'}
                      {!layer.visible && <span className="layer-chip__status">hidden</span>}
                    </span>
                    <span className="layer-chip__action">
                      {locked ? 'Locked' : isSelected ? 'Remove' : 'Keep'}
                    </span>
                  </button>
                )
              })}
              {(!frame?.layers || frame.layers.length === 0) && (
                <p style={{ opacity: 0.6 }}>No layers to manage</p>
              )}
            </div>
            <div className="dialog-actions">
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setIsDeleteLayersOpen(false)
                  setLayersToDelete(new Set())
                }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary danger" 
                onClick={executeDeleteLayers}
                disabled={layersToDelete.size === 0}
              >
                Delete {layersToDelete.size} layer{layersToDelete.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
