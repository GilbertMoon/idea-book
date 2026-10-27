import { test, expect } from '@playwright/test'

test('configuration and photo Blobs survive reload; opt-out deletes webhook and deleted photos', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188/')
  const result = await page.evaluate(async () => {
    const { StorageService } = await import('/src/services/StorageService.js')
    const service = new StorageService('storage-test-persistence')
    await service.save({ groups: [{id:'a',name:'Team',members:[{id:'m',name:'Member',photoBlob:new Blob(['photo'],{type:'image/png'})}]}], settings:{maxReturns:3}, slackSettings:{url:'secret-test-only',remember:false}, obstacleSettings:{fixed:[],rotating:[],oscillating:[]},isShuffled:true })
    const first = await service.load()
    await service.save({...first,groups:[]})
    const next = await service.load()
    service.close()
    return {name:first.groups[0].name,photo:await first.groups[0].members[0].photoBlob.text(),slack:first.slackSettings,groups:next.groups}
  })
  expect(result).toEqual({name:'Team',photo:'photo',slack:{url:'',remember:false},groups:[]})
})


test('durable configuration survives a fresh page and queued snapshots cannot resurrect deleted photos', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188/')
  await page.evaluate(async () => {
    const {StorageService} = await import('/src/services/StorageService.js')
    const service = new StorageService('storage-test-restart')
    const snapshot = {groups:[{id:1,name:'Persist',members:[{id:2,name:'Photo',photoBlob:new Blob(['persistent photo'])}]}],settings:{maxReturns:3},slackSettings:{url:'mock-value',remember:true}}
    await Promise.all([service.save(snapshot),service.save({...snapshot,groups:[]}),service.save(snapshot)])
    service.close()
  })
  await page.reload()
  expect(await page.evaluate(async () => {
    const {StorageService} = await import('/src/services/StorageService.js')
    const service = new StorageService('storage-test-restart')
    const data = await service.load()
    const result = {name:data.groups[0].name,photo:await data.groups[0].members[0].photoBlob.text(),maxReturns:data.settings.maxReturns,slack:data.slackSettings}
    await service.save({...data,groups:[]})
    const db = await service.open()
    const photos = await new Promise(resolve => {const request=db.transaction('photos').objectStore('photos').count();request.onsuccess=()=>resolve(request.result)})
    service.close()
    return {...result,photos}
  })).toEqual({name:'Persist',photo:'persistent photo',maxReturns:3,slack:{url:'mock-value',remember:true},photos:0})
})

test('corrupt photos, incompatible schemas and blocked upgrades reject without exposing stored values', async ({ page }) => {
  await page.goto('http://127.0.0.1:5188/')
  const failures = await page.evaluate(async () => {
    const {StorageService,storageErrorMessage} = await import('/src/services/StorageService.js')
    const service = new StorageService('storage-test-corrupt')
    await service.save({groups:[{id:1,name:'team',members:[{id:2,name:'member'}]}]})
    const db = await service.open()
    await new Promise(resolve => {const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:2,blob:'corrupt'});tx.oncomplete=resolve})
    let corrupt = false
    try {await service.load()} catch {corrupt=true}
    service.close()
    const schemaRequest = indexedDB.open('storage-test-schema',1)
    const schemaDb=await new Promise(resolve=>{schemaRequest.onsuccess=()=>resolve(schemaRequest.result)})
    schemaDb.close()
    let schema=false
    try {await new StorageService('storage-test-schema').load()} catch {schema=true}
    const blocker = await new Promise(resolve=>{const req=indexedDB.open('storage-test-blocked');req.onsuccess=()=>resolve(req.result)})
    // A higher schema version also represents an incompatible installed application.
    blocker.close()
    const newer=await new Promise(resolve=>{const req=indexedDB.open('storage-test-blocked',2);req.onsuccess=()=>resolve(req.result)})
    newer.close()
    let incompatible=false
    try {await new StorageService('storage-test-blocked').load()} catch {incompatible=true}
    return {corrupt,schema,incompatible,message:storageErrorMessage(new DOMException('private detail','QuotaExceededError'))}
  })
  expect(failures.corrupt).toBe(true)
  expect(failures.schema).toBe(true)
  expect(failures.incompatible).toBe(true)
  expect(failures.message).toContain('저장 공간')
  expect(failures.message).not.toContain('private detail')
})

