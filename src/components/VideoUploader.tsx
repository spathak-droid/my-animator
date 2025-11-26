import { useRef } from 'react'
import type { ChangeEvent } from 'react'

interface VideoUploaderProps {
  disabled?: boolean
  onVideoSelected: (file: File) => void
}

export function VideoUploader({ disabled, onVideoSelected }: VideoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onVideoSelected(file)
      // reset value so the same file can be re-selected later
      event.target.value = ''
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>1. Upload reference video</h2>
        <p>Supported formats: mp4, mov, webm. Processing stays entirely offline.</p>
      </div>
      <div className="panel-body upload-panel">
        <button
          className="primary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {disabled ? 'Processing…' : 'Select video'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
