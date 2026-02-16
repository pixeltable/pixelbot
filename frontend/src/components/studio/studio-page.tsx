import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText,
  ImageIcon,
  Film,
  Music,
  Loader2,
  Wand2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Palette,
  Focus,
  Maximize,
  Scan,
  Eye,
  Sparkles,
  ChevronRight,
  Play,
  FileSearch,
  Mic,
  ArrowLeft,
  Download,
  Save,
  Search,
  Layers,
  Info,
  Scissors,
  Type,
  ScanLine,
  Clock,
  Table2,
  ChevronLeft,
  Trash2,
  Plus,
  Check,
  X,
  Undo2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import * as api from '@/lib/api'
import { SearchResults } from './search-results'
import { EmbeddingMap } from './embedding-map'
import { DetectionPanel } from './detection-panel'
import type {
  StudioFile,
  StudioFiles,
  Operation,
  OperationsCatalog,
  ImagePreview,
  TransformResult,
  VideoTransformResult,
  CsvRowsResponse,
  DocumentChunks,
  VideoFrames,
  Transcription,
  SearchResult,
  SearchResponse,
} from '@/types'

// ── Icons per operation ─────────────────────────────────────────────────────

const OPERATION_ICONS: Record<string, typeof Wand2> = {
  resize: Maximize,
  rotate: RotateCw,
  flip_horizontal: FlipHorizontal,
  flip_vertical: FlipVertical,
  grayscale: Palette,
  blur: Focus,
  sharpen: Sparkles,
  edge_detect: Scan,
  emboss: Scan,
  brightness: Sun,
  contrast: Contrast,
  saturation: Palette,
  auto_contrast: Contrast,
  equalize: Contrast,
  invert: Eye,
  view_chunks: FileSearch,
  view_transcription: Mic,
  view_frames: Film,
  view_metadata: Info,
  detect_scenes: ScanLine,
  extract_frame: ImageIcon,
  clip_video: Scissors,
  overlay_text: Type,
}

const FILE_TYPE_ICON: Record<string, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  csv: Table2,
}

const FILE_TYPE_COLOR: Record<string, string> = {
  document: 'text-k-blue-light',
  image: 'text-k-yellow',
  video: 'text-k-red',
  audio: 'text-green-500',
  csv: 'text-emerald-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  transform: 'Transform',
  filter: 'Filters',
  adjust: 'Adjustments',
  analyze: 'Analyze',
}

// ── Main Component ──────────────────────────────────────────────────────────

