import pb from '@/lib/pocketbase/client'

export type DocumentStatus = 'pending' | 'approved' | 'rejected'

export interface DocumentUserRef {
  id: string
  name: string
  email: string
  phone: string
  rating_avg: number
  rating_count: number
  avatar: string
  status: string
  created: string
}

export interface DocumentRecord {
  id: string
  user_id: string | DocumentUserRef
  type: string
  file: string
  resubmit_count: number
  status: DocumentStatus
  reviewed_at: string
  reviewed_by: string
  reviewer_note: string
  created: string
  updated: string
  expand?: {
    user_id?: DocumentUserRef
  }
}

/** Type labels shown in the admin review table. */
export const DOC_TYPE_LABELS: Record<string, string> = {
  identity: 'Documento de identidade',
  cnh: 'CNH',
  rg: 'RG',
  address: 'Comprovante de endereço',
  criminal_record: 'Antecedentes criminais',
}

export const docTypeLabel = (type: string) =>
  DOC_TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1)

/** All documents, newest first, with the owning user expanded. */
export const getAllDocuments = () =>
  pb.collection('documents').getFullList({
    expand: 'user_id',
    sort: '-created',
  }) as Promise<DocumentRecord[]>

/** Documents by status: 'pending' | 'approved' | 'rejected' | 'all'. */
export const getDocumentsByStatus = (status: string) =>
  pb.collection('documents').getFullList({
    filter: status === 'all' ? '' : `status="${status}"`,
    expand: 'user_id',
    sort: '-created',
  }) as Promise<DocumentRecord[]>

/** Approve a document (admin action). */
export const approveDocument = (id: string) =>
  pb
    .collection('documents')
    .update(id, { status: 'approved', reviewed_at: new Date().toISOString() })

/** Reject a document (admin action) — the pro re-uploads from their settings. */
export const rejectDocument = (id: string, note: string) =>
  pb.collection('documents').update(id, {
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewer_note: note,
  })

/** Absolute URL for a stored document file. */
export const documentFileUrl = (doc: DocumentRecord): string => {
  const record = doc as unknown as Record<string, unknown>
  const fileName = doc.file
  if (!fileName) return ''
  return pb.files.getUrl(record as any, fileName) as unknown as string
}

/**
 * Status summary derived from one pro's documents:
 * - approved: at least one approved document
 * - pending: none approved, at least one pending
 * - none: no documents at all
 */
export function summarizeProDocuments(docs: DocumentRecord[]): 'approved' | 'pending' | 'none' {
  if (docs.some((d) => d.status === 'approved')) return 'approved'
  if (docs.some((d) => d.status === 'pending')) return 'pending'
  return 'none'
}
