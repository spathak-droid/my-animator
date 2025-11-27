import type { ReactNode } from 'react'

interface WorkspaceViewProps {
  brushRail: ReactNode
  stageContent: ReactNode
}

export function WorkspaceView({ brushRail, stageContent }: WorkspaceViewProps) {
  return (
    <div className="workspace-full">
      {brushRail}
      <div className="canvas-stack">{stageContent}</div>
    </div>
  )
}