export function StudioPage() {
  const { addToast } = useToast()
  const [files, setFiles] = useState<StudioFiles | null>(null)
  const [operations, setOperations] = useState<OperationsCatalog>({})
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [selectedFile, setSelectedFile] = useState<StudioFile | null>(null)
  const [activeFileType, setActiveFileType] = useState<string>('image')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'search' | 'embeddings' | null>(null)

  // Operation state
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null)
  const [operationParams, setOperationParams] = useState<Record<string, number | string>>({})
  const [isProcessing, setIsProcessing] = useState(false)

  // Preview state
  const [originalPreview, setOriginalPreview] = useState<ImagePreview | null>(null)
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Document / Audio / Video result state
  const [documentChunks, setDocumentChunks] = useState<DocumentChunks | null>(null)
  const [documentSummary, setDocumentSummary] = useState<{
    summary: import('@/types').DocumentSummary | null
    text_preview: string
  } | null>(null)
  const [videoFrames, setVideoFrames] = useState<VideoFrames | null>(null)
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const [videoTransformResult, setVideoTransformResult] = useState<VideoTransformResult | null>(null)

  // CSV state
  const [csvData, setCsvData] = useState<CsvRowsResponse | null>(null)
  const [isLoadingCsv, setIsLoadingCsv] = useState(false)
  const [isDeletingCsv, setIsDeletingCsv] = useState(false)

  // Load files and operations on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingFiles(true)
      try {
        const [filesData, opsData] = await Promise.all([
          api.getStudioFiles(),
          api.getStudioOperations(),
        ])
        setFiles(filesData)
        setOperations(opsData)

        // Auto-select the first non-empty file type
        const typeOrder: { key: string; field: keyof StudioFiles }[] = [
          { key: 'document', field: 'documents' },
          { key: 'image', field: 'images' },
          { key: 'video', field: 'videos' },
          { key: 'audio', field: 'audios' },
          { key: 'csv', field: 'csv_tables' },
        ]
        const firstNonEmpty = typeOrder.find((t) => (filesData[t.field]?.length ?? 0) > 0)
        if (firstNonEmpty) setActiveFileType(firstNonEmpty.key)
      } catch {
        addToast('Failed to load studio data', 'error')
      } finally {
        setIsLoadingFiles(false)
      }
    }
    loadData()
  }, [addToast])

  // Load preview when selecting a file
  const handleSelectFile = useCallback(
    async (file: StudioFile) => {
      setSelectedFile(file)
      setSelectedOperation(null)
      setTransformResult(null)
      setVideoTransformResult(null)
      setDocumentChunks(null)
      setDocumentSummary(null)
      setVideoFrames(null)
      setTranscription(null)
      setCsvData(null)
      setOperationParams({})

      if (file.type === 'image') {
        setIsLoadingPreview(true)
        try {
          const preview = await api.getImagePreview(file.uuid)
          setOriginalPreview(preview)
        } catch {
          addToast('Failed to load image preview', 'error')
        } finally {
          setIsLoadingPreview(false)
        }
      } else {
        setOriginalPreview(null)
      }

      if (file.type === 'document') {
        api
          .getDocumentSummary(file.uuid)
          .then((data) => setDocumentSummary(data))
          .catch(() => {})
      }

      if (file.type === 'csv' && file.table_name) {
        setIsLoadingCsv(true)
        try {
          const data = await api.getCsvRows(file.table_name, 0, 100)
          setCsvData(data)
        } catch {
          addToast('Failed to load CSV data', 'error')
        } finally {
          setIsLoadingCsv(false)
        }
      }
    },
    [addToast],
  )

  // Select an operation and initialize default params
  const handleSelectOperation = useCallback((op: Operation) => {
    setSelectedOperation(op)
    setTransformResult(null)
    setVideoTransformResult(null)
    setDocumentChunks(null)
    setVideoFrames(null)
    setTranscription(null)
    const defaults: Record<string, number | string> = {}
    for (const p of op.params) {
      defaults[p.name] = p.default
    }
    setOperationParams(defaults)
  }, [])

  // Run operation
  const handleRunOperation = useCallback(async () => {
    if (!selectedFile || !selectedOperation) return
    setIsProcessing(true)

    try {
      if (selectedFile.type === 'image') {
        const result = await api.transformImage(
          selectedFile.uuid,
          selectedOperation.id,
          operationParams,
        )
        setTransformResult(result)
      } else if (selectedFile.type === 'document' && selectedOperation.id === 'view_chunks') {
        const chunks = await api.getDocumentChunks(selectedFile.uuid)
        setDocumentChunks(chunks)
      } else if (selectedFile.type === 'video' && selectedOperation.id === 'view_frames') {
        const limit = Number(operationParams.limit) || 12
        const frames = await api.getVideoFrames(selectedFile.uuid, limit)
        setVideoFrames(frames)
      } else if (
        selectedFile.type === 'video' &&
        ['view_metadata', 'extract_frame', 'clip_video', 'overlay_text', 'detect_scenes'].includes(selectedOperation.id)
      ) {
        const result = await api.transformVideo(
          selectedFile.uuid,
          selectedOperation.id,
          operationParams,
        )
        setVideoTransformResult(result)
      } else if (selectedOperation.id === 'view_transcription') {
        const trans = await api.getTranscription(selectedFile.uuid, selectedFile.type)
        setTranscription(trans)
      }
      addToast(`${selectedOperation.label} completed`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setIsProcessing(false)
    }
  }, [selectedFile, selectedOperation, operationParams, addToast])

  // Save transformed image to Pixeltable
  const [isSaving, setIsSaving] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleSaveImage = useCallback(async () => {
    if (!selectedFile || !selectedOperation || !transformResult) return
    setIsSaving(true)
    try {
      const result = await api.saveTransformedImage(
        selectedFile.uuid,
        selectedOperation.id,
        operationParams,
      )
      addToast(`Saved as "${result.filename}"`, 'success')
      // Refresh file list to show the new image
      const filesData = await api.getStudioFiles()
      setFiles(filesData)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedFile, selectedOperation, operationParams, transformResult, addToast])

  const handleDownloadImage = useCallback(async () => {
    if (!selectedFile || !selectedOperation) return
    setIsDownloading(true)
    try {
      const blob = await api.downloadTransformedImage(
        selectedFile.uuid,
        selectedOperation.id,
        operationParams,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = selectedFile.name.replace(/\.[^.]+$/, '')
      a.download = `${baseName}_${selectedOperation.id}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('Download started', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Download failed', 'error')
    } finally {
      setIsDownloading(false)
    }
  }, [selectedFile, selectedOperation, operationParams, addToast])

  // Save video clip/overlay result as new video
  const handleSaveVideoResult = useCallback(async () => {
    if (!selectedFile || !selectedOperation || !videoTransformResult) return
    if (videoTransformResult.operation !== 'clip_video' && videoTransformResult.operation !== 'overlay_text') return
    setIsSaving(true)
    try {
      const result = await api.saveVideoResult(
        selectedFile.uuid,
        selectedOperation.id,
        operationParams,
      )
      addToast(result.message, 'success')
      const filesData = await api.getStudioFiles()
      setFiles(filesData)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedFile, selectedOperation, operationParams, videoTransformResult, addToast])

  // Save extracted frame as new image
  const handleSaveExtractedFrame = useCallback(async () => {
    if (!selectedFile || !videoTransformResult || videoTransformResult.operation !== 'extract_frame') return
    setIsSaving(true)
    try {
      const result = await api.saveExtractedFrame(selectedFile.uuid, operationParams)
      addToast(result.message, 'success')
      const filesData = await api.getStudioFiles()
      setFiles(filesData)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedFile, operationParams, videoTransformResult, addToast])

  const handleDeselectFile = useCallback(() => {
    setSelectedFile(null)
    setSelectedOperation(null)
    setTransformResult(null)
    setVideoTransformResult(null)
    setOriginalPreview(null)
    setDocumentChunks(null)
    setDocumentSummary(null)
    setVideoFrames(null)
    setTranscription(null)
    setCsvData(null)
  }, [])

  // Search handler
  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null)
        setWorkspaceView(null)
        return
      }
      setIsSearching(true)
      setWorkspaceView('search')
      setSelectedFile(null)
      try {
        const result = await api.searchStudio(query.trim())
        setSearchResults(result)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Search failed', 'error')
      } finally {
        setIsSearching(false)
      }
    },
    [addToast],
  )

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch(e.currentTarget.value)
      }
    },
    [handleSearch],
  )

  const handleSelectSearchResult = useCallback(
    (result: SearchResult) => {
      const matchingFile = [...(files?.images ?? []), ...(files?.documents ?? []), ...(files?.videos ?? []), ...(files?.audios ?? []), ...(files?.csv_tables ?? [])].find(
        (f) => f.uuid === result.uuid,
      )
      if (matchingFile) {
        setWorkspaceView(null)
        handleSelectFile(matchingFile)
      }
    },
    [files, handleSelectFile],
  )

  // Delete a CSV table
  const handleDeleteCsv = useCallback(
    async (csvUuid: string) => {
      setIsDeletingCsv(true)
      try {
        await api.deleteCsvTable(csvUuid)
        addToast('CSV table deleted', 'success')
        handleDeselectFile()
        // Refresh the file list
        const filesData = await api.getStudioFiles()
        setFiles(filesData)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to delete CSV table', 'error')
      } finally {
        setIsDeletingCsv(false)
      }
    },
    [addToast, handleDeselectFile],
  )

  // CSV pagination
  const handleCsvPage = useCallback(
    async (offset: number) => {
      if (!selectedFile?.table_name) return
      setIsLoadingCsv(true)
      try {
        const data = await api.getCsvRows(selectedFile.table_name, offset, 100)
        setCsvData(data)
      } catch {
        addToast('Failed to load page', 'error')
      } finally {
        setIsLoadingCsv(false)
      }
    },
    [selectedFile, addToast],
  )

  // Compute files list for the active type
  const filesList: StudioFile[] = files
    ? {
        image: files.images,
        document: files.documents,
        video: files.videos,
        audio: files.audios,
        csv: files.csv_tables,
      }[activeFileType] ?? []
    : []

  const availableOps = operations[selectedFile?.type ?? ''] ?? []
  const groupedOps = availableOps.reduce<Record<string, Operation[]>>((acc, op) => {
    const cat = op.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(op)
    return acc
  }, {})

  const totalFiles = files
    ? files.documents.length + files.images.length + files.videos.length + files.audios.length + (files.csv_tables?.length ?? 0)
    : 0

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoadingFiles) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-k-yellow mb-3" />
        <p className="text-sm text-muted-foreground">Loading Studio...</p>
      </div>
    )
  }

  if (totalFiles === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <Wand2 className="h-10 w-10 text-muted-foreground/30" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Studio</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Upload files using the Files panel to start exploring and transforming your data.
          The Studio supports image transforms, document analysis, audio transcription, and video frame extraction.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Panel: File Browser ─────────────────────────────────── */}
      <div className="w-72 border-r border-border flex flex-col bg-card/30">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <h2 className="text-sm font-semibold tracking-tight">Studio</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* File Type Filters */}
        <div className="px-3 pb-3 space-y-0.5">
          {(['document', 'image', 'video', 'audio', 'csv'] as const).map((type) => {
            const Icon = FILE_TYPE_ICON[type]
            const typeToKey: Record<string, keyof StudioFiles> = {
              image: 'images',
              document: 'documents',
              video: 'videos',
              audio: 'audios',
              csv: 'csv_tables',
            }
            const label: Record<string, string> = {
              document: 'Documents',
              image: 'Images',
              video: 'Videos',
              audio: 'Audio',
              csv: 'Tables',
            }
            const count = files?.[typeToKey[type]]?.length ?? 0
            const isActive = activeFileType === type
            return (
              <button
                key={type}
                className={cn(
                  'flex items-center gap-2.5 w-full rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-primary/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => setActiveFileType(type)}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive && FILE_TYPE_COLOR[type])} />
                <span className="flex-1 text-left">{label[type]}</span>
                <span className={cn(
                  'text-[10px] tabular-nums min-w-[1.25rem] text-center rounded-full px-1.5 py-0.5',
                  isActive
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-muted-foreground/50',
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-border/50" />

        {/* Explore Section */}
        <div className="px-3 py-3 space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 px-1 pb-0.5">
            Explore
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search all files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-8 pl-7 text-xs bg-muted/40"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-k-yellow" />
            )}
          </div>
          <button
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-2.5 py-1.5 text-xs transition-all',
              workspaceView === 'embeddings'
                ? 'bg-k-yellow/10 text-k-yellow font-medium ring-1 ring-k-yellow/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              setSelectedFile(null)
              setWorkspaceView(workspaceView === 'embeddings' ? null : 'embeddings')
            }}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Embedding Map</span>
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-border/50" />

        {/* File List */}
        <ScrollArea className="flex-1">
          <div className="px-2 py-2 space-y-0.5">
            {filesList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No {activeFileType} files
              </p>
            ) : (
              filesList.map((file) => {
                const Icon = FILE_TYPE_ICON[file.type]
                const isSelected = selectedFile?.uuid === file.uuid
                return (
                  <button
                    key={file.uuid}
                    className={cn(
                      'flex items-start gap-2.5 w-full rounded-lg px-2.5 py-2 text-left transition-all',
                      isSelected
                        ? 'bg-primary/10 ring-1 ring-primary/20'
                        : 'hover:bg-accent/60',
                    )}
                    onClick={() => handleSelectFile(file)}
                  >
                    {file.thumbnail ? (
                      <img
                        src={file.thumbnail}
                        alt={file.name}
                        className="h-9 w-9 rounded-md object-cover shrink-0 border border-border/50"
                      />
                    ) : (
                      <div
                        className={cn(
                          'h-9 w-9 rounded-md flex items-center justify-center shrink-0',
                          isSelected ? 'bg-primary/10' : 'bg-muted',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', FILE_TYPE_COLOR[file.type])} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p
                        className={cn(
                          'text-xs font-medium leading-snug line-clamp-2',
                          isSelected ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        title={file.summary?.title || file.name}
                      >
                        {file.summary?.title || file.name}
                      </p>
                      {file.type === 'csv' && file.row_count != null ? (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {file.row_count} rows &middot; {file.columns?.length ?? 0} cols
                        </p>
                      ) : file.summary?.summary ? (
                        <p className="text-[10px] text-muted-foreground/60 line-clamp-1 mt-0.5">
                          {file.summary.summary}
                        </p>
                      ) : file.timestamp ? (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {file.timestamp}
                        </p>
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right Panel: Workspace ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {workspaceView === 'search' && !selectedFile ? (
          <div className="flex-1 overflow-auto p-5">
            {isSearching ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
              </div>
            ) : searchResults ? (
              <SearchResults
                results={searchResults.results}
                query={searchResults.query}
                onSelectResult={handleSelectSearchResult}
              />
            ) : (
              <EmptyWorkspace />
            )}
          </div>
        ) : workspaceView === 'embeddings' && !selectedFile ? (
          <div className="flex-1 p-5 overflow-hidden">
            <EmbeddingMap />
          </div>
        ) : !selectedFile ? (
          <EmptyWorkspace />
        ) : (
          <>
            {/* Workspace Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <button
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
                onClick={handleDeselectFile}
              >
                <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate" title={selectedFile.name}>{selectedFile.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {selectedFile.type}
                  </Badge>
                  {originalPreview && (
                    <span className="text-[10px] text-muted-foreground">
                      {originalPreview.width} x {originalPreview.height} &middot; {originalPreview.mode}
                    </span>
                  )}
                  {selectedFile.type === 'csv' && selectedFile.row_count != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {selectedFile.row_count} rows &middot; {selectedFile.columns?.length ?? 0} columns
                    </span>
                  )}
                </div>
              </div>
              {selectedFile.type === 'csv' && (
                <button
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => handleDeleteCsv(selectedFile.uuid)}
                  disabled={isDeletingCsv}
                >
                  {isDeletingCsv ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>
              )}
            </div>

            {/* Workspace Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Operations Sidebar (hidden for CSV) */}
              {selectedFile.type !== 'csv' && (
              <div className="w-52 border-r border-border flex flex-col bg-card/20">
                <div className="px-3 pt-3 pb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Operations
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="px-2 pb-3 space-y-3">
                    {Object.entries(groupedOps).map(([category, ops]) => (
                      <div key={category}>
                        <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider px-2 mb-1">
                          {CATEGORY_LABELS[category] ?? category}
                        </p>
                        <div className="space-y-0.5">
                          {ops.map((op) => {
                            const Icon = OPERATION_ICONS[op.id] ?? Wand2
                            const isActive = selectedOperation?.id === op.id
                            return (
                              <button
                                key={op.id}
                                className={cn(
                                  'flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-left transition-all',
                                  isActive
                                    ? 'bg-k-yellow/10 text-k-yellow ring-1 ring-k-yellow/20'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                                onClick={() => handleSelectOperation(op)}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs font-medium">{op.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              )}

              {/* Preview + Params Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Params Bar */}
                {selectedOperation && (
                  <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        {selectedOperation.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {selectedOperation.description}
                      </span>
                    </div>

                    {/* Param inputs */}
                    {selectedOperation.params.map((param) => (
                      <div key={param.name} className="flex items-center gap-2">
                        <label className="text-[11px] text-muted-foreground capitalize whitespace-nowrap">
                          {param.name}:
                        </label>
                        {param.step !== undefined ? (
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[Number(operationParams[param.name] ?? param.default)]}
                              min={param.min ?? 0}
                              max={param.max ?? 100}
                              step={param.step}
                              className="w-24"
                              onValueChange={([val]) =>
                                setOperationParams((prev) => ({ ...prev, [param.name]: val }))
                              }
                            />
                            <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                              {Number(operationParams[param.name] ?? param.default).toFixed(1)}
                            </span>
                          </div>
                        ) : param.type === 'string' ? (
                          <Input
                            type="text"
                            value={operationParams[param.name] ?? param.default}
                            className="w-28 h-7 text-xs"
                            onChange={(e) =>
                              setOperationParams((prev) => ({
                                ...prev,
                                [param.name]: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Input
                            type="number"
                            value={operationParams[param.name] ?? param.default}
                            min={param.min}
                            max={param.max}
                            className="w-20 h-7 text-xs text-center"
                            onChange={(e) =>
                              setOperationParams((prev) => ({
                                ...prev,
                                [param.name]: Number(e.target.value),
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}

                    <button
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all',
                        'bg-k-yellow text-k-black hover:bg-k-yellow-hover',
                        isProcessing && 'opacity-70 pointer-events-none',
                      )}
                      onClick={handleRunOperation}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {isProcessing ? 'Processing...' : 'Run'}
                    </button>
                  </div>
                )}

                {/* Preview Content */}
                <ScrollArea className="flex-1">
                  <div className="p-5">
                    {/* Image previews */}
                    {selectedFile.type === 'image' && (
                      <ImageWorkspace
                        originalPreview={originalPreview}
                        transformResult={transformResult}
                        isLoadingPreview={isLoadingPreview}
                        hasOperation={!!selectedOperation}
                        onSave={handleSaveImage}
                        onDownload={handleDownloadImage}
                        isSaving={isSaving}
                        isDownloading={isDownloading}
                        imageUuid={selectedFile.uuid}
                      />
                    )}

                    {/* Document chunks + summary */}
                    {selectedFile.type === 'document' && (
                      <DocumentWorkspace
                        documentChunks={documentChunks}
                        documentSummary={documentSummary}
                        hasOperation={!!selectedOperation}
                      />
                    )}

                    {/* Video frames, transforms, and transcription */}
                    {selectedFile.type === 'video' && (
                      <VideoWorkspace
                        videoUuid={selectedFile.uuid}
                        videoFrames={videoFrames}
                        transcription={transcription}
                        videoTransformResult={videoTransformResult}
                        selectedOperation={selectedOperation}
                        isSaving={isSaving}
                        onSaveVideoResult={handleSaveVideoResult}
                        onSaveExtractedFrame={handleSaveExtractedFrame}
                      />
                    )}

                    {/* Audio transcription */}
                    {selectedFile.type === 'audio' && (
                      <AudioWorkspace
                        transcription={transcription}
                        hasOperation={!!selectedOperation}
                      />
                    )}

                    {/* CSV table viewer */}
                    {selectedFile.type === 'csv' && (
                      <CsvWorkspace
                        csvData={csvData}
                        isLoading={isLoadingCsv}
                        tableName={selectedFile.table_name ?? ''}
                        onPageChange={handleCsvPage}
                        onDataChanged={async () => {
                          if (!selectedFile.table_name) return
                          setIsLoadingCsv(true)
                          try {
                            const data = await api.getCsvRows(selectedFile.table_name, csvData?.offset ?? 0, 100)
                            setCsvData(data)
                            const filesData = await api.getStudioFiles()
                            setFiles(filesData)
                          } catch {
                            addToast('Failed to refresh data', 'error')
                          } finally {
                            setIsLoadingCsv(false)
                          }
                        }}
                      />
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Wand2 className="h-8 w-8 text-muted-foreground/30" />
      </div>
      <h3 className="text-sm font-semibold mb-1">Select a file to get started</h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        Choose a file from the left panel to explore its contents, apply transforms, view
        extracted chunks, transcriptions, and more. Operations are powered by Pixeltable UDFs.
      </p>
    </div>
  )
}

function ImageWorkspace({
  originalPreview,
  transformResult,
  isLoadingPreview,
  hasOperation,
  onSave,
  onDownload,
  isSaving,
  isDownloading,
  imageUuid,
}: {
  originalPreview: ImagePreview | null
  transformResult: TransformResult | null
  isLoadingPreview: boolean
  hasOperation: boolean
  onSave: () => void
  onDownload: () => void
  isSaving: boolean
  isDownloading: boolean
  imageUuid: string
}) {
  if (isLoadingPreview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
      </div>
    )
  }

  if (!originalPreview) return null

  const hasResult = !!transformResult

  return (
    <div className={cn('grid gap-5', hasResult ? 'grid-cols-2' : 'grid-cols-1 max-w-lg mx-auto')}>
      {/* Original */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Original
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {originalPreview.width} x {originalPreview.height}
          </span>
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
          <img
            src={originalPreview.preview}
            alt="Original"
            className="w-full h-auto object-contain"
          />
        </div>
      </div>

      {/* Transformed */}
      {hasResult && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-k-yellow" />
            <span className="text-[11px] font-medium text-k-yellow uppercase tracking-wider">
              {transformResult.operation.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              {transformResult.width} x {transformResult.height}
            </span>
          </div>
          <div className="rounded-xl border border-k-yellow/20 overflow-hidden bg-muted/30">
            <img
              src={transformResult.preview}
              alt="Transformed"
              className="w-full h-auto object-contain"
            />
          </div>

          {/* Save & Download actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                'bg-k-yellow text-k-black hover:bg-k-yellow-hover',
                isSaving && 'opacity-70 pointer-events-none',
              )}
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              {isSaving ? 'Saving...' : 'Save to Library'}
            </button>
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all',
                'text-muted-foreground hover:bg-accent hover:text-foreground',
                isDownloading && 'opacity-70 pointer-events-none',
              )}
              onClick={onDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>
      )}

      {/* Hint when no operation selected */}
      {!hasResult && hasOperation && (
        <div className="col-span-full text-center py-4">
          <p className="text-xs text-muted-foreground">
            Click <span className="font-semibold text-k-yellow">Run</span> to preview the
            transformation
          </p>
        </div>
      )}

      {/* Object Detection / Classification */}
      <div className="col-span-full mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            AI Analysis
          </span>
        </div>
        <DetectionPanel
          imageUuid={imageUuid}
          source="image"
          imageSrc={originalPreview.preview}
          imageWidth={originalPreview.width}
          imageHeight={originalPreview.height}
        />
      </div>
    </div>
  )
}

function DocumentWorkspace({
  documentChunks,
  documentSummary,
  hasOperation,
}: {
  documentChunks: DocumentChunks | null
  documentSummary: {
    summary: import('@/types').DocumentSummary | null
    text_preview: string
  } | null
  hasOperation: boolean
}) {
  const summary = documentSummary?.summary

  return (
    <div className="space-y-4">
      {/* Auto-generated summary card (always visible when available) */}
      {summary && (
        <div className="rounded-xl border border-k-blue-light/20 bg-k-blue-light/5 p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-k-blue-light" />
            <span className="text-[11px] font-semibold text-k-blue-light uppercase tracking-wider">
              Auto-Summary
            </span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              Gemini
            </Badge>
          </div>
          {summary.title && (
            <h4 className="text-sm font-semibold text-foreground mb-1">{summary.title}</h4>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">
            {summary.summary}
          </p>
          {summary.key_topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {summary.key_topics.map((topic, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {topic}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chunks operation */}
      {!hasOperation && !summary && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileSearch className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-xs text-muted-foreground">
            Select <span className="font-semibold">View Chunks</span> to see extracted text
            segments
          </p>
        </div>
      )}

      {!hasOperation && summary && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Select <span className="font-semibold">View Chunks</span> for full text segments
          </p>
        </div>
      )}

      {hasOperation && !documentChunks && (
        <div className="text-center py-12">
          <p className="text-xs text-muted-foreground">
            Click <span className="font-semibold text-k-yellow">Run</span> to extract document
            chunks
          </p>
        </div>
      )}

      {documentChunks && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {documentChunks.total} chunks
            </Badge>
          </div>
          <div className="space-y-2">
            {documentChunks.chunks.map((chunk, i) => (
              <div
                key={i}
                className="rounded-lg border border-border p-3 bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    #{i + 1}
                  </span>
                  {chunk.heading && (
                    <span className="text-[10px] font-medium text-k-blue-light truncate">
                      {chunk.heading}
                    </span>
                  )}
                  {chunk.page !== undefined && chunk.page !== null && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      p.{chunk.page}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{chunk.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VideoWorkspace({
  videoUuid,
  videoFrames,
  transcription,
  videoTransformResult,
  selectedOperation,
  isSaving,
  onSaveVideoResult,
  onSaveExtractedFrame,
}: {
  videoUuid: string
  videoFrames: VideoFrames | null
  transcription: Transcription | null
  videoTransformResult: VideoTransformResult | null
  selectedOperation: Operation | null
  isSaving: boolean
  onSaveVideoResult: () => void
  onSaveExtractedFrame: () => void
}) {
  const [analyzingFrame, setAnalyzingFrame] = useState<number | null>(null)
  if (!selectedOperation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Film className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-xs text-muted-foreground">
          Select an operation to explore video frames, metadata, or transforms
        </p>
      </div>
    )
  }

  if (selectedOperation.id === 'view_frames') {
    if (!videoFrames) {
      return <RunPrompt label="extract keyframes" />
    }
    return (
      <div className="space-y-3 animate-fade-in">
        <Badge variant="secondary" className="text-[10px]">
          {videoFrames.total} keyframes
        </Badge>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {videoFrames.frames.map((frame, i) => (
            <div key={i} className="relative rounded-lg border border-border overflow-hidden group">
              <img
                src={frame.frame}
                alt={`Frame ${frame.position}`}
                className="w-full aspect-video object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-0.5 flex items-center justify-between">
                <span className="text-[10px] text-white/80 font-mono">
                  {frame.position}s
                </span>
                <button
                  className="text-[9px] text-violet-300 hover:text-violet-100 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setAnalyzingFrame(analyzingFrame === i ? null : i)}
                >
                  {analyzingFrame === i ? 'Close' : 'Detect'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Frame detection panel */}
        {analyzingFrame !== null && videoFrames.frames[analyzingFrame] && (
          <div className="mt-3 pt-3 border-t border-border/50 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Frame {analyzingFrame} Detection
              </span>
            </div>
            <DetectionPanel
              imageUuid={videoUuid}
              source="video_frame"
              frameIdx={analyzingFrame}
              imageSrc={videoFrames.frames[analyzingFrame].frame}
              imageWidth={640}
              imageHeight={360}
            />
          </div>
        )}
      </div>
    )
  }

  if (selectedOperation.id === 'view_transcription') {
    return <TranscriptionView transcription={transcription} />
  }

  if (selectedOperation.id === 'view_metadata') {
    if (!videoTransformResult || videoTransformResult.operation !== 'view_metadata') {
      return <RunPrompt label="load metadata" />
    }
    const { metadata, duration } = videoTransformResult
    const entries: [string, string | number | null | undefined][] = [
      ['Duration', duration != null ? `${duration}s` : null],
      ['Resolution', metadata.width && metadata.height ? `${metadata.width} x ${metadata.height}` : null],
      ['FPS', metadata.fps],
      ['Codec', metadata.codec],
      ['Profile', metadata.profile],
      ['Pixel Format', metadata.pix_fmt],
      ['Total Frames', metadata.total_frames],
      ['Bit Rate', metadata.bit_rate != null ? `${Math.round(metadata.bit_rate / 1000)} kbps` : null],
      ['File Size', metadata.format_size != null ? `${(metadata.format_size / (1024 * 1024)).toFixed(2)} MB` : null],
    ]
    return (
      <div className="space-y-3 animate-fade-in">
        <Badge variant="secondary" className="text-[10px]">Video Metadata</Badge>
        <div className="rounded-xl border border-border bg-card/50 divide-y divide-border">
          {entries.map(([label, value]) =>
            value != null ? (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-foreground font-mono">{value}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>
    )
  }

  if (selectedOperation.id === 'extract_frame') {
    if (!videoTransformResult || videoTransformResult.operation !== 'extract_frame') {
      return <RunPrompt label="extract frame" />
    }
    const { frame, width, height, timestamp } = videoTransformResult
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            Frame @ {timestamp}s
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {width} x {height}
          </Badge>
          <button
            onClick={onSaveExtractedFrame}
            disabled={isSaving}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-k-yellow/10 text-k-yellow text-[10px] font-medium hover:bg-k-yellow/20 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save as Image
          </button>
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-black/20">
          <img
            src={frame}
            alt={`Extracted frame at ${timestamp}s`}
            className="w-full object-contain max-h-[500px]"
          />
        </div>
      </div>
    )
  }

  if (selectedOperation.id === 'clip_video') {
    if (!videoTransformResult || videoTransformResult.operation !== 'clip_video') {
      return <RunPrompt label="create clip" />
    }
    const { video_url, duration: clipDuration } = videoTransformResult
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            Clip {clipDuration != null ? `(${clipDuration}s)` : ''}
          </Badge>
          <button
            onClick={onSaveVideoResult}
            disabled={isSaving}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-k-yellow/10 text-k-yellow text-[10px] font-medium hover:bg-k-yellow/20 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save as Video
          </button>
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-black">
          <video
            src={video_url}
            controls
            className="w-full max-h-[500px]"
          />
        </div>
      </div>
    )
  }

  if (selectedOperation.id === 'overlay_text') {
    if (!videoTransformResult || videoTransformResult.operation !== 'overlay_text') {
      return <RunPrompt label="apply text overlay" />
    }
    const { video_url } = videoTransformResult
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">Text Overlay</Badge>
          <button
            onClick={onSaveVideoResult}
            disabled={isSaving}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-k-yellow/10 text-k-yellow text-[10px] font-medium hover:bg-k-yellow/20 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save as Video
          </button>
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-black">
          <video
            src={video_url}
            controls
            className="w-full max-h-[500px]"
          />
        </div>
      </div>
    )
  }

  if (selectedOperation.id === 'detect_scenes') {
    if (!videoTransformResult || videoTransformResult.operation !== 'detect_scenes') {
      return <RunPrompt label="detect scenes" />
    }
    const { scenes, total_duration, scene_count } = videoTransformResult
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {scene_count} scene{scene_count !== 1 ? 's' : ''} detected
          </Badge>
          {total_duration != null && (
            <Badge variant="outline" className="text-[10px]">
              {total_duration}s total
            </Badge>
          )}
        </div>

        {/* Scene timeline bar */}
        {total_duration != null && total_duration > 0 && (
          <div className="rounded-lg border border-border p-3 bg-card/50">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Timeline</p>
            <div className="relative h-6 bg-muted/30 rounded-md overflow-hidden flex">
              {scenes.map((scene, i) => {
                const widthPercent = (scene.duration / total_duration) * 100
                const colors = [
                  'bg-k-yellow/60', 'bg-k-blue-light/60', 'bg-k-red/60',
                  'bg-green-500/60', 'bg-purple-500/60', 'bg-orange-500/60',
                  'bg-pink-500/60', 'bg-cyan-500/60',
                ]
                return (
                  <div
                    key={i}
                    className={cn('h-full border-r border-background/40', colors[i % colors.length])}
                    style={{ width: `${Math.max(widthPercent, 0.5)}%` }}
                    title={`Scene ${i + 1}: ${scene.start_time.toFixed(1)}s – ${(scene.start_time + scene.duration).toFixed(1)}s`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Scene list */}
        <div className="rounded-xl border border-border bg-card/50 divide-y divide-border">
          {scenes.map((scene, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted/40 text-[10px] font-bold text-muted-foreground shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-foreground">Scene {i + 1}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {scene.start_time.toFixed(1)}s
                </span>
                <span className="text-foreground">{scene.duration.toFixed(1)}s</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function RunPrompt({ label }: { label: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-xs text-muted-foreground">
        Click <span className="font-semibold text-k-yellow">Run</span> to {label}
      </p>
    </div>
  )
}

function AudioWorkspace({
  transcription,
  hasOperation,
}: {
  transcription: Transcription | null
  hasOperation: boolean
}) {
  if (!hasOperation) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Mic className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-xs text-muted-foreground">
          Select <span className="font-semibold">View Transcription</span> to see audio text
        </p>
      </div>
    )
  }

  return <TranscriptionView transcription={transcription} />
}

function TranscriptionView({ transcription }: { transcription: Transcription | null }) {
  if (!transcription) {
    return (
      <div className="text-center py-12">
        <p className="text-xs text-muted-foreground">
          Click <span className="font-semibold text-k-yellow">Run</span> to load transcription
        </p>
      </div>
    )
  }

  if (transcription.sentences.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xs text-muted-foreground">
          No transcription available. The file may still be processing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {transcription.sentences.length} sentences
        </Badge>
      </div>
      <div className="rounded-xl border border-border p-4 bg-card/50">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {transcription.full_text}
        </p>
      </div>
    </div>
  )
}

function CsvWorkspace({
  csvData,
  isLoading,
  tableName,
  onPageChange,
  onDataChanged,
}: {
  csvData: CsvRowsResponse | null
  isLoading: boolean
  tableName: string
  onPageChange: (offset: number) => void
  onDataChanged: () => Promise<void>
}) {
  const { addToast } = useToast()

  // Editing state: which cell is being edited
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Add row state
  const [isAddingRow, setIsAddingRow] = useState(false)
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({})

  // Delete row state
  const [deletingRowIdx, setDeletingRowIdx] = useState<number | null>(null)

  // Undo state (single revert via table.revert())
  const [canUndo, setCanUndo] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  // Focus the edit input when editing starts
  useEffect(() => {
    if (editingCell) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingCell])

  const handleStartEdit = useCallback((rowIdx: number, col: string, currentValue: unknown) => {
    setEditingCell({ rowIdx, col })
    setEditValue(currentValue != null ? String(currentValue) : '')
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingCell || !csvData || !tableName) return
    const row = csvData.rows[editingCell.rowIdx]
    if (!row) return

    const originalValue = row[editingCell.col]
    if (String(originalValue ?? '') === editValue) {
      handleCancelEdit()
      return
    }

    setIsSaving(true)
    try {
      await api.updateCsvRow(tableName, row, { [editingCell.col]: editValue })
      addToast('Cell updated', 'success')
      handleCancelEdit()
      setCanUndo(true)
      await onDataChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [editingCell, csvData, tableName, editValue, handleCancelEdit, addToast, onDataChanged])

  const handleAddRow = useCallback(async () => {
    if (!csvData || !tableName) return
    setIsSaving(true)
    try {
      await api.addCsvRows(tableName, [newRowValues])
      addToast('Row added', 'success')
      setIsAddingRow(false)
      setNewRowValues({})
      setCanUndo(true)
      await onDataChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Add failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [csvData, tableName, newRowValues, addToast, onDataChanged])

  const handleDeleteRow = useCallback(async (rowIdx: number) => {
    if (!csvData || !tableName) return
    const row = csvData.rows[rowIdx]
    if (!row) return

    setDeletingRowIdx(rowIdx)
    try {
      await api.deleteCsvRows(tableName, row)
      addToast('Row deleted', 'success')
      setCanUndo(true)
      await onDataChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setDeletingRowIdx(null)
    }
  }, [csvData, tableName, addToast, onDataChanged])

  const handleRevert = useCallback(async () => {
    if (!tableName || isReverting) return
    setIsReverting(true)
    try {
      await api.revertCsvTable(tableName)
      addToast('Reverted to previous version', 'success')
      setCanUndo(false)
      await onDataChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Revert failed', 'error')
    } finally {
      setIsReverting(false)
    }
  }, [tableName, isReverting, addToast, onDataChanged])

  if (isLoading && !csvData) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
      </div>
    )
  }

  if (!csvData) {
    return (
      <div className="text-center py-12">
        <Table2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm font-medium">No data</p>
        <p className="text-xs text-muted-foreground mt-1">This table has no rows.</p>
      </div>
    )
  }

  const { columns, rows, total, offset, limit } = csvData
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)
  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {total} rows
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {columns.length} columns
          </Badge>
          <button
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
              isAddingRow
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              setIsAddingRow(!isAddingRow)
              setNewRowValues({})
            }}
          >
            <Plus className="h-3 w-3" />
            Add row
          </button>
          {canUndo && (
            <button
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              onClick={handleRevert}
              disabled={isReverting}
              title="Undo last operation (table.revert)"
            >
              {isReverting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Undo
            </button>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent disabled:opacity-30 transition-colors"
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={!hasPrev || isLoading}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent disabled:opacity-30 transition-colors"
              onClick={() => onPageChange(offset + limit)}
              disabled={!hasNext || isLoading}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Add Row Form */}
      {isAddingRow && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 animate-fade-in">
          <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">New Row</p>
          <div className="grid grid-cols-2 gap-2">
            {columns.map((col) => (
              <div key={col} className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{col}</label>
                <input
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  value={newRowValues[col] ?? ''}
                  onChange={(e) => setNewRowValues((prev) => ({ ...prev, [col]: e.target.value }))}
                  placeholder={col}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors',
                isSaving && 'opacity-50 pointer-events-none',
              )}
              onClick={handleAddRow}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => { setIsAddingRow(false); setNewRowValues({}) }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left font-semibold text-muted-foreground px-3 py-2 text-[10px] uppercase tracking-wider w-10">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left font-semibold text-muted-foreground px-3 py-2 text-[10px] uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors group"
                >
                  <td className="px-3 py-1.5 text-muted-foreground/50 tabular-nums">
                    {offset + idx + 1}
                  </td>
                  {columns.map((col) => {
                    const val = row[col]
                    const isEditing = editingCell?.rowIdx === idx && editingCell?.col === col

                    if (isEditing) {
                      return (
                        <td key={col} className="px-1.5 py-0.5">
                          <div className="flex items-center gap-1">
                            <input
                              ref={editInputRef}
                              className="h-6 flex-1 min-w-[60px] rounded border border-k-yellow/40 bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-k-yellow/50"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              disabled={isSaving}
                            />
                            <button
                              className="h-5 w-5 rounded flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </button>
                            <button
                              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td
                        key={col}
                        className="px-3 py-1.5 text-foreground max-w-[200px] truncate cursor-pointer hover:bg-k-yellow/5 transition-colors"
                        title={`Click to edit — ${val != null ? String(val) : 'null'}`}
                        onClick={() => handleStartEdit(idx, col, val)}
                      >
                        {val != null ? String(val) : (
                          <span className="text-muted-foreground/40 italic">null</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5">
                    <button
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/0 group-hover:text-destructive/60 hover:!text-destructive hover:bg-destructive/10 transition-all"
                      onClick={() => handleDeleteRow(idx)}
                      disabled={deletingRowIdx === idx}
                      title="Delete row"
                    >
                      {deletingRowIdx === idx ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="text-center py-8 text-muted-foreground text-xs">
                    No rows. Click "Add row" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
