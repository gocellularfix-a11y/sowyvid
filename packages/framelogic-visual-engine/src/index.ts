import { z } from 'zod'

export const MotionProfileNameSchema = z.enum(['premium', 'retail-energy', 'urgent-sale', 'calm', 'social-reel', 'food-showcase', 'local-trust'])
export type MotionProfileName = z.infer<typeof MotionProfileNameSchema>
export interface MotionProfile {
  name: MotionProfileName
  cameraTravel: number
  zoomStart: number
  zoomEnd: number
  transitionFrames: number
  springDamping: number
  springStiffness: number
  textDelayFrames: number
  maxRotationDeg: number
}
const PROFILES: Record<MotionProfileName, MotionProfile> = {
  premium: { name:'premium',cameraTravel:0.025,zoomStart:1.01,zoomEnd:1.055,transitionFrames:18,springDamping:22,springStiffness:85,textDelayFrames:8,maxRotationDeg:0.4 },
  'retail-energy': { name:'retail-energy',cameraTravel:0.045,zoomStart:1.02,zoomEnd:1.09,transitionFrames:12,springDamping:18,springStiffness:120,textDelayFrames:5,maxRotationDeg:0.8 },
  'urgent-sale': { name:'urgent-sale',cameraTravel:0.06,zoomStart:1.03,zoomEnd:1.12,transitionFrames:8,springDamping:15,springStiffness:160,textDelayFrames:2,maxRotationDeg:1.2 },
  calm: { name:'calm',cameraTravel:0.015,zoomStart:1,zoomEnd:1.035,transitionFrames:20,springDamping:25,springStiffness:70,textDelayFrames:10,maxRotationDeg:0.2 },
  'social-reel': { name:'social-reel',cameraTravel:0.055,zoomStart:1.03,zoomEnd:1.11,transitionFrames:9,springDamping:16,springStiffness:145,textDelayFrames:3,maxRotationDeg:1 },
  'food-showcase': { name:'food-showcase',cameraTravel:0.02,zoomStart:1.015,zoomEnd:1.06,transitionFrames:16,springDamping:22,springStiffness:90,textDelayFrames:7,maxRotationDeg:0.3 },
  'local-trust': { name:'local-trust',cameraTravel:0.012,zoomStart:1,zoomEnd:1.03,transitionFrames:18,springDamping:24,springStiffness:75,textDelayFrames:9,maxRotationDeg:0.15 },
}
export const getMotionProfile = (name: MotionProfileName): MotionProfile => ({ ...PROFILES[name] })

