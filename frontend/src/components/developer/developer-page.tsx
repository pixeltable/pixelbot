import { useState, useEffect, useCallback } from 'react'
import {
  Code2,
  Download,
  FileJson,
  FileSpreadsheet,
  Database,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Table2,
  Braces,
  Plug,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'

const BASE = '/api'

// ── Types ───────────────────────────────────────────────────────────────────

interface ExportTable {
  path: string
  columns: string[]
  row_count: number
}

// ── API Endpoint Definitions ────────────────────────────────────────────────

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  curl: string
}

interface ApiGroup {
  label: string
  endpoints: ApiEndpoint[]
}

const API_GROUPS: ApiGroup[] = [
  {
    label: 'Chat & Agent',
    endpoints: [
      {
        method: 'POST', path: '/api/query',
        description: 'Run a query through the multimodal AI agent',
        curl: `curl -X POST http://localhost:8000/api/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "What documents do I have?"}'`,
      },
    ],
  },
  {
    label: 'Files',
    endpoints: [
      {
        method: 'POST', path: '/api/upload',
        description: 'Upload a file (document, image, video, audio, CSV)',
        curl: `curl -X POST http://localhost:8000/api/upload \\
  -F "file=@document.pdf"`,
      },
      {
        method: 'POST', path: '/api/add_url',
        description: 'Import a file from URL',
        curl: `curl -X POST http://localhost:8000/api/add_url \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/image.jpg"}'`,
      },
      {
        method: 'GET', path: '/api/context_info',
        description: 'List all uploaded files, tools, and configuration',
        curl: 'curl http://localhost:8000/api/context_info',
      },
    ],
  },
  {
    label: 'Generation',
    endpoints: [
      {
        method: 'POST', path: '/api/generate_image',
        description: 'Generate an image from a text prompt',
        curl: `curl -X POST http://localhost:8000/api/generate_image \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A sunset over mountains"}'`,
      },
      {
        method: 'POST', path: '/api/generate_video',
        description: 'Generate a video from a text prompt',
        curl: `curl -X POST http://localhost:8000/api/generate_video \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A timelapse of clouds"}'`,
      },
      {
        method: 'GET', path: '/api/image_history',
        description: 'List all generated images',
        curl: 'curl http://localhost:8000/api/image_history',
      },
    ],
  },
  {
    label: 'Prompt Lab',
    endpoints: [
      {
        method: 'GET', path: '/api/experiments/models',
        description: 'List available LLM models with API key status',
        curl: 'curl http://localhost:8000/api/experiments/models',
      },
      {
        method: 'POST', path: '/api/experiments/run',
        description: 'Run a prompt against multiple models in parallel',
        curl: `curl -X POST http://localhost:8000/api/experiments/run \\
  -H "Content-Type: application/json" \\
  -d '{"user_prompt": "Explain quantum computing", "models": [{"model_id": "claude-sonnet-4-20250514"}, {"model_id": "gpt-4o"}], "temperature": 0.7}'`,
      },
      {
        method: 'GET', path: '/api/experiments/history',
        description: 'List all past experiments',
        curl: 'curl http://localhost:8000/api/experiments/history',
      },
    ],
  },
  {
    label: 'Data Export',
    endpoints: [
      {
        method: 'GET', path: '/api/export/tables',
        description: 'List all tables available for export',
        curl: 'curl http://localhost:8000/api/export/tables',
      },
      {
        method: 'GET', path: '/api/export/json/{table}',
        description: 'Export a table as JSON',
        curl: 'curl -o export.json http://localhost:8000/api/export/json/agents.chat_history?limit=100',
      },
      {
        method: 'GET', path: '/api/export/csv/{table}',
        description: 'Export a table as CSV',
        curl: 'curl -o export.csv http://localhost:8000/api/export/csv/agents.chat_history?limit=100',
      },
      {
        method: 'GET', path: '/api/export/parquet/{table}',
        description: 'Export a table as Parquet',
        curl: 'curl -o export.parquet http://localhost:8000/api/export/parquet/agents.chat_history?limit=100',
      },
    ],
  },
  {
    label: 'Database',
    endpoints: [
      {
        method: 'GET', path: '/api/db/tables',
        description: 'List all Pixeltable tables with schemas and row counts',
        curl: 'curl http://localhost:8000/api/db/tables',
      },
      {
        method: 'GET', path: '/api/db/table/{path}/rows',
        description: 'Fetch paginated rows from any table',
        curl: 'curl "http://localhost:8000/api/db/table/agents.chat_history/rows?limit=10&offset=0"',
      },
      {
        method: 'GET', path: '/api/db/timeline',
        description: 'Unified chronological feed across all tables',
        curl: 'curl http://localhost:8000/api/db/timeline?limit=50',
      },
    ],
  },
  {
    label: 'Memory',
    endpoints: [
      {
        method: 'GET', path: '/api/memory',
        description: 'List all memories (with optional semantic search)',
        curl: 'curl "http://localhost:8000/api/memory?search=python"',
      },
      {
        method: 'POST', path: '/api/memory/manual',
        description: 'Save a new memory entry',
        curl: `curl -X POST http://localhost:8000/api/memory/manual \\
  -H "Content-Type: application/json" \\
  -d '{"content": "User prefers Python", "type": "text", "context_query": "preferences"}'`,
      },
    ],
  },
]

