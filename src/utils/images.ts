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

export const createBlankCanvasFrame = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 405
  const ctx = canvas.getContext('2d')

  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#0f172a')
    gradient.addColorStop(1, '#1a1f3b')
    ctx.fillStyle = gradient
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