async function mountContext(page) {
  await page.evaluate(async () => {
    const {default:React} = await import('/node_modules/.vite/deps/react.js')
    const {default:{createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js')
    const {GameStateProvider} = await import('/src/state/GameState.jsx')
    const {useGameState} = await import('/src/state/GameContext.js')
    function Probe(){ const state=useGameState();React.useEffect(()=>{window.testGameState=state},[state]);return null }
    const host=document.createElement('div');document.body.append(host)
    window.testRoot=createRoot(host)
    window.testRoot.render(React.createElement(React.StrictMode,null,React.createElement(GameStateProvider,null,React.createElement(Probe))))
  })
  await page.waitForFunction(() => window.testGameState?.hydrated)
}

test('race replay retains configuration and photo URLs are revoked only after removal', async ({page}) => {
  await page.goto('http://127.0.0.1:5188/')
  await mountContext(page)
  await page.evaluate(() => window.testGameState.addGroup({name:'Retained'}))
  await page.waitForFunction(() => window.testGameState.groups.length===1)
  await page.evaluate(() => {const s=window.testGameState;s.addMember(s.groups[0].id,{name:'Image',photoBlob:new Blob(['x'],{type:'image/png'})});s.updateSettings({maxReturns:3});s.prepareGame()})
  await page.waitForFunction(() => window.testGameState.gameStatus==='READY' && window.testGameState.groups[0].members.length===1)
  const url=await page.evaluate(() => window.testGameState.groups[0].members[0].imageUrl)
  await page.evaluate(() => window.testGameState.startGame())
  await page.waitForFunction(() => window.testGameState.gameStatus==='RUNNING')
  await page.evaluate(() => window.testGameState.finishGame())
  await page.waitForFunction(() => window.testGameState.gameStatus==='FINISHED')
  await page.evaluate(() => window.testGameState.resetRace())
  await page.waitForFunction(() => window.testGameState.gameStatus==='IDLE')
  expect(await page.evaluate(async url => ({photo:await (await fetch(url)).text(),teams:window.testGameState.groups.length,returns:window.testGameState.settings.maxReturns}),url)).toEqual({photo:'x',teams:1,returns:3})
  await page.evaluate(() => window.testGameState.clearTeams())
  await page.waitForFunction(() => window.testGameState.groups.length===0)
  expect(await page.evaluate(async url => {try {await fetch(url);return false}catch{return true}},url)).toBe(true)
})

test('denied IndexedDB leaves the context usable with a visible storage error', async ({page}) => {
  await page.addInitScript(() => {Object.defineProperty(window,'indexedDB',{value:undefined})})
  await page.goto('http://127.0.0.1:5188/')
  await mountContext(page)
  expect(await page.evaluate(() => window.testGameState.storageError)).toBeTruthy()
  await page.evaluate(() => window.testGameState.addGroup({name:'Session only'}))
  await page.waitForFunction(() => window.testGameState.groups.length===1)
  expect(await page.evaluate(() => window.testGameState.storageError)).toBeTruthy()
})



test('a persistent browser profile restores teams and Blob photos after browser restart', async ({playwright},testInfo) => {
  const chromium=playwright.chromium
  const profile=testInfo.outputPath('browser-profile')
  let context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true})
  let page=await context.newPage()
  await page.goto('http://127.0.0.1:5188/')
  await page.evaluate(async () => {
    const {StorageService}=await import('/src/services/StorageService.js')
    const service=new StorageService('restart-durable')
    await service.save({groups:[{id:1,name:'Across restart',members:[{id:2,name:'Photo',photoBlob:new Blob(['durable'])}]}],slackSettings:{url:'mock-opt-in',remember:true}})
    service.close()
  })
  await context.close()
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true})
  try {
    page=await context.newPage()
    await page.goto('http://127.0.0.1:5188/')
    const restored=await page.evaluate(async () => {
      const {StorageService}=await import('/src/services/StorageService.js')
      const service=new StorageService('restart-durable')
      const data=await service.load()
      service.close()
      return {name:data.groups[0].name,photo:await data.groups[0].members[0].photoBlob.text(),remember:data.slackSettings.remember}
    })
    expect(restored).toEqual({name:'Across restart',photo:'durable',remember:true})
  } finally {await context.close()}
})

