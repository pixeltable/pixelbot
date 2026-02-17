import { useState, useEffect, useCallback } from 'react'
import {
  Trash2,
  Download,
  Search,
  Loader2,
  ImageIcon,
  Palette,
  Clock,
  Film,
  Zap,
  FolderPlus,
  Check,
  Pencil,
  Sparkles,
  ArrowRight,
  Save,
  RotateCcw,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { GeneratedImage, GeneratedVideo, GenerationConfig } from '@/types'
import { cn } from '@/lib/utils'

type ActiveTab = 'images' | 'videos'
type ReveMode = 'edit'

export function ImagesPage() {
  const { addToast } = useToast()

  // Generation config (for provider badge display)
  const [genConfig, setGenConfig] = useState<GenerationConfig | null>(null)

  // Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('images')

  // Images
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [imageSearch, setImageSearch] = useState('')
  const [isLoadingImages, setIsLoadingImages] = useState(true)
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)

  // Videos
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [videoSearch, setVideoSearch] = useState('')
  const [isLoadingVideos, setIsLoadingVideos] = useState(true)
  const [selectedVideo, setSelectedVideo] = useState<GeneratedVideo | null>(null)

  // Save to collection tracking
  const [isSavingToCollection, setIsSavingToCollection] = useState(false)
  const [savedToCollection, setSavedToCollection] = useState<Set<string>>(new Set())

  // Reve edit state
  const [reveImage, setReveImage] = useState<GeneratedImage | null>(null)
  const [reveMode, setReveMode] = useState<ReveMode>('edit')

  // Load config + data
  useEffect(() => {
    api.getGenerationConfig().then(setGenConfig).catch(() => {})
  }, [])

  const fetchImages = useCallback(async () => {
    setIsLoadingImages(true)
    try {
      const data = await api.getImageHistory()
      setImages(data)
    } catch {
      addToast('Failed to load images', 'error')
    } finally {
      setIsLoadingImages(false)
    }
  }, [addToast])

  const fetchVideos = useCallback(async () => {
    setIsLoadingVideos(true)
    try {
      const data = await api.getVideoHistory()
      setVideos(data)
    } catch {
      addToast('Failed to load videos', 'error')
    } finally {
      setIsLoadingVideos(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchImages()
    fetchVideos()
  }, [fetchImages, fetchVideos])

  const handleDeleteImage = useCallback(
    async (timestamp: string) => {
      try {
        await api.deleteImage(timestamp)
        addToast('Image deleted', 'success')
        setSelectedImage(null)
        await fetchImages()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchImages],
  )

  const handleDeleteVideo = useCallback(
    async (timestamp: string) => {
      try {
        await api.deleteVideo(timestamp)
        addToast('Video deleted', 'success')
        setSelectedVideo(null)
        await fetchVideos()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchVideos],
  )

  const handleDownloadImage = useCallback((image: GeneratedImage) => {
    const a = document.createElement('a')
    a.href = image.full_image
    a.download = `pixelbot_${image.timestamp}.png`
    a.click()
  }, [])

  const handleDownloadVideo = useCallback((video: GeneratedVideo) => {
    const a = document.createElement('a')
    a.href = api.getVideoUrl(video.video_path)
    a.download = `pixelbot_${video.timestamp}.mp4`
    a.click()
  }, [])

  const handleSaveImageToCollection = useCallback(
    async (timestamp: string) => {
      if (isSavingToCollection || savedToCollection.has(timestamp)) return
      setIsSavingToCollection(true)
      try {
        await api.saveGeneratedImageToCollection(timestamp)
        setSavedToCollection((prev) => new Set(prev).add(timestamp))
        addToast('Image saved to collection — CLIP embedding & RAG indexing started', 'success')
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to save to collection', 'error')
      } finally {
        setIsSavingToCollection(false)
      }
    },
    [isSavingToCollection, savedToCollection, addToast],
  )

  const handleSaveVideoToCollection = useCallback(
    async (timestamp: string) => {
      if (isSavingToCollection || savedToCollection.has(timestamp)) return
      setIsSavingToCollection(true)
      try {
        await api.saveGeneratedVideoToCollection(timestamp)
        setSavedToCollection((prev) => new Set(prev).add(timestamp))
        addToast('Video saved to collection — keyframe extraction & transcription started', 'success')
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to save to collection', 'error')
      } finally {
        setIsSavingToCollection(false)
      }
    },
    [isSavingToCollection, savedToCollection, addToast],
  )

  const handleEditImage = useCallback((image: GeneratedImage) => {
    setSelectedImage(null)
    setReveImage(image)
    setReveMode('edit')
  }, [])



  const handleEditVideo = useCallback(() => {
    addToast('Video editing coming soon — RunwayML integration', 'info')
  }, [addToast])

  const filteredImages = images.filter(
    (img) => !imageSearch || img.prompt.toLowerCase().includes(imageSearch.toLowerCase()),
  )

  const filteredVideos = videos.filter(
    (vid) => !videoSearch || vid.prompt.toLowerCase().includes(videoSearch.toLowerCase()),
  )

  const providerLabel =
    activeTab === 'images'
      ? genConfig?.image_provider === 'gemini'
        ? 'Gemini Imagen'
        : 'DALL-E'
      : 'Gemini Veo'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Media Library</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {images.length} image{images.length !== 1 ? 's' : ''} &middot;{' '}
              {videos.length} video{videos.length !== 1 ? 's' : ''}
            </p>
            {genConfig && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1">
                <Zap className="h-2.5 w-2.5" />
                {providerLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeTab === 'images'
                ? 'bg-k-yellow/10 text-k-yellow ring-1 ring-k-yellow/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => setActiveTab('images')}
          >
            <ImageIcon className="h-3 w-3" />
            Images
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeTab === 'videos'
                ? 'bg-k-yellow/10 text-k-yellow ring-1 ring-k-yellow/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => setActiveTab('videos')}
          >
            <Film className="h-3 w-3" />
            Videos
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by prompt..."
            value={activeTab === 'images' ? imageSearch : videoSearch}
            onChange={(e) =>
              activeTab === 'images'
                ? setImageSearch(e.target.value)
                : setVideoSearch(e.target.value)
            }
            className="pl-9 h-9 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Gallery */}
      <ScrollArea className="flex-1 px-6">
        {activeTab === 'images' ? (
          <ImageGallery
            images={filteredImages}
            isLoading={isLoadingImages}
            onSelect={setSelectedImage}
          />
        ) : (
          <VideoGallery
            videos={filteredVideos}
            isLoading={isLoadingVideos}
            onSelect={setSelectedVideo}
          />
        )}
      </ScrollArea>

      {/* Image Detail Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-k-yellow" />
              Generated Image
              {selectedImage?.provider && (
                <Badge variant="secondary" className="text-[9px] ml-1">
                  {selectedImage.provider}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm">{selectedImage?.prompt}</DialogDescription>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-4">
              <img
                src={selectedImage.full_image}
                alt={selectedImage.prompt}
                className="w-full rounded-xl border border-border"
              />
              <div className="flex gap-2 justify-end">
                {savedToCollection.has(selectedImage.timestamp) ? (
                  <button
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-500 cursor-default"
                    disabled
                  >
                    <Check className="h-3 w-3" /> Saved to Collection
                  </button>
                ) : (
                  <button
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-k-yellow/30 px-3 py-1.5 text-xs font-medium text-k-yellow hover:bg-k-yellow/10 transition-colors',
                      isSavingToCollection && 'opacity-50 pointer-events-none',
                    )}
                    onClick={() => handleSaveImageToCollection(selectedImage.timestamp)}
                    disabled={isSavingToCollection}
                  >
                    {isSavingToCollection ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderPlus className="h-3 w-3" />
                    )}
                    {isSavingToCollection ? 'Saving...' : 'Save to Collection'}
                  </button>
                )}
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/10 transition-colors"
                  onClick={() => handleEditImage(selectedImage)}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={() => handleDownloadImage(selectedImage)}
                >
                  <Download className="h-3 w-3" /> Download
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleDeleteImage(selectedImage.timestamp)}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Video Detail Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-4 w-4 text-k-yellow" />
              Generated Video
              {selectedVideo?.provider && (
                <Badge variant="secondary" className="text-[9px] ml-1">
                  {selectedVideo.provider}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm">{selectedVideo?.prompt}</DialogDescription>
          </DialogHeader>
          {selectedVideo && (
            <div className="space-y-4">
              <video
                src={api.getVideoUrl(selectedVideo.video_path)}
                controls
                className="w-full rounded-xl border border-border"
              />
              <div className="flex gap-2 justify-end">
                {savedToCollection.has(selectedVideo.timestamp) ? (
                  <button
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-500 cursor-default"
                    disabled
                  >
                    <Check className="h-3 w-3" /> Saved to Collection
                  </button>
                ) : (
                  <button
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-k-yellow/30 px-3 py-1.5 text-xs font-medium text-k-yellow hover:bg-k-yellow/10 transition-colors',
                      isSavingToCollection && 'opacity-50 pointer-events-none',
                    )}
                    onClick={() => handleSaveVideoToCollection(selectedVideo.timestamp)}
                    disabled={isSavingToCollection}
                  >
                    {isSavingToCollection ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderPlus className="h-3 w-3" />
                    )}
                    {isSavingToCollection ? 'Saving...' : 'Save to Collection'}
                  </button>
                )}
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/10 transition-colors"
                  onClick={handleEditVideo}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={() => handleDownloadVideo(selectedVideo)}
                >
                  <Download className="h-3 w-3" /> Download
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleDeleteVideo(selectedVideo.timestamp)}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reve Edit Dialog */}
      <ReveEditDialog
        image={reveImage}
        mode={reveMode}
        onModeChange={setReveMode}
        open={!!reveImage}
        onOpenChange={(open) => {
          if (!open) setReveImage(null)
        }}
        onSaved={() => {
          addToast('Result saved to collection', 'success')
          fetchImages()
        }}
      />
    </div>
  )
}

// ── Reve Edit Dialog ────────────────────────────────────────────────────────

function ReveEditDialog({
  image,
  mode,
  onModeChange,
  open,
  onOpenChange,
  onSaved,
}: {
  image: GeneratedImage | null
  mode: ReveMode
  onModeChange: (mode: ReveMode) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [instruction, setInstruction] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [resultPreview, setResultPreview] = useState<string | null>(null)
  const [resultTempPath, setResultTempPath] = useState<string | null>(null)
  const [resultDimensions, setResultDimensions] = useState<{ width: number; height: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const resetState = useCallback(() => {
    setInstruction('')
    setIsProcessing(false)
    setResultPreview(null)
    setResultTempPath(null)
    setResultDimensions(null)
    setIsSaving(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [resetState, onOpenChange])

  const handleGenerate = useCallback(async () => {
    if (!image || !instruction.trim()) return
    setIsProcessing(true)
    setResultPreview(null)
    setResultTempPath(null)

    try {
      const result = await api.reveEdit({
        timestamp: image.timestamp,
        instruction: instruction.trim(),
      })
      setResultPreview(result.preview)
      setResultTempPath(result.temp_path)
      setResultDimensions({ width: result.width, height: result.height })
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : `Reve ${mode} failed`,
        'error',
      )
    } finally {
      setIsProcessing(false)
    }
  }, [image, instruction, mode, addToast])

  const handleSave = useCallback(async () => {
    if (!resultTempPath) return
    setIsSaving(true)
    try {
      await api.reveSave(resultTempPath)
      onSaved()
      handleClose()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [resultTempPath, onSaved, handleClose, addToast])

  const handleDownloadResult = useCallback(() => {
    if (!resultPreview) return
    const a = document.createElement('a')
    a.href = resultPreview
    a.download = `pixelbot_reve_${mode}_${Date.now()}.png`
    a.click()
  }, [resultPreview, mode])

  const handleRetry = useCallback(() => {
    setResultPreview(null)
    setResultTempPath(null)
    setResultDimensions(null)
  }, [])

  if (!image) return null

  const hasResult = !!resultPreview

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-violet-400" />
            Edit with Reve AI
            <Badge variant="secondary" className="text-[9px] ml-1">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              Reve
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Describe how you want to modify this image using natural language.
          </DialogDescription>
        </DialogHeader>

        {/* Image comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Original */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Original
              </span>
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
              <img
                src={image.full_image}
                alt={image.prompt}
                className="w-full object-contain max-h-[360px]"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/60 truncate">{image.prompt}</p>
          </div>

          {/* Result */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'h-1.5 w-1.5 rounded-full',
                hasResult ? 'bg-violet-400' : 'bg-muted-foreground/30',
              )} />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Result
              </span>
              {resultDimensions && (
                <span className="text-[9px] text-muted-foreground/50">
                  {resultDimensions.width}&times;{resultDimensions.height}
                </span>
              )}
            </div>
            <div className={cn(
              'rounded-xl border overflow-hidden min-h-[200px] flex items-center justify-center',
                hasResult
                  ? 'border-violet-500/20 bg-violet-500/5'
                  : 'border-dashed border-border bg-muted/20',
            )}>
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <div className="relative">
                    <Loader2 className={cn(
                      'h-8 w-8 animate-spin text-violet-400',
                    )} />
                    <Sparkles className={cn(
                      'absolute -top-1 -right-1 h-3.5 w-3.5 animate-pulse text-violet-300',
                    )} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                      Applying edit...
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      Reve AI is processing your image
                    </p>
                  </div>
                </div>
              ) : hasResult ? (
                <img
                  src={resultPreview!}
                  alt="Reve result"
                  className="w-full object-contain max-h-[360px]"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                  <ArrowRight className="h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    Enter an edit instruction and click Apply
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instruction input */}
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Edit instruction
          </label>
          <div className="relative">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "Make the sky more dramatic", "Add a warm sunset glow", "Remove the background"'
              className="w-full rounded-xl border border-violet-500/20 bg-background px-4 py-3 text-sm resize-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              rows={2}
              disabled={isProcessing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleClose}
            disabled={isProcessing}
          >
            <X className="h-3 w-3" />
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {hasResult && (
              <>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleRetry}
                  disabled={isProcessing}
                >
                  <RotateCcw className="h-3 w-3" />
                  Try again
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleDownloadResult}
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors',
                    'bg-violet-500 text-white hover:bg-violet-600',
                    isSaving && 'opacity-50 pointer-events-none',
                  )}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  {isSaving ? 'Saving...' : 'Save to Library'}
                </button>
              </>
            )}

            {!hasResult && (
              <button
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors',
                  'bg-violet-500 text-white hover:bg-violet-600',
                  (!instruction.trim() || isProcessing) && 'opacity-50 pointer-events-none',
                )}
                onClick={handleGenerate}
                disabled={!instruction.trim() || isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {isProcessing ? 'Editing...' : 'Apply Edit'}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ImageGallery({
  images,
  isLoading,
  onSelect,
}: {
  images: GeneratedImage[]
  isLoading: boolean
  onSelect: (img: GeneratedImage) => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-k-yellow mb-2" />
        <p className="text-xs text-muted-foreground">Loading gallery...</p>
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Palette className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">No images yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
          Generate images from Chat using the Image mode toggle, then manage them here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-6">
      {images.map((img, i) => (
        <div
          key={img.timestamp}
          className={cn(
            'group relative rounded-xl border border-border overflow-hidden cursor-pointer',
            'hover:border-k-yellow/50 hover:shadow-lg hover:shadow-k-yellow/5 transition-all animate-fade-in',
          )}
          style={{ animationDelay: `${i * 40}ms` }}
          onClick={() => onSelect(img)}
        >
          <img
            src={img.thumbnail_image}
            alt={img.prompt}
            className="w-full aspect-square object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-white text-xs truncate font-medium">{img.prompt}</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-2.5 w-2.5 text-white/50" />
                <span className="text-[10px] text-white/50">
                  {new Date(img.timestamp).toLocaleDateString()}
                </span>
                {img.provider && (
                  <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-white/10 text-white/60 border-0">
                    {img.provider}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function VideoGallery({
  videos,
  isLoading,
  onSelect,
}: {
  videos: GeneratedVideo[]
  isLoading: boolean
  onSelect: (vid: GeneratedVideo) => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-k-yellow mb-2" />
        <p className="text-xs text-muted-foreground">Loading videos...</p>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Film className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">No videos yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
          Generate videos from Chat using the Video mode toggle, then manage them here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-6">
      {videos.map((vid, i) => (
        <div
          key={vid.timestamp}
          className={cn(
            'group relative rounded-xl border border-border overflow-hidden cursor-pointer',
            'hover:border-k-yellow/50 hover:shadow-lg hover:shadow-k-yellow/5 transition-all animate-fade-in',
          )}
          style={{ animationDelay: `${i * 40}ms` }}
          onClick={() => onSelect(vid)}
        >
          <video
            src={api.getVideoUrl(vid.video_path)}
            muted
            className="w-full aspect-video object-cover"
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-white text-xs truncate font-medium">{vid.prompt}</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-2.5 w-2.5 text-white/50" />
                <span className="text-[10px] text-white/50">
                  {new Date(vid.timestamp).toLocaleDateString()}
                </span>
                {vid.provider && (
                  <Badge variant="secondary" className="text-[8px] px-1 py-0 bg-white/10 text-white/60 border-0">
                    {vid.provider}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {/* Play icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
            <div className="h-10 w-10 rounded-full bg-black/50 flex items-center justify-center">
              <Film className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
