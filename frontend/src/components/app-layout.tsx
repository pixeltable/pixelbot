import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  History,
  ImageIcon,
  Brain,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  GitBranch,
  Database,
  FlaskConical,
  Code2,
  SquarePen,
  Plug,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type NavItem = { to: string; icon: typeof MessageSquare; label: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Conversation',
    items: [
      { to: '/', icon: MessageSquare, label: 'Chat' },
      { to: '/history', icon: History, label: 'History' },
      { to: '/memory', icon: Brain, label: 'Memory' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/images', icon: ImageIcon, label: 'Media Library' },
      { to: '/studio', icon: Wand2, label: 'Studio' },
      { to: '/experiments', icon: FlaskConical, label: 'Prompt Lab' },
      { to: '/integrations', icon: Plug, label: 'Integrations' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/database', icon: Database, label: 'Database' },
      { to: '/developer', icon: Code2, label: 'Developer' },
      { to: '/architecture', icon: GitBranch, label: 'Architecture' },
    ],
  },
]

const BOTTOM_NAV = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const handleNewChat = () => {
    navigate(`/?c=${crypto.randomUUID()}`)
    setMobileOpen(false)
  }

  const sidebarContents = (
    <div className="flex h-full min-h-0 flex-col">
        {/* Logo + New Chat */}
        <div className={cn(
          'flex h-14 items-center px-3 shrink-0',
          isSidebarOpen ? 'justify-between' : 'flex-col justify-center gap-1',
        )}>
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Pixelbot"
              className="h-8 w-8 shrink-0 rounded-lg"
            />
            {isSidebarOpen && (
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                Pixelbot
              </span>
            )}
          </div>
          <button
            onClick={handleNewChat}
            className={cn(
              'hidden items-center justify-center rounded-lg text-muted-foreground md:flex hover:bg-accent hover:text-foreground transition-colors',
              isSidebarOpen ? 'h-7 w-7' : 'h-6 w-6',
            )}
            title="New chat"
            aria-label="New chat"
          >
            <SquarePen className={cn(isSidebarOpen ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
          </button>
        </div>

        {/* Primary nav */}
        <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-2">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={group.label}>
              {groupIdx > 0 && (
                <div className={cn('my-1.5', isSidebarOpen ? 'mx-2.5' : 'mx-1')}>
                  <div className="h-px bg-border/40" />
                </div>
              )}
              {isSidebarOpen && (
                <span className="block px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    aria-label={label}
                    title={label}
                    onClick={() => setMobileOpen(false)}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors',
                        isSidebarOpen ? '' : 'justify-center',
                        isActive
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" />
                    {isSidebarOpen && <span>{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="px-2 pb-2 space-y-0.5">
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors',
                  isSidebarOpen ? '' : 'justify-center',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )
              }
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              {isSidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}

          <button
            className={cn(
              'hidden w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] md:flex text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
              isSidebarOpen ? '' : 'justify-center',
            )}
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? (
              <>
                <PanelLeftClose className="h-[15px] w-[15px] shrink-0" />
                <span>Collapse</span>
              </>
            ) : (
              <PanelLeftOpen className="h-[15px] w-[15px] shrink-0" />
            )}
          </button>

          <a
            href="https://github.com/pixeltable/pixeltable"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 pt-2 pb-1 transition-opacity hover:opacity-80',
              isSidebarOpen ? 'px-2.5' : 'justify-center px-1',
            )}
            aria-label="Powered by Pixeltable — View on GitHub"
            title="Powered by Pixeltable — View on GitHub"
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted-foreground/20">
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="white" fillOpacity="0.9" />
                <rect x="9" y="1" width="6" height="6" rx="1" fill="white" fillOpacity="0.6" />
                <rect x="1" y="9" width="6" height="6" rx="1" fill="white" fillOpacity="0.6" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill="white" fillOpacity="0.3" />
              </svg>
            </div>
            {isSidebarOpen && (
              <span className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                powered by Pixeltable
              </span>
            )}
          </a>
        </div>
    </div>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to content</a>
      <aside className={cn('hidden shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex', isSidebarOpen ? 'w-[200px]' : 'w-14')}>
        {sidebarContents}
      </aside>
      <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-hidden" tabIndex={-1}>
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 md:hidden">
          <Dialog open={mobileOpen} onOpenChange={(open) => { setMobileOpen(open); if (open) setIsSidebarOpen(true) }}>
            <DialogTrigger asChild>
              <button aria-label="Open navigation" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent"><Menu className="h-5 w-5" /></button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="fixed left-0 top-0 flex h-dvh max-h-dvh w-72 max-w-[85vw] flex-col rounded-none p-0">
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              {sidebarContents}
            </DialogContent>
          </Dialog>
          <span className="text-sm font-semibold">Pixelbot</span>
          <button onClick={handleNewChat} aria-label="New chat" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg hover:bg-accent"><SquarePen className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
