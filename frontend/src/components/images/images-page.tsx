import { useState, useCallback } from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'
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

type ActiveTab = 'images' | 'flux' | 'videos'

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

  // FLUX images
  const [fluxImages, setFluxImages] = useState<GeneratedImage[]>([])
  const [fluxSearch, setFluxSearch] = useState('')
  const [isLoadingFlux, setIsLoadingFlux] = useState(false)
  const [fluxLoaded, setFluxLoaded] = useState(false)

  // Slideshow
  const [isSlideshowMode, setIsSlideshowMode] = useState(false)
  const [selectedSlideshowTimestamps, setSelectedSlideshowTimestamps] = useState<string[]>([])
  const [isGeneratingSlideshow, setIsGeneratingSlideshow] = useState(false)

  // Videos
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [videoSearch, setVideoSearch] = useState('')
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [videosLoaded, setVideosLoaded] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<GeneratedVideo | null>(null)

  // Save to collection tracking
  const [isSavingToCollection, setIsSavingToCollection] = useState(false)
  const [savedToCollection, setSavedToCollection] = useState<Set<string>>(new Set())

  useMountEffect(() => {
    api.getGenerationConfig().then(setGenConfig).catch(() => {})
  })

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

  const fetchFluxImages = useCallback(async () => {
    setIsLoadingFlux(true)
    try {
      const data = await api.getFluxImageHistory()
      setFluxImages(data)
      setFluxLoaded(true)
    } catch {
      addToast('Failed to load FLUX images', 'error')
    } finally {
      setIsLoadingFlux(false)
    }
  }, [addToast])

  const fetchVideos = useCallback(async () => {
    setIsLoadingVideos(true)
    try {
      const data = await api.getVideoHistory()
      setVideos(data)
      setVideosLoaded(true)
    } catch {
      addToast('Failed to load videos', 'error')
    } finally {
      setIsLoadingVideos(false)
    }
  }, [addToast])

  useMountEffect(() => {
    fetchImages()
  })

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab)
    if (tab === 'flux' && !fluxLoaded) {
      fetchFluxImages()
    } else if (tab === 'videos' && !videosLoaded) {
      fetchVideos()
    }
  }, [fluxLoaded, videosLoaded, fetchFluxImages, fetchVideos])

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
    a.download = `${image.prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`
    a.click()
  }, [])

  const handleGenerateSlideshow = useCallback(async () => {
    if (selectedSlideshowTimestamps.length < 2) return
    setIsGeneratingSlideshow(true)
    try {
      addToast('Generating slideshow... this may take a moment', 'info')
      await api.generateSlideshow(selectedSlideshowTimestamps)
      addToast('Slideshow generated successfully! Check the Videos tab.', 'success')
      setIsSlideshowMode(false)
      setSelectedSlideshowTimestamps([])
      fetchVideos()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Slideshow generation failed', 'error')
    } finally {
      setIsGeneratingSlideshow(true)
    }
  }, [selectedSlideshowTimestamps, addToast, fetchVideos])

  const toggleSlideshowSelect = useCallback((img: GeneratedImage) => {
    setSelectedSlideshowTimestamps((prev) =>
      prev.includes(img.timestamp)
        ? prev.filter((t) => t !== img.timestamp)
        : [...prev, img.timestamp]
    )
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
        if (activeTab === 'flux') {
          await api.saveFluxImage(timestamp)
        } else {
          await api.saveGeneratedImageToCollection(timestamp)
        }
        setSavedToCollection((prev) => new Set(prev).add(timestamp))
        addToast('Image saved to collection — CLIP embedding & RAG indexing started', 'success')
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to save to collection', 'error')
      } finally {
        setIsSavingToCollection(false)
      }
    },
    [isSavingToCollection, savedToCollection, addToast, activeTab],
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



  const handleEditVideo = useCallback(() => {
    addToast('Video editing coming soon — RunwayML integration', 'info')
  }, [addToast])

  const filteredImages = images.filter(
    (img) => !imageSearch || img.prompt.toLowerCase().includes(imageSearch.toLowerCase()),
  )

  const filteredFluxImages = fluxImages.filter(
    (img) => !fluxSearch || img.prompt.toLowerCase().includes(fluxSearch.toLowerCase()),
  )

  const filteredVideos = videos.filter(
    (vid) => !videoSearch || vid.prompt.toLowerCase().includes(videoSearch.toLowerCase()),
  )

  const providerLabel =
    activeTab === 'images'
      ? 'Gemini Imagen'
      : activeTab === 'flux'
        ? 'BFL FLUX'
        : 'Gemini Veo'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Media Library</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {images.length} imagen &middot; {fluxImages.length} flux &middot;{' '}
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
            onClick={() => handleTabChange('images')}
          >
            <ImageIcon className="h-3 w-3" />
            Images
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeTab === 'flux'
                ? 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => handleTabChange('flux')}
          >
            <Palette className="h-3 w-3" />
            FLUX
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeTab === 'videos'
                ? 'bg-k-yellow/10 text-k-yellow ring-1 ring-k-yellow/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => handleTabChange('videos')}
          >
            <Film className="h-3 w-3" />
            Videos
          </button>
        </div>
      </div>

      {/* Search and Action Bar */}
      <div className="px-6 py-3 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by prompt..."
            value={activeTab === 'images' ? imageSearch : activeTab === 'flux' ? fluxSearch : videoSearch}
            onChange={(e) =>
              activeTab === 'images'
                ? setImageSearch(e.target.value)
                : activeTab === 'flux'
                  ? setFluxSearch(e.target.value)
                  : setVideoSearch(e.target.value)
            }
            className="pl-9 h-9 rounded-lg text-sm"
          />
        </div>
        {(activeTab === 'images' || activeTab === 'flux') && (
          isSlideshowMode ? (
            <div className="flex items-center gap-2">
               <button 
                  className="px-3 py-1.5 text-xs font-medium border border-border text-foreground hover:bg-accent rounded-lg transition-colors"
                  onClick={() => { setIsSlideshowMode(false); setSelectedSlideshowTimestamps([]) }}
               >
                 Cancel
               </button>
               <button 
                  disabled={selectedSlideshowTimestamps.length < 2 || isGeneratingSlideshow} 
                  className="px-3 py-1.5 text-xs font-medium bg-k-yellow text-background hover:bg-yellow-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleGenerateSlideshow}
               >
                 {isGeneratingSlideshow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                 Generate Video ({selectedSlideshowTimestamps.length})
               </button>
            </div>
          ) : (
            <button 
               className="px-3 py-1.5 text-xs font-medium border border-border text-foreground hover:bg-accent rounded-lg flex items-center gap-2 transition-colors"
               onClick={() => setIsSlideshowMode(true)}
            >
               <Film className="h-3.5 w-3.5" />
               Slideshow Mode
            </button>
          )
        )}
      </div>

      {/* Gallery */}
      <ScrollArea className="flex-1 px-6">
        {activeTab === 'images' ? (
          <ImageGallery
            images={filteredImages}
            isLoading={isLoadingImages}
            onSelect={isSlideshowMode ? toggleSlideshowSelect : setSelectedImage}
            selectableMode={isSlideshowMode}
            selectedTimestamps={selectedSlideshowTimestamps}
          />
        ) : activeTab === 'flux' ? (
          <ImageGallery
            images={filteredFluxImages}
            isLoading={isLoadingFlux}
            onSelect={isSlideshowMode ? toggleSlideshowSelect : setSelectedImage}
            selectableMode={isSlideshowMode}
            selectedTimestamps={selectedSlideshowTimestamps}
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

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ImageGallery({
  images,
  isLoading,
  onSelect,
  selectableMode = false,
  selectedTimestamps = [],
}: {
  images: GeneratedImage[]
  isLoading: boolean
  onSelect: (img: GeneratedImage) => void
  selectableMode?: boolean
  selectedTimestamps?: string[]
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
      {images.map((img, i) => {
        const isSelected = selectedTimestamps.includes(img.timestamp);
        return (
          <div
            key={img.timestamp}
            className={cn(
              'group relative rounded-xl border overflow-hidden cursor-pointer',
              'transition-all animate-fade-in',
              selectableMode && isSelected ? 'border-k-yellow ring-2 ring-k-yellow/50 shadow-md transform scale-[0.98]' : 'border-border hover:border-k-yellow/50 hover:shadow-lg hover:shadow-k-yellow/5'
            )}
            style={{ animationDelay: `${i * 40}ms` }}
            onClick={() => onSelect(img)}
          >
            <img
              src={img.thumbnail_image}
              alt={img.prompt}
              className="w-full aspect-square object-cover"
            />
            {selectableMode && (
              <div className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full border border-white bg-black/40 shadow-sm overflow-hidden z-10 transition-colors">
                 {isSelected && <div className="w-full h-full bg-k-yellow flex items-center justify-center"><Check className="h-3.5 w-3.5 text-black" /></div>}
              </div>
            )}
            <div className={cn("absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent transition-opacity duration-200", selectableMode ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
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
        )
      })}
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
