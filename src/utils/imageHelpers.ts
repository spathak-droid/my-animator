import type { DrawingLayer, DrawingStroke, FrameData } from '../types'

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to convert blob to data URL'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

export const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

const drawStrokeOnContext = (
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
) => {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = stroke.size
  if (stroke.mode === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
  }

  ctx.beginPath()
  const [firstX, firstY, ...rest] = stroke.points
  ctx.moveTo(firstX, firstY)
  for (let i = 0; i < rest.length; i += 2) {
    const x = rest[i]
    const y = rest[i + 1]
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

export const renderFrameComposite = async (frame: FrameData): Promise<string> => {
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2d context unavailable')
  }

  const base = await loadImageElement(frame.imageUrl)
  ctx.drawImage(base, 0, 0)

  if (frame.outlineUrl) {
    const outlineImg = await loadImageElement(frame.outlineUrl)
    ctx.globalAlpha = 0.9
    ctx.drawImage(outlineImg, 0, 0)
    ctx.globalAlpha = 1
  }

  frame.layers
    .filter((layer) => layer.visible)
    .forEach((layer: DrawingLayer) => {
      layer.strokes.forEach((stroke) => drawStrokeOnContext(ctx, stroke))
    })

  return canvas.toDataURL('image/png')
}
