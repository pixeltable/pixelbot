import { useState, useEffect, useCallback } from 'react'
import { Trash2, Download, ChevronRight, Search, Loader2, Clock, Zap, MessageSquare, Bug } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { WorkflowEntry, WorkflowDetail } from '@/types'
import { cn } from '@/lib/utils'

export function HistoryPage() {
  const { addToast } = useToast()
  const [entries, setEntries] = useState<WorkflowEntry[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDetail, setSelectedDetail] = useState<WorkflowDetail | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const fetchHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const ctx = await api.getContextInfo()
      setEntries(ctx.workflow_data)
    } catch {
      addToast('Failed to load history', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleViewDetail = useCallback(
    async (timestamp: string) => {
      try {
        const detail = await api.getWorkflowDetail(timestamp)
        setSelectedDetail(detail)
        setIsDetailOpen(true)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load detail', 'error')
      }
    },
    [addToast],
  )

  const handleDelete = useCallback(
    async (timestamp: string) => {
      try {
        await api.deleteHistory(timestamp)
        addToast('Entry deleted', 'success')
        await fetchHistory()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchHistory],
  )

  const handleDownload = useCallback(async () => {
    try {
      const blob = await api.downloadHistory()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'chat_history_full.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      addToast('Download failed', 'error')
    }
  }, [addToast])

  const handleDebugExport = useCallback(async () => {
    try {
      const blob = await api.debugExport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'agents_tools_debug_export.json'
      a.click()
      URL.revokeObjectURL(url)
      addToast('Debug export downloaded', 'success')
    } catch {
      addToast('Debug export failed', 'error')
    }
  }, [addToast])

  const filteredEntries = entries.filter(
    (e) =>
      !search ||
      e.prompt.toLowerCase().includes(search.toLowerCase()) ||
      e.answer?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">History</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entries.length} conversation{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleDebugExport}
            title="Export full agents.tools table with all columns for debugging"
          >
            <Bug className="h-3 w-3" /> Debug Export
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleDownload}
          >
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
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
            <p className="text-xs text-muted-foreground">Loading history...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-1.5 pb-4">
            {filteredEntries.map((entry, i) => (
              <div
                key={entry.timestamp}
                className={cn(
                  'flex items-center gap-3 rounded-xl border border-border/50 p-3 hover:bg-card hover:border-border transition-all group cursor-pointer animate-fade-in',
                )}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => handleViewDetail(entry.timestamp)}
              >
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.prompt}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {entry.answer?.slice(0, 100)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                    <span className="text-[10px] text-muted-foreground/70">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleViewDetail(entry.timestamp)
                    }}
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(entry.timestamp)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-k-yellow" />
              Workflow Detail
            </DialogTitle>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-4 text-sm">
                {/* Prompt */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Prompt</p>
                  <p className="text-sm">{selectedDetail.prompt}</p>
                </div>

                {/* Answer */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Answer</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedDetail.answer}</p>
                </div>

                {/* Parameters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Temperature</p>
                    <p className="text-lg font-semibold">{selectedDetail.temperature}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Max Tokens</p>
                    <p className="text-lg font-semibold">{selectedDetail.max_tokens}</p>
                  </div>
                </div>

                {/* System prompts */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Initial System Prompt</p>
                  <pre className="p-2.5 bg-muted rounded-md text-xs overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
                    {selectedDetail.initial_system_prompt}
                  </pre>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Final System Prompt</p>
                  <pre className="p-2.5 bg-muted rounded-md text-xs overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
                    {selectedDetail.final_system_prompt}
                  </pre>
                </div>

                {/* Tool output */}
                {selectedDetail.tool_output != null && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Tool Output</p>
                    <pre className="p-2.5 bg-muted rounded-md text-xs overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(selectedDetail.tool_output as Record<string, unknown>, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
