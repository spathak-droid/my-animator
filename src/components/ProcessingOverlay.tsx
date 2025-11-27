interface ProcessingOverlayProps {
  eyebrow: string
  title: string
  progressLabel: string
  progressPercent: number
  statusLine: string
}

export function ProcessingOverlay({
  eyebrow,
  title,
  progressLabel,
  progressPercent,
  statusLine,
}: ProcessingOverlayProps) {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(progressPercent)))

  return (
    <div className="processing-overlay" role="status" aria-live="polite">
      <div className="processing-modal">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <div className="progress-header">
          <span>{progressLabel}</span>
          <span>{clampedPercent}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${clampedPercent}%` }} />
        </div>
        <p className="lede status-line">{statusLine}</p>
      </div>
    </div>
  )
}
