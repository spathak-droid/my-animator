interface AppHeaderProps {
  statusMessage: string
  isBusy: boolean
  canClearProject: boolean
  onClearProject: () => void
}

export function AppHeader({ statusMessage, isBusy, canClearProject, onClearProject }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Flipaclip-style web animator</p>
        <h1>Trace, stylize, and animate fully in the browser.</h1>
        <p className="lede">
          Import a reference video, auto-generate outlines with TensorFlow.js, draw in layers, and manage a 12 FPS
          timeline using Konva.
        </p>
      </div>
      <div className="header-actions">
        <button className="ghost" onClick={onClearProject} disabled={!canClearProject}>
          Clear project
        </button>
        <span className={`status-chip ${isBusy ? 'busy' : ''}`}>{statusMessage}</span>
      </div>
    </header>
  )
}
