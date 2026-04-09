import React, { createContext, useContext, useState, ReactNode } from 'react'

export type Role = 'guest' | 'pro' | 'client' | 'admin'

interface AuthState {
  role: Role
  setRole: (role: Role) => void
  user: { name: string; avatar: string } | null
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>('guest')

  const user =
    role === 'guest'
      ? null
      : {
          name: role === 'pro' ? 'Ana Silva' : role === 'client' ? 'Hotel Plaza' : 'Admin Global',
          avatar:
            role === 'pro'
              ? 'https://img.usecurling.com/ppl/thumbnail?gender=female&seed=1'
              : 'https://img.usecurling.com/i?q=hotel&shape=fill&color=blue',
        }

  const logout = () => setRole('guest')

  return React.createElement(
    AuthContext.Provider,
    { value: { role, setRole, user, logout } },
    children,
  )
}

export const useAuthStore = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthStore must be used within AuthProvider')
  return ctx
}
