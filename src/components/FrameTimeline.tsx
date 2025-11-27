import type { FrameData } from '../types'

interface FrameTimelineProps {
  frames: FrameData[]
  activeFrameId: string | null
  onSelectFrame: (frameId: string) => void
  layout?: 'grid' | 'rail'
  onInsertFrame?: (frameId: string, direction: 'left' | 'right') => void
  onDeleteFrame?: (frameId: string) => void
}

export function FrameTimeline({
  frames,
  activeFrameId,
  onSelectFrame,
  layout = 'grid',
  onInsertFrame,
  onDeleteFrame,
}: FrameTimelineProps) {
  const isEmpty = frames.length === 0

  if (isEmpty) {
    return null
  }

  return (
    <div className={`timeline-panel ${layout === 'rail' ? 'rail' : ''}`}>
      <div className={layout === 'rail' ? 'timeline-strip rail' : 'timeline-strip'}>
        {frames.map((frame) => (
          <div className="timeline-frame-wrapper" key={frame.id}>
            <button
              className={frame.id === activeFrameId ? 'timeline-frame active' : 'timeline-frame'}
              onClick={() => onSelectFrame(frame.id)}
            >
              <div className="frame-preview">
                {(() => {
                  const layerImage = frame.layers.find((layer) => layer.visible && layer.imageUrl)?.imageUrl
                  const previewSrc = layerImage ?? frame.imageUrl
                  return <img src={previewSrc} alt={`Frame ${frame.frameNumber + 1}`} />
                })()}
                <canvas 
                  className="frame-canvas-overlay"
                  width="80"
                  height="50"
                  ref={(canvas) => {
                    if (canvas && frame.layers) {
                      const ctx = canvas.getContext('2d')
                      if (ctx) {
                        ctx.clearRect(0, 0, 80, 50)
                        const scaleX = 80 / (frame.width || 720)
                        const scaleY = 50 / (frame.height || 405)
                        
                        frame.layers.forEach(layer => {
                          if (layer.visible) {
                            layer.strokes.forEach(stroke => {
                              if (stroke.points.length > 2) {
                                ctx.beginPath()
                                ctx.strokeStyle = stroke.mode === 'eraser' ? 'rgba(0,0,0,0.3)' : stroke.color
                                ctx.lineWidth = (stroke.size * scaleX) * 0.5
                                ctx.lineCap = 'round'
                                ctx.lineJoin = 'round'
                                
                                for (let i = 0; i < stroke.points.length; i += 2) {
                                  const x = stroke.points[i] * scaleX
                                  const y = stroke.points[i + 1] * scaleY
                                  if (i === 0) ctx.moveTo(x, y)
                                  else ctx.lineTo(x, y)
                                }
                                ctx.stroke()
                              }
                            })
                          }
                        })
                      }
                    }
                  }}
                />
              </div>
              <span>#{frame.frameNumber + 1}</span>
            </button>
            {(onInsertFrame || onDeleteFrame) && (
              <div className="frame-insert-controls">
                {onInsertFrame && (
                  <>
                    <button
                      className="insert-btn left"
                      type="button"
                      aria-label={`Add frame before #${frame.frameNumber + 1}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onInsertFrame(frame.id, 'left')
                      }}
                    >
                      +
                    </button>
                    <button
                      className="insert-btn right"
                      type="button"
                      aria-label={`Add frame after #${frame.frameNumber + 1}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onInsertFrame(frame.id, 'right')
                      }}
                    >
                      +
                    </button>
                  </>
                )}
                {onDeleteFrame && frames.length > 1 && (
                  <button
                    className="delete-btn"
                    type="button"
                    aria-label={`Delete frame #${frame.frameNumber + 1}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteFrame(frame.id)
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
