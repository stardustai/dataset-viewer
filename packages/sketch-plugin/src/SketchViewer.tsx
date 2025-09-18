import { FC, useEffect, useRef, useState } from 'react'
import type { PluginViewerProps } from '@dataset-viewer/sdk'
import { Loader2, AlertCircle } from 'lucide-react'
import sketchEditor from 'sketch-editor'
import 'sketch-editor/style';

sketchEditor.config.tile = true;
sketchEditor.config.maxTextureSize = 4096;

export const SketchViewer: FC<PluginViewerProps> = ({
  file,
  content,
  fileAccessor,
  onError,
  t
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sketchResourcesRef = useRef<{ root?: any; listener?: any; resizeObserver?: ResizeObserver }>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('Initializing...')

  useEffect(() => {
    let isCancelled = false

    const renderSketch = async () => {
      try {
        console.log('🎨 Starting sketch/PSD render...')
        setLoadingStage('Reading file content...')
        setLoadingProgress(10)

        // 1. Get file content
        let buffer: ArrayBuffer
        if (content instanceof ArrayBuffer) {
          buffer = content
        } else if (content) {
          throw new Error(t('sketch.unsupportedFormat'))
        } else {
          buffer = await fileAccessor.getFullContent()
        }

        if (isCancelled) return

        // 2. Detect file type and convert to JSON
        const fileExtension = file.path.toLowerCase().split('.').pop()
        let json: any

        if (fileExtension === 'psd') {
          setLoadingStage('Converting PSD data...')
          setLoadingProgress(30)
          json = await sketchEditor.openAndConvertPsdBuffer(buffer)
        } else {
          setLoadingStage('Converting sketch data...')
          setLoadingProgress(30)
          json = await sketchEditor.openAndConvertSketchBuffer(buffer)
        }

        if (isCancelled) return

        setLoadingStage('Setting up canvas...')
        setLoadingProgress(50)

        // 3. Setup canvas
        const canvas = canvasRef.current
        if (!canvas) throw new Error('Canvas not available')

        const container = canvas.parentElement!
        const { clientWidth, clientHeight } = container
        const dpi = window.devicePixelRatio || 1

        canvas.width = (clientWidth || 800) * dpi
        canvas.height = (clientHeight || 600) * dpi

        setLoadingStage('Parsing design content...')
        setLoadingProgress(70)

        // 4. Parse and render
        const root = sketchEditor.parse(json, { canvas, dpi })
        if (!root) throw new Error('Failed to parse design file')

        setLoadingStage('Initializing controls...')
        setLoadingProgress(85)

        // 5. Setup controls (read-only)
        const listener = sketchEditor.control.initCanvasControl(root, container, {
          disabled: {
            select: true, remove: true, move: true, resize: true,
            editText: true, inputText: true, contextMenu: true,
            guides: true, editGeom: true, metaFrame: true,
            hover: false, drag: false, scale: false
          }
        })

        setLoadingStage('Finalizing...')
        setLoadingProgress(95)

        // 6. Setup resize handling
        const resizeObserver = new ResizeObserver(([entry]) => {
          if (entry && canvas) {
            const { width, height } = entry.contentRect
            canvas.width = width * dpi
            canvas.height = height * dpi
          }
        })
        resizeObserver.observe(container)

        // Store references for cleanup
        sketchResourcesRef.current = { root, listener, resizeObserver }

        if (!isCancelled) {
          setLoadingProgress(100)
          setLoadingStage('Complete')
          setIsLoading(false)
          setError(null)
          console.log(`🎨 ${fileExtension?.toUpperCase()} rendered successfully`)
        }

      } catch (err) {
        console.error(`🎨 ${file.path.split('.').pop()?.toUpperCase()} render failed:`, err)
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : t('sketch.parseFailed'))
          setIsLoading(false)
          setLoadingStage('Error')
          setLoadingProgress(0)
          onError(err instanceof Error ? err.message : t('sketch.parseFailed'))
        }
      }
    }

    renderSketch()

    return () => {
      isCancelled = true
      const { root, listener, resizeObserver } = sketchResourcesRef.current
      try {
        resizeObserver?.disconnect()
        listener?.destroy()
        root?.destroy()
      } catch (err) {
        console.warn('Cleanup error:', err)
      }
      sketchResourcesRef.current = {}
    }
  }, [file.path, content])

  // 渲染错误状态
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-8 w-full h-full">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          {t('sketch.loadFailedTitle') || 'Design File Loading Failed'}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="sketch-viewer w-full h-full relative overflow-hidden bg-gray-50 dark:bg-gray-900">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          imageRendering: 'crisp-edges'
        }}
      />

      {/* 增强的加载指示器 - 参考 CAD 插件样式 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
          <div className="flex flex-col items-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-96 max-w-sm">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2 text-center">
              {t('sketch.loading') || 'Loading design file...'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center h-10 flex items-center justify-center">
              {loadingStage}
            </p>

            {/* 进度条 */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {loadingProgress}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

SketchViewer.displayName = 'SketchViewer'
