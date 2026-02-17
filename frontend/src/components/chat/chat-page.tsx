import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send,
  ImageIcon,
  Film,
  Volume2,
  Mic,
  MicOff,
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
  ListOrdered,
  X,
  Music,
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
  const [mode, setMode] = useState<'chat' | 'image' | 'video' | 'voice'>('chat')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Message Queue ────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<string[]>([])
  const isProcessingRef = useRef(false)

  // ── Dictation (Web Speech API) ──────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const dictationBaseRef = useRef('')

  const hasSpeechApi = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const toggleDictation = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    // Snapshot whatever is already typed as the frozen base
    dictationBaseRef.current = input

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Rebuild full transcript from all results on every event
      let full = ''
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript
        if (event.results[i].isFinal) full += ' '
      }
      const base = dictationBaseRef.current
      const sep = base && !base.endsWith(' ') ? ' ' : ''
      setInput(base + sep + full.trim())
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening, input])

  // Stop dictation when component unmounts
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    api.getPersonas().then(setPersonas).catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const processMessage = useCallback(async (text: string) => {
    isProcessingRef.current = true
    setIsLoading(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    if (mode === 'image') {
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
      }
    } else if (mode === 'video') {
      try {
        const result = await api.generateVideo(text)
        const videoUrl = api.getVideoUrl(result.video_path)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Generated video for: "${text}"`,
            video_url: videoUrl,
          },
        ])
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Video generation failed', 'error')
      }
    } else if (mode === 'voice') {
      try {
        const result = await api.generateSpeech(text)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Generated speech (${result.voice})`,
            audio_url: result.audio_url,
            audio_path: result.audio_path,
          },
        ])
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Speech generation failed', 'error')
      }
    } else {
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
      }
    }

    setIsLoading(false)
    isProcessingRef.current = false
  }, [mode, selectedPersona, addToast])

  // Drain the queue one at a time — only starts the next after isLoading goes false
  useEffect(() => {
    if (isLoading || queue.length === 0 || isProcessingRef.current) return
    const [next, ...rest] = queue
    setQueue(rest)
    processMessage(next)
  }, [isLoading, queue, processMessage])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return

    // Stop dictation if active
    recognitionRef.current?.stop()
    setIsListening(false)
    setInput('')

    if (isProcessingRef.current) {
      setQueue((prev) => [...prev, text])
      return
    }

    processMessage(text)
  }, [input, processMessage])

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

  const handleSaveAudio = useCallback(
    async (audioPath: string) => {
      try {
        await api.saveGeneratedSpeechToCollection(audioPath)
        addToast('Audio saved to library — transcription & RAG indexing will run', 'success')
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to save audio', 'error')
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
              onSaveAudio={handleSaveAudio}
              onFollowUp={handleFollowUp}
            />
          ))}

          {/* Thinking indicator with pipeline stages */}
          {isLoading && <ThinkingIndicator />}

          {/* Queued messages */}
          {queue.length > 0 && (
            <div className="space-y-1.5 py-2 pl-10">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <ListOrdered className="h-3 w-3" />
                <span>{queue.length} queued</span>
              </div>
              {queue.map((q, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg bg-accent/20 border border-border/30 px-3 py-1.5 text-xs text-muted-foreground/70 group"
                >
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums w-4">{idx + 1}</span>
                  <span className="truncate flex-1">{q}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400 transition-all shrink-0"
                    onClick={() => setQueue((prev) => prev.filter((_, i) => i !== idx))}
                    title="Remove from queue"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
                    : mode === 'video'
                      ? 'Describe the video you want to generate...'
                      : mode === 'voice'
                        ? 'Type the text to convert to speech...'
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
                  onClick={() => setMode(mode === 'image' ? 'chat' : 'image')}
                >
                  <ImageIcon className="h-3 w-3" />
                  {mode === 'image' ? 'Image mode' : 'Image'}
                </button>

                <button
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[11px] font-medium transition-colors',
                    mode === 'video'
                      ? 'bg-violet-500/10 text-violet-400'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => setMode(mode === 'video' ? 'chat' : 'video')}
                >
                  <Film className="h-3 w-3" />
                  {mode === 'video' ? 'Video mode' : 'Video'}
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
                    mode === 'voice'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => setMode(mode === 'voice' ? 'chat' : 'voice')}
                >
                  <Volume2 className="h-3 w-3" />
                  {mode === 'voice' ? 'Voice mode' : 'Voice'}
                </button>
              </div>

              <div className="flex items-center gap-1">
                {hasSpeechApi && (
                  <button
                    onClick={toggleDictation}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                      isListening
                        ? 'bg-red-500/10 text-red-400 animate-pulse'
                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-accent',
                    )}
                    title={isListening ? 'Stop dictation' : 'Start dictation'}
                  >
                    {isListening ? (
                      <MicOff className="h-3.5 w-3.5" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {queue.length > 0 && (
                  <div className="flex items-center gap-1 rounded-lg bg-accent/50 px-2 py-1 text-[10px] text-muted-foreground">
                    <ListOrdered className="h-3 w-3" />
                    {queue.length}
                  </div>
                )}
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                    input.trim()
                      ? isLoading
                        ? 'bg-accent text-foreground hover:opacity-80'
                        : 'bg-foreground text-background hover:opacity-80'
                      : 'text-muted-foreground/30 cursor-not-allowed',
                  )}
                >
                  {isLoading && !input.trim() ? (
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
    </div>
  )
}

// ── Message Component ───────────────────────────────────────────────────────

function MessageBubble({
  message,
  onCopy,
  onSave,
  onSaveAudio,
  onFollowUp,
}: {
  message: ChatMessage
  onCopy: (content: string) => void
  onSave: (content: string) => void
  onSaveAudio?: (audioPath: string) => void
  onFollowUp: (question: string) => void
}) {
  const isUser = message.role === 'user'
  const isImage = message.content.startsWith('![')
  const isVideo = !!message.video_url
  const isAudio = !!message.audio_url

  const renderedHtml = useMemo(() => {
    if (isUser || isImage || isVideo || isAudio) return ''
    return renderMarkdown(message.content)
  }, [message.content, isUser, isImage, isVideo, isAudio])

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
        {isAudio ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{message.content}</p>
            <div className="rounded-xl border border-border/60 overflow-hidden bg-card/40 p-3 max-w-sm">
              <audio src={message.audio_url} controls className="w-full h-8" />
            </div>
          </div>
        ) : isVideo ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{message.content}</p>
            <div className="rounded-xl border border-border overflow-hidden bg-black max-w-lg">
              <video
                src={message.video_url}
                controls
                className="w-full"
              />
            </div>
          </div>
        ) : isImage ? (
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
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isImage && !isVideo && (
            <>
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
            </>
          )}
          {isAudio && message.audio_path && onSaveAudio && (
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => onSaveAudio(message.audio_path!)}
            >
              <Music className="h-3 w-3" /> Save to Library
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