test('failed hydration preserves damaged records and an error status rather than overwriting them',async ({page}) => {
  await page.goto('http://127.0.0.1:5188/')
  await page.evaluate(async () => {
    const {StorageService}=await import('/src/services/StorageService.js')
    const service=new StorageService()
    await service.save({groups:[{id:1,name:'Damaged',members:[{id:2,name:'Member'}]}]})
    const db=await service.open()
    await new Promise(resolve=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:2,blob:'invalid'});tx.oncomplete=resolve})
    service.close()
  })
  await page.reload()
  await mountContext(page)
  expect(await page.evaluate(()=>window.testGameState.storageStatus)).toBe('error')
  expect(await page.evaluate(async()=>{
    const request=indexedDB.open('ranking-race',1)
    const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result)})
    const count=await new Promise(resolve=>{const req=db.transaction('photos').objectStore('photos').count();req.onsuccess=()=>resolve(req.result)})
    db.close()
    return count
  })).toBe(1)
})

test('a failed snapshot rolls back all stores instead of committing cleared teams and photos',async({page})=>{
  await page.goto('http://127.0.0.1:5188/')
  expect(await page.evaluate(async()=>{
    const {StorageService}=await import('/src/services/StorageService.js')
    const service=new StorageService('atomic-rollback')
    await service.save({groups:[{id:1,name:'Preserved',members:[{id:2,name:'Photo',photoBlob:new Blob(['original'])}]}]})
    let failed=false
    try {await service.save({groups:[{name:'Missing key',members:[]}]})} catch {failed=true}
    const data=await new StorageService('atomic-rollback').load()
    service.close()
    return {failed,name:data.groups[0].name,photo:await data.groups[0].members[0].photoBlob.text()}
  })).toEqual({failed:true,name:'Preserved',photo:'original'})
})

test('duplicate prepare and finish events preserve one run and cannot show results while idle',async({page})=>{
  await page.goto('http://127.0.0.1:5188/')
  await mountContext(page)
  await page.evaluate(()=>window.testGameState.finishGame())
  expect(await page.evaluate(()=>window.testGameState.showResult)).toBe(false)
  await page.evaluate(()=>window.testGameState.prepareGame())
  await page.waitForFunction(()=>window.testGameState.gameStatus==='READY')
  const runId=await page.evaluate(()=>window.testGameState.runId)
  await page.evaluate(()=>{window.testGameState.prepareGame();window.testGameState.startGame();window.testGameState.prepareGame()})
  await page.waitForFunction(()=>window.testGameState.gameStatus==='RUNNING')
  expect(await page.evaluate(()=>window.testGameState.runId)).toBe(runId)
})

test('blocked database opening reports failure and closes the eventual connection',async({page})=>{
  await page.goto('http://127.0.0.1:5188/')
  expect(await page.evaluate(async()=>{
    const {StorageService}=await import('/src/services/StorageService.js')
    const originalOpen=indexedDB.open.bind(indexedDB)
    const blocker=await new Promise(resolve=>{const req=originalOpen('blocked-upgrade',1);req.onsuccess=()=>resolve(req.result)})
    indexedDB.open=(name,version)=>originalOpen(name,name==='blocked-upgrade' ? 2 : version)
    let rejected=false
    try {await new StorageService('blocked-upgrade').open()} catch {rejected=true}
    indexedDB.open=originalOpen
    blocker.close()
    // Deletion waits for the pending upgrade: it stays blocked if the rejected opener leaks its connection.
    const deleted=await Promise.race([
      new Promise(resolve=>{const req=indexedDB.deleteDatabase('blocked-upgrade');req.onsuccess=()=>resolve(true);req.onerror=()=>resolve(false)}),
      new Promise(resolve=>setTimeout(()=>resolve(false),1500))
    ])
    return {rejected,deleted}
  })).toEqual({rejected:true,deleted:true})
})
