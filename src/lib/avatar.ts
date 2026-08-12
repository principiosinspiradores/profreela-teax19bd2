import pb from '@/lib/pocketbase/client'

/**
 * Returns a fully-qualified avatar URL for a PocketBase user record.
 *
 * PocketBase stores only the filename string in the `avatar` field, so we
 * need to build the absolute URL with `pb.files.getURL`.
 *
 * If the user has no avatar (or the record is missing), fall back to a
 * ui-avatars.com image generated from the user's name. We never use
 * usecurling.com for profile pictures.
 */
export function getAvatarUrl(user: any, size = 128): string {
  if (user?.avatar) {
    try {
      return pb.files.getURL(user, user.avatar)
    } catch {
      // fall through to fallback
    }
  }
  const name = encodeURIComponent(user?.name || 'User')
  return `https://ui-avatars.com/api/?background=random&name=${name}&size=${size}`
}
