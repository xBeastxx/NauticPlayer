declare module 'node-mpv' {
  export default class mpv {
    constructor(options?: any, args?: string[])
    start(): Promise<void>
    quit(): Promise<void>
    load(file: string): Promise<void>
    play(): Promise<void>
    pause(): Promise<void>
    togglePause(): Promise<void>
    seek(seconds: number, mode?: string): Promise<void>
    volume(level: number): Promise<void>
    mute(state: boolean): Promise<void>
    on(event: string, callback: (...args: any[]) => void): void
  }
}
