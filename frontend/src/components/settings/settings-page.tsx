import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Loader2, Settings, User, Sliders } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { Persona, LLMParameters } from '@/types'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { addToast } = useToast()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [finalPrompt, setFinalPrompt] = useState('')
  const [params, setParams] = useState<LLMParameters>({
    max_tokens: 1024,
    temperature: 0.7,
  })

  const fetchPersonas = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await api.getPersonas()
      setPersonas(data)
    } catch {
      addToast('Failed to load personas', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchPersonas()
  }, [fetchPersonas])

  const handleSelectPersona = useCallback(
    (name: string) => {
      const persona = personas.find((p) => p.persona_name === name)
      if (!persona) return
      setSelectedName(name)
      setFormName(name)
      setInitialPrompt(persona.initial_prompt)
      setFinalPrompt(persona.final_prompt)
      setParams(persona.llm_params)
    },
    [personas],
  )

  const handleNewPersona = useCallback(() => {
    setSelectedName(null)
    setFormName('')
    setInitialPrompt('')
    setFinalPrompt('')
    setParams({ max_tokens: 1024, temperature: 0.7 })
  }, [])

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      addToast('Persona name is required', 'error')
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        initial_prompt: initialPrompt,
        final_prompt: finalPrompt,
        llm_params: params,
      }

      if (selectedName) {
        await api.updatePersona(selectedName, payload)
        addToast(`Persona "${formName}" updated`, 'success')
      } else {
        await api.createPersona({ persona_name: formName.trim(), ...payload })
        addToast(`Persona "${formName}" created`, 'success')
      }
      await fetchPersonas()
      setSelectedName(formName.trim())
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [formName, initialPrompt, finalPrompt, params, selectedName, addToast, fetchPersonas])

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await api.deletePersona(name)
        addToast(`Persona "${name}" deleted`, 'success')
        if (selectedName === name) handleNewPersona()
        await fetchPersonas()
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Delete failed', 'error')
      }
    },
    [addToast, fetchPersonas, selectedName, handleNewPersona],
  )

  return (
    <div className="flex h-full">
      {/* Persona List */}
      <div className="w-60 border-r border-border flex flex-col bg-card/30">
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Personas</h3>
          </div>
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            onClick={handleNewPersona}
          >
            <Plus className="h-3 w-3" /> New Persona
          </button>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
            </div>
          ) : personas.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">No personas</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {personas.map((p) => (
                <div
                  key={p.persona_name}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer group transition-colors',
                    selectedName === p.persona_name
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => handleSelectPersona(p.persona_name)}
                >
                  <div
                    className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
                      selectedName === p.persona_name
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {p.persona_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm truncate">{p.persona_name}</span>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(p.persona_name)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Editor */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {selectedName ? `Edit: ${selectedName}` : 'New Persona'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure system prompts and LLM parameters
              </p>
            </div>
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-medium',
                selectedName
                  ? 'bg-k-yellow/10 text-k-yellow'
                  : 'bg-k-blue/10 text-k-blue-light',
              )}
            >
              {selectedName ? 'Editing' : 'Creating'}
            </span>
          </div>

          {/* Name */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Persona Name
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Research Assistant"
              className="rounded-lg"
              disabled={!!selectedName}
            />
          </div>

          {/* Prompts */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Initial System Prompt
              </label>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 mb-2">
                Guides tool selection and initial reasoning
              </p>
              <Textarea
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                rows={4}
                className="rounded-lg text-sm"
                placeholder="You are a helpful assistant..."
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Final System Prompt
              </label>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 mb-2">
                Guides the final answer generation
              </p>
              <Textarea
                value={finalPrompt}
                onChange={(e) => setFinalPrompt(e.target.value)}
                rows={4}
                className="rounded-lg text-sm"
                placeholder="Based on the provided context..."
              />
            </div>
          </div>

          {/* LLM Parameters */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                LLM Parameters
              </h3>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Temperature</span>
                <span className="text-sm font-mono text-k-yellow">{params.temperature ?? 0.7}</span>
              </div>
              <Slider
                value={[params.temperature ?? 0.7]}
                onValueChange={([v]) => setParams({ ...params, temperature: v })}
                min={0}
                max={1}
                step={0.1}
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Max Tokens</span>
                <span className="text-sm font-mono text-k-yellow">{params.max_tokens ?? 1024}</span>
              </div>
              <Slider
                value={[params.max_tokens ?? 1024]}
                onValueChange={([v]) => setParams({ ...params, max_tokens: v })}
                min={100}
                max={4000}
                step={100}
              />
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all',
              isSaving
                ? 'bg-muted text-muted-foreground cursor-wait'
                : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm',
            )}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {selectedName ? 'Update Persona' : 'Create Persona'}
          </button>
        </div>
      </ScrollArea>
    </div>
  )
}
