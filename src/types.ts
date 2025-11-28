export type DrawingTool = 'pencil' | 'smooth' | 'highlight' | 'gradient' | 'eraser'

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
  imageUrl?: string
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
  name?: string
  backgroundColor?: string
  frames: FrameData[]
  audioUrl?: string  // Extracted audio from video as data URL
  updatedAt: number
}

export interface ExportProgress {
  message: string
  ratio: number
}

export type ExportKind = 'mp4' | 'gif' | 'png-sequence'
