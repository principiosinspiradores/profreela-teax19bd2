import { Outlet, Link } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { AppSidebar } from './AppSidebar'
import { NotificationBell } from './NotificationBell'
import { BrandLogo } from './BrandLogo'

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-xs">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center">
          <BrandLogo size="md" />
        </Link>
        <span className="text-xs text-muted-foreground font-medium hidden sm:inline-block bg-muted/60 px-2.5 py-1 rounded-full border border-border/50">
          profreela.com.br
        </span>
      </div>
    </header>
  )
}

function AuthenticatedHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 shadow-sm">
      <SidebarTrigger className="-ml-1" label="Menu" />
      <div className="flex flex-1 items-center justify-end gap-1">
        <NotificationBell />
      </div>
    </header>
  )
}

export default function Layout() {
  const { role } = useAuth()

  if (role === 'guest') {
    return (
      <div className="min-h-screen flex flex-col bg-background font-sans antialiased text-foreground">
        <PublicHeader />
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar />
        <SidebarInset className="flex flex-col w-full bg-background overflow-hidden">
          <AuthenticatedHeader />
          <main className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
