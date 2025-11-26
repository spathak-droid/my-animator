declare module '@ffmpeg/ffmpeg' {
  export interface LoggerMessage {
    type: string
    message: string
  }

  export interface ProgressEvent {
    ratio: number
  }

  export interface LoadOptions {
    coreURL: string
    wasmURL: string
    workerURL?: string
  }

  export interface FileSystemAPI {
    (action: 'writeFile', path: string, data: Uint8Array | ArrayBuffer): void
    (action: 'readFile', path: string): Uint8Array
    (action: 'unlink', path: string): void
    (action: 'readdir', path: string): string[]
  }

  export class FFmpeg {
    loaded: boolean
    load: (options: LoadOptions) => Promise<void>
    run: (...args: string[]) => Promise<void>
    FS: FileSystemAPI
    exit: () => Promise<void>
    on: (event: 'log' | 'progress', handler: (payload: LoggerMessage | ProgressEvent) => void) => void
  }

  export const fetchFile: (
    input:
      | string
      | URL
      | File
      | Blob
      | ArrayBuffer
      | Uint8Array
      | Buffer
  ) => Promise<Uint8Array>
}
