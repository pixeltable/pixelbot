import { useState, useEffect, useCallback } from 'react'
import {
  Plug,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Hash,
  Webhook,
  RefreshCw,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type {
  IntegrationInfo,
  NotificationLogEntry,
} from '@/types'
import { cn } from '@/lib/utils'

const SERVICE_ICONS: Record<string, typeof Plug> = {
  slack: Hash,
  discord: Hash,
  webhook: Webhook,
}

const SERVICE_COLORS: Record<string, string> = {
  slack: 'text-[#E01E5A]',
  discord: 'text-[#5865F2]',
  webhook: 'text-amber-400',
}

const SERVICE_BG: Record<string, string> = {
  slack: 'bg-[#E01E5A]/10 border-[#E01E5A]/20',
  discord: 'bg-[#5865F2]/10 border-[#5865F2]/20',
  webhook: 'bg-amber-400/10 border-amber-400/20',
}

export function IntegrationsPage() {
  const { addToast } = useToast()
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([])
  const [log, setLog] = useState<NotificationLogEntry[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [testingService, setTestingService] = useState<string | null>(null)
  const [testMessages, setTestMessages] = useState<Record<string, string>>({})

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [statusRes, logRes] = await Promise.all([
        api.getIntegrationsStatus(),
        api.getNotificationLog(50),
      ])
      setIntegrations(statusRes.integrations)
      setLog(logRes.notifications)
      setLogTotal(logRes.total)
    } catch {
      addToast('Failed to load integrations', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleTest = async (serviceId: string) => {
    const message = testMessages[serviceId]?.trim() || 'Test notification from Pixelbot'
    setTestingService(serviceId)
    try {
      const res = await api.testNotification(serviceId, message)
      if (res.status === 'success') {
        addToast(`${serviceId} notification sent!`, 'success')
      } else {
        addToast(res.result, 'error')
      }
      const logRes = await api.getNotificationLog(50)
      setLog(logRes.notifications)
      setLogTotal(logRes.total)
    } catch {
      addToast(`Failed to test ${serviceId}`, 'error')
    } finally {
      setTestingService(null)
    }
  }

  const configuredCount = integrations.filter(i => i.configured).length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Plug className="h-5 w-5 text-violet-400" />
            <h1 className="text-lg font-semibold">Integrations</h1>
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {configuredCount} of {integrations.length} services connected
            {logTotal > 0 && <> &middot; {logTotal} notifications sent</>}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-8 px-6 py-6">
          {/* Services Grid */}
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Notification Services
            </h2>
            <p className="mb-4 text-xs text-muted-foreground/60">
              The chat agent can send notifications on your behalf — "summarize my docs and post to Slack".
              Configure webhook URLs in <code className="rounded bg-muted px-1 py-0.5 text-[11px]">backend/.env</code> to enable.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {integrations.map(integration => {
                const Icon = SERVICE_ICONS[integration.id] ?? Plug
                const color = SERVICE_COLORS[integration.id] ?? 'text-muted-foreground'
                const bg = SERVICE_BG[integration.id] ?? 'bg-muted/30 border-border/40'
                const isTesting = testingService === integration.id

                return (
                  <div
                    key={integration.id}
                    className={cn(
                      'rounded-xl border p-4 transition-colors',
                      integration.configured ? bg : 'border-border/20 bg-card/30 opacity-60',
                    )}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', color)} />
                        <span className="text-sm font-medium">{integration.name}</span>
                      </div>
                      {integration.configured ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                          <XCircle className="h-3 w-3" /> Not set
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                      {integration.description}
                    </p>

                    <div className="mt-1.5 text-[10px] text-muted-foreground/40 font-mono">
                      {integration.env_var}
                    </div>

                    {/* Test area */}
                    {integration.configured && (
                      <div className="mt-3 flex gap-2">
                        <Input
                          className="h-7 text-xs bg-background/50"
                          placeholder="Test message..."
                          value={testMessages[integration.id] ?? ''}
                          onChange={e => setTestMessages(prev => ({ ...prev, [integration.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleTest(integration.id)}
                        />
                        <button
                          onClick={() => handleTest(integration.id)}
                          disabled={isTesting}
                          className={cn(
                            'flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                            'bg-foreground/10 hover:bg-foreground/20 text-foreground',
                          )}
                        >
                          {isTesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Test
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* How it works */}
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              How It Works
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  step: '1',
                  title: 'Custom UDFs',
                  desc: 'Each service is a @pxt.udf wrapping a simple HTTP POST — ~10 lines of Python.',
                },
                {
                  step: '2',
                  title: 'Agent Tools',
                  desc: 'Registered via pxt.tools() so the chat agent can call them autonomously.',
                },
                {
                  step: '3',
                  title: 'Activity Log',
                  desc: 'Every notification is logged to the agents.notifications Pixeltable table.',
                },
              ].map(item => (
                <div
                  key={item.step}
                  className="rounded-lg border border-border/20 bg-card/20 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">
                      {item.step}
                    </span>
                    <span className="text-xs font-medium">{item.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Activity Log */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Activity Log
              </h2>
              {logTotal > 0 && (
                <span className="text-[11px] text-muted-foreground/50">
                  {logTotal} total
                </span>
              )}
            </div>

            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/20 bg-card/20 py-12 text-center">
                <Clock className="mb-2 h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground/40">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground/30">
                  Test a service above or ask the chat agent to send one
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {log.map((entry, i) => {
                  const Icon = SERVICE_ICONS[entry.service] ?? Plug
                  const color = SERVICE_COLORS[entry.service] ?? 'text-muted-foreground'
                  const isSuccess = entry.status === 'success'

                  return (
                    <div
                      key={`${entry.timestamp}-${i}`}
                      className="flex items-start gap-3 rounded-lg border border-border/10 bg-card/20 px-3 py-2.5"
                    >
                      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', color)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium capitalize">{entry.service}</span>
                          {isSuccess ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-400" />
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground/40">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
                          {entry.message}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString()
  } catch {
    return ts
  }
}
