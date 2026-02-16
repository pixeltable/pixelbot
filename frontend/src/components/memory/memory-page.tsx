import { useState, useEffect, useCallback } from 'react'
import { Trash2, Download, Search, Plus, Loader2, Brain, Code, FileText, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { MemoryItem } from '@/types'
import { cn } from '@/lib/utils'

export function MemoryPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState<MemoryItem[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<'text' | 'code'>('text')
  const [newLanguage, setNewLanguage] = useState('')

  const fetchMemory = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getMemory(search || undefined)
      setItems(data)
    } catch {
      addToast('Failed to load memory', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast, search])

  useEffect(() => {
    fetchMemory()
  }, [fetchMemory])

  const handleDelete = useCallback(
    async (timestamp: string) => {
      try {
        await api.deleteMemory(timestamp)
        addToast('Memory item deleted', 'success')
        await fetchMemory()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchMemory],
  )

  const handleAdd = useCallback(async () => {
    if (!newContent.trim()) return
    try {
      await api.addMemoryManual({
        content: newContent,
        type: newType,
        language: newType === 'code' ? newLanguage || 'text' : null,
      })
      addToast('Memory item added', 'success')
      setNewContent('')
      setNewLanguage('')
      setIsAddOpen(false)
      await fetchMemory()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to add', 'error')
    }
  }, [newContent, newType, newLanguage, addToast, fetchMemory])

  const handleDownload = useCallback(async () => {
    try {
      const blob = await api.downloadMemory()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'memory_bank.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast('Download failed', 'error')
    }
  }, [addToast])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Memory Bank</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleDownload}
          >
            <Download className="h-3 w-3" /> Export
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Semantic search across memory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 px-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-k-yellow mb-2" />
            <p className="text-xs text-muted-foreground">Loading memory...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Brain className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">No memories yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              Save answers from chat or add manually to build your knowledge base
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {items.map((item, i) => (
              <div
                key={item.timestamp}
                className={cn(
                  'rounded-xl border border-border/50 p-3 group hover:bg-card hover:border-border transition-all animate-fade-in',
                )}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Type badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                          item.type === 'code'
                            ? 'bg-k-blue/10 text-k-blue-light'
                            : 'bg-k-yellow/10 text-k-yellow',
                        )}
                      >
                        {item.type === 'code' ? (
                          <Code className="h-2.5 w-2.5" />
                        ) : (
                          <FileText className="h-2.5 w-2.5" />
                        )}
                        {item.type}
                        {item.language && ` · ${item.language}`}
                      </div>
                      {item.sim !== undefined && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          sim: {item.sim.toFixed(3)}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className={cn(
                        'text-sm whitespace-pre-wrap leading-relaxed',
                        item.type === 'code' && 'font-mono text-xs bg-muted p-2.5 rounded-lg',
                      )}
                    >
                      {item.content}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
                      {item.context_query && (
                        <span className="truncate max-w-[200px]">
                          Context: {item.context_query}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                    onClick={() => handleDelete(item.timestamp)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-k-yellow" />
              Add Memory Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors',
                  newType === 'text'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => setNewType('text')}
              >
                <FileText className="h-3.5 w-3.5" /> Text
              </button>
              <button
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors',
                  newType === 'code'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                onClick={() => setNewType('code')}
              >
                <Code className="h-3.5 w-3.5" /> Code
              </button>
            </div>

            {newType === 'code' && (
              <Input
                placeholder="Language (e.g., python, javascript)"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
                className="rounded-lg"
              />
            )}

            <Textarea
              placeholder="Content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={6}
              className={cn('rounded-lg', newType === 'code' && 'font-mono text-sm')}
            />

            <button
              onClick={handleAdd}
              disabled={!newContent.trim()}
              className={cn(
                'w-full rounded-lg py-2.5 text-sm font-medium transition-all',
                newContent.trim()
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              Save to Memory
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
