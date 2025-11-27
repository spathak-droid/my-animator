declare module '@ffmpeg/ffmpeg' {
  export interface LoggerMessage {
    type: string
    message: string
  }

  export interface ProgressEvent {
    ratio: number
    time?: number
  }

  export interface LoadOptions {
    coreURL: string
    wasmURL: string
    workerURL?: string
  }

  export interface ListDirNode {
    name: string
    isDir: boolean
  }

  export class FFmpeg {
    loaded: boolean
    load: (options?: LoadOptions) => Promise<void>
    exec: (args: string[], timeout?: number) => Promise<number>
    ffprobe: (args: string[], timeout?: number) => Promise<number>
    writeFile: (path: string, data: Uint8Array | string) => Promise<void>
    readFile: (path: string, encoding?: 'binary' | 'utf8') => Promise<Uint8Array | string>
    deleteFile: (path: string) => Promise<void>
    rename: (oldPath: string, newPath: string) => Promise<void>
    createDir: (path: string) => Promise<void>
    listDir: (path: string) => Promise<ListDirNode[]>
    deleteDir: (path: string) => Promise<void>
    on: (
      event: 'log' | 'progress',
      handler: (payload: LoggerMessage | ProgressEvent) => void,
    ) => void
    terminate: () => void
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
