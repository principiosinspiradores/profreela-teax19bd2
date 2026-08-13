import pb from '@/lib/pocketbase/client'

export interface Review {
  id: string
  job_id: string
  author_id: string
  recipient_id: string
  rating: number
  comment?: string
  created?: string
  updated?: string
  expand?: {
    author_id?: any
    recipient_id?: any
    job_id?: any
  }
}

export interface ReviewResult {
  ok: boolean
  review_id?: string
  error?: string
}

/**
 * Create a review for a completed job (client → pro).
 * Goes through the server endpoint so the denormalized pro rating and the
 * low-rating penalties are applied by the on_review_create hook.
 */
export async function createReview(
  jobId: string,
  rating: number,
  comment?: string,
): Promise<ReviewResult> {
  const res = await pb.send('/backend/v1/reviews', {
    method: 'POST',
    body: { jobId, rating, comment: comment || '' },
  })
  if (!res?.ok) {
    throw new Error(res?.error || 'Não foi possível registrar a avaliação.')
  }
  return res as ReviewResult
}

/** All reviews received by a professional. */
export const getProReviews = (proId: string) =>
  pb.collection('reviews').getFullList({
    filter: `recipient_id="${proId}"`,
    expand: 'author_id,job_id',
    sort: '-created',
  }) as Promise<Review[]>

/** Reviews authored by a user (client). Used to detect which completed jobs were already reviewed. */
export const getReviewsByAuthor = (authorId: string) =>
  pb.collection('reviews').getFullList({
    filter: `author_id="${authorId}"`,
    sort: '-created',
  }) as Promise<Review[]>

/** A pro's denormalized rating average (0-5) and count, read from the user record. */
export function getProRatingSummary(pro: any): { avg: number; count: number } {
  const avg = Number(pro?.rating_avg || 0)
  const count = Number(pro?.rating_count || 0)
  return { avg, count }
}

/** Format a 0-5 average as "4,9" (pt-BR). */
export function formatRating(avg: number): string {
  return avg.toFixed(1).replace('.', ',')
}
