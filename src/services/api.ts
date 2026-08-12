import pb from '@/lib/pocketbase/client'

export const getServices = () => pb.collection('services').getFullList()
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
export const updateService = (id: string, data: any) => pb.collection('services').update(id, data)
export const getDocuments = () =>
  pb.collection('documents').getFullList({ expand: 'user_id', sort: '-created' })
export const getUserDocuments = (userId: string) =>
  pb.collection('documents').getFullList({ filter: `user_id="${userId}"`, sort: '-created' })
export const createDocument = (data: any) => pb.collection('documents').create(data)
export const updateDocument = (id: string, data: any) => pb.collection('documents').update(id, data)
export const getNearbyPros = () =>
  pb.collection('users').getFullList({ filter: `role="pro" && status="active"` })
