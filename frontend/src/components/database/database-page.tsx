import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Database,
  Table2,
  Eye,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Columns3,
  Rows3,
  Cpu,
  MessageSquare,
  FileText,
  ImageIcon,
  Film,
  Music,
  Sparkles,
  Brain,
  Settings2,
  TableProperties,
  Search,
  Download,
  Filter,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { TableInfo, TableRowsResponse } from '@/types'

// ── Grouping logic ──────────────────────────────────────────────────────────

interface TableGroup {
  label: string
  icon: typeof Database
  color: string
  match: (shortName: string, table: TableInfo) => boolean
}

const GROUPS: TableGroup[] = [
  {
    label: 'Agent Pipeline',
    icon: MessageSquare,
    color: 'text-blue-400',
    match: (n) => ['tools', 'chat_history', 'collection'].includes(n),
  },
  {
    label: 'Documents',
    icon: FileText,
    color: 'text-amber-400',
    match: (n) => n === 'chunks',
  },
  {
    label: 'Images',
    icon: ImageIcon,
    color: 'text-emerald-400',
    match: (n) => n === 'images',
  },
  {
    label: 'Videos',
    icon: Film,
    color: 'text-rose-400',
    match: (n) => ['videos', 'video_frames', 'video_audio_chunks', 'video_transcript_sentences'].includes(n),
  },
  {
    label: 'Audio',
    icon: Music,
    color: 'text-orange-400',
    match: (n) => ['audios', 'audio_chunks', 'audio_transcript_sentences'].includes(n),
  },
  {
    label: 'Generation',
    icon: Sparkles,
    color: 'text-pink-400',
    match: (n) => n.includes('generation_tasks'),
  },
  {
    label: 'Memory & Config',
    icon: Brain,
    color: 'text-purple-400',
    match: (n) => ['memory_bank', 'user_personas'].includes(n),
  },
  {
    label: 'Data Tables',
    icon: TableProperties,
    color: 'text-cyan-400',
    match: (n) => n.startsWith('csv_'),
  },
]

