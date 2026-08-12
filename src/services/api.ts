import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export const getServices = () => pb.collection('services').getFullList()

/**
 * Create a new service (admin only).
 *
 * The PocketBase JS SDK injects the auth token from `pb.authStore`
 * automatically — we do NOT pass custom headers, because in SDK v0.26.x the
 * second argument of `.create()` is treated as `SendOptions` and custom
 * headers passed there can produce a malformed multipart payload that the
 * server rejects with HTTP 400. Letting the SDK manage the token keeps
 * create and update behaviour identical.
 */
export const createService = async (data: any) => {
  try {
    return await pb.collection('services').create(data)
  } catch (err) {
    console.error('[createService] failed:', err)
    throw err
  }
}

export const updateService = async (id: string, data: any) => {
  try {
    return await pb.collection('services').update(id, data)
  } catch (err) {
    console.error('[updateService] failed:', err)
    throw err
  }
}

export const deleteService = async (id: string) => {
  try {
    return await pb.collection('services').delete(id)
  } catch (err) {
    console.error('[deleteService] failed:', err)
    throw err
  }
}
export const getJobs = () =>
  pb.collection('jobs').getFullList({ expand: 'service_id,pro_id,customer_id', sort: '-created' })
export const getProJobs = (proId: string) =>
  pb.collection('jobs').getFullList({
    filter: `pro_id="${proId}" || status="pending"`,
    expand: 'service_id,customer_id',
    sort: '-created',
  })
export const getClientJobs = (clientId: string) =>
  pb.collection('jobs').getFullList({
    filter: `customer_id="${clientId}"`,
    expand: 'service_id,pro_id',
    sort: '-created',
  })
export const createJob = (data: any) => pb.collection('jobs').create(data)
export const updateJob = (id: string, data: any) => pb.collection('jobs').update(id, data)
export const getBanners = () => pb.collection('banners').getFullList({ filter: 'active=true' })
export const getModerationLogs = () =>
  pb.collection('moderation_logs').getFullList({ expand: 'pro_id' })
export const createModerationLog = (data: any) => pb.collection('moderation_logs').create(data)
export const getUsers = () => pb.collection('users').getFullList({ sort: '-created' })
export const updateUser = (id: string, data: any) => pb.collection('users').update(id, data)
export const getDocuments = () =>
  pb.collection('documents').getFullList({ expand: 'user_id', sort: '-created' })
export const getUserDocuments = (userId: string) =>
  pb.collection('documents').getFullList({ filter: `user_id="${userId}"`, sort: '-created' })
export const createDocument = (data: any) => pb.collection('documents').create(data)
export const updateDocument = (id: string, data: any) => pb.collection('documents').update(id, data)
export const getNearbyPros = () =>
  pb.collection('users').getFullList({ filter: `role="pro" && status="active"` })
