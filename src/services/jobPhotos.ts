import pb from '@/lib/pocketbase/client'

export type JobPhotoType = 'start' | 'end'

export interface JobPhoto {
  id: string
  job_id: string
  type: JobPhotoType
  photo_file: string
  created: string
  updated: string
  expand?: {
    job_id?: any
  }
}

/**
 * Geofence radius (meters). The pro must be within this distance of the job's
 * coordinates to start/finish the service. Mirrors the backend constant in
 * start_job.js / finish_job.js — keep them in sync.
 */
export const GEOFENCE_RADIUS_M = 50

/** Haversine distance in meters between two coordinates. */
export function haversineMeters(
  a: { latitude: number; longitude: number } | { lat: number; lng: number },
  b: { latitude: number; longitude: number } | { lat: number; lng: number },
): number {
  const aLat = 'latitude' in a ? a.latitude : a.lat
  const aLng = 'longitude' in a ? a.longitude : a.lng
  const bLat = 'latitude' in b ? b.latitude : b.lat
  const bLng = 'longitude' in b ? b.longitude : b.lng
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Whether the pro's current position is within the geofence of the job. */
export function isWithinGeofence(
  proCoords: { latitude: number; longitude: number } | null,
  jobCoords: { lat: number; lng: number } | null,
): boolean {
  if (!proCoords || !jobCoords) return true // unknown position — don't hard-block on the client
  return haversineMeters(proCoords, jobCoords) <= GEOFENCE_RADIUS_M
}

/**
 * Upload a job evidence photo to the `job_photos` collection.
 * Uses multipart/form-data so PocketBase stores the file in `photo_file`.
 */
export async function uploadJobPhoto(
  jobId: string,
  type: JobPhotoType,
  file: File,
): Promise<JobPhoto> {
  const formData = new FormData()
  formData.append('job_id', jobId)
  formData.append('type', type)
  formData.append('photo_file', file)
  return (await pb.collection('job_photos').create(formData)) as JobPhoto
}

/** All evidence photos for a job, newest first. */
export async function getJobPhotos(jobId: string): Promise<JobPhoto[]> {
  return (await pb.collection('job_photos').getFullList({
    filter: `job_id="${jobId}"`,
    sort: '-created',
  })) as JobPhoto[]
}

/** Whether a photo of the given type already exists for the job. */
export async function hasJobPhoto(jobId: string, type: JobPhotoType): Promise<boolean> {
  const list = await pb.collection('job_photos').getList(1, 1, {
    filter: `job_id="${jobId}" && type="${type}"`,
  })
  return list.items.length > 0
}

/** Build the absolute URL for a stored job photo file. */
export function jobPhotoUrl(photo: JobPhoto): string {
  return pb.files.getUrl(photo, photo.photo_file) as unknown as string
}
