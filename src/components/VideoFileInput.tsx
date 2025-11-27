import { forwardRef, useImperativeHandle, useRef } from 'react'

export interface VideoFileInputHandle {
  open: () => void
}

interface VideoFileInputProps {
  accept?: string
  onVideoSelected: (file: File) => void | Promise<void>
}

export const VideoFileInput = forwardRef<VideoFileInputHandle, VideoFileInputProps>(
  ({ accept = 'video/*', onVideoSelected }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null)

    useImperativeHandle(ref, () => ({
      open: () => {
        inputRef.current?.click()
      },
    }))

    return (
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void onVideoSelected(file)
          event.target.value = ''
        }}
      />
    )
  },
)

VideoFileInput.displayName = 'VideoFileInput'
