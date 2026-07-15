import { z } from 'zod'

/** Business categories that steer template suitability and motion profiles. */
export const BusinessCategory = z.enum([
  'phone-electronics',
  'restaurant-food',
  'local-service',
  'retail-product',
  'events',
  'health-beauty',
  'automotive',
  'professional-services',
  'other',
])
export type BusinessCategory = z.infer<typeof BusinessCategory>

/** What the owner wants the commercial to achieve. */
export const PromotionObjective = z.enum([
  'product-promotion',
  'limited-time-sale',
  'local-service',
  'restaurant-food',
  'phone-electronics',
  'event-announcement',
  'new-arrival',
  'testimonial',
  'before-after',
  'business-introduction',
])
export type PromotionObjective = z.infer<typeof PromotionObjective>

/** Aspect ratios. Vertical (9:16) is the default for social reels. */
export const AspectRatio = z.enum(['9:16', '1:1', '16:9', '4:5'])
export type AspectRatio = z.infer<typeof AspectRatio>

/** Target publishing platform (drives preset + safe zones). */
export const Platform = z.enum([
  'instagram-reel',
  'facebook-reel',
  'tiktok',
  'instagram-feed',
  'facebook-feed',
  'youtube-shorts',
  'landscape',
  'square',
])
export type Platform = z.infer<typeof Platform>

/** Energy level requested by the owner — a simple 3-way choice, not a slider. */
export const EnergyLevel = z.enum(['calm', 'balanced', 'energetic'])
export type EnergyLevel = z.infer<typeof EnergyLevel>

/** Lifecycle of a commercial project. */
export const ProjectStatus = z.enum([
  'draft',
  'planned',
  'previewed',
  'rendered',
  'exported',
])
export type ProjectStatus = z.infer<typeof ProjectStatus>

/** Bounded motion behaviors (see docs/VIDEO-ENGINE.md). */
export const MotionProfile = z.enum([
  'premium-clean',
  'bold-retail',
  'high-energy-promo',
  'calm-professional',
  'food-showcase',
  'product-hero',
  'local-service-trust',
  'urgent-sale',
  'social-kinetic',
])
export type MotionProfile = z.infer<typeof MotionProfile>
