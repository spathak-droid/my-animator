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
      <button className="rail-toggle" onClick={onToggleOnionSkin}>
        Onion skin: {onionSkin ? 'On' : 'Off'}
      </button>
    </div>
  )
}
