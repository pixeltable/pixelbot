import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FlaskConical,
  Play,
  Clock,
  Type,
  Hash,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
  History,
  X,
  Pencil,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type {
  ExperimentModelInfo,
  ExperimentModelConfig,
  ExperimentResult,
  ExperimentRun,
  ExperimentSummary,
} from '@/types'

const PROVIDER_STYLES: Record<string, { color: string; bg: string; border: string; text: string }> = {
  anthropic: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300' },
  google: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300' },
  mistral: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-300' },
  openai: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300' },
}

function getProviderStyle(provider: string) {
  return PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.openai
}

export function ExperimentsPage() {
  const { addToast } = useToast()

  // Setup state
  const [task, setTask] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.')
  const [userPrompt, setUserPrompt] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({})
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [customModelId, setCustomModelId] = useState('')
  const [customProvider, setCustomProvider] = useState('openai')
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1024)

  // Data state
  const [availableModels, setAvailableModels] = useState<ExperimentModelInfo[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentRun, setCurrentRun] = useState<ExperimentRun | null>(null)
  const [history, setHistory] = useState<ExperimentSummary[]>([])
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Load models and history on mount
  useEffect(() => {
    api.getExperimentModels().then((models) => {
      setAvailableModels(models)
      const available = models.filter((m) => m.available).map((m) => m.id)
      if (available.length > 0) {
        setSelectedModels(available.slice(0, 2))
      }
    }).catch((err) => {
      console.error('Failed to load models:', err)
    })
    loadHistory()
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getExperimentHistory()
      setHistory(data)
    } catch {
      // silent — history may not exist yet
    }
  }, [])

  const toggleModel = useCallback((modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    )
  }, [])

  // Build the models config array for the API call
  const buildModelConfigs = useCallback((): ExperimentModelConfig[] => {
    return selectedModels.map((presetId) => {
      const override = modelOverrides[presetId]
      const preset = availableModels.find((m) => m.id === presetId)
      return {
        model_id: override || presetId,
        provider: preset?.provider ?? undefined,
        display_name: override ? `${preset?.name ?? presetId} (${override})` : undefined,
      }
    })
  }, [selectedModels, modelOverrides, availableModels])

  const handleRun = useCallback(async () => {
    if (!userPrompt.trim()) {
      addToast('Enter a user prompt first', 'error')
      return
    }
    if (selectedModels.length === 0) {
      addToast('Select at least one model', 'error')
      return
    }

    setIsRunning(true)
    setCurrentRun(null)

    try {
      const result = await api.runExperiment({
        task: task || 'Untitled',
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        models: buildModelConfigs(),
        temperature,
        max_tokens: maxTokens,
      })
      setCurrentRun(result)
      loadHistory()
      addToast('Experiment complete', 'success')
    } catch (err) {
      addToast(`Experiment failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsRunning(false)
    }
  }, [task, systemPrompt, userPrompt, selectedModels, temperature, maxTokens, addToast, loadHistory, buildModelConfigs])

  const handleLoadExperiment = useCallback(async (experimentId: string) => {
    try {
      const data = await api.getExperiment(experimentId)
      setCurrentRun(data)
      setTask(data.task)
      setSystemPrompt(data.system_prompt)
      setUserPrompt(data.user_prompt)
      setTemperature(data.temperature)
      setMaxTokens(data.max_tokens)
      setSelectedModels(data.results.map((r) => r.model_id))
      setIsHistoryOpen(false)
    } catch (err) {
      addToast('Failed to load experiment', 'error')
    }
  }, [addToast])

  const handleDeleteExperiment = useCallback(async (experimentId: string) => {
    try {
      await api.deleteExperiment(experimentId)
      setHistory((prev) => prev.filter((e) => e.experiment_id !== experimentId))
      if (currentRun?.experiment_id === experimentId) {
        setCurrentRun(null)
      }
      addToast('Experiment deleted', 'success')
    } catch {
      addToast('Failed to delete', 'error')
    }
  }, [currentRun, addToast])

  const handleCopyResponse = useCallback((text: string, modelId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(modelId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleRerun = useCallback(() => {
    handleRun()
  }, [handleRun])

  // Fastest model for comparison
  const fastestTime = useMemo(() => {
    if (!currentRun) return 0
    const times = currentRun.results
      .filter((r) => !r.error && r.response_time_ms > 0)
      .map((r) => r.response_time_ms)
    return times.length > 0 ? Math.min(...times) : 0
  }, [currentRun])

  return (
    <div className="flex h-full">
      {/* Left panel: Setup */}
      <div className="w-[360px] shrink-0 border-r border-border/60 flex flex-col overflow-y-auto bg-card/20">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
              <FlaskConical className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-foreground">Prompt Lab</h1>
              <p className="text-[11px] text-muted-foreground/60">Compare models side-by-side</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Task */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Task Label
            </label>
            <Input
              placeholder="e.g. Summarization, Code Gen..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              System Prompt
            </label>
            <Textarea
              placeholder="You are a helpful assistant..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[72px] text-[12px] resize-y"
            />
          </div>

          {/* User Prompt */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              User Prompt
            </label>
            <Textarea
              placeholder="Enter your prompt to test..."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="min-h-[100px] text-[12px] resize-y"
            />
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Models
            </label>
            <div className="space-y-1">
              {availableModels.map((model) => {
                const style = getProviderStyle(model.provider)
                const isSelected = selectedModels.includes(model.id)
                const isEditing = editingModelId === model.id
                const hasOverride = !!modelOverrides[model.id]
                return (
                  <div key={model.id}>
                    <button
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all',
                        'border',
                        isSelected
                          ? `${style.bg} ${style.border}`
                          : 'border-transparent hover:bg-accent/30',
                        !model.available && 'opacity-40 cursor-not-allowed',
                      )}
                      onClick={() => model.available && toggleModel(model.id)}
                      disabled={!model.available}
                    >
                      <div
                        className={cn(
                          'h-3.5 w-3.5 rounded border-2 shrink-0 transition-colors',
                          isSelected ? `${style.border} bg-current` : 'border-muted-foreground/30',
                        )}
                      >
                        {isSelected && (
                          <Check className="h-2.5 w-2.5 text-background" style={{ margin: '-1px' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={cn('text-[12px] font-medium', isSelected ? style.text : 'text-foreground')}>
                          {model.name}
                        </span>
                        {hasOverride && (
                          <span className="block text-[9px] text-muted-foreground/50 font-mono truncate">
                            {modelOverrides[model.id]}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn('text-[9px] px-1.5 py-0', style.color)}
                      >
                        {model.provider}
                      </Badge>
                      {!model.available && (
                        <span className="text-[9px] text-muted-foreground/50">no key</span>
                      )}
                      {isSelected && model.available && (
                        <Pencil
                          className="h-2.5 w-2.5 text-muted-foreground/40 hover:text-foreground shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingModelId(isEditing ? null : model.id)
                          }}
                        />
                      )}
                    </button>

                    {/* Inline model ID editor */}
                    {isEditing && isSelected && (
                      <div className="ml-8 mt-1 mb-1 flex items-center gap-1.5">
                        <Input
                          placeholder={model.id}
                          value={modelOverrides[model.id] ?? ''}
                          onChange={(e) =>
                            setModelOverrides((prev) => ({
                              ...prev,
                              [model.id]: e.target.value,
                            }))
                          }
                          className="h-6 text-[10px] font-mono flex-1"
                        />
                        {hasOverride && (
                          <button
                            className="text-muted-foreground/40 hover:text-foreground"
                            onClick={() => {
                              setModelOverrides((prev) => {
                                const next = { ...prev }
                                delete next[model.id]
                                return next
                              })
                              setEditingModelId(null)
                            }}
                            title="Reset to default"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add custom model */}
              {isAddingCustom ? (
                <div className="rounded-lg border border-dashed border-border/60 p-2.5 space-y-1.5">
                  <Input
                    placeholder="Model ID (e.g. claude-3.5-haiku)"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    className="h-7 text-[11px] font-mono"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      className="h-6 flex-1 rounded border border-input bg-transparent px-2 text-[10px]"
                      value={customProvider}
                      onChange={(e) => setCustomProvider(e.target.value)}
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="mistral">Mistral</option>
                      <option value="openai">OpenAI</option>
                    </select>
                    <button
                      className="h-6 rounded bg-violet-600 px-2.5 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                      disabled={!customModelId.trim()}
                      onClick={() => {
                        if (!customModelId.trim()) return
                        const newModel: ExperimentModelInfo = {
                          id: customModelId.trim(),
                          name: customModelId.trim(),
                          provider: customProvider,
                          available: true,
                        }
                        setAvailableModels((prev) => [...prev, newModel])
                        setSelectedModels((prev) => [...prev, newModel.id])
                        setCustomModelId('')
                        setIsAddingCustom(false)
                      }}
                    >
                      Add
                    </button>
                    <button
                      className="h-6 rounded border border-border px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => { setIsAddingCustom(false); setCustomModelId('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/40 px-3 py-2 text-[11px] text-muted-foreground/50 hover:text-muted-foreground hover:border-border/60 transition-colors"
                  onClick={() => setIsAddingCustom(true)}
                >
                  <Plus className="h-3 w-3" />
                  Add custom model
                </button>
              )}
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Parameters
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Temperature</span>
                <span className="text-[11px] font-mono text-foreground">{temperature.toFixed(1)}</span>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={1}
                step={0.1}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Max Tokens</span>
                <span className="text-[11px] font-mono text-foreground">{maxTokens}</span>
              </div>
              <Slider
                value={[maxTokens]}
                onValueChange={([v]) => setMaxTokens(v)}
                min={64}
                max={4096}
                step={64}
              />
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="px-5 py-4 border-t border-border/40 space-y-2">
          <button
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all',
              'bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            onClick={handleRun}
            disabled={isRunning || !userPrompt.trim() || selectedModels.length === 0}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Experiment
              </>
            )}
          </button>

          <button
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors',
              'border border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          >
            <History className="h-3.5 w-3.5" />
            History
            {history.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1">
                {history.length}
              </Badge>
            )}
            {isHistoryOpen ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
          </button>
        </div>
      </div>

      {/* Right panel: Results + History */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {/* Running state */}
          {isRunning && !currentRun && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 mb-6">
                <Sparkles className="h-4 w-4 text-violet-400 animate-pulse" />
                <h2 className="text-[14px] font-semibold text-foreground">Running experiment...</h2>
              </div>
              {selectedModels.map((modelId) => {
                const model = availableModels.find((m) => m.id === modelId)
                const style = getProviderStyle(model?.provider ?? '')
                return (
                  <div
                    key={modelId}
                    className={cn(
                      'rounded-xl border p-5 animate-pulse',
                      style.border,
                      style.bg,
                    )}
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <Loader2 className={cn('h-3.5 w-3.5 animate-spin', style.color)} />
                      <span className={cn('text-[13px] font-semibold', style.text)}>
                        {model?.name ?? modelId}
                      </span>
                      <Badge variant="secondary" className={cn('text-[9px]', style.color)}>
                        {model?.provider}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 rounded bg-foreground/5 w-full" />
                      <div className="h-3 rounded bg-foreground/5 w-4/5" />
                      <div className="h-3 rounded bg-foreground/5 w-3/5" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Results */}
          {currentRun && !isRunning && (
            <div className="p-6 space-y-4">
              {/* Results header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-400" />
                  <h2 className="text-[14px] font-semibold text-foreground">{currentRun.task}</h2>
                </div>
                <Badge variant="outline" className="text-[9px] px-2 py-0 font-mono">
                  {currentRun.experiment_id}
                </Badge>
                <span className="text-[10px] text-muted-foreground/50 ml-auto">
                  {new Date(currentRun.timestamp).toLocaleString()}
                </span>
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleRerun}
                  title="Re-run experiment"
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-run
                </button>
              </div>

              {/* Prompt preview */}
              <div className="rounded-lg border border-border/40 bg-card/30 px-4 py-3 mb-4">
                <p className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1">
                  Prompt
                </p>
                <p className="text-[12px] text-foreground/80 line-clamp-3">{currentRun.user_prompt}</p>
              </div>

              {/* Model result cards */}
              <div className="space-y-4">
                {currentRun.results.map((result) => (
                  <ResultCard
                    key={result.model_id}
                    result={result}
                    fastestTime={fastestTime}
                    copiedId={copiedId}
                    onCopy={handleCopyResponse}
                  />
                ))}
              </div>

              {/* Comparison summary */}
              {currentRun.results.length > 1 && (
                <ComparisonBar results={currentRun.results} />
              )}
            </div>
          )}

          {/* Empty state */}
          {!currentRun && !isRunning && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                    <FlaskConical className="h-8 w-8 text-violet-400/60" />
                  </div>
                </div>
                <h3 className="text-[15px] font-semibold text-foreground mb-2">
                  Prompt Engineering Lab
                </h3>
                <p className="text-[12px] text-muted-foreground/60 leading-relaxed mb-4">
                  Compare how different LLMs respond to the same prompt.
                  Adjust parameters, iterate on prompts, and track every experiment
                  with Pixeltable's automatic versioning.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {availableModels.filter((m) => m.available).map((m) => {
                    const style = getProviderStyle(m.provider)
                    return (
                      <Badge
                        key={m.id}
                        variant="secondary"
                        className={cn('text-[10px]', style.color)}
                      >
                        {m.name}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History drawer */}
        {isHistoryOpen && (
          <div className="border-t border-border/60 bg-card/30 max-h-[280px] overflow-y-auto shrink-0">
            <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[12px] font-semibold text-foreground">Experiment History</h3>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                  {history.length}
                </Badge>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsHistoryOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {history.length === 0 ? (
              <div className="px-5 py-8 text-center text-[11px] text-muted-foreground/50">
                No experiments yet. Run one to start tracking.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {history.map((exp) => (
                  <div
                    key={exp.experiment_id}
                    className={cn(
                      'px-5 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors cursor-pointer group',
                      currentRun?.experiment_id === exp.experiment_id && 'bg-accent/20',
                    )}
                    onClick={() => handleLoadExperiment(exp.experiment_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-medium text-foreground truncate">
                          {exp.task}
                        </span>
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 font-mono shrink-0">
                          {exp.experiment_id}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        {exp.user_prompt}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {exp.model_ids.map((mid) => {
                        const model = availableModels.find((m) => m.id === mid)
                        const style = getProviderStyle(model?.provider ?? '')
                        return (
                          <div
                            key={mid}
                            className={cn('h-2 w-2 rounded-full', style.bg, style.border, 'border')}
                            title={model?.name ?? mid}
                          />
                        )
                      })}
                    </div>
                    <span className="text-[9px] text-muted-foreground/40 shrink-0">
                      {new Date(exp.timestamp).toLocaleDateString()}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteExperiment(exp.experiment_id)
                      }}
                      title="Delete experiment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Result Card ─────────────────────────────────────────────────────────────

function ResultCard({
  result,
  fastestTime,
  copiedId,
  onCopy,
}: {
  result: ExperimentResult
  fastestTime: number
  copiedId: string | null
  onCopy: (text: string, modelId: string) => void
}) {
  const style = getProviderStyle(result.provider)
  const isFastest = result.response_time_ms > 0 && result.response_time_ms === fastestTime

  if (result.error) {
    return (
      <div className={cn('rounded-xl border p-5', 'border-destructive/30 bg-destructive/5')}>
        <div className="flex items-center gap-2.5 mb-3">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className={cn('text-[13px] font-semibold', style.text)}>
            {result.model_name}
          </span>
          <Badge variant="secondary" className={cn('text-[9px]', style.color)}>
            {result.provider}
          </Badge>
        </div>
        <p className="text-[12px] text-destructive/80 font-mono">{result.error}</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border p-5 transition-all', style.border, 'bg-card/40 hover:bg-card/60')}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className={cn('text-[13px] font-semibold', style.text)}>
          {result.model_name}
        </span>
        <Badge variant="secondary" className={cn('text-[9px]', style.color)}>
          {result.provider}
        </Badge>
        <div className="flex-1" />
        <button
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
          onClick={() => result.response && onCopy(result.response, result.model_id)}
          title="Copy response"
        >
          {copiedId === result.model_id ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Response */}
      <div className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap mb-4 max-h-[300px] overflow-y-auto">
        {result.response}
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 flex-wrap">
        <MetricBadge
          icon={Clock}
          label={formatTime(result.response_time_ms)}
          highlight={isFastest}
          highlightColor="text-emerald-400"
        />
        <MetricBadge icon={Type} label={`${result.word_count} words`} />
        <MetricBadge icon={Hash} label={`${result.char_count} chars`} />
        {isFastest && (
          <Badge variant="secondary" className="text-[9px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
            Fastest
          </Badge>
        )}
      </div>
    </div>
  )
}

// ── Comparison Bar ──────────────────────────────────────────────────────────

function ComparisonBar({ results }: { results: ExperimentResult[] }) {
  const validResults = results.filter((r) => !r.error && r.response_time_ms > 0)
  if (validResults.length < 2) return null

  const maxTime = Math.max(...validResults.map((r) => r.response_time_ms))
  const maxWords = Math.max(...validResults.map((r) => r.word_count))

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-5 mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-4">
        Comparison
      </h3>

      {/* Speed comparison */}
      <div className="space-y-2 mb-4">
        <span className="text-[10px] text-muted-foreground/60">Response Time</span>
        {validResults.map((r) => {
          const style = getProviderStyle(r.provider)
          const pct = maxTime > 0 ? (r.response_time_ms / maxTime) * 100 : 0
          return (
            <div key={`time-${r.model_id}`} className="flex items-center gap-2">
              <span className={cn('text-[10px] font-medium w-28 shrink-0 truncate', style.text)}>
                {r.model_name}
              </span>
              <div className="flex-1 h-2 rounded-full bg-foreground/5 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', style.bg)}
                  style={{ width: `${pct}%`, backgroundColor: `hsl(var(--${r.provider === 'anthropic' ? 'amber' : r.provider === 'google' ? 'blue' : r.provider === 'mistral' ? 'cyan' : 'emerald'}-400) / 0.6)` }}
                />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground w-16 text-right shrink-0">
                {formatTime(r.response_time_ms)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Word count comparison */}
      <div className="space-y-2">
        <span className="text-[10px] text-muted-foreground/60">Word Count</span>
        {validResults.map((r) => {
          const style = getProviderStyle(r.provider)
          const pct = maxWords > 0 ? (r.word_count / maxWords) * 100 : 0
          return (
            <div key={`words-${r.model_id}`} className="flex items-center gap-2">
              <span className={cn('text-[10px] font-medium w-28 shrink-0 truncate', style.text)}>
                {r.model_name}
              </span>
              <div className="flex-1 h-2 rounded-full bg-foreground/5 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', style.bg)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground w-16 text-right shrink-0">
                {r.word_count}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Metric Badge ────────────────────────────────────────────────────────────

function MetricBadge({
  icon: Icon,
  label,
  highlight,
  highlightColor,
}: {
  icon: typeof Clock
  label: string
  highlight?: boolean
  highlightColor?: string
}) {
  return (
    <div className={cn(
      'flex items-center gap-1 text-[10px]',
      highlight && highlightColor ? highlightColor : 'text-muted-foreground/60',
    )}>
      <Icon className="h-3 w-3" />
      <span className="font-mono">{label}</span>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
