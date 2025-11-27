import type { ReactNode } from 'react'

interface GettingStartedPanelsProps {
  isBusy: boolean
  onCreateBlankCanvas: () => void
  videoUploader: ReactNode
  stagePreview: ReactNode
}

export function GettingStartedPanels({
  isBusy,
  onCreateBlankCanvas,
  videoUploader,
  stagePreview,
}: GettingStartedPanelsProps) {
  return (
    <main className="main-grid">
      <section className="left-column">
        <div className="panel">
          <div className="panel-header">
            <h2>1. Open a blank canvas</h2>
            <p>Start sketching immediately with a fresh 720×405 stage.</p>
          </div>
          <div className="panel-body intro-panel">
            <button className="primary" onClick={onCreateBlankCanvas} disabled={isBusy}>
              {isBusy ? 'Preparing…' : 'Launch canvas'}
            </button>
            <p className="subtext">You can import video layers later for tracing.</p>
          </div>
        </div>

        {videoUploader}
      </section>

      <section className="right-column">{stagePreview}</section>
    </main>
  )
}
