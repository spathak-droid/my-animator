import { v4 as uuidv4 } from 'uuid'
import type { DrawingLayer, FrameData } from '../types'

export const createLayer = (name: string): DrawingLayer => ({
  id: uuidv4(),
  name,
  visible: true,
  strokes: [],
})

export const cloneVisibleImageLayers = (frames: FrameData[]): DrawingLayer[] => {
  const seen = new Map<string, DrawingLayer>()
  frames.forEach((frame) => {
    frame.layers.forEach((layer) => {
      if (layer.imageUrl && !seen.has(layer.imageUrl)) {
        seen.set(layer.imageUrl, layer)
      }
    })
  })
  return Array.from(seen.values())
}

export const applyImageLayerToFrames = (
  frames: FrameData[],
  targetFrameId: string,
  dataUrl: string,
  scope: 'frame' | 'all',
): FrameData[] => {
  return frames.map((frame) => {
    const shouldEnable = scope === 'all' || frame.id === targetFrameId
    let hasImageLayer = false

    const updatedLayers = frame.layers.map((layer) => {
      if (layer.imageUrl === dataUrl) {
        hasImageLayer = true
        return { ...layer, visible: shouldEnable }
      }
      return layer
    })

    if (hasImageLayer) {
      return { ...frame, layers: updatedLayers }
    }

    const imageLayer: DrawingLayer = {
      ...createLayer(`Image ${frame.layers.length + 1}`),
      imageUrl: dataUrl,
      visible: shouldEnable,
    }

    return {
      ...frame,
      layers: [...updatedLayers, imageLayer],
    }
  })
}
