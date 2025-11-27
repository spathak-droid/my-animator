import { useCallback, useMemo, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

interface UseFfmpegResult {
  ffmpeg: FFmpeg | null
  isReady: boolean
  isLoading: boolean
  loadFfmpeg: () => Promise<FFmpeg>
}

export function useFfmpeg(): UseFfmpegResult {
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadFfmpeg = useCallback(async () => {
    if (ffmpegRef.current?.loaded) {
      setIsReady(true)
      return ffmpegRef.current
    }

    if (!ffmpegRef.current) {
      ffmpegRef.current = new FFmpeg()
    }

    const ffmpeg = ffmpegRef.current
    const assetsBase = `${import.meta.env.BASE_URL ?? '/'}ffmpeg/esm`
    const coreBase = `${assetsBase}/core`

    setIsLoading(true)
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(
          `${coreBase}/ffmpeg-core.wasm`,
          'application/wasm',
        ),
        workerURL: await toBlobURL(`${assetsBase}/worker.js`, 'text/javascript'),
      })
      setIsReady(true)
    } finally {
      setIsLoading(false)
    }

    return ffmpeg
  }, [])

  return useMemo(
    () => ({
      ffmpeg: ffmpegRef.current,
      isReady,
      isLoading,
      loadFfmpeg,
    }),
    [isReady, isLoading, loadFfmpeg],
  )
}

export { fetchFile }