// ── SDK Code Snippets ───────────────────────────────────────────────────────

interface CodeSnippet {
  label: string
  description: string
  language: string
  code: string
}

const SDK_SNIPPETS: CodeSnippet[] = [
  {
    label: 'Connect & List Tables',
    description: 'Initialize Pixeltable and browse the catalog',
    language: 'python',
    code: `import pixeltable as pxt

# List all tables in the agents namespace
for tbl in pxt.list_tables("agents", recursive=True):
    path = tbl.get_path()
    print(f"{path}: {tbl.count()} rows, {len(tbl.columns())} columns")`,
  },
  {
    label: 'Query Chat History',
    description: 'Fetch and filter chat history with Pixeltable expressions',
    language: 'python',
    code: `import pixeltable as pxt

t = pxt.get_table("agents.chat_history")

# Get recent messages
recent = (
    t.order_by(t.timestamp, asc=False)
     .select(t.role, t.content, t.timestamp)
     .limit(20)
     .collect()
)
for row in recent:
    print(f"[{row['role']}] {row['content'][:80]}...")`,
  },
  {
    label: 'Semantic Search',
    description: 'Search across documents using embedding similarity',
    language: 'python',
    code: `import pixeltable as pxt

chunks = pxt.get_table("agents.chunks")

# Semantic search — uses the E5-large-instruct embedding index
sim = chunks.text.similarity("machine learning best practices")
results = (
    chunks.where(sim > 0.5)
          .order_by(sim, asc=False)
          .select(chunks.text, sim=sim)
          .limit(10)
          .collect()
)
for r in results:
    print(f"[{r['sim']:.3f}] {r['text'][:100]}...")`,
  },
  {
    label: 'Export to Pandas',
    description: 'Convert any table to a pandas DataFrame',
    language: 'python',
    code: `import pixeltable as pxt

t = pxt.get_table("agents.prompt_experiments")

# Collect as pandas DataFrame
df = (
    t.select(t.task, t.model_id, t.response_time_ms, t.word_count)
     .collect()
     .to_pandas()
)

# Export to various formats
df.to_csv("experiments.csv", index=False)
df.to_parquet("experiments.parquet")
df.to_json("experiments.json", orient="records", indent=2)
print(df.describe())`,
  },
  {
    label: 'Image Similarity Search',
    description: 'Find similar images using CLIP embeddings',
    language: 'python',
    code: `import pixeltable as pxt

images = pxt.get_table("agents.images")

# CLIP-based text-to-image search
sim = images.image.similarity("a cat sitting on a desk")
results = (
    images.where(sim > 0.25)
          .order_by(sim, asc=False)
          .select(images.image, sim=sim)
          .limit(5)
          .collect()
)
# results contain PIL Image objects
for r in results:
    r["image"].show()`,
  },
  {
    label: 'Insert & Computed Columns',
    description: 'Insert data and let computed columns do the work',
    language: 'python',
    code: `import pixeltable as pxt
from datetime import datetime

# Insert an image — Pixeltable auto-generates:
# - CLIP embedding (for similarity search)
# - Thumbnail (96x96 PIL resize + base64)
images = pxt.get_table("agents.images")
images.insert([{
    "image": "/path/to/photo.jpg",  # or URL
    "uuid": "my-custom-id",
    "timestamp": datetime.now(),
    "user_id": "local_user",
}])
# All computed columns trigger automatically!`,
  },
  {
    label: 'Table Version Control',
    description: 'Undo operations and inspect version history',
    language: 'python',
    code: `import pixeltable as pxt

t = pxt.get_table("agents.chat_history")

# See version history
for v in t.get_versions():
    print(f"v{v.version}: {v.change_type} | "
          f"+{v.inserts} -{v.deletes} ~{v.updates}")

# Undo the last operation
t.revert()
print(f"Reverted to version {t.get_versions()[0].version}")`,
  },
]

