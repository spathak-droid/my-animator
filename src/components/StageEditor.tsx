import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type { KonvaEventObject } from 'konva/lib/Node'
import { v4 as uuidv4 } from 'uuid'
import type { DrawingStroke, DrawingTool, FrameData } from '../types'
import { adjustHexBrightness, hexToRgba } from '../utils/color'

function ImageLayerNode({ imageUrl }: { imageUrl?: string }) {
  const [image] = useImage(imageUrl ?? '', 'anonymous')
  if (!image) return null
  return <KonvaImage image={image} listening={false} />
}

interface StageEditorProps {
  frame: FrameData | null
  prevFrame?: FrameData | null
  nextFrame?: FrameData | null
  tool: DrawingTool
  brushColor: string
  brushSize: number
  onionSkin: boolean
  onCommitStroke: (frameId: string, layerId: string, stroke: DrawingStroke) => void
  children?: ReactNode
  totalFrames?: number
  onUndoStroke?: () => void
  onRedoStroke?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onAddLayer?: () => void
  onAddImage?: (scope: 'frame' | 'all') => void
  onAddVideo?: () => void
  onToggleLayerVisibility?: (layerId: string) => void
  onSelectLayer?: (layerId: string) => void
  onDeleteLayer?: (layerId: string) => void
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
  nextFrame,
  children,
  tool,
  brushColor,
  brushSize,
  onionSkin,
  onCommitStroke,
  totalFrames = 0,
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
}: StageEditorProps) {
  const [draftStroke, setDraftStroke] = useState<DrawingStroke | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null)
  const [scale, setScale] = useState(1.4)
  const stageContainerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const layerPanelRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false)

  const [baseImage] = useImage(frame?.imageUrl ?? '', 'anonymous')
  const [outlineImage] = useImage(frame?.outlineUrl ?? '', 'anonymous')
  const [prevImage] = useImage(
    onionSkin && prevFrame ? prevFrame.imageUrl : '',
    'anonymous',
  )
  const [nextImage] = useImage(
    onionSkin && nextFrame ? nextFrame.imageUrl : '',
    'anonymous',
  )

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
      setDraftStroke({
        id: uuidv4(),
        points: [x, y],
        color: brushColor,
        size: brushSize,
        mode: tool,
      })
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
        return {
          ...current,
          points: [...current.points, x, y],
        }
      })
    },
    [isDrawing, scale, updatePointerPosition],
  )

  const finishStroke = useCallback(() => {
    if (!frame) return
    setIsDrawing(false)
    setDraftStroke((current) => {
      if (current && current.points.length > 2) {
        // Defer the commit to avoid setState during render
        setTimeout(() => onCommitStroke(frame.id, frame.activeLayerId, current), 0)
      }
      return null
    })
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
          <h2>Drawing workspace</h2>
          <p>
            Frame {frame.frameNumber + 1} • Canvas {frame.width} × {frame.height}px
          </p>
        </div>
        <span className="frame-count">{totalFrames} frames</span>
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
            {onionSkin && prevImage && (
              <Layer opacity={0.15} listening={false}>
                <KonvaImage image={prevImage} listening={false} />
              </Layer>
            )}
            {onionSkin && nextImage && (
              <Layer opacity={0.15} listening={false}>
                <KonvaImage image={nextImage} listening={false} />
              </Layer>
            )}
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
                  {frame.layers.map((layer) => (
                    <div
                      key={layer.id}
                      className={`layer-row ${layer.id === frame.activeLayerId ? 'active' : ''}`}
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
                        className="layer-delete"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeleteLayer?.(layer.id)
                        }}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  ))}
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
      {children}
    </div>
  )
}
