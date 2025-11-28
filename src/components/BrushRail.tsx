import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
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

const tools: { label: string; value: DrawingTool }[] = [
  { label: 'Pencil', value: 'pencil' },
  { label: 'Smooth', value: 'smooth' },
  { label: 'Highlight', value: 'highlight' },
  { label: 'Gradient', value: 'gradient' },
  { label: 'Eraser', value: 'eraser' },
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
  return (
    <div className="brush-rail">
      {tools.map(({ label, value }) => (
        <button key={value} className={tool === value ? 'active' : ''} onClick={() => onToolChange(value)}>
          {label}
        </button>
      ))}
      <label className="rail-label" htmlFor="rail-brush-size">
        Size
      </label>
      <input
        id="rail-brush-size"
        type="range"
        min={1}
        max={40}
        value={brushSize}
        onChange={(event) => onBrushSizeChange(Number(event.target.value))}
      />
      <label className="rail-label" htmlFor="rail-brush-color">
        Color
      </label>
      <input
        id="rail-brush-color"
        type="color"
        value={brushColor}
        onChange={(event) => onBrushColorChange(event.target.value)}
      />
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
        startIcon={<AutoAwesomeIcon />}
        onClick={onAutoTrace}
        sx={{ mt: 1, borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}
      >
        Auto Trace
      </Button>
    </div>
  )
}