export const ArtDirectionNameSchema = z.enum(['premium-dark','retail-energy','urgent-sale','clean-modern','social-reel','food-showcase','local-trust'])
export type ArtDirectionName = z.infer<typeof ArtDirectionNameSchema>
export interface ArtDirection {
  name: ArtDirectionName
  motionProfile: MotionProfileName
  palette: { backgroundDepth: number; glow: number; hueShiftDeg: number; saturation: number; vignette: number }
  seedSalt: string
  transitionIntensity: number
  contentScale: number
}
const DIRECTIONS: Record<ArtDirectionName, ArtDirection> = {
  'premium-dark': { name:'premium-dark',motionProfile:'premium',palette:{backgroundDepth:1.22,glow:.58,hueShiftDeg:-16,saturation:.86,vignette:1.42},seedSalt:'premium-dark',transitionIntensity:.85,contentScale:.98 },
  'retail-energy': { name:'retail-energy',motionProfile:'retail-energy',palette:{backgroundDepth:1,glow:1,hueShiftDeg:26,saturation:1.06,vignette:1},seedSalt:'retail-energy',transitionIntensity:1,contentScale:1 },
  'urgent-sale': { name:'urgent-sale',motionProfile:'urgent-sale',palette:{backgroundDepth:1.06,glow:1.24,hueShiftDeg:-24,saturation:1.2,vignette:1.1},seedSalt:'urgent-sale',transitionIntensity:1.25,contentScale:1 },
  'clean-modern': { name:'clean-modern',motionProfile:'calm',palette:{backgroundDepth:.62,glow:.5,hueShiftDeg:6,saturation:.94,vignette:.44},seedSalt:'clean-modern',transitionIntensity:.8,contentScale:.94 },
  'social-reel': { name:'social-reel',motionProfile:'social-reel',palette:{backgroundDepth:1.02,glow:1.34,hueShiftDeg:22,saturation:1.32,vignette:.9},seedSalt:'social-reel',transitionIntensity:1.2,contentScale:1 },
  'food-showcase': { name:'food-showcase',motionProfile:'food-showcase',palette:{backgroundDepth:.92,glow:.8,hueShiftDeg:12,saturation:1.15,vignette:.7},seedSalt:'food-showcase',transitionIntensity:.9,contentScale:1.02 },
  'local-trust': { name:'local-trust',motionProfile:'local-trust',palette:{backgroundDepth:.76,glow:.45,hueShiftDeg:-4,saturation:.9,vignette:.5},seedSalt:'local-trust',transitionIntensity:.75,contentScale:.96 },
}
const DIRECTION_ORDER: ArtDirectionName[] = ['premium-dark','retail-energy','urgent-sale','clean-modern','social-reel','food-showcase','local-trust']
export function resolveArtDirection(input: { name?: string; variantIndex?: number; industry?: string; objective?: string }): ArtDirection {
  if (input.name && ArtDirectionNameSchema.safeParse(input.name).success) return structuredClone(DIRECTIONS[input.name as ArtDirectionName])
  const industry = input.industry?.toLowerCase()
  if (industry && /restaurant|food|comida|restaurante/.test(industry)) return structuredClone(DIRECTIONS['food-showcase'])
  if (industry && /service|repair|servicio|servico|serviço/.test(industry)) return structuredClone(DIRECTIONS['local-trust'])
  if (input.objective === 'limited-time-sale') return structuredClone(DIRECTIONS['urgent-sale'])
  const index = Math.abs(Math.floor(input.variantIndex ?? 1)) % DIRECTION_ORDER.length
  return structuredClone(DIRECTIONS[DIRECTION_ORDER[index] ?? 'retail-energy'])
}

export type MediaPlacement = 'full' | 'framed-hero' | 'side-panel' | 'floating-card' | 'masked'
export type CropBias = 'center' | 'top' | 'bottom'
export type GradeStyle = 'soft' | 'clean' | 'warm' | 'cool' | 'punch'
export interface MediaGrade { style: GradeStyle; filter: string; multiply: number; accent: number; vignette: number }
export interface MediaLayoutPlan { placement: MediaPlacement; crop: CropBias; grade: MediaGrade }
const GRADES: Record<GradeStyle, MediaGrade> = {
  soft:{style:'soft',filter:'contrast(1.05) saturate(1.04) brightness(0.99)',multiply:.26,accent:.24,vignette:.4},
  clean:{style:'clean',filter:'contrast(1.08) saturate(1.06) brightness(1)',multiply:.28,accent:.3,vignette:.44},
  warm:{style:'warm',filter:'contrast(1.07) saturate(1.16) brightness(1)',multiply:.24,accent:.3,vignette:.42},
  cool:{style:'cool',filter:'contrast(1.06) saturate(.98) brightness(.99)',multiply:.26,accent:.22,vignette:.44},
  punch:{style:'punch',filter:'contrast(1.18) saturate(1.12) brightness(.92)',multiply:.5,accent:.46,vignette:.6},
}
const hash = (value: string): number => { let h=0x811c9dc5; for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,0x01000193)} return h>>>0 }
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))
export function resolveGrade(industry?: string, tone?: string): MediaGrade {
  const normalized = industry?.toLowerCase()
  const style: GradeStyle = /restaurant|food/.test(normalized ?? '') ? 'warm' : /fitness/.test(normalized ?? '') || tone==='bold' ? 'punch' : /realtor|real-estate/.test(normalized ?? '') || tone==='premium' ? 'soft' : 'clean'
  const intensity = tone==='premium'?.82:tone==='bold'?1.18:tone==='clean'?.95:1
  const base=GRADES[style]
  return {...base,multiply:clamp(base.multiply*intensity,.14,.62),accent:clamp(base.accent*intensity,.12,.56),vignette:clamp(base.vignette*intensity,.3,.72)}
}
const CANDIDATES: Record<string,MediaPlacement[]> = { hook:['full','framed-hero'],problem:['side-panel','masked'],solution:['floating-card','full'],proof:['masked','framed-hero'],offer:['full','framed-hero'],cta:['full','framed-hero'] }
export interface SceneVisualInput { role:string; hasMedia:boolean; kind:'image'|'video'; caption:string }
export function planSceneLayouts(scenes: SceneVisualInput[], context: { industry?:string; tone?:string; seed:string }): Array<MediaLayoutPlan|null> {
  const grade=resolveGrade(context.industry,context.tone); let lastPlacement:MediaPlacement|null=null; let lastCrop:CropBias|null=null
  return scenes.map((scene,index)=>{
    if(!scene.hasMedia)return null
    const options=CANDIDATES[scene.role]??['full']; let placement=options[hash(`${context.seed}|${index}|${scene.role}|${context.industry??''}|${context.tone??''}`)%options.length]!
    if(placement===lastPlacement&&options.length>1)placement=options.find((item)=>item!==lastPlacement)??placement
    let crop:CropBias=scene.role==='proof'?'top':hash(`${context.seed}|crop|${index}|${scene.role}`)%4===0?'top':'center'
    if(crop===lastCrop&&scene.role!=='proof')crop=crop==='center'?'top':'center'
    lastPlacement=placement;lastCrop=crop;return{placement,crop,grade}
  })
}

