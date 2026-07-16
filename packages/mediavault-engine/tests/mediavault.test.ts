import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyMedia, MediaVault, planCatalogItems, resolveMediaSource, selectCatalogItem, type CatalogItem } from '../src/index.js'

const dirs: string[] = []
const png = Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), Buffer.alloc(4), Buffer.from('IHDR'), Buffer.from([0,0,0,100,0,0,0,200]), Buffer.alloc(20)])
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir,{recursive:true,force:true}))))

describe('MediaVault', () => {
  it('copies media into managed storage with content IDs and duplicate detection', async () => {
    const root = await mkdtemp(join(tmpdir(),'mediavault-')); dirs.push(root)
    const vault = new MediaVault(root)
    const first = await vault.importBytes({ originalName: 'producto.png', bytes: png })
    const second = await vault.importBytes({ originalName: 'copy.png', bytes: png })
    expect(first.duplicate).toBe(false); expect(second.duplicate).toBe(true); expect(second.record.id).toBe(first.record.id)
    expect(first.record.orientation).toBe('portrait'); expect(first.record.group).toBe('products')
    expect(await readFile(first.absolutePath)).toEqual(png)
    expect((await vault.list())).toHaveLength(1)
  })

  it('imports from a file but never persists the original absolute path', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(),'source-')); const vaultRoot = await mkdtemp(join(tmpdir(),'vault-')); dirs.push(sourceRoot,vaultRoot)
    const source = join(sourceRoot,'store.png'); await writeFile(source,png)
    const result = await new MediaVault(vaultRoot).importFile(source)
    expect(JSON.stringify(result.record)).not.toContain(sourceRoot)
    expect(result.record.relativePath.startsWith('files/')).toBe(true)
  })

  it('rejects renamed or unsupported content', async () => {
    const root = await mkdtemp(join(tmpdir(),'mediavault-')); dirs.push(root)
    const vault = new MediaVault(root)
    await expect(vault.importBytes({ originalName: 'evil.png', bytes: Buffer.from('MZ executable') })).rejects.toThrow('does not match')
    await expect(vault.importBytes({ originalName: 'file.exe', bytes: Buffer.from('x') })).rejects.toThrow('Unsupported')
  })

  it('classifies English, Spanish, and Portuguese names deterministically', () => {
    expect(classifyMedia({ originalName:'before-repair.jpg',kind:'image' }).group).toBe('before')
    expect(classifyMedia({ originalName:'fachada tienda.jpg',kind:'image' }).group).toBe('store')
    expect(classifyMedia({ originalName:'equipe-loja.jpg',kind:'image' }).group).toBe('team')
  })

  it('selects only commercial-clear catalog media and avoids adjacent repeats', () => {
    const base = (id:string, allowed=true): CatalogItem => ({ id, assetKey:id, industry:'retail', roles:['hook','offer'], kind:'image', subjectType:'product', orientation:'portrait', tones:['bold'], qualityScore:id==='a'?0.9:0.8, tags:['phone'], license:{source:'licensed',commercialUseAllowed:allowed,notes:''} })
    const catalog=[base('a'),base('b'),base('blocked',false)]
    expect(selectCatalogItem({role:'hook'},{industry:'retail',preferTags:['phone']},'x',catalog)?.id).toBe('a')
    const plan=planCatalogItems([{role:'hook'},{role:'offer'}],{industry:'retail'},'x',catalog)
    expect(plan[0]?.id).not.toBe(plan[1]?.id); expect(plan.some((item)=>item?.id==='blocked')).toBe(false)
    expect(resolveMediaSource({hasUserAsset:false,hasLibraryAsset:false,catalogItem:plan[0]!,hasSurface:true})).toBe('catalog')
  })
})
