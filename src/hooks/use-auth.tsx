import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'

export type Role = 'guest' | 'pro' | 'client' | 'admin'

interface AuthContextType {
  user: any
  role: Role
  signUp: (data: any) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(pb.authStore.record)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record)
    })
    setLoading(false)
    return () => {
      unsubscribe()
    }
  }, [])

  const signUp = async (data: any) => {
    try {
      // Build the create payload explicitly so every required auth field is
      // sent in the exact shape PocketBase v0.23+ expects:
      //   - `password` + `passwordConfirm` must match
      //   - `emailVisibility` is set so the email is always returned on the
      //     record (the app reads user.email in several places)
      //   - `role` is required on the users collection
      await pb.collection('users').create({
        email: data.email,
        password: data.password,
        passwordConfirm: data.password,
        name: data.name,
        role: data.role,
        status: data.status,
        terms_accepted: data.terms_accepted,
        emailVisibility: true,
      })
      await pb.collection('users').authWithPassword(data.email, data.password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = () => {
    pb.authStore.clear()
  }

  const role: Role = user?.role || 'guest'

  return (
    <AuthContext.Provider value={{ user, role, signUp, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
