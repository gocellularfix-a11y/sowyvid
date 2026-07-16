import { z } from 'zod'

export const MediaKindSchema = z.enum(['image', 'video', 'audio', 'logo'])
export const OrientationSchema = z.enum(['portrait', 'landscape', 'square'])
export const MediaGroupSchema = z.enum(['products', 'store', 'people', 'team', 'logo', 'before', 'after', 'music', 'voice', 'unknown'])
export const LicenseSchema = z.object({
  source: z.enum(['owner-provided', 'bundled-fixture', 'public-domain', 'licensed', 'internal', 'unknown']),
  commercialUseAllowed: z.boolean(),
  notes: z.string().max(500).default(''),
})
export const MediaRecordSchema = z.object({
  id: z.string().regex(/^media_[a-f0-9]{64}$/),
  kind: MediaKindSchema,
  extension: z.string().regex(/^[a-z0-9]{1,6}$/),
  originalName: z.string().min(1).max(200),
  relativePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  importedAt: z.string().datetime(),
  modifiedAtSource: z.string().datetime().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().positive().nullable(),
  orientation: OrientationSchema.nullable(),
  hasAudio: z.boolean().nullable(),
  group: MediaGroupSchema,
  classificationConfidence: z.number().min(0).max(1),
  classificationMethod: z.enum(['filename', 'shape', 'explicit', 'default']),
  tags: z.array(z.string().min(1).max(80)).max(100),
  qualityScore: z.number().min(0).max(1),
  userPriority: z.number().min(0).max(1),
  license: LicenseSchema,
})
export type MediaRecord = z.infer<typeof MediaRecordSchema>

export const CatalogItemSchema = z.object({
  id: z.string().min(1),
  assetKey: z.string().min(1),
  industry: z.string().min(1),
  roles: z.array(z.string().min(1)),
  kind: z.enum(['image', 'video']),
  subjectType: z.enum(['product', 'hands', 'storefront', 'lifestyle', 'service', 'environment', 'abstract-subject']),
  orientation: OrientationSchema,
  tones: z.array(z.string().min(1)),
  qualityScore: z.number().min(0).max(1),
  tags: z.array(z.string().min(1)),
  license: LicenseSchema,
})
export type CatalogItem = z.infer<typeof CatalogItemSchema>
