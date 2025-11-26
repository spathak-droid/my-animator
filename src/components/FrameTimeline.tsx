import type { FrameData } from '../types'

interface FrameTimelineProps {
  frames: FrameData[]
  activeFrameId: string | null
  onSelectFrame: (frameId: string) => void
}

export function FrameTimeline({ frames, activeFrameId, onSelectFrame }: FrameTimelineProps) {
  if (!frames.length) {
    return (
      <div className="panel timeline-panel empty">
        <p>Timeline will appear after you extract frames.</p>
      </div>
    )
  }

  return (
    <div className="panel timeline-panel">
      <div className="panel-header">
        <h3>Timeline</h3>
        <p>{frames.length} frames • 12 FPS</p>
      </div>
      <div className="timeline-strip">
        {frames.map((frame) => (
          <button
            key={frame.id}
            className={frame.id === activeFrameId ? 'timeline-frame active' : 'timeline-frame'}
            onClick={() => onSelectFrame(frame.id)}
          >
            <img src={frame.imageUrl} alt={`Frame ${frame.frameNumber + 1}`} />
            <span>#{frame.frameNumber + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
