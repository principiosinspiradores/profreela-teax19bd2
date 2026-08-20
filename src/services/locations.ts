import pb from '@/lib/pocketbase/client'

/** A saved address the client can reuse when requesting a service. */
export interface SavedLocation {
  id: string
  client_id: string
  label: string
  address: string
  latitude?: number
  longitude?: number
  created?: string
  updated?: string
}

export const getSavedLocations = (clientId: string) =>
  pb.collection('saved_locations').getFullList({
    filter: `client_id="${clientId}"`,
    sort: '-created',
  }) as Promise<SavedLocation[]>

export const createSavedLocation = (data: Partial<SavedLocation>) =>
  pb.collection('saved_locations').create<SavedLocation>(data)

export const updateSavedLocation = (id: string, data: Partial<SavedLocation>) =>
  pb.collection('saved_locations').update<SavedLocation>(id, data)

export const deleteSavedLocation = (id: string) => pb.collection('saved_locations').delete(id)
