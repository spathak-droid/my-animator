import * as tf from '@tensorflow/tfjs'
import type { Tensor2D, Tensor3D, Tensor4D } from '@tensorflow/tfjs'
import { loadImageElement } from './imageHelpers'

let tfReady: Promise<void> | null = null

const ensureTfReady = () => {
  if (!tfReady) {
    tfReady = tf.ready()
  }
  return tfReady
}

export const generateOutlineMask = async (imageUrl: string): Promise<string> => {
  await ensureTfReady()
  const image = await loadImageElement(imageUrl)

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to derive 2d context for outline generation')
  }
  ctx.drawImage(image, 0, 0)

  const outlineTensor = tf.tidy(() => {
    const pixels = tf.browser.fromPixels(canvas) as Tensor3D
    const normalizedPixels = pixels.toFloat().div(tf.scalar(255)) as Tensor3D
    const grayscale = normalizedPixels.mean(2) as Tensor2D
    const grayscale3d = grayscale.expandDims(-1) as Tensor3D
    const grayscale4d = grayscale3d.expandDims(0) as Tensor4D

    const blurKernel = tf.tensor4d(
      [
        0.0625, 0.125, 0.0625,
        0.125, 0.25, 0.125,
        0.0625, 0.125, 0.0625,
      ],
      [3, 3, 1, 1],
    )

    const sobelXKernel = tf.tensor4d(
      [
        -1, 0, 1,
        -2, 0, 2,
        -1, 0, 1,
      ],
      [3, 3, 1, 1],
    )
    const sobelYKernel = tf.tensor4d(
      [
        -1, -2, -1,
         0,  0,  0,
         1,  2,  1,
      ],
      [3, 3, 1, 1],
    )

    const blurred = tf.conv2d(grayscale4d, blurKernel, 1, 'same') as Tensor4D
    const gradX = tf.conv2d(blurred, sobelXKernel, 1, 'same') as Tensor4D
    const gradY = tf.conv2d(blurred, sobelYKernel, 1, 'same') as Tensor4D
    const magnitude = tf.sqrt(tf.add(tf.square(gradX), tf.square(gradY))) as Tensor4D
    const normalized = tf.div(
      magnitude,
      tf.add(tf.max(magnitude), tf.scalar(1e-5)),
    ) as Tensor4D

    const sharpenKernel = tf.tensor4d(
      [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0,
      ],
      [3, 3, 1, 1],
    )
    const sharpened = tf.conv2d(normalized, sharpenKernel, 1, 'same') as Tensor4D
    const clipped = sharpened.clipByValue(0, 1) as Tensor4D
    const squeezed = clipped.squeeze([0, 3]) as Tensor2D
    return squeezed
  })

  const rgba = tf.tidy(() => {
    const alpha = outlineTensor.mul(0.95)
    return tf.stack([alpha, alpha, alpha, alpha], 2) as Tensor3D
  })

  const pixelData = await tf.browser.toPixels(rgba)
  outlineTensor.dispose()
  rgba.dispose()

  const outlineCanvas = document.createElement('canvas')
  outlineCanvas.width = canvas.width
  outlineCanvas.height = canvas.height
  const outlineCtx = outlineCanvas.getContext('2d')
  if (!outlineCtx) {
    throw new Error('Unable to paint outline result')
  }
  const clamped = new Uint8ClampedArray(pixelData)
  const imageData = new ImageData(clamped, canvas.width, canvas.height)
  outlineCtx.putImageData(imageData, 0, 0)

  return outlineCanvas.toDataURL('image/png')
}
