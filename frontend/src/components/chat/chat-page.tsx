import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  ImageIcon,
  Loader2,
  Bookmark,
  User,
  Copy,
  Sparkles,
  ChevronDown,
  FileText,
  Wrench,
  Brain,
  ArrowRight,
} from 'lucide-react'
import { marked } from 'marked'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { ChatMessage, Persona } from '@/types'
import { cn } from '@/lib/utils'
import { ThinkingIndicator } from '@/components/chat/thinking-indicator'

// Configure marked for clean output
marked.setOptions({
  breaks: true,
  gfm: true,
})

function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}

function parseFollowUpQuestions(text: string): string[] {
  try {
    const data = JSON.parse(text)
    if (Array.isArray(data?.questions)) {
      return data.questions.filter(Boolean)
    }
  } catch {
    // Fallback: legacy newline-separated format
  }
  return text.split('\n').filter(Boolean)
}

const SOURCE_CONFIG = {
  docs: { icon: FileText, label: 'Documents', className: 'text-blue-400' },
  images: { icon: ImageIcon, label: 'Images', className: 'text-k-yellow' },
  tools: { icon: Wrench, label: 'Tools', className: 'text-orange-400' },
  memory: { icon: Brain, label: 'Memory', className: 'text-emerald-400' },
} as const

