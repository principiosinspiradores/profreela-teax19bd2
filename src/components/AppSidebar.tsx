import { Home, Briefcase, Settings, History, Users, BarChart3, Wallet } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { getAvatarUrl } from '@/lib/avatar'
import { BrandLogo } from './BrandLogo'

export function AppSidebar() {
  const { role, signOut, user } = useAuth()
  const location = useLocation()

  const getMenu = () => {
    switch (role) {
      case 'pro':
        return [
          { title: 'Painel', url: '/pro', icon: Home },
          { title: 'Ganhos', url: '/pro/earnings', icon: Wallet },
          { title: 'Configurações', url: '/pro/settings', icon: Settings },
        ]
      case 'client':
        return [
          { title: 'Painel', url: '/client', icon: Home },
          { title: 'Nova Solicitação', url: '/client/request', icon: Briefcase },
          { title: 'Histórico', url: '/client/history', icon: History },
        ]
      case 'admin':
        return [
          { title: 'Visão Geral', url: '/admin', icon: BarChart3 },
          { title: 'Usuários', url: '/admin/users', icon: Users },
          { title: 'Preços Dinâmicos', url: '/admin/pricing', icon: Wallet },
          { title: 'Configurações', url: '/admin/settings', icon: Settings },
        ]
      default:
        return []
    }
  }

  const items = getMenu()

  return (
    <Sidebar>
      <SidebarHeader className="p-4 flex flex-row items-center justify-between border-b bg-background">
        <Link to="/" className="flex items-center">
          <BrandLogo size="md" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                // Match by prefix so sub-routes (e.g. /client/request) keep the
                // correct parent item highlighted. The root dashboards ("/pro",
                // "/client", "/admin") are matched exactly to avoid all three
                // lighting up at once.
                const isRoot = ['/', '/pro', '/client', '/admin'].includes(item.url)
                const isActive = isRoot
                  ? location.pathname === item.url
                  : location.pathname.startsWith(item.url)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3 mb-4">
          <img
            src={getAvatarUrl(user, 128)}
            alt="Avatar"
            className="w-10 h-10 rounded-full border bg-muted object-cover"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{user?.name}</span>
            <span className="text-xs text-muted-foreground capitalize">{role}</span>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={signOut}>
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
