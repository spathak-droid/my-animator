import { useCallback, useMemo, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

type FFmpegInstance = FFmpeg

interface UseFfmpegResult {
  ffmpeg: FFmpegInstance | null
  isReady: boolean
  isLoading: boolean
  loadFfmpeg: () => Promise<FFmpegInstance>
}

export function useFfmpeg(): UseFfmpegResult {
  const ffmpegRef = useRef<FFmpegInstance | null>(null)
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
    const baseURL = `${import.meta.env.BASE_URL ?? '/'}ffmpeg/umd`

    setIsLoading(true)
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm',
        ),
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
