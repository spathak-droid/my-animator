import { useCallback, useEffect, useRef, useState } from 'react'
import type { FrameData } from '../types'

interface FrameTimelineProps {
  frames: FrameData[]
  activeFrameId: string | null
  onSelectFrame: (frameId: string) => void
  layout?: 'grid' | 'rail'
  onInsertFrame?: (frameId: string, direction: 'left' | 'right') => void
  onDeleteFrame?: (frameId: string) => void
  audioUrl?: string
  fps?: number
}

export function FrameTimeline({
  frames,
  activeFrameId,
  onSelectFrame,
  layout = 'grid',
  onInsertFrame,
  onDeleteFrame,
  audioUrl,
  fps = 12,
}: FrameTimelineProps) {
  const isEmpty = frames.length === 0
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const startFrameRef = useRef<number>(0)
  const lastFrameIndexRef = useRef<number>(-1)

  // Get current frame index
  const currentFrameIndex = frames.findIndex(f => f.id === activeFrameId)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp
    }

    const elapsed = timestamp - startTimeRef.current
    const frameDuration = 1000 / fps
    const frameOffset = Math.floor(elapsed / frameDuration)
    const targetFrameIndex = (startFrameRef.current + frameOffset) % frames.length

    // Only update if frame actually changed to avoid redundant re-renders
    if (targetFrameIndex !== lastFrameIndexRef.current && frames[targetFrameIndex]) {
      lastFrameIndexRef.current = targetFrameIndex
      onSelectFrame(frames[targetFrameIndex].id)
    }

    // Loop back to start when we've gone through all frames
    if (targetFrameIndex >= frames.length - 1 && frameOffset > 0) {
      // Reset for loop
      startTimeRef.current = timestamp
      startFrameRef.current = 0
      lastFrameIndexRef.current = -1
      if (audioRef.current) {
        audioRef.current.currentTime = 0
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [frames, fps, onSelectFrame])

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      // Stop
      setIsPlaying(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    } else {
      // Play
      setIsPlaying(true)
      startTimeRef.current = 0
      startFrameRef.current = currentFrameIndex >= 0 ? currentFrameIndex : 0
      
      // Start audio from corresponding position
      if (audioRef.current && audioUrl) {
        const startTime = startFrameRef.current / fps
        audioRef.current.currentTime = startTime
        audioRef.current.play().catch(console.error)
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
  }, [isPlaying, currentFrameIndex, fps, audioUrl, animate])

  // Stop playing when frames change significantly
  useEffect(() => {
    if (isPlaying && frames.length === 0) {
      setIsPlaying(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [frames.length, isPlaying])

  if (isEmpty) {
    return null
  }

  return (
    <div className={`timeline-panel ${layout === 'rail' ? 'rail' : ''}`}>
      {/* Play/Pause button */}
      <button
        type="button"
        className={`timeline-play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={handlePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          style={{ display: 'none' }}
        />
      )}
      
      <div className={layout === 'rail' ? 'timeline-strip rail' : 'timeline-strip'}>
        {frames.map((frame) => (
          <div className="timeline-frame-wrapper" key={frame.id}>
            <button
              className={frame.id === activeFrameId ? 'timeline-frame active' : 'timeline-frame'}
              onClick={() => onSelectFrame(frame.id)}
            >
              <div className="frame-preview">
                {(() => {
                  // Find first visible layer with an image, or fall back to base image
                  const layerImage = frame.layers.find((layer) => layer.visible && layer.imageUrl)?.imageUrl
                  const previewSrc = layerImage || frame.imageUrl
                  // Only render img if we have a valid source
                  if (previewSrc) {
                    return <img src={previewSrc} alt={`Frame ${frame.frameNumber + 1}`} />
                  }
                  // Show placeholder for frames with no visible images
                  return (
                    <div 
                      className="frame-placeholder" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        background: '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: 'rgba(255,255,255,0.4)'
                      }}
                    >
                      No layers
                    </div>
                  )
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
                              // Skip eraser strokes in frame previews
                              if (stroke.mode === 'eraser') return
                              
                              if (stroke.points.length > 2) {
                                ctx.beginPath()
                                ctx.strokeStyle = stroke.color
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
