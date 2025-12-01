import { type JSX, useCallback, useRef } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CreateIcon from '@mui/icons-material/Create'
import GestureIcon from '@mui/icons-material/Gesture'
import HighlightIcon from '@mui/icons-material/Highlight'
import GradientIcon from '@mui/icons-material/Gradient'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import Button from '@mui/material/Button'
import type { DrawingTool } from '../types'

interface BrushRailProps {
  tool: DrawingTool
  brushSize: number
  brushColor: string
  onionSkin: boolean
  onToolChange: (tool: DrawingTool) => void
  onBrushSizeChange: (size: number) => void
  onBrushColorChange: (color: string) => void
  onToggleOnionSkin: () => void
  onAutoTrace: () => void
}

const tools: { label: string; value: DrawingTool; icon: JSX.Element }[] = [
  { label: 'Pencil', value: 'pencil', icon: <CreateIcon fontSize="small" /> },
  { label: 'Smooth', value: 'smooth', icon: <GestureIcon fontSize="small" /> },
  { label: 'Highlight', value: 'highlight', icon: <HighlightIcon fontSize="small" /> },
  { label: 'Gradient', value: 'gradient', icon: <GradientIcon fontSize="small" /> },
  { label: 'Eraser', value: 'eraser', icon: <AutoFixHighIcon fontSize="small" /> },
]

export function BrushRail({
  tool,
  brushSize,
  brushColor,
  onionSkin,
  onToolChange,
  onBrushSizeChange,
  onBrushColorChange,
  onToggleOnionSkin,
  onAutoTrace,
}: BrushRailProps) {
  const dragState = useRef<{ startY: number; startSize: number } | null>(null)

  const clampSize = useCallback((size: number) => Math.min(40, Math.max(1, size)), [])

  const updateSizeFromPointer = useCallback(
    (clientY: number) => {
      if (!dragState.current) return
      const delta = dragState.current.startY - clientY
      const nextSize = clampSize(dragState.current.startSize + Math.round(delta / 2))
      onBrushSizeChange(nextSize)
    },
    [clampSize, onBrushSizeChange],
  )

  const handleSizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragState.current = { startY: event.clientY, startSize: brushSize }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [brushSize],
  )

  const handleSizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return
      event.preventDefault()
      updateSizeFromPointer(event.clientY)
    },
    [updateSizeFromPointer],
  )

  const handleSizePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    dragState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return (
    <div className="brush-rail">
      {tools.map(({ label, value, icon }) => (
        <button
          key={value}
          className={tool === value ? 'active' : ''}
          onClick={() => onToolChange(value)}
          aria-label={label}
          title={label}
        >
          {icon}
          <span className="brush-tool-label">{label}</span>
        </button>
      ))}
      <div className="brush-size-block">
        <div className="brush-size-inline">
          <span className="rail-label" id="rail-brush-size-label">
            Size
          </span>
          <div
            className="brush-size-knob"
            onPointerDown={handleSizePointerDown}
            onPointerMove={handleSizePointerMove}
            onPointerUp={handleSizePointerEnd}
            onPointerLeave={handleSizePointerEnd}
            onPointerCancel={handleSizePointerEnd}
            role="slider"
            aria-valuemin={1}
            aria-valuemax={40}
            aria-valuenow={brushSize}
            aria-labelledby="rail-brush-size-label"
          >
            <span>{brushSize}px</span>
          </div>
        </div>
      </div>
      <div className="brush-color-block">
        <span className="rail-label" id="rail-brush-color-label">
          Color
        </span>
        <div className="brush-color-swatch">
          <input
            id="rail-brush-color"
            type="color"
            aria-labelledby="rail-brush-color-label"
            value={brushColor}
            onChange={(event) => onBrushColorChange(event.target.value)}
          />
        </div>
      </div>
      <div className="onion-skin-toggle">
        <label className="toggle-label">
          <span>Onion</span>
          <div className="toggle-switch" onClick={onToggleOnionSkin}>
            <div className={`toggle-slider ${onionSkin ? 'active' : ''}`}></div>
          </div>
        </label>
      </div>
      <Button
        variant="contained"
        color="primary"
        startIcon={<AutoAwesomeIcon className="auto-trace-icon" />}
        onClick={onAutoTrace}
        className="auto-trace-btn"
        title="Auto Trace visible layers"
        aria-label="Auto Trace visible layers"
        sx={{ mt: 1, borderRadius: '12px', textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' }}
      >
        <span className="visually-hidden">Auto Trace</span>
        <span className="auto-trace-tooltip">Auto Trace</span>
      </Button>
    </div>
  )
}
