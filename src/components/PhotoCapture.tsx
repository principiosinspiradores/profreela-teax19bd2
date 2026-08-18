import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, RefreshCw, Upload, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Capture a job evidence photo using the device camera, with a gallery upload
 * fallback.
 *
 * Strategy:
 *  1. Try `getUserMedia` for a live camera preview (rear camera preferred via
 *     `facingMode: 'environment'`). The pro captures a frame onto a <canvas>.
 *  2. If the camera is unavailable / permission denied, fall back to a hidden
 *     `<input type="file" accept="image/*" capture="environment">` which on
 *     mobile opens the native camera app, and on desktop opens the file picker.
 *
 * Props:
 *  - title / description: copy shown in the capture card.
 *  - onCapture: called with the captured File once the pro confirms.
 *  - autoConfirm: when true, the captured frame is confirmed automatically
 *    (used when the parent wants to drive confirmation itself).
 */
export function PhotoCapture({
  title = 'Tirar foto',
  description,
  onCapture,
  autoConfirm = false,
  className,
}: {
  title?: string
  description?: string
  onCapture: (file: File) => void
  autoConfirm?: boolean
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'live' | 'unavailable'>(
    'idle',
  )
  const [submitting, setSubmitting] = useState(false)

  // Start the live camera preview on mount.
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('unavailable')
        return
      }
      setCameraStatus('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraStatus('live')
      } catch {
        if (!cancelled) setCameraStatus('unavailable')
      }
    }
    start()
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `job-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        applyFile(file)
      },
      'image/jpeg',
      0.85,
    )
  }

  const applyFile = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setCapturedFile(file)
    setPreviewUrl(url)
    stopCamera()
    if (autoConfirm) {
      confirm(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) applyFile(file)
    // reset so picking the same file again re-fires onChange
    e.target.value = ''
  }

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setCapturedFile(null)
    setCameraStatus('idle')
    // Restart the camera.
    ;(async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('unavailable')
        return
      }
      setCameraStatus('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraStatus('live')
      } catch {
        setCameraStatus('unavailable')
      }
    })()
  }

  const confirm = (fileArg?: File) => {
    const file = fileArg || capturedFile
    if (!file) return
    setSubmitting(true)
    // onCapture may be sync or async; wrap to reset the spinner.
    Promise.resolve(onCapture(file))
      .catch(() => {})
      .finally(() => setSubmitting(false))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <canvas ref={canvasRef} className="hidden" />
      {!previewUrl ? (
        <div className="space-y-3">
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center">
            {cameraStatus === 'live' || cameraStatus === 'starting' ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                autoPlay
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-300 gap-2 p-6 text-center">
                <Camera className="h-10 w-10 opacity-70" />
                <p className="text-sm">
                  {cameraStatus === 'unavailable'
                    ? 'Câmera indisponível. Use o botão abaixo para enviar uma foto da galeria.'
                    : 'Iniciando câmera…'}
                </p>
              </div>
            )}
            {cameraStatus === 'live' && (
              <Button
                type="button"
                size="lg"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-xl"
                onClick={captureFrame}
              >
                <Camera className="h-5 w-5 mr-2" /> Capturar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInput}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <Upload className="h-4 w-4 mr-2" />
              {cameraStatus === 'live' ? 'Enviar da galeria' : 'Escolher foto'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
            <img src={previewUrl} alt="Pré-visualização" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={retake}
              disabled={submitting}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Refazer
            </Button>
            {!autoConfirm && (
              <Button
                type="button"
                className="flex-1"
                onClick={() => confirm()}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" /> Confirmar
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {title && <p className="text-sm font-medium text-center">{title}</p>}
      {description && <p className="text-xs text-muted-foreground text-center">{description}</p>}
    </div>
  )
}

export default PhotoCapture
