export type DrawingTool = 'brush' | 'eraser'

export interface DrawingStroke {
  id: string
  points: number[]
  color: string
  size: number
  mode: DrawingTool
}

export interface DrawingLayer {
  id: string
  name: string
  visible: boolean
  strokes: DrawingStroke[]
}

export interface FrameData {
  id: string
  frameNumber: number
  imageUrl: string
  outlineUrl?: string
  compositedUrl?: string
  layers: DrawingLayer[]
  activeLayerId: string
  width: number
  height: number
}

export interface AnimatorProject {
  frames: FrameData[]
  updatedAt: number
}

export interface ExportProgress {
  message: string
  ratio: number
}

export type ExportKind = 'mp4' | 'gif' | 'png-sequence'
