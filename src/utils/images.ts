import { v4 as uuidv4 } from 'uuid'
import { blobToDataUrl, loadImageElement } from './imageHelpers'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { FrameData } from '../types'
import { createLayer } from './project'

export const composeFrames = async (
  fileNames: string[],
  ffmpegInstance: FFmpeg,
): Promise<FrameData[]> => {
  const frames: FrameData[] = []

  for (const [index, name] of fileNames.entries()) {
    const frameFile = (await ffmpegInstance.readFile(name, 'binary')) as Uint8Array
    const frameCopy = new Uint8Array(frameFile.length)
    frameCopy.set(frameFile)
    const blob = new Blob([frameCopy], { type: 'image/png' })
    const imageUrl = await blobToDataUrl(blob)
    const image = await loadImageElement(imageUrl)
    const baseLayer = createLayer('Layer 1')

    frames.push({
      id: uuidv4(),
      frameNumber: index,
      imageUrl,
      layers: [baseLayer],
      activeLayerId: baseLayer.id,
      width: image.width,
      height: image.height,
    })

    await ffmpegInstance.deleteFile(name)
  }

  return frames
}

export const createBackgroundImage = (
  backgroundColor: string = '#0f172a',
  width: number = 720,
  height: number = 405
): string => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    // Check if it's a gradient (contains comma) or solid color
    if (backgroundColor.includes(',')) {
      // Parse gradient colors
      const colors = backgroundColor.split(',')
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color.trim())
      })
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = backgroundColor
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  return canvas.toDataURL('image/png')
}

export const createBlankCanvasFrame = (backgroundColor: string = '#0f172a') => {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 405
  const ctx = canvas.getContext('2d')

  if (ctx) {
    // Check if it's a gradient (contains comma) or solid color
    if (backgroundColor.includes(',')) {
      // Parse gradient colors
      const colors = backgroundColor.split(',')
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1), color.trim())
      })
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = backgroundColor
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const imageUrl = canvas.toDataURL('image/png')
  const baseLayer = createLayer('Layer 1')

  const frame: FrameData = {
    id: uuidv4(),
    frameNumber: 0,
    imageUrl,
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    width: canvas.width,
    height: canvas.height,
  }

  return frame
}
