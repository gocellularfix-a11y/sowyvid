import { describe,expect,it } from 'vitest'
import { createVisualDirectionPlan, getMotionProfile, planSceneLayouts, resolveArtDirection, resolvePolishedTextFrame } from '../src/index.js'

describe('FrameLogic',()=>{
  it('selects bounded industry-aware art directions',()=>{
    expect(resolveArtDirection({industry:'restaurant'}).name).toBe('food-showcase')
    expect(resolveArtDirection({industry:'phone repair'}).name).toBe('local-trust')
    const urgent=resolveArtDirection({objective:'limited-time-sale'});expect(urgent.motionProfile).toBe('urgent-sale')
    expect(getMotionProfile(urgent.motionProfile).zoomEnd).toBeLessThanOrEqual(1.12)
  })
  it('creates deterministic layout rhythm without adjacent repeats',()=>{
    const scenes=[{role:'hook',hasMedia:true,kind:'image' as const,caption:'a'},{role:'offer',hasMedia:true,kind:'image' as const,caption:'b'},{role:'cta',hasMedia:true,kind:'image' as const,caption:'c'}]
    const a=planSceneLayouts(scenes,{industry:'retail',tone:'bold',seed:'x'});const b=planSceneLayouts(scenes,{industry:'retail',tone:'bold',seed:'x'})
    expect(a).toEqual(b);expect(a[0]?.placement).not.toBe(a[1]?.placement);expect(a[1]?.placement).not.toBe(a[2]?.placement)
  })
  it('keeps text inside safe width and honors editorial alignment',()=>{
    const frame=resolvePolishedTextFrame({role:'problem',safeZoneHint:'editorial',compositionBias:'editorial',verticalAnchor:'center',safeZone:'balanced',alignment:'center',width:1080,height:1920,contentWidth:.8})
    expect(frame.justifyContent).toBe('flex-start');expect(frame.textAlign).toBe('left');expect(frame.maxWidth).toBeGreaterThanOrEqual(454);expect(frame.maxWidth).toBeLessThanOrEqual(994)
  })
  it('serializes a complete renderer-neutral plan',()=>{
    const plan=createVisualDirectionPlan({art:{industry:'retail',variantIndex:1},tone:'premium',seed:'campaign',scenes:[{role:'hook',hasMedia:true,kind:'video',caption:'hello'}],textFrames:[{role:'hook',compositionBias:'hero',verticalAnchor:'bottom',safeZone:'hero',alignment:'center',width:1080,height:1920,contentWidth:.75}]})
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);expect(plan.scenes).toHaveLength(1);expect(plan.textFrames).toHaveLength(1)
  })
})