const MCP_CONFIG = `{
  "mcpServers": {
    "pixeltable": {
      "command": "uvx",
      "args": ["mcp-server-pixeltable-developer"],
      "env": {
        "PIXELTABLE_HOME": "~/.pixeltable",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}`

// ── Main Component ──────────────────────────────────────────────────────────

export function DeveloperPage() {
  const { addToast } = useToast()
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const copyToClipboard = useCallback((text: string, label?: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 2000)
    if (label) addToast(`Copied ${label}`, 'success')
  }, [addToast])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
            <Code2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Developer</h1>
            <p className="text-[12px] text-muted-foreground/60">Export data, browse the API, and connect to Pixeltable</p>
          </div>
        </div>

        <Tabs defaultValue="export">
          <TabsList className="mb-6">
            <TabsTrigger value="export" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5">
              <Terminal className="h-3.5 w-3.5" /> API
            </TabsTrigger>
            <TabsTrigger value="sdk" className="gap-1.5">
              <Braces className="h-3.5 w-3.5" /> Python SDK
            </TabsTrigger>
            <TabsTrigger value="connect" className="gap-1.5">
              <Plug className="h-3.5 w-3.5" /> Connect
            </TabsTrigger>
          </TabsList>

          {/* ── Export Tab ──────────────────────────────────────────────── */}
          <TabsContent value="export">
            <ExportTab copyToClipboard={copyToClipboard} />
          </TabsContent>

          {/* ── API Tab ────────────────────────────────────────────────── */}
          <TabsContent value="api">
            <div className="space-y-6">
              <p className="text-[12px] text-muted-foreground/60">
                All endpoints are available at <code className="text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono">http://localhost:8000</code>. The backend also serves interactive docs at{' '}
                <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
                  /docs <ExternalLink className="h-2.5 w-2.5 inline" />
                </a>
              </p>

              {API_GROUPS.map((group) => (
                <ApiGroupCard
                  key={group.label}
                  group={group}
                  copiedText={copiedText}
                  onCopy={copyToClipboard}
                />
              ))}
            </div>
          </TabsContent>

          {/* ── SDK Tab ────────────────────────────────────────────────── */}
          <TabsContent value="sdk">
            <div className="space-y-4">
              <p className="text-[12px] text-muted-foreground/60">
                Access your Pixeltable data directly with the Python SDK. All tables created by Pixelbot live in the <code className="text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono">agents</code> namespace at <code className="text-[11px] bg-accent px-1.5 py-0.5 rounded font-mono">~/.pixeltable/</code>.
              </p>

              <div className="grid gap-4">
                {SDK_SNIPPETS.map((snippet) => (
                  <SnippetCard
                    key={snippet.label}
                    snippet={snippet}
                    copiedText={copiedText}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Connect Tab ────────────────────────────────────────────── */}
          <TabsContent value="connect">
            <div className="space-y-6">
              {/* MCP */}
              <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <Plug className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">Model Context Protocol (MCP)</h3>
                    <p className="text-[11px] text-muted-foreground/60">Connect Claude, Cursor, or any MCP-compatible AI to your Pixeltable data</p>
                  </div>
                  <a
                    href="https://github.com/pixeltable/mcp-server-pixeltable-developer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    GitHub <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-[12px] text-muted-foreground/80">
                    Add this to your MCP client configuration (e.g. <code className="bg-accent px-1 py-0.5 rounded text-[11px] font-mono">claude_desktop_config.json</code> or Cursor settings):
                  </p>
                  <CodeBlock
                    code={MCP_CONFIG}
                    language="json"
                    copiedText={copiedText}
                    onCopy={copyToClipboard}
                  />
                  <p className="text-[11px] text-muted-foreground/50">
                    Once connected, your AI assistant can query, insert, and manage all Pixeltable tables directly.
                  </p>
                </div>
              </div>

              {/* Direct Python */}
              <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Braces className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">Direct Python Access</h3>
                    <p className="text-[11px] text-muted-foreground/60">Access the same data Pixelbot uses from any Python script or notebook</p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <CodeBlock
                    code={`pip install pixeltable

# Then in Python:
import pixeltable as pxt
t = pxt.get_table("agents.chat_history")
print(t.count(), "rows")
print(t.select(t.role, t.content).limit(5).collect())`}
                    language="bash"
                    copiedText={copiedText}
                    onCopy={copyToClipboard}
                  />
                  <p className="text-[11px] text-muted-foreground/50">
                    Pixeltable stores everything at <code className="bg-accent px-1 py-0.5 rounded text-[10px] font-mono">~/.pixeltable/</code>. Any script on the same machine can read/write the same tables.
                  </p>
                </div>
              </div>

              {/* REST API */}
              <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Terminal className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">REST API</h3>
                    <p className="text-[11px] text-muted-foreground/60">Access everything via HTTP from any language or tool</p>
                  </div>
                  <a
                    href="http://localhost:8000/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    OpenAPI Docs <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="p-5 space-y-3">
                  <CodeBlock
                    code={`# Query the agent
curl -X POST http://localhost:8000/api/query \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Summarize my documents"}'

# Export data
curl -o history.json http://localhost:8000/api/export/json/agents.chat_history
curl -o data.csv http://localhost:8000/api/export/csv/agents.prompt_experiments`}
                    language="bash"
                    copiedText={copiedText}
                    onCopy={copyToClipboard}
                  />
                </div>
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Pixeltable Docs', url: 'https://docs.pixeltable.com/', icon: BookOpen },
                  { label: 'GitHub', url: 'https://github.com/pixeltable/pixeltable', icon: Code2 },
                  { label: 'MCP Server', url: 'https://github.com/pixeltable/mcp-server-pixeltable-developer', icon: Plug },
                  { label: 'LLMs.txt', url: 'https://docs.pixeltable.com/llms.txt', icon: FileJson },
                ].map(({ label, url, icon: Icon }) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border/60 px-3.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <ExternalLink className="h-2.5 w-2.5 opacity-40" />
                  </a>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ── Export Tab Component ─────────────────────────────────────────────────────

function ExportTab({ copyToClipboard }: { copyToClipboard: (text: string, label?: string) => void }) {
  const { addToast } = useToast()
  const [tables, setTables] = useState<ExportTable[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv' | 'parquet'>('json')
  const [limit, setLimit] = useState(1000)
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[]; count: number } | null>(null)

  useEffect(() => {
    fetch(`${BASE}/export/tables`)
      .then((r) => r.json())
      .then((data) => {
        setTables(data.tables || [])
        if (data.tables?.length > 0) setSelectedTable(data.tables[0].path)
      })
      .catch(() => {})
  }, [])

  const loadPreview = useCallback(async (path: string) => {
    try {
      const res = await fetch(`${BASE}/export/preview/${path}?limit=5`)
      if (res.ok) {
        const data = await res.json()
        setPreview(data)
      }
    } catch {
      setPreview(null)
    }
  }, [])

  useEffect(() => {
    if (selectedTable) loadPreview(selectedTable)
  }, [selectedTable, loadPreview])

  const handleDownload = useCallback(async () => {
    if (!selectedTable) return
    setIsLoading(true)
    try {
      const url = `${BASE}/export/${selectedFormat}/${selectedTable}?limit=${limit}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${selectedTable.replace('.', '_')}.${selectedFormat}`
      a.click()
      URL.revokeObjectURL(a.href)
      addToast(`Exported ${selectedTable} as ${selectedFormat.toUpperCase()}`, 'success')
    } catch (err) {
      addToast('Export failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [selectedTable, selectedFormat, limit, addToast])

  const selectedInfo = tables.find((t) => t.path === selectedTable)
  const curlCmd = selectedTable
    ? `curl -o export.${selectedFormat} http://localhost:8000/api/export/${selectedFormat}/${selectedTable}?limit=${limit}`
    : ''

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-muted-foreground/60">
        Export any Pixeltable table as JSON, CSV, or Parquet. All data types are automatically serialized.
      </p>

      <div className="grid grid-cols-[1fr_auto] gap-6">
        {/* Left: Config */}
        <div className="space-y-4">
          {/* Table selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Table</label>
            <select
              className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-[12px] font-mono"
              value={selectedTable ?? ''}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t.path} value={t.path}>
                  {t.path} ({t.row_count} rows, {t.columns.length} cols)
                </option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">Format</label>
            <div className="flex gap-2">
              {([
                { id: 'json' as const, label: 'JSON', icon: FileJson },
                { id: 'csv' as const, label: 'CSV', icon: FileSpreadsheet },
                { id: 'parquet' as const, label: 'Parquet', icon: Database },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[11px] font-medium transition-all',
                    selectedFormat === id
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-border/60 text-muted-foreground hover:bg-accent/30',
                  )}
                  onClick={() => setSelectedFormat(id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row limit */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Row Limit
            </label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50000, parseInt(e.target.value) || 1000)))}
              className="h-8 text-[12px] w-32 font-mono"
              min={1}
              max={50000}
            />
          </div>

          {/* Download button */}
          <button
            className={cn(
              'flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-all',
              'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            onClick={handleDownload}
            disabled={!selectedTable || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download {selectedFormat.toUpperCase()}
          </button>

          {/* curl equivalent */}
          {curlCmd && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground/40">curl equivalent:</span>
              <div className="relative group">
                <pre className="rounded-lg bg-card/60 border border-border/40 px-3 py-2 text-[10px] font-mono text-muted-foreground/70 overflow-x-auto">
                  {curlCmd}
                </pre>
                <button
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-foreground transition-all"
                  onClick={() => copyToClipboard(curlCmd, 'curl command')}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="w-[340px] shrink-0">
          {selectedInfo && (
            <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
                <Table2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="text-[11px] font-mono font-medium text-foreground truncate">{selectedInfo.path}</span>
                <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">{selectedInfo.row_count} rows</Badge>
              </div>

              {/* Column list */}
              <div className="px-4 py-2.5 border-b border-border/30">
                <div className="flex flex-wrap gap-1">
                  {selectedInfo.columns.slice(0, 12).map((col) => (
                    <Badge key={col} variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                      {col}
                    </Badge>
                  ))}
                  {selectedInfo.columns.length > 12 && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      +{selectedInfo.columns.length - 12}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Data preview */}
              {preview && preview.rows.length > 0 && (
                <div className="px-4 py-2.5 max-h-[260px] overflow-y-auto">
                  <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Preview (5 rows)</span>
                  <div className="mt-1.5 space-y-1.5">
                    {preview.rows.map((row, i) => (
                      <div key={i} className="text-[9px] font-mono text-muted-foreground/60 bg-accent/20 rounded px-2 py-1 truncate">
                        {JSON.stringify(row).slice(0, 120)}...
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── API Group Card ──────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PUT: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
}

function ApiGroupCard({
  group,
  copiedText,
  onCopy,
}: {
  group: ApiGroup
  copiedText: string | null
  onCopy: (text: string, label?: string) => void
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-[12px] font-semibold text-foreground">{group.label}</h3>
      </div>
      <div className="divide-y divide-border/30">
        {group.endpoints.map((ep, i) => (
          <div key={`${ep.method}-${ep.path}`}>
            <button
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent/20 transition-colors text-left"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            >
              <Badge className={cn('text-[9px] px-2 py-0 font-mono font-bold shrink-0', METHOD_COLORS[ep.method])}>
                {ep.method}
              </Badge>
              <span className="text-[11px] font-mono text-foreground/80 flex-1 truncate">{ep.path}</span>
              <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{ep.description}</span>
              <ChevronDown className={cn('h-3 w-3 text-muted-foreground/30 shrink-0 transition-transform', expandedIdx === i && 'rotate-180')} />
            </button>
            {expandedIdx === i && (
              <div className="px-4 pb-3">
                <div className="relative group">
                  <pre className="rounded-lg bg-background/50 border border-border/30 px-3 py-2.5 text-[10px] font-mono text-muted-foreground/70 overflow-x-auto whitespace-pre-wrap">
                    {ep.curl}
                  </pre>
                  <button
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCopy(ep.curl, 'curl command')
                    }}
                  >
                    {copiedText === ep.curl ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground/40 hover:text-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Snippet Card ────────────────────────────────────────────────────────────

function SnippetCard({
  snippet,
  copiedText,
  onCopy,
}: {
  snippet: CodeSnippet
  copiedText: string | null
  onCopy: (text: string, label?: string) => void
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
        <Braces className="h-3.5 w-3.5 text-amber-400/60" />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-foreground">{snippet.label}</span>
          <span className="text-[10px] text-muted-foreground/50 ml-2">{snippet.description}</span>
        </div>
        <Badge variant="secondary" className="text-[9px] font-mono">{snippet.language}</Badge>
      </div>
      <CodeBlock
        code={snippet.code}
        language={snippet.language}
        copiedText={copiedText}
        onCopy={onCopy}
      />
    </div>
  )
}

// ── Code Block ──────────────────────────────────────────────────────────────

function CodeBlock({
  code,
  language,
  copiedText,
  onCopy,
}: {
  code: string
  language: string
  copiedText: string | null
  onCopy: (text: string, label?: string) => void
}) {
  return (
    <div className="relative group">
      <pre className="px-4 py-3 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
        {code}
      </pre>
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/50"
        onClick={() => onCopy(code, 'code')}
      >
        {copiedText === code ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground/40" />
        )}
      </button>
    </div>
  )
}
