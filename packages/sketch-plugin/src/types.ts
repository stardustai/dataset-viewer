// Type declarations for sketch-editor library

declare module 'sketch-editor' {
  export interface SketchEditorConfig {
    debug?: boolean
    offscreenCanvas?: boolean
    tile?: boolean
    deltaTime?: number
    maxTextureSize?: number
    MAX_TEXTURE_SIZE?: number
    MAX_TEXTURE_UNITS?: number
    MAX_VARYING_VECTORS?: number
    treeLvPadding?: number
  }

  export interface ParseOptions {
    canvas: HTMLCanvasElement
    dpi?: number
  }

  export interface PanelOptions {
    maxFontSize?: number
  }

  export interface ListenerOptions {
    enabled?: {
      selectWithMeta?: boolean
      resizeWithAlt?: boolean
    }
    disabled?: {
      select?: boolean
      hover?: boolean
      remove?: boolean
      move?: boolean
      resize?: boolean
      drag?: boolean
      scale?: boolean
      editText?: boolean
      inputText?: boolean
      contextMenu?: boolean
      guides?: boolean
      editGeom?: boolean
      metaFrame?: boolean
    }
  }

  export interface Root {
    destroy(): void
    getCurPage(): any
  }

  export interface Listener {
    destroy(): void
    selected: any[]
    state: any
    emit(event: string, ...args: any[]): void
    on(event: string, callback: (...args: any[]) => void): void
    options: ListenerOptions
  }

  export interface Control {
    initCanvasControl(root: Root, dom: HTMLElement, options?: ListenerOptions): Listener
    initPageList(root: Root, dom: HTMLElement, listener: Listener): any
    initTree(root: Root, dom: HTMLElement, listener: Listener): any
    initPanel(root: Root, dom: HTMLElement, listener: Listener, opts?: PanelOptions): any
    initZoom(root: Root, dom: HTMLElement, listener: Listener): any
    initToolbar(root: Root, dom: HTMLElement, listener: Listener): any
  }

  export interface Style {
    font: {
      registerLocalFonts(): Promise<void>
      registerData(data: any): void
    }
  }

  export const config: SketchEditorConfig
  export const control: Control
  export const style: Style

  export function openAndConvertSketchBuffer(buffer: ArrayBuffer): Promise<any>
  export function openAndConvertPsdBuffer(buffer: ArrayBuffer): Promise<any>
  export function parse(json: any, options: ParseOptions): Root
}
