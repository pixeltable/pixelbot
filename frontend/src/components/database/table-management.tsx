import { useState, useCallback } from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'
import {
  Plus,
  Trash2,
  PenLine,
  Undo2,
  Columns3,
  Cpu,
  Eye,
  Search as SearchIcon,
  FolderPlus,
  FolderMinus,
  Loader2,
  Copy,
  ChevronDown,
  ChevronRight,
  Zap,
  BookOpen,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type {
  TableInfo,
  MgmtResponse,
  ColumnTypeInfo,
  FunctionCategory,
  IteratorInfo,
  EmbeddingFunctionInfo,
  VersionEntry,
} from '@/types'

// ── Shared helpers ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-medium text-muted-foreground">{children}</label>
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-muted-foreground/60">{children}</p>
}

function ResultBanner({ result, onClear }: { result: MgmtResponse | null; onClear: () => void }) {
  if (!result) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-[11px] mt-3',
        result.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
      )}
    >
      <span className="flex-1">{result.message}</span>
      <button onClick={onClear} className="opacity-60 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Create Table Dialog ──────────────────────────────────────────────────────

interface SchemaEntry {
  name: string
  type: string
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onSuccess,
  availableTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  availableTypes: ColumnTypeInfo[]
}) {
  const { addToast } = useToast()
  const [path, setPath] = useState('')
  const [columns, setColumns] = useState<SchemaEntry[]>([{ name: '', type: 'string' }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addColumn = () => setColumns([...columns, { name: '', type: 'string' }])
  const removeColumn = (idx: number) => setColumns(columns.filter((_, i) => i !== idx))
  const updateColumn = (idx: number, field: 'name' | 'type', value: string) => {
    const next = [...columns]
    next[idx] = { ...next[idx], [field]: value }
    setColumns(next)
  }

  const handleSubmit = async () => {
    if (!path.trim()) return
    const validCols = columns.filter((c) => c.name.trim())
    if (validCols.length === 0) return

    setIsSubmitting(true)
    try {
      const schema: Record<string, string> = {}
      for (const col of validCols) schema[col.name.trim()] = col.type
      await api.createTable({ path: path.trim(), schema })
      addToast(`Table '${path}' created`, 'success')
      onSuccess()
      onOpenChange(false)
      setPath('')
      setColumns([{ name: '', type: 'string' }])
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create table', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-emerald-400" />
            Create Table
          </DialogTitle>
          <DialogDescription>Create a new Pixeltable table with a defined schema.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <FieldLabel>Table Path</FieldLabel>
            <Input
              placeholder="namespace.table_name"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="h-8 text-xs font-mono"
            />
            <FieldHint>e.g. agents.my_table or my_ns.data</FieldHint>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Columns</FieldLabel>
              <button
                onClick={addColumn}
                className="text-[10px] text-k-yellow hover:underline flex items-center gap-1"
              >
                <Plus className="h-2.5 w-2.5" /> Add column
              </button>
            </div>
            {columns.map((col, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="column_name"
                  value={col.name}
                  onChange={(e) => updateColumn(idx, 'name', e.target.value)}
                  className="h-7 text-[11px] font-mono flex-1"
                />
                <select
                  value={col.type}
                  onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring w-28"
                >
                  {(availableTypes.length > 0
                    ? availableTypes
                    : [
                        { key: 'string', name: 'String' },
                        { key: 'int', name: 'Int' },
                        { key: 'float', name: 'Float' },
                        { key: 'bool', name: 'Bool' },
                        { key: 'timestamp', name: 'Timestamp' },
                        { key: 'json', name: 'Json' },
                        { key: 'image', name: 'Image' },
                        { key: 'video', name: 'Video' },
                        { key: 'audio', name: 'Audio' },
                        { key: 'document', name: 'Document' },
                      ]
                  ).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {columns.length > 1 && (
                  <button
                    onClick={() => removeColumn(idx)}
                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !path.trim() || columns.every((c) => !c.name.trim())}
              className="bg-k-yellow text-black hover:bg-k-yellow-hover"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Create View Dialog ───────────────────────────────────────────────────────

export function CreateViewDialog({
  open,
  onOpenChange,
  onSuccess,
  tables,
  iterators,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  tables: TableInfo[]
  iterators: IteratorInfo[]
}) {
  const { addToast } = useToast()
  const [path, setPath] = useState('')
  const [baseTable, setBaseTable] = useState('')
  const [useIterator, setUseIterator] = useState(false)
  const [iteratorType, setIteratorType] = useState('')
  const [iteratorArgs, setIteratorArgs] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedIterator = iterators.find((i) => i.name === iteratorType)

  const handleSubmit = async () => {
    if (!path.trim() || !baseTable) return
    setIsSubmitting(true)
    try {
      const params: Parameters<typeof api.createView>[0] = {
        path: path.trim(),
        base_table: baseTable,
      }
      if (useIterator && iteratorType) {
        params.iterator_type = iteratorType
        try {
          params.iterator_args = JSON.parse(iteratorArgs || '{}')
        } catch {
          addToast('Invalid JSON for iterator args', 'error')
          setIsSubmitting(false)
          return
        }
      }
      await api.createView(params)
      addToast(`View '${path}' created`, 'success')
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to create view', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-400" />
            Create View
          </DialogTitle>
          <DialogDescription>Create a view over an existing table, optionally with an iterator.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <FieldLabel>View Path</FieldLabel>
            <Input
              placeholder="namespace.view_name"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Base Table</FieldLabel>
            <select
              value={baseTable}
              onChange={(e) => setBaseTable(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select table...</option>
              {tables
                .filter((t) => t.type !== 'view')
                .map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.path}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useIterator}
                onChange={(e) => setUseIterator(e.target.checked)}
                className="rounded"
              />
              <span className="text-[11px] text-muted-foreground">Use Iterator</span>
            </label>

            {useIterator && (
              <>
                <select
                  value={iteratorType}
                  onChange={(e) => {
                    setIteratorType(e.target.value)
                    const iter = iterators.find((i) => i.name === e.target.value)
                    if (iter) setIteratorArgs(JSON.stringify(iter.example_args, null, 2))
                  }}
                  className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select iterator...</option>
                  {iterators.map((it) => (
                    <option key={it.name} value={it.name}>
                      {it.name} — {it.description}
                    </option>
                  ))}
                </select>
                {selectedIterator && (
                  <div className="space-y-1.5">
                    <FieldLabel>Iterator Args (JSON)</FieldLabel>
                    <textarea
                      value={iteratorArgs}
                      onChange={(e) => setIteratorArgs(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                    <FieldHint>
                      Column arg "{selectedIterator.column_arg}" is resolved against the base table.
                    </FieldHint>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || !path.trim() || !baseTable}
              className="bg-k-yellow text-black hover:bg-k-yellow-hover"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Create View
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Table Actions Panel (shown when table is selected) ───────────────────────

export function TableActionsToolbar({
  table,
  tables,
  onRefresh,
}: {
  table: TableInfo
  tables: TableInfo[]
  onRefresh: () => void
}) {
  const { addToast } = useToast()
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Add Column state
  const [colName, setColName] = useState('')
  const [colType, setColType] = useState('string')

  // Add Computed Column state
  const [computedName, setComputedName] = useState('')
  const [computedExpr, setComputedExpr] = useState('')

  // Rename Column state
  const [renameOld, setRenameOld] = useState('')
  const [renameNew, setRenameNew] = useState('')

  // Drop Column state
  const [dropCol, setDropCol] = useState('')

  // Rename Table state
  const [newPath, setNewPath] = useState('')

  // Insert Rows state
  const [insertJson, setInsertJson] = useState('')

  // Embedding Index state
  const [embCol, setEmbCol] = useState('')
  const [embFunc, setEmbFunc] = useState('gemini')

  // Versions state
  const [versions, setVersions] = useState<VersionEntry[]>([])

  const resetAll = () => {
    setColName('')
    setColType('string')
    setComputedName('')
    setComputedExpr('')
    setRenameOld('')
    setRenameNew('')
    setDropCol('')
    setNewPath('')
    setInsertJson('')
    setEmbCol('')
    setEmbFunc('gemini')
  }

  const toggleAction = (action: string) => {
    if (activeAction === action) {
      setActiveAction(null)
    } else {
      setActiveAction(action)
      resetAll()
      if (action === 'versions') loadVersions()
    }
  }

  const loadVersions = async () => {
    try {
      const data = await api.getTableVersions(table.path)
      setVersions(data.versions)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load versions', 'error')
    }
  }

  const exec = async (fn: () => Promise<MgmtResponse>, successMsg?: string) => {
    setIsLoading(true)
    try {
      const result = await fn()
      addToast(successMsg || result.message, 'success')
      onRefresh()
      setActiveAction(null)
      resetAll()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const nonComputedCols = table.columns.filter((c) => !c.is_computed)
  const allCols = table.columns

  const actions = [
    { id: 'add-col', label: 'Add Column', icon: Columns3, color: 'text-emerald-400' },
    { id: 'add-computed', label: 'Computed Column', icon: Cpu, color: 'text-amber-400' },
    { id: 'drop-col', label: 'Drop Column', icon: Trash2, color: 'text-red-400' },
    { id: 'rename-col', label: 'Rename Column', icon: PenLine, color: 'text-blue-400' },
    { id: 'embed-index', label: 'Embedding Index', icon: SearchIcon, color: 'text-purple-400' },
    { id: 'insert', label: 'Insert Rows', icon: Plus, color: 'text-emerald-400' },
    { id: 'rename-table', label: 'Rename Table', icon: PenLine, color: 'text-blue-400' },
    { id: 'revert', label: 'Undo Last', icon: Undo2, color: 'text-orange-400' },
    { id: 'versions', label: 'Versions', icon: RotateCcw, color: 'text-cyan-400' },
    { id: 'drop-table', label: 'Drop Table', icon: Trash2, color: 'text-red-400' },
  ]

  return (
    <div className="border-t border-border/40">
      {/* Action buttons strip */}
      <div className="flex flex-wrap gap-1 px-4 py-2">
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={() => toggleAction(a.id)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
              activeAction === a.id
                ? 'bg-accent text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <a.icon className={cn('h-3 w-3', activeAction === a.id ? a.color : '')} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Action panels */}
      {activeAction && (
        <div className="px-4 pb-3 border-t border-border/20">
          {/* Add Column */}
          {activeAction === 'add-col' && (
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <FieldLabel>Column Name</FieldLabel>
                <Input
                  placeholder="new_column"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  className="h-7 text-[11px] font-mono"
                />
              </div>
              <div className="w-28 space-y-1">
                <FieldLabel>Type</FieldLabel>
                <select
                  value={colType}
                  onChange={(e) => setColType(e.target.value)}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-[11px] focus:outline-none"
                >
                  {['string', 'int', 'float', 'bool', 'timestamp', 'json', 'image', 'video', 'audio', 'document'].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <Button
                size="sm"
                onClick={() => exec(() => api.addColumn(table.path, colName.trim(), colType))}
                disabled={isLoading || !colName.trim()}
                className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
              </Button>
            </div>
          )}

          {/* Add Computed Column */}
          {activeAction === 'add-computed' && (
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <FieldLabel>Column Name</FieldLabel>
                  <Input
                    placeholder="computed_col"
                    value={computedName}
                    onChange={(e) => setComputedName(e.target.value)}
                    className="h-7 text-[11px] font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>Expression</FieldLabel>
                <textarea
                  placeholder="gemini.generate_content(table.prompt, model='gemini-2.5-flash')"
                  value={computedExpr}
                  onChange={(e) => setComputedExpr(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <FieldHint>
                  Use table.column_name for references. Available modules: gemini, openai, image, video, string
                </FieldHint>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() =>
                    exec(() => api.addComputedColumn(table.path, computedName.trim(), computedExpr.trim(), 'error'))
                  }
                  disabled={isLoading || !computedName.trim() || !computedExpr.trim()}
                  className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cpu className="h-3 w-3" />}
                  Add Computed Column
                </Button>
              </div>
            </div>
          )}

          {/* Drop Column */}
          {activeAction === 'drop-col' && (
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <FieldLabel>Column to Drop</FieldLabel>
                <select
                  value={dropCol}
                  onChange={(e) => setDropCol(e.target.value)}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-[11px] font-mono focus:outline-none"
                >
                  <option value="">Select column...</option>
                  {allCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type}){c.is_computed ? ' ⚡' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => exec(() => api.dropColumn(table.path, dropCol))}
                disabled={isLoading || !dropCol}
                className="h-7 text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Drop
              </Button>
            </div>
          )}

          {/* Rename Column */}
          {activeAction === 'rename-col' && (
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <FieldLabel>Column</FieldLabel>
                <select
                  value={renameOld}
                  onChange={(e) => setRenameOld(e.target.value)}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-[11px] font-mono focus:outline-none"
                >
                  <option value="">Select...</option>
                  {allCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <FieldLabel>New Name</FieldLabel>
                <Input
                  placeholder="new_name"
                  value={renameNew}
                  onChange={(e) => setRenameNew(e.target.value)}
                  className="h-7 text-[11px] font-mono"
                />
              </div>
              <Button
                size="sm"
                onClick={() => exec(() => api.renameColumn(table.path, renameOld, renameNew.trim()))}
                disabled={isLoading || !renameOld || !renameNew.trim()}
                className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Rename'}
              </Button>
            </div>
          )}

          {/* Embedding Index */}
          {activeAction === 'embed-index' && (
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <FieldLabel>Column</FieldLabel>
                <select
                  value={embCol}
                  onChange={(e) => setEmbCol(e.target.value)}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-[11px] font-mono focus:outline-none"
                >
                  <option value="">Select column...</option>
                  {allCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28 space-y-1">
                <FieldLabel>Embedding</FieldLabel>
                <select
                  value={embFunc}
                  onChange={(e) => setEmbFunc(e.target.value)}
                  className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-[11px] focus:outline-none"
                >
                  <option value="gemini">Gemini (text)</option>
                  <option value="clip">CLIP (image)</option>
                </select>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  exec(() =>
                    api.addEmbeddingIndex({ path: table.path, column: embCol, embedding_function: embFunc }),
                  )
                }
                disabled={isLoading || !embCol}
                className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <SearchIcon className="h-3 w-3" />}
                Add Index
              </Button>
            </div>
          )}

          {/* Insert Rows */}
          {activeAction === 'insert' && (
            <div className="space-y-2 pt-2">
              <FieldLabel>Rows (JSON array)</FieldLabel>
              <textarea
                placeholder={`[{"${nonComputedCols[0]?.name || 'col'}": "value"}]`}
                value={insertJson}
                onChange={(e) => setInsertJson(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <FieldHint>
                Insertable columns: {nonComputedCols.map((c) => c.name).join(', ') || 'none'}
              </FieldHint>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    try {
                      const rows = JSON.parse(insertJson)
                      if (!Array.isArray(rows)) throw new Error('Must be a JSON array')
                      exec(() => api.insertRows(table.path, rows))
                    } catch (err) {
                      addToast(err instanceof Error ? err.message : 'Invalid JSON', 'error')
                    }
                  }}
                  disabled={isLoading || !insertJson.trim()}
                  className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
                >
                  {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Insert
                </Button>
              </div>
            </div>
          )}

          {/* Rename Table */}
          {activeAction === 'rename-table' && (
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <FieldLabel>New Path</FieldLabel>
                <Input
                  placeholder="new_namespace.new_name"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="h-7 text-[11px] font-mono"
                />
                <FieldHint>Current: {table.path}</FieldHint>
              </div>
              <Button
                size="sm"
                onClick={() => exec(() => api.renameTable(table.path, newPath.trim()))}
                disabled={isLoading || !newPath.trim()}
                className="h-7 bg-k-yellow text-black hover:bg-k-yellow-hover text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Move'}
              </Button>
            </div>
          )}

          {/* Revert */}
          {activeAction === 'revert' && (
            <div className="flex items-center gap-3 pt-2">
              <p className="text-[11px] text-muted-foreground flex-1">
                Undo the last operation on <span className="font-mono font-medium text-foreground">{table.path}</span>.
                This reverts inserts, deletes, updates, or schema changes.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exec(() => api.revertTable(table.path))}
                disabled={isLoading}
                className="h-7 text-[11px] text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Revert
              </Button>
            </div>
          )}

          {/* Versions */}
          {activeAction === 'versions' && (
            <div className="pt-2 max-h-48 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Loading versions...</p>
              ) : (
                <div className="space-y-1">
                  {versions.map((v) => (
                    <div
                      key={v.version}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] bg-muted/30 border border-border/30"
                    >
                      <Badge variant="secondary" className="text-[9px] tabular-nums">
                        v{v.version}
                      </Badge>
                      <span className="text-muted-foreground">
                        {v.change_type === 'schema' ? '📐' : '📊'} {v.change_type}
                      </span>
                      {v.schema_change && (
                        <span className="text-foreground/70 font-mono truncate max-w-[200px]">
                          {v.schema_change}
                        </span>
                      )}
                      {(v.inserts > 0 || v.deletes > 0) && (
                        <span className="text-muted-foreground/60">
                          +{v.inserts} -{v.deletes}
                        </span>
                      )}
                      {v.errors > 0 && <span className="text-red-400">⚠ {v.errors} errors</span>}
                      <span className="ml-auto text-muted-foreground/40 text-[9px]">
                        {v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Drop Table */}
          {activeAction === 'drop-table' && (
            <div className="flex items-center gap-3 pt-2">
              <p className="text-[11px] text-red-400 flex-1">
                Permanently delete <span className="font-mono font-medium">{table.path}</span> and all its data.
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => exec(() => api.dropTable(table.path, true))}
                disabled={isLoading}
                className="h-7 text-[11px]"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Drop Table
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Directory Management Dialog ──────────────────────────────────────────────

export function DirectoryDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { addToast } = useToast()
  const [mode, setMode] = useState<'create' | 'drop'>('create')
  const [path, setPath] = useState('')
  const [force, setForce] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!path.trim()) return
    setIsSubmitting(true)
    try {
      if (mode === 'create') {
        await api.createDir(path.trim(), true)
        addToast(`Directory '${path}' created`, 'success')
      } else {
        await api.dropDir(path.trim(), force)
        addToast(`Directory '${path}' dropped`, 'success')
      }
      onSuccess()
      onOpenChange(false)
      setPath('')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? (
              <FolderPlus className="h-4 w-4 text-emerald-400" />
            ) : (
              <FolderMinus className="h-4 w-4 text-red-400" />
            )}
            {mode === 'create' ? 'Create Directory' : 'Drop Directory'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['create', 'drop'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors',
                  mode === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {m === 'create' ? 'Create' : 'Drop'}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Directory Path</FieldLabel>
            <Input
              placeholder="my_namespace"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          {mode === 'drop' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded"
              />
              <span className="text-[11px] text-red-400">Force (drop all contents)</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={mode === 'drop' ? 'destructive' : 'default'}
              onClick={handleSubmit}
              disabled={isSubmitting || !path.trim()}
              className={cn(
                mode === 'create' && 'bg-k-yellow text-black hover:bg-k-yellow-hover',
                'text-[11px]',
              )}
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {mode === 'create' ? 'Create' : 'Drop'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Function Browser Dialog ──────────────────────────────────────────────────

export function FunctionBrowserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
        {open && <FunctionBrowserContent />}
      </DialogContent>
    </Dialog>
  )
}

function FunctionBrowserContent() {
  const { addToast } = useToast()
  const [functions, setFunctions] = useState<FunctionCategory[]>([])
  const [iterators, setIterators] = useState<IteratorInfo[]>([])
  const [embeddings, setEmbeddings] = useState<EmbeddingFunctionInfo[]>([])
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useMountEffect(() => {
    api
      .getAvailableFunctions()
      .then((data) => {
        setFunctions(data.functions)
        setIterators(data.iterators)
        setEmbeddings(data.embedding_functions)
      })
      .catch((err) => addToast(err instanceof Error ? err.message : 'Failed to load', 'error'))
      .finally(() => setIsLoading(false))
  })

  const copyExample = (text: string) => {
    navigator.clipboard.writeText(text)
    addToast('Copied to clipboard', 'success')
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-k-yellow" />
            Function Reference
          </DialogTitle>
          <DialogDescription>
            Functions, iterators, and embeddings available for computed columns and views.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Functions */}
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Functions
              </h4>
              <div className="space-y-1">
                {functions.map((cat) => (
                  <div key={cat.category} className="border border-border/40 rounded-md">
                    <button
                      onClick={() => setExpandedCat(expandedCat === cat.category ? null : cat.category)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-accent/30 transition-colors rounded-md"
                    >
                      {expandedCat === cat.category ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-[11px] font-semibold text-foreground">{cat.category}</span>
                      <Badge variant="secondary" className="text-[9px] ml-auto">
                        {cat.functions.length}
                      </Badge>
                    </button>
                    {expandedCat === cat.category && (
                      <div className="px-3 pb-2 space-y-1.5">
                        {cat.functions.map((fn) => (
                          <div
                            key={fn.name}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5 bg-muted/20"
                          >
                            <Zap className="h-3 w-3 text-k-yellow shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-mono font-medium text-foreground">{fn.name}</p>
                              <p className="text-[10px] text-muted-foreground">{fn.description}</p>
                              {fn.example && (
                                <div className="flex items-center gap-1 mt-1">
                                  <code className="text-[9px] text-k-yellow/80 bg-k-yellow/5 rounded px-1.5 py-0.5 font-mono truncate">
                                    {fn.example}
                                  </code>
                                  <button
                                    onClick={() => copyExample(fn.example)}
                                    className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                                  >
                                    <Copy className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Iterators */}
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Iterators (for Views)
              </h4>
              <div className="space-y-1.5">
                {iterators.map((it) => (
                  <div key={it.name} className="rounded-md px-3 py-2 bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3 w-3 text-blue-400" />
                      <span className="text-[11px] font-mono font-medium text-foreground">{it.name}</span>
                      <span className="text-[10px] text-muted-foreground">{it.description}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-[9px] text-blue-400/80 bg-blue-400/5 rounded px-1.5 py-0.5 font-mono">
                        {JSON.stringify(it.example_args)}
                      </code>
                      <button
                        onClick={() => copyExample(JSON.stringify(it.example_args, null, 2))}
                        className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Embedding Functions */}
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Embedding Functions
              </h4>
              <div className="space-y-1.5">
                {embeddings.map((e) => (
                  <div key={e.name} className="flex items-center gap-2 rounded-md px-3 py-2 bg-muted/20 border border-border/30">
                    <SearchIcon className="h-3 w-3 text-purple-400" />
                    <span className="text-[11px] font-mono font-medium text-foreground">{e.name}</span>
                    <span className="text-[10px] text-muted-foreground flex-1">{e.description}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {e.modality}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
    </>
  )
}
