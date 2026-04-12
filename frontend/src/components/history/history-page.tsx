import { useState, useCallback } from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'
import { useNavigate } from 'react-router-dom'
import {
  Trash2,
  Download,
  Search,
  Loader2,
  Clock,
  MessageSquare,
  Bug,
  Brain,
  FileText,
  ImageIcon,
  Film,
  Music,
  Sparkles,
  Wand2,
  Upload,
  User,
  Database,
  ArrowRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { Conversation, TimelineEvent } from '@/types'
import { cn } from '@/lib/utils'

type HistoryView = 'conversations' | 'timeline'

export function HistoryPage() {
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [view, setView] = useState<HistoryView>('conversations')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Timeline state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)

  const fetchConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getConversations()
      setConversations(data)
    } catch {
      addToast('Failed to load conversations', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useMountEffect(() => {
    fetchConversations()
  })

  const loadTimeline = useCallback(async () => {
    setIsLoadingTimeline(true)
    try {
      const result = await api.getTimeline(200)
      setTimelineEvents(result.events)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load timeline', 'error')
    } finally {
      setIsLoadingTimeline(false)
    }
  }, [addToast])

  const handleSetView = useCallback((newView: HistoryView) => {
    setView(newView)
    if (newView === 'timeline') {
      loadTimeline()
    }
  }, [loadTimeline])

  const handleOpenConversation = useCallback(
    (conversationId: string) => {
      navigate(`/?c=${conversationId}`)
    },
    [navigate],
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation()
      try {
        await api.deleteConversation(conversationId)
        addToast('Conversation deleted', 'success')
        setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId))
        window.dispatchEvent(new Event('conversations-changed'))
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast],
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

  const filteredConversations = conversations.filter(
    (c) => !search || c.title.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">History</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium transition-colors',
                view === 'conversations'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleSetView('conversations')}
            >
              <MessageSquare className="h-3 w-3 inline mr-1" />
              Conversations
            </button>
            <button
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium transition-colors border-l border-border',
                view === 'timeline'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleSetView('timeline')}
            >
              <Clock className="h-3 w-3 inline mr-1" />
              Timeline
            </button>
          </div>

          {view === 'conversations' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Timeline view */}
      {view === 'timeline' && (
        <TimelineView events={timelineEvents} isLoading={isLoadingTimeline} />
      )}

      {/* Conversations view */}
      {view === 'conversations' && (
        <>
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

          <ScrollArea className="flex-1 px-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-k-yellow mb-2" />
                <p className="text-xs text-muted-foreground">Loading conversations...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <MessageSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              <div className="space-y-1.5 pb-4">
                {filteredConversations.map((convo, i) => (
                  <div
                    key={convo.conversation_id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 p-3 hover:bg-card hover:border-border transition-all group cursor-pointer animate-fade-in"
                    style={{ animationDelay: `${i * 30}ms` }}
                    onClick={() => handleOpenConversation(convo.conversation_id)}
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {convo.title || 'New conversation'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(convo.updated_at).toLocaleString()}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {convo.message_count} messages
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenConversation(convo.conversation_id)
                        }}
                        title="Open conversation"
                      >
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                        onClick={(e) => handleDelete(e, convo.conversation_id)}
                        title="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  )
}

// ── Timeline View ────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, typeof Database> = {
  Query: MessageSquare,
  Chat: MessageSquare,
  Memory: Brain,
  Document: FileText,
  Image: ImageIcon,
  Video: Film,
  Audio: Music,
  ImageGen: Sparkles,
  VideoGen: Wand2,
  CSV: Upload,
  Persona: User,
}

const EVENT_COLORS: Record<string, string> = {
  Query: 'text-blue-400',
  Chat: 'text-sky-400',
  Memory: 'text-purple-400',
  Document: 'text-amber-400',
  Image: 'text-emerald-400',
  Video: 'text-rose-400',
  Audio: 'text-orange-400',
  ImageGen: 'text-pink-400',
  VideoGen: 'text-red-400',
  CSV: 'text-cyan-400',
  Persona: 'text-indigo-400',
}

function TimelineView({
  events,
  isLoading,
}: {
  events: TimelineEvent[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2">
        <Clock className="h-10 w-10 text-muted-foreground/15" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    )
  }

  // Group events by date
  const groups: Record<string, TimelineEvent[]> = {}
  for (const event of events) {
    const dateKey = event.timestamp
      ? new Date(event.timestamp).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'Unknown date'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(event)
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 w-full">
      {Object.entries(groups).map(([date, dateEvents]) => (
        <div key={date} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider shrink-0">
              {date}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-1">
            {dateEvents.map((event, idx) => {
              const Icon = EVENT_ICONS[event.type] ?? Database
              const colorClass = EVENT_COLORS[event.type] ?? 'text-muted-foreground'
              const time = event.timestamp
                ? new Date(event.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''

              return (
                <div
                  key={`${event.table}-${idx}`}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors"
                >
                  <div className={cn('mt-0.5 shrink-0', colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('text-[8px] shrink-0', colorClass)}
                      >
                        {event.type}
                      </Badge>
                      {event.role && (
                        <span className="text-[9px] text-muted-foreground/50">
                          {event.role}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-foreground/80 mt-0.5 line-clamp-2">
                      {event.label}
                    </p>
                  </div>
                  <span className="text-[9px] text-muted-foreground/40 tabular-nums shrink-0 mt-0.5">
                    {time}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
