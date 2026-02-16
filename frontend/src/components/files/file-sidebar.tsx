import { useState, useCallback, useEffect, useRef } from 'react'
import { Upload, Link, Trash2, FileText, ImageIcon, Film, Music, Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { FileItem } from '@/types'
import { cn } from '@/lib/utils'

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
}

const FILE_TYPE_COLORS: Record<string, string> = {
  document: 'text-k-blue-light',
  image: 'text-k-yellow',
  video: 'text-k-red',
  audio: 'text-green-500',
}

interface FileSection {
  key: string
  label: string
  items: FileItem[]
}

export function FileSidebar() {
  const { addToast } = useToast()
  const [sections, setSections] = useState<FileSection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    try {
      const ctx = await api.getContextInfo()
      setSections([
        { key: 'document', label: 'Documents', items: ctx.documents },
        { key: 'image', label: 'Images', items: ctx.images },
        { key: 'video', label: 'Videos', items: ctx.videos },
        { key: 'audio', label: 'Audio', items: ctx.audios },
      ])
    } catch {
      // Silently fail for sidebar refresh
    }
  }, [])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setIsLoading(true)
      try {
        for (const file of Array.from(files)) {
          await api.uploadFile(file)
          addToast(`Uploaded ${file.name}`, 'success')
        }
        await fetchFiles()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Upload failed', 'error')
      } finally {
        setIsLoading(false)
      }
    },
    [addToast, fetchFiles],
  )

  const handleAddUrl = useCallback(async () => {
    if (!urlInput.trim()) return
    setIsLoading(true)
    try {
      await api.addUrl(urlInput.trim())
      addToast('URL added', 'success')
      setUrlInput('')
      setShowUrlInput(false)
      await fetchFiles()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to add URL', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [urlInput, addToast, fetchFiles])

  const handleDelete = useCallback(
    async (uuid: string, fileType: string) => {
      try {
        await api.deleteFile(uuid, fileType)
        addToast('File deleted', 'success')
        await fetchFiles()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchFiles],
  )

  const handleDeleteAll = useCallback(
    async (fileType: string) => {
      try {
        await api.deleteAll(fileType)
        addToast(`All ${fileType}s deleted`, 'success')
        await fetchFiles()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchFiles],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleUpload(e.dataTransfer.files)
    },
    [handleUpload],
  )

  const totalFiles = sections.reduce((acc, s) => acc + s.items.length, 0)

  return (
    <div className="h-full overflow-hidden">
      <div className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Files & Context</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {totalFiles} file{totalFiles !== 1 ? 's' : ''} uploaded
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer',
            isDragging
              ? 'border-k-yellow bg-k-yellow/5 scale-[1.02]'
              : 'border-border hover:border-muted-foreground/30',
            isLoading && 'opacity-60 pointer-events-none',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 mx-auto mb-1.5 text-k-yellow animate-spin" />
          ) : (
            <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground">
            {isLoading ? 'Uploading...' : 'Drop files or click to upload'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        {/* URL toggle + input */}
        {!showUrlInput ? (
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
            onClick={() => setShowUrlInput(true)}
          >
            <Link className="h-3 w-3" /> Add from URL
          </button>
        ) : (
          <div className="flex gap-1">
            <Input
              placeholder="https://..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              className="text-xs h-8 rounded-lg"
              autoFocus
            />
            <button
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              onClick={handleAddUrl}
              disabled={isLoading}
            >
              <Link className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => {
                setShowUrlInput(false)
                setUrlInput('')
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* File sections */}
        {sections.map((section) => {
          if (section.items.length === 0) return null
          const Icon = FILE_TYPE_ICONS[section.key] || FileText
          const colorClass = FILE_TYPE_COLORS[section.key] || 'text-muted-foreground'
          return (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', colorClass)} />
                  <span className="text-xs font-medium">{section.label}</span>
                  <span className="text-[10px] text-muted-foreground">({section.items.length})</span>
                </div>
                <button
                  className="text-[10px] text-destructive/70 hover:text-destructive transition-colors"
                  onClick={() => handleDeleteAll(section.key)}
                >
                  Clear
                </button>
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <div
                    key={item.uuid}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent/50 group transition-colors min-w-0"
                  >
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="h-7 w-7 rounded-md object-cover shrink-0 border border-border/50"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className={cn('h-3 w-3', colorClass)} />
                      </div>
                    )}
                    <span
                      className="flex-1 min-w-0 truncate text-muted-foreground group-hover:text-foreground transition-colors"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <button
                      className="h-5 w-5 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                      onClick={() => handleDelete(item.uuid, section.key)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {totalFiles === 0 && !isLoading && (
          <div className="py-8 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No files yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Upload documents, images, videos, or audio
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