export interface PolishInput { role:string; safeZoneHint?:'hero'|'editorial'|'balanced'; compositionBias:'hero'|'editorial'|'balanced'; verticalAnchor:'top'|'center'|'bottom'; safeZone:'hero'|'editorial'|'balanced'; alignment:'left'|'center'|'right'; width:number; height:number; contentWidth:number }
export interface PolishedTextFrame { justifyContent:'flex-start'|'center'|'flex-end'; alignItems:'flex-start'|'center'|'flex-end'; textAlign:'left'|'center'|'right'; maxWidth:number; paddingTop:number; paddingRight:number; paddingBottom:number; paddingLeft:number; translateYPercent:number; cardTreatment:'none'|'frame'|'panel' }
export function resolvePolishedTextFrame(input: PolishInput): PolishedTextFrame {
  const hint=input.safeZoneHint??input.safeZone
  let justifyContent:PolishedTextFrame['justifyContent']=hint==='hero'?'flex-end':hint==='editorial'?'flex-start':input.verticalAnchor==='top'?'flex-start':input.verticalAnchor==='bottom'?'flex-end':'center'
  if(input.role==='problem'&&justifyContent==='center')justifyContent='flex-start'; if(input.role==='proof')justifyContent='flex-end'
  const alignItems=input.alignment==='left'?'flex-start':input.alignment==='right'?'flex-end':hint==='editorial'?'flex-start':'center'
  const textAlign=input.alignment==='right'?'right':alignItems==='flex-start'?'left':'center'
  let factor=input.contentWidth*(input.compositionBias==='editorial'?.86:input.compositionBias==='hero'?1.08:1)
  const maxWidth=Math.round(clamp(input.width*factor,input.width*.42,input.width*.92))
  const vertical=Math.round(clamp(input.height*.07,28,100)); const horizontal=Math.round(clamp(input.width*.06,24,96))
  const translateYPercent=input.role==='solution'?-7:justifyContent==='flex-start'?3:justifyContent==='flex-end'?-3:0
  const cardTreatment=hint==='editorial'?'panel':hint==='hero'?'none':'frame'
  return{justifyContent,alignItems,textAlign,maxWidth,paddingTop:vertical,paddingRight:horizontal,paddingBottom:vertical,paddingLeft:horizontal,translateYPercent,cardTreatment}
}

export interface VisualDirectionPlan { version:1; artDirection:ArtDirection; motion:MotionProfile; scenes:Array<MediaLayoutPlan|null>; textFrames:PolishedTextFrame[] }
export function createVisualDirectionPlan(input:{ art:{name?:string;variantIndex?:number;industry?:string;objective?:string}; scenes:SceneVisualInput[]; textFrames:PolishInput[]; tone?:string; seed:string }):VisualDirectionPlan {
  const artDirection=resolveArtDirection(input.art)
  return {version:1,artDirection,motion:getMotionProfile(artDirection.motionProfile),scenes:planSceneLayouts(input.scenes,{seed:`${input.seed}|${artDirection.seedSalt}`,...(input.art.industry?{industry:input.art.industry}:{}),...(input.tone?{tone:input.tone}:{})}),textFrames:input.textFrames.map(resolvePolishedTextFrame)}
}
