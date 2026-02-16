import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  MessageSquare,
  History,
  ImageIcon,
  Brain,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
  X,
  Wand2,
  GitBranch,
  Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileSidebar } from '@/components/files/file-sidebar'

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
    label: 'Create',
    items: [
      { to: '/images', icon: ImageIcon, label: 'Media' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/studio', icon: Wand2, label: 'Studio' },
      { to: '/database', icon: Database, label: 'Database' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/architecture', icon: GitBranch, label: 'Architecture' },
    ],
  },
]

const BOTTOM_NAV = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-border/60 bg-card/40 transition-all duration-200 ease-out',
          isSidebarOpen ? 'w-[200px]' : 'w-14',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-14 items-center gap-2.5 px-3 shrink-0',
          isSidebarOpen ? 'justify-start' : 'justify-center',
        )}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-k-yellow shadow-sm shadow-k-yellow/20">
            <span className="text-sm font-bold text-k-black">P</span>
          </div>
          {isSidebarOpen && (
            <span className="text-[13px] font-semibold tracking-tight text-foreground">
              Pixelbot
            </span>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex flex-1 flex-col px-2 pt-2">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={group.label}>
              {groupIdx > 0 && (
                <div className={cn('my-1.5', isSidebarOpen ? 'mx-2.5' : 'mx-1')}>
                  <div className="h-px bg-border/40" />
                </div>
              )}
              {isSidebarOpen && (
                <span className="block px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  {group.label}
                </span>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
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
          {/* Files toggle */}
          <button
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors',
              isSidebarOpen ? '' : 'justify-center',
              isFilePanelOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            onClick={() => setIsFilePanelOpen(!isFilePanelOpen)}
          >
            {isFilePanelOpen ? (
              <X className="h-[15px] w-[15px] shrink-0" />
            ) : (
              <FolderOpen className="h-[15px] w-[15px] shrink-0" />
            )}
            {isSidebarOpen && <span>{isFilePanelOpen ? 'Close Files' : 'Files'}</span>}
          </button>

          {/* Settings */}
          {BOTTOM_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
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

          {/* Collapse */}
          <button
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
              isSidebarOpen ? '' : 'justify-center',
            )}
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

          {/* Powered by Pixeltable */}
          <a
            href="https://github.com/pixeltable/pixeltable"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 pt-2 pb-1 transition-opacity hover:opacity-80',
              isSidebarOpen ? 'px-2.5' : 'justify-center px-1',
            )}
            title="Powered by Pixeltable — View on GitHub"
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="white" fillOpacity="0.9" />
                <rect x="9" y="1" width="6" height="6" rx="1" fill="white" fillOpacity="0.6" />
                <rect x="1" y="9" width="6" height="6" rx="1" fill="white" fillOpacity="0.6" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill="white" fillOpacity="0.3" />
              </svg>
            </div>
            {isSidebarOpen && (
              <span className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors">
                powered by Pixeltable
              </span>
            )}
          </a>
        </div>
      </aside>

      {/* Main content area (no top bar) */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>

          {/* File panel */}
          {isFilePanelOpen && (
            <div className="w-72 shrink-0 border-l border-border/60 overflow-y-auto overflow-x-hidden bg-card/30 animate-slide-in">
              <FileSidebar />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
