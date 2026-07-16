/**
 * The single canonical source of product identity. The name "SowyVid" is
 * PROVISIONAL — change it here (and in the build identity file
 * `build/branding.json`, mirrored for tooling that can't import TS) to rebrand
 * the whole application. See docs/BRANDING.md for the full rename checklist.
 *
 * Nothing in the engine packages imports this — engines stay brand-neutral.
 */
export interface BrandingConfig {
  productName: string
  shortName: string
  internalCodename: string
  tagline: string
  appId: string
  windowTitle: string
  /** App-data directory name (OS userData). Changing this changes where data lives. */
  dataDirectoryName: string
  databaseName: string
  supportEmail?: string
  website?: string
  copyright: string
}

export const branding: BrandingConfig = {
  productName: 'SowyVid',
  shortName: 'SowyVid',
  internalCodename: 'sowyvid',
  tagline: 'Comerciales que venden por ti',
  appId: 'com.sowyvid.app',
  windowTitle: 'SowyVid',
  dataDirectoryName: 'SowyVid',
  databaseName: 'sowyvid.db',
  copyright: `Copyright © 2026 SowyVid`,
}