export function ChatPage() {
  const { addToast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'chat' | 'image'>('chat')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getPersonas().then(setPersonas).catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setInput('')
    setIsLoading(true)

    if (mode === 'image') {
      setMessages((prev) => [...prev, { role: 'user', content: text }])
      try {
        const result = await api.generateImage(text)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `![Generated Image](data:image/png;base64,${result.generated_image_base64})`,
          },
        ])
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Image generation failed', 'error')
      } finally {
        setIsLoading(false)
      }
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])

    try {
      const response = await api.sendQuery(text, selectedPersona)
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.answer,
        image_context: response.image_context,
        video_frame_context: response.video_frame_context,
        follow_up_text: response.follow_up_text,
        metadata: response.metadata,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Query failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, mode, selectedPersona, addToast])

  const handleFollowUp = useCallback((question: string) => {
    setInput(question)
  }, [])

  const handleSaveToMemory = useCallback(
    async (content: string, contextQuery: string) => {
      try {
        await api.saveMemory({ content, type: 'text', context_query: contextQuery })
        addToast('Saved to memory', 'success')
      } catch {
        addToast('Failed to save', 'error')
      }
    },
    [addToast],
  )

  const handleCopy = useCallback(
    (content: string) => {
      navigator.clipboard.writeText(content)
      addToast('Copied to clipboard', 'success')
    },
    [addToast],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
          {/* Welcome screen */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-28 text-center animate-fade-in">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                What can I help with?
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Ask about your documents, images, videos, or search the web.
              </p>
              <div className="flex flex-wrap gap-2 mt-8 justify-center">
                {[
                  'What documents do I have?',
                  'Summarize my files',
                  'Search for recent news',
                  'Show me financial data',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="px-3.5 py-2 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border transition-all"
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              onCopy={handleCopy}
              onSave={(content) => {
                const userMsg = messages[i - 1]
                handleSaveToMemory(content, userMsg?.content ?? 'Chat response')
              }}
              onFollowUp={handleFollowUp}
            />
          ))}

          {/* Thinking indicator with pipeline stages */}
          {isLoading && <ThinkingIndicator />}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-4 pb-5">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border/60 bg-card/50 shadow-sm focus-within:border-border focus-within:shadow-md transition-all">
            <div className="px-4 pt-3 pb-1">
              <Textarea
                placeholder={
                  mode === 'image'
                    ? 'Describe the image you want to generate...'
                    : 'Ask anything...'
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                rows={1}
                className="min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1">
                <div className="relative">
                  <select
                    value={selectedPersona ?? ''}
                    onChange={(e) => setSelectedPersona(e.target.value || null)}
                    className="appearance-none h-7 rounded-lg bg-transparent pl-2.5 pr-6 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer focus:outline-none"
                  >
                    <option value="">Default Agent</option>
                    {personas.map((p) => (
                      <option key={p.persona_name} value={p.persona_name}>
                        {p.persona_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
                </div>

                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[11px] font-medium transition-colors',
                    mode === 'image'
                      ? 'bg-k-yellow/10 text-k-yellow'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => setMode(mode === 'chat' ? 'image' : 'chat')}
                >
                  <ImageIcon className="h-3 w-3" />
                  {mode === 'image' ? 'Image mode' : 'Image'}
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                  input.trim() && !isLoading
                    ? 'bg-foreground text-background hover:opacity-80'
                    : 'text-muted-foreground/30 cursor-not-allowed',
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Message Component ───────────────────────────────────────────────────────

function MessageBubble({
  message,
  onCopy,
  onSave,
  onFollowUp,
}: {
  message: ChatMessage
  onCopy: (content: string) => void
  onSave: (content: string) => void
  onFollowUp: (question: string) => void
}) {
  const isUser = message.role === 'user'
  const isImage = message.content.startsWith('![')

  const renderedHtml = useMemo(() => {
    if (isUser || isImage) return ''
    return renderMarkdown(message.content)
  }, [message.content, isUser, isImage])

  const sources = useMemo(() => {
    if (!message.metadata) return []
    const active: (keyof typeof SOURCE_CONFIG)[] = []
    if (message.metadata.has_doc_context) active.push('docs')
    if (message.metadata.has_image_context) active.push('images')
    if (message.metadata.has_tool_output) active.push('tools')
    if (message.metadata.has_memory_context) active.push('memory')
    return active
  }, [message.metadata])

  const followUps = useMemo(() => {
    if (!message.follow_up_text) return []
    return parseFollowUpQuestions(message.follow_up_text)
  }, [message.follow_up_text])

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end py-2 animate-fade-in">
        <div className="max-w-[75%] rounded-2xl bg-accent text-foreground px-4 py-3">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="flex-shrink-0 mt-1">
          <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 py-4 group animate-fade-in">
      {/* Avatar */}
      <div className="flex-shrink-0 mt-0.5">
        <div className="h-7 w-7 rounded-full bg-k-yellow/10 border border-k-yellow/20 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-k-yellow" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Main answer */}
        {isImage ? (
          <img
            src={message.content.match(/\(([^)]+)\)/)?.[1]}
            alt="Generated"
            className="rounded-xl max-w-full"
          />
        ) : (
          <div
            className="prose-chat text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}

        {/* Image context */}
        {message.image_context && message.image_context.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-w-sm">
            {message.image_context.map((img, j) => (
              <img
                key={j}
                src={`data:image/png;base64,${img.encoded_image}`}
                alt={`Context ${j}`}
                className="h-20 w-full rounded-lg object-cover border border-border/30"
              />
            ))}
          </div>
        )}

        {/* Video frame context */}
        {message.video_frame_context && message.video_frame_context.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-w-sm">
            {message.video_frame_context.map((frame, j) => (
              <img
                key={j}
                src={`data:image/png;base64,${frame.encoded_frame}`}
                alt={`Frame ${j}`}
                className="h-20 w-full rounded-lg object-cover border border-border/30"
              />
            ))}
          </div>
        )}

        {/* Sources (subtle inline) */}
        {sources.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
            <span>Sources:</span>
            {sources.map((key) => {
              const config = SOURCE_CONFIG[key]
              const Icon = config.icon
              return (
                <span key={key} className={cn('inline-flex items-center gap-1', config.className)}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </span>
              )
            })}
          </div>
        )}

        {/* Follow-up suggestions */}
        {followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {followUps.map((q, j) => (
              <button
                key={j}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-xs text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border transition-all"
                onClick={() => onFollowUp(q)}
              >
                <ArrowRight className="h-3 w-3 shrink-0 opacity-40" />
                <span className="truncate max-w-[280px]">{q}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isImage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => onCopy(message.content)}
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => onSave(message.content)}
            >
              <Bookmark className="h-3 w-3" /> Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