function getShortName(path: string): string {
  return path.replace(/^agents\//, '')
}

interface GroupedTables {
  group: TableGroup
  tables: TableInfo[]
  views: TableInfo[]
}

function groupTables(tables: TableInfo[]): GroupedTables[] {
  const result: GroupedTables[] = GROUPS.map((g) => ({ group: g, tables: [], views: [] }))
  const ungrouped: TableInfo[] = []

  for (const table of tables) {
    const shortName = getShortName(table.path)
    let matched = false
    for (const entry of result) {
      if (entry.group.match(shortName, table)) {
        if (table.type === 'view') {
          entry.views.push(table)
        } else {
          entry.tables.push(table)
        }
        matched = true
        break
      }
    }
    if (!matched) ungrouped.push(table)
  }

  // Add ungrouped as "Other" if any
  if (ungrouped.length > 0) {
    result.push({
      group: { label: 'Other', icon: Settings2, color: 'text-muted-foreground', match: () => false },
      tables: ungrouped.filter((t) => t.type !== 'view'),
      views: ungrouped.filter((t) => t.type === 'view'),
    })
  }

  // Only return groups that have items
  return result.filter((g) => g.tables.length + g.views.length > 0)
}

// ── Component ───────────────────────────────────────────────────────────────

export function DatabasePage() {
  const { addToast } = useToast()
  const [tables, setTables] = useState<TableInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [rowData, setRowData] = useState<TableRowsResponse | null>(null)
  const [isLoadingRows, setIsLoadingRows] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [tableSearch, setTableSearch] = useState('')
  const [rowFilter, setRowFilter] = useState('')

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables
    const q = tableSearch.toLowerCase()
    return tables.filter((t) => t.path.toLowerCase().includes(q))
  }, [tables, tableSearch])

  const grouped = useMemo(() => groupTables(filteredTables), [filteredTables])

  const filteredRows = useMemo(() => {
    if (!rowData || !rowFilter.trim()) return rowData?.rows ?? []
    const q = rowFilter.toLowerCase()
    return rowData.rows.filter((row) =>
      rowData.columns.some((col) => {
        const val = row[col]
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(q)
      }),
    )
  }, [rowData, rowFilter])

  const handleDownloadCsv = useCallback(() => {
    if (!rowData || !selectedTable) return
    const rows = rowFilter.trim() ? filteredRows : rowData.rows
    if (rows.length === 0) {
      addToast('No rows to download', 'info')
      return
    }
    const cols = rowData.columns
    const csvLines: string[] = [cols.map(escapeCsvField).join(',')]
    for (const row of rows) {
      csvLines.push(cols.map((col) => escapeCsvField(formatCellValue(row[col]))).join(','))
    }
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${getShortName(selectedTable.path)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rowData, selectedTable, filteredRows, rowFilter, addToast])

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

  const handleSelectTable = useCallback(
    async (table: TableInfo) => {
      setSelectedTable(table)
      setIsLoadingRows(true)
      setRowData(null)
      setRowFilter('')
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

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0)
  const tableCount = tables.filter((t) => t.type === 'table').length
  const viewCount = tables.filter((t) => t.type === 'view').length

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: grouped table list */}
      <div className="w-72 shrink-0 border-r border-border/60 flex flex-col bg-card/20">
        <div className="px-4 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1.5">
            <Database className="h-4 w-4 text-k-yellow" />
            Database
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {tables.length} objects &middot; {totalRows.toLocaleString()} total rows
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex gap-2 px-4 pb-2">
          <Badge variant="secondary" className="text-[9px]">
            <Table2 className="h-2.5 w-2.5 mr-1" />
            {tableCount} tables
          </Badge>
          <Badge variant="secondary" className="text-[9px]">
            <Eye className="h-2.5 w-2.5 mr-1" />
            {viewCount} views
          </Badge>
        </div>

        {/* Table search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <Input
              placeholder="Filter tables..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="h-7 pl-7 pr-7 text-[11px] rounded-md"
            />
            {tableSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                onClick={() => setTableSearch('')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Grouped table list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
            </div>
          ) : (
            <div className="space-y-1">
              {grouped.map(({ group, tables: groupTables, views: groupViews }) => {
                const Icon = group.icon
                const isCollapsed = collapsedGroups.has(group.label)
                const itemCount = groupTables.length + groupViews.length

                return (
                  <div key={group.label}>
                    {/* Group header */}
                    <button
                      className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-accent/30 transition-colors"
                      onClick={() => toggleGroup(group.label)}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-150',
                          isCollapsed && '-rotate-90',
                        )}
                      />
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', group.color)} />
                      <span className="text-[11px] font-semibold text-muted-foreground flex-1">
                        {group.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                        {itemCount}
                      </span>
                    </button>

                    {/* Group items */}
                    {!isCollapsed && (
                      <div className="ml-3 pl-2.5 border-l border-border/30 space-y-px mt-0.5 mb-1">
                        {/* Tables first */}
                        {groupTables.map((table) => (
                          <TableItem
                            key={table.path}
                            table={table}
                            isSelected={selectedTable?.path === table.path}
                            onClick={() => handleSelectTable(table)}
                          />
                        ))}
                        {/* Then views */}
                        {groupViews.length > 0 && groupTables.length > 0 && (
                          <div className="py-0.5" />
                        )}
                        {groupViews.map((view) => (
                          <TableItem
                            key={view.path}
                            table={view}
                            isSelected={selectedTable?.path === view.path}
                            onClick={() => handleSelectTable(view)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
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
                <h3 className="text-sm font-semibold text-foreground font-mono flex-1 min-w-0 truncate">
                  {selectedTable.path}
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] shrink-0',
                    selectedTable.type === 'view' ? 'text-blue-400 border-blue-400/30' : 'text-emerald-400 border-emerald-400/30',
                  )}
                >
                  {selectedTable.type}
                </Badge>
                {selectedTable.base_table && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    from {selectedTable.base_table}
                  </span>
                )}
                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium shrink-0',
                    'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
                    (!rowData || rowData.rows.length === 0) && 'opacity-30 pointer-events-none',
                  )}
                  onClick={handleDownloadCsv}
                  disabled={!rowData || rowData.rows.length === 0}
                  title="Download visible rows as CSV"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
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

              {/* Row filter */}
              {rowData && rowData.rows.length > 0 && (
                <div className="relative mt-2.5">
                  <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                  <Input
                    placeholder="Filter rows..."
                    value={rowFilter}
                    onChange={(e) => setRowFilter(e.target.value)}
                    className="h-7 pl-7 pr-7 text-[11px] rounded-md"
                  />
                  {rowFilter && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                      onClick={() => setRowFilter('')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
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
              ) : filteredRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Search className="h-8 w-8 text-muted-foreground/15" />
                  <p className="text-xs text-muted-foreground">No rows match "{rowFilter}"</p>
                  <button
                    className="text-[10px] text-k-yellow hover:underline"
                    onClick={() => setRowFilter('')}
                  >
                    Clear filter
                  </button>
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
                      {filteredRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border/30 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-3 py-1.5 text-muted-foreground/40 tabular-nums">
                            {rowFilter ? idx + 1 : rowData.offset + idx + 1}
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
            {rowData && (rowData.total > rowData.limit || rowFilter) && (
              <div className="flex items-center justify-between px-5 py-2 border-t border-border/60 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {rowFilter
                    ? `${filteredRows.length} of ${rowData.rows.length} rows match`
                    : `${rowData.total.toLocaleString()} rows total`}
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

// ── Sub-components ──────────────────────────────────────────────────────────

function TableItem({
  table,
  isSelected,
  onClick,
}: {
  table: TableInfo
  isSelected: boolean
  onClick: () => void
}) {
  const shortName = getShortName(table.path)
  const isView = table.type === 'view'

  return (
    <button
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors group',
        isSelected
          ? 'bg-primary/10 text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      onClick={onClick}
    >
      {isView ? (
        <Eye className="h-3 w-3 shrink-0 text-blue-400/70" />
      ) : (
        <Table2 className="h-3 w-3 shrink-0 text-emerald-400/70" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{shortName}</p>
      </div>
      <span className="text-[9px] text-muted-foreground/40 tabular-nums shrink-0">
        {table.row_count.toLocaleString()}
      </span>
      <ChevronRight
        className={cn(
          'h-2.5 w-2.5 shrink-0 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50',
        )}
      />
    </button>
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

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
