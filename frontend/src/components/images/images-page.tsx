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
  Sparkles,
  Send,
  Zap,
  FolderPlus,
  Check,
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

export function ImagesPage() {
  const { addToast } = useToast()

  // Generation config
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

  // Generation prompt
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // Save to collection tracking
  const [isSavingToCollection, setIsSavingToCollection] = useState(false)
  const [savedToCollection, setSavedToCollection] = useState<Set<string>>(new Set())

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

  // Generate
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return
    setIsGenerating(true)
    try {
      if (activeTab === 'images') {
        await api.generateImage(prompt.trim())
        addToast('Image generated', 'success')
        setPrompt('')
        await fetchImages()
      } else {
        await api.generateVideo(prompt.trim())
        addToast('Video generated', 'success')
        setPrompt('')
        await fetchVideos()
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Generation failed', 'error')
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, isGenerating, activeTab, addToast, fetchImages, fetchVideos])

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

  const modelId =
    activeTab === 'images' ? genConfig?.image_model : genConfig?.video_model

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Media Generation</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {images.length} image{images.length !== 1 ? 's' : ''} &middot;{' '}
              {videos.length} video{videos.length !== 1 ? 's' : ''}
            </p>
            {genConfig && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1">
                <Zap className="h-2.5 w-2.5" />
                {providerLabel}
                {modelId && (
                  <span className="text-muted-foreground/60 font-mono">{modelId}</span>
                )}
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

      {/* Generation Prompt Bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-muted/30">
        <Sparkles className="h-4 w-4 text-k-yellow shrink-0" />
        <Input
          placeholder={
            activeTab === 'images'
              ? 'Describe the image you want to generate...'
              : 'Describe the video you want to generate...'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          className="h-8 text-sm flex-1"
          disabled={isGenerating}
        />
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all',
            'bg-k-yellow text-k-black hover:bg-k-yellow-hover',
            (isGenerating || !prompt.trim()) && 'opacity-50 pointer-events-none',
          )}
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          {isGenerating
            ? activeTab === 'images'
              ? 'Generating...'
              : 'Generating...'
            : 'Generate'}
        </button>
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
            providerLabel={providerLabel}
            onSelect={setSelectedImage}
          />
        ) : (
          <VideoGallery
            videos={filteredVideos}
            isLoading={isLoadingVideos}
            providerLabel={providerLabel}
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
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ImageGallery({
  images,
  isLoading,
  providerLabel,
  onSelect,
}: {
  images: GeneratedImage[]
  isLoading: boolean
  providerLabel: string
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
          Use the prompt bar above to generate images with {providerLabel}
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
  providerLabel,
  onSelect,
}: {
  videos: GeneratedVideo[]
  isLoading: boolean
  providerLabel: string
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
          Use the prompt bar above to generate videos with {providerLabel}
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
