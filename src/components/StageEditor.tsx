import { useCallback, useMemo, useState } from 'react'
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type { KonvaEventObject } from 'konva/lib/Node'
import { v4 as uuidv4 } from 'uuid'
import type { DrawingStroke, DrawingTool, FrameData } from '../types'

interface StageEditorProps {
  frame: FrameData | null
  prevFrame?: FrameData | null
  nextFrame?: FrameData | null
  tool: DrawingTool
  brushColor: string
  brushSize: number
  onionSkin: boolean
  onCommitStroke: (frameId: string, layerId: string, stroke: DrawingStroke) => void
}

const toStrokeColor = (stroke: DrawingStroke) =>
  stroke.mode === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color

export function StageEditor({
  frame,
  prevFrame,
  nextFrame,
  tool,
  brushColor,
  brushSize,
  onionSkin,
  onCommitStroke,
}: StageEditorProps) {
  const [draftStroke, setDraftStroke] = useState<DrawingStroke | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

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

  const stageWidth = frame?.width ?? 720
  const stageHeight = frame?.height ?? 405

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!frame) return
      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) return
      setIsDrawing(true)
      setDraftStroke({
        id: uuidv4(),
        points: [pointer.x, pointer.y],
        color: brushColor,
        size: brushSize,
        mode: tool,
      })
    },
    [frame, brushColor, brushSize, tool],
  )

  const handlePointerMove = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawing) return
      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) return
      setDraftStroke((current) => {
        if (!current) return current
        return {
          ...current,
          points: [...current.points, pointer.x, pointer.y],
        }
      })
    },
    [isDrawing],
  )

  const finishStroke = useCallback(() => {
    if (!frame) return
    setIsDrawing(false)
    setDraftStroke((current) => {
      if (current && current.points.length > 2) {
        onCommitStroke(frame.id, frame.activeLayerId, current)
      }
      return null
    })
  }, [frame, onCommitStroke])

  const strokes = useMemo(
    () =>
      frame?.layers
        .filter((layer) => layer.visible)
        .flatMap((layer) =>
          layer.strokes.map((stroke) => ({ ...stroke, layerId: layer.id })),
        ) ?? [],
    [frame],
  )

  if (!frame) {
    return (
      <div className="panel stage-placeholder">
        <h2>No frames yet</h2>
        <p>Upload a reference video to start extracting frames.</p>
      </div>
    )
  }

  return (
    <div className="stage-panel">
      <div className="panel-header">
        <div>
          <h2>Drawing workspace</h2>
          <p>
            Frame {frame.frameNumber + 1} • Canvas {frame.width} × {frame.height}px
          </p>
        </div>
      </div>
      <div className="stage-canvas">
        <Stage
          width={stageWidth}
          height={stageHeight}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={finishStroke}
          onMouseLeave={finishStroke}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={finishStroke}
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
          {strokes.map((stroke) => (
            <Layer key={stroke.id} listening={false}>
              <Line
                points={stroke.points}
                stroke={toStrokeColor(stroke)}
                strokeWidth={stroke.size}
                lineJoin="round"
                lineCap="round"
                globalCompositeOperation=
                  {stroke.mode === 'eraser' ? 'destination-out' : 'source-over'}
                tension={0}
                listening={false}
              />
            </Layer>
          ))}
          {draftStroke && (
            <Layer listening={false}>
              <Line
                points={draftStroke.points}
                stroke={toStrokeColor(draftStroke)}
                strokeWidth={draftStroke.size}
                lineJoin="round"
                lineCap="round"
                globalCompositeOperation=
                  {draftStroke.mode === 'eraser' ? 'destination-out' : 'source-over'}
                tension={0}
                listening={false}
              />
            </Layer>
          )}
        </Stage>
      </div>
    </div>
  )
}
