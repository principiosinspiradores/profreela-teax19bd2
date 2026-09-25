import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'

export type Role = 'guest' | 'pro' | 'client' | 'admin'

interface AuthContextType {
  user: any
  role: Role
  signUp: (data: any) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => void
  requestPasswordReset: (email: string) => Promise<{ error: any }>
  confirmPasswordReset: (
    token: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<{ error: any }>
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
      //
      // When an avatar File is provided (e.g. for pros), we send the request
      // as multipart/form-data so PocketBase stores the file in the `avatar`
      // field. Otherwise we send a plain JSON object.
      if (data.avatar instanceof File) {
        const formData = new FormData()
        formData.append('email', data.email)
        formData.append('password', data.password)
        formData.append('passwordConfirm', data.password)
        formData.append('name', data.name)
        formData.append('role', data.role)
        formData.append('status', data.status)
        formData.append('terms_accepted', String(!!data.terms_accepted))
        formData.append('emailVisibility', 'true')
        formData.append('avatar', data.avatar)
        if (data.cpf) {
          formData.append('cpf', data.cpf)
        }
        await pb.collection('users').create(formData)
      } else {
        const payload: Record<string, any> = {
          email: data.email,
          password: data.password,
          passwordConfirm: data.password,
          name: data.name,
          role: data.role,
          status: data.status,
          terms_accepted: data.terms_accepted,
          emailVisibility: true,
        }
        if (data.cpf) {
          payload.cpf = data.cpf
        }
        await pb.collection('users').create(payload)
      }
      await pb.collection('users').authWithPassword(data.email, data.password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const authData = await pb.collection('users').authWithPassword(email, password)
      const record = authData?.record || pb.authStore.record
      if (record?.status === 'blocked') {
        pb.authStore.clear()
        return {
          error: new Error('Sua conta está bloqueada. Entre em contato com o suporte.'),
        }
      }
      if (record?.status === 'deleted') {
        pb.authStore.clear()
        return {
          error: new Error('Esta conta foi excluída ou desativada.'),
        }
      }
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = () => {
    pb.authStore.clear()
  }

  const requestPasswordReset = async (email: string) => {
    try {
      await pb.collection('users').requestPasswordReset(email)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const confirmPasswordReset = async (token: string, password: string, passwordConfirm: string) => {
    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const role: Role = user?.role || 'guest'

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        signUp,
        signIn,
        signOut,
        requestPasswordReset,
        confirmPasswordReset,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
