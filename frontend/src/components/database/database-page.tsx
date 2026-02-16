import { useState, useEffect, useCallback } from 'react'
import {
  Database,
  Table2,
  Eye,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Columns3,
  Rows3,
  Cpu,
  Clock,
  MessageSquare,
  Brain,
  FileText,
  ImageIcon,
  Film,
  Music,
  Sparkles,
  Wand2,
  Upload,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { TableInfo, TableRowsResponse, TimelineEvent } from '@/types'

type DbView = 'tables' | 'timeline'

export function DatabasePage() {
  const { addToast } = useToast()
  const [view, setView] = useState<DbView>('tables')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [rowData, setRowData] = useState<TableRowsResponse | null>(null)
  const [isLoadingRows, setIsLoadingRows] = useState(false)

  // Timeline state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const result = await api.listTables()
        setTables(result.tables)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load tables', 'error')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [addToast])

  useEffect(() => {
    if (view !== 'timeline') return
    async function loadTimeline() {
      setIsLoadingTimeline(true)
      try {
        const result = await api.getTimeline(200)
        setTimelineEvents(result.events)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load timeline', 'error')
      } finally {
        setIsLoadingTimeline(false)
      }
    }
    loadTimeline()
  }, [view, addToast])

  const handleSelectTable = useCallback(
    async (table: TableInfo) => {
      setSelectedTable(table)
      setIsLoadingRows(true)
      setRowData(null)
      try {
        const rows = await api.getTableRows(table.path, 50, 0)
        setRowData(rows)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load rows', 'error')
      } finally {
        setIsLoadingRows(false)
      }
    },
    [addToast],
  )

  const handlePageChange = useCallback(
    async (newOffset: number) => {
      if (!selectedTable) return
      setIsLoadingRows(true)
      try {
        const rows = await api.getTableRows(selectedTable.path, 50, newOffset)
        setRowData(rows)
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load rows', 'error')
      } finally {
        setIsLoadingRows(false)
      }
    },
    [selectedTable, addToast],
  )

  // Group tables by prefix (e.g. agents.csv_*, agents.video_*, etc.)
  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0)
  const tableCount = tables.filter((t) => t.type === 'table').length
  const viewCount = tables.filter((t) => t.type === 'view').length

  if (view === 'timeline') {
    return (
      <div className="flex h-full overflow-hidden flex-col">
        <TimelineHeader view={view} onViewChange={setView} tableCount={tables.length} totalRows={totalRows} />
        <TimelineView events={timelineEvents} isLoading={isLoadingTimeline} />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: table list */}
      <div className="w-72 shrink-0 border-r border-border/60 flex flex-col bg-card/20">
        <TimelineHeader view={view} onViewChange={setView} tableCount={tables.length} totalRows={totalRows} />

        {/* Stats bar */}
        <div className="flex gap-2 px-4 pb-3">
          <Badge variant="secondary" className="text-[9px]">
            <Table2 className="h-2.5 w-2.5 mr-1" />
            {tableCount} tables
          </Badge>
          <Badge variant="secondary" className="text-[9px]">
            <Eye className="h-2.5 w-2.5 mr-1" />
            {viewCount} views
          </Badge>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {tables.map((table) => {
                const isSelected = selectedTable?.path === table.path
                const shortName = table.path.replace(/^agents\//, '')
                return (
                  <button
                    key={table.path}
                    className={cn(
                      'flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-left transition-colors group',
                      isSelected
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                    onClick={() => handleSelectTable(table)}
                  >
                    {table.type === 'view' ? (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    ) : (
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{shortName}</p>
                      <p className="text-[9px] text-muted-foreground/60">
                        {table.columns.length} cols &middot; {table.row_count.toLocaleString()} rows
                      </p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
                      )}
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: table details + rows */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Database className="h-12 w-12 text-muted-foreground/15" />
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">Select a table</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Browse the Pixeltable catalog and inspect data
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Schema header */}
            <div className="px-5 pt-4 pb-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground font-mono">
                  {selectedTable.path}
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px]',
                    selectedTable.type === 'view' ? 'text-blue-400 border-blue-400/30' : 'text-emerald-400 border-emerald-400/30',
                  )}
                >
                  {selectedTable.type}
                </Badge>
                {selectedTable.base_table && (
                  <span className="text-[10px] text-muted-foreground/60">
                    from {selectedTable.base_table}
                  </span>
                )}
              </div>

              {/* Column chips */}
              <div className="flex flex-wrap gap-1.5">
                {selectedTable.columns.map((col) => (
                  <div
                    key={col.name}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] border',
                      col.is_computed
                        ? 'border-amber-500/20 bg-amber-500/5 text-amber-400'
                        : 'border-border bg-muted/30 text-muted-foreground',
                    )}
                  >
                    {col.is_computed ? (
                      <Cpu className="h-2.5 w-2.5" />
                    ) : (
                      <Columns3 className="h-2.5 w-2.5" />
                    )}
                    <span className="font-mono font-medium">{col.name}</span>
                    <span className="text-[8px] opacity-60">{col.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Data grid */}
            <div className="flex-1 overflow-auto">
              {isLoadingRows ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
                </div>
              ) : !rowData || rowData.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Rows3 className="h-8 w-8 text-muted-foreground/15" />
                  <p className="text-xs text-muted-foreground">No rows in this table</p>
                </div>
              ) : (
                <div className="min-w-full">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-card/90 backdrop-blur-sm z-10">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground/60 text-[9px] w-10">
                          #
                        </th>
                        {rowData.columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left font-medium text-muted-foreground font-mono whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowData.rows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border/30 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-3 py-1.5 text-muted-foreground/40 tabular-nums">
                            {rowData.offset + idx + 1}
                          </td>
                          {rowData.columns.map((col) => {
                            const val = row[col]
                            const displayVal = formatCellValue(val)
                            return (
                              <td
                                key={col}
                                className="px-3 py-1.5 text-foreground/80 max-w-[300px] truncate font-mono"
                                title={typeof val === 'string' ? val : JSON.stringify(val)}
                              >
                                {displayVal}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination footer */}
            {rowData && rowData.total > rowData.limit && (
              <div className="flex items-center justify-between px-5 py-2 border-t border-border/60 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {rowData.total.toLocaleString()} rows total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent disabled:opacity-30 transition-colors"
                    onClick={() => handlePageChange(Math.max(0, rowData.offset - rowData.limit))}
                    disabled={rowData.offset === 0 || isLoadingRows}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {Math.floor(rowData.offset / rowData.limit) + 1} /{' '}
                    {Math.ceil(rowData.total / rowData.limit)}
                  </span>
                  <button
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent disabled:opacity-30 transition-colors"
                    onClick={() => handlePageChange(rowData.offset + rowData.limit)}
                    disabled={rowData.offset + rowData.limit >= rowData.total || isLoadingRows}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') {
    if (val.startsWith('<binary')) return val
    if (val.length > 120) return val.slice(0, 120) + '...'
    return val
  }
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (Array.isArray(val)) return `[${val.length} items]`
  if (typeof val === 'object') {
    const s = JSON.stringify(val)
    return s.length > 120 ? s.slice(0, 120) + '...' : s
  }
  return String(val)
}

// ── Shared Header ────────────────────────────────────────────────────────────

function TimelineHeader({
  view,
  onViewChange,
  tableCount,
  totalRows,
}: {
  view: DbView
  onViewChange: (v: DbView) => void
  tableCount: number
  totalRows: number
}) {
  return (
    <div className="px-4 pt-5 pb-3">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Database className="h-4 w-4 text-k-yellow" />
          Database
        </h2>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            className={cn(
              'px-2.5 py-1 text-[10px] font-medium transition-colors',
              view === 'tables'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onViewChange('tables')}
          >
            <Table2 className="h-3 w-3 inline mr-1" />
            Tables
          </button>
          <button
            className={cn(
              'px-2.5 py-1 text-[10px] font-medium transition-colors border-l border-border',
              view === 'timeline'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onViewChange('timeline')}
          >
            <Clock className="h-3 w-3 inline mr-1" />
            Timeline
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {tableCount} objects &middot; {totalRows.toLocaleString()} total rows
      </p>
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
    <div className="flex-1 overflow-y-auto px-6 py-4 max-w-3xl mx-auto w-full">
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
