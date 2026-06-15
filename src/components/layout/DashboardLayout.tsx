import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Package,
  Warehouse,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Truck,
  Settings,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ClipboardList,
  MapPin,
  CircleDot,
  BarChart3,
  ShoppingBag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Orders', href: '/orders', icon: ShoppingBag },
  {
    name: 'Products',
    href: '/products',
    icon: Package,
    children: [
      { name: 'Inventory', href: '/inventory', icon: Warehouse },
      { name: 'Purchases', href: '/purchases', icon: ShoppingCart },
      { name: 'Tracking', href: '/tracking', icon: MapPin },
      { name: 'Suppliers', href: '/suppliers', icon: Truck },
    ],
  },
  {
    name: 'Sales Channels',
    href: '/sales-channels',
    icon: BarChart3,
    children: [
      { name: 'Pricing', href: '/pricing', icon: DollarSign },
      { name: 'Profitability', href: '/profitability', icon: TrendingUp },
    ],
  },
  { name: 'Activity Log', href: '/activity', icon: ClipboardList },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function isPathActive(currentPath: string, href: string) {
  return currentPath === href || (href !== '/' && currentPath.startsWith(`${href}/`))
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { signOut, profile } = useAuth()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 bg-sidebar shadow-2xl animate-slide-up">
            <SidebarContent
              currentPath={location.pathname}
              onSignOut={signOut}
              profile={profile}
              onNavigate={() => setSidebarOpen(false)}
              onClose={() => setSidebarOpen(false)}
              isMobile
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex flex-col flex-grow bg-sidebar">
          <SidebarContent currentPath={location.pathname} onSignOut={signOut} profile={profile} />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar for mobile */}
        <div className="sticky top-0 z-30 flex items-center gap-4 border-b bg-background/80 glass px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-black tracking-tight">OpsCore</h1>
          </div>
        </div>

        <main className="p-4 md:p-8 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({
  currentPath,
  onSignOut,
  profile,
  onNavigate,
  onClose,
  isMobile,
}: {
  currentPath: string
  onSignOut: () => void
  profile: { full_name: string | null; email: string; role: string } | null
  onNavigate?: () => void
  onClose?: () => void
  isMobile?: boolean
}) {
  return (
    <div className="flex flex-col h-full text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary">
            <CircleDot className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-3xl font-black tracking-tight text-white">OpsCore</span>
          </div>
        </div>
        {isMobile && onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-muted"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold">Menu</p>
        {navigation.map((item) => {
          const isActive = isPathActive(currentPath, item.href)
          const isChildActive = item.children?.some((child) => isPathActive(currentPath, child.href)) ?? false
          const isExpanded = isActive || isChildActive
          return (
            <div key={item.name}>
              <Link
                to={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-white shadow-glow'
                    : isChildActive
                      ? 'bg-sidebar-muted text-white'
                      : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-muted'
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.name}
                {item.children ? (
                  <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform duration-200', isExpanded ? 'rotate-0' : '-rotate-90')} />
                ) : isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </Link>

              {item.children && isExpanded && (
                <div className="mt-1 space-y-0.5 pl-7">
                  {item.children.map((child) => {
                    const childActive = isPathActive(currentPath, child.href)
                    return (
                      <Link
                        key={child.name}
                        to={child.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                          childActive
                            ? 'bg-primary text-white shadow-glow'
                            : 'text-sidebar-foreground/55 hover:text-white hover:bg-sidebar-muted'
                        )}
                      >
                        <child.icon className="h-4 w-4" />
                        {child.name}
                        {childActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center ring-2 ring-white/10">
            <span className="text-sm font-semibold text-white">
              {profile?.full_name?.[0] ?? profile?.email[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-[11px] text-sidebar-foreground/50 capitalize">{profile?.role ?? 'standard'}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-muted"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
