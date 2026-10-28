import {test,expect} from '@playwright/test'
const base=`http://127.0.0.1:${process.env.E2E_PORT || 5188}/`
async function prepare(page,count=5){
 await page.clock.install();await page.goto(base)
 await expect(page.locator('.save-status')).toContainText('이 브라우저에 저장됨')
 await page.evaluate(async count=>{
  const {StorageService}=await import('/src/services/StorageService.js'),s=new StorageService()
  const photo=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'],{type:'image/svg+xml'})
  await s.save({groups:Array.from({length:count},(_,i)=>({id:`s${i}`,name:`관전 팀 ${i}`,members:[{id:`m${i}`,name:'사진',photoBlob:photo}]})),settings:{maxRaceSeconds:90,chaseAttack:{attackMode:'cannon',cooldown:.1,maxAttacks:10,rangeMultiplier:10}},slackSettings:{url:'',remember:false},obstacleSettings:{fixed:[],rotating:[],oscillating:[]},isShuffled:false});s.close()
 },count)
 await page.reload();await expect(page.locator('.group-card')).toHaveCount(count)
 await page.evaluate(async()=>{
  const {RaceEngine}=await import('/src/physics/RaceEngine.js')
  const start=RaceEngine.prototype.start
  RaceEngine.prototype.start=function(){const result=start.call(this);window.spectatorEngine=this;return result}
 })
 await page.getByRole('button',{name:'경기 준비',exact:true}).click()
}
for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768}])test(`whole arena and fixed commentary visible at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await prepare(page,30)
 await page.clock.runFor(150)
 const board=await page.locator('.race-board').boundingBox(),rail=await page.locator('.team-rail').boundingBox(),canvas=await page.locator('canvas').boundingBox()
 expect(board.y+board.height).toBeLessThanOrEqual(viewport.height)
 expect(Math.abs(board.height-rail.height)).toBeLessThan(2)
 expect(canvas.y+canvas.height).toBeLessThanOrEqual(viewport.height)
 expect(canvas.width/canvas.height).toBeCloseTo(1400/820,2)
 expect((canvas.width*1200/1400)/canvas.height).toBeCloseTo(1200/820,2)
 await expect(page.getByRole('region',{name:'실시간 경기 해설'})).toBeVisible()
 expect(await page.locator('.team-list').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
 await page.screenshot({path:`work/spectator-${viewport.width}.png`,fullPage:true})
})
test('real cannon hit renders photo, simulation countdown, independent victims, recovery and replay reset',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  const text=CanvasRenderingContext2D.prototype.fillText
  window.stunTexts=[]
  CanvasRenderingContext2D.prototype.fillText=function(value,...args){if(value==='STUN!'||/^\d+\.\ds$/.test(value))window.stunTexts.push(value);return text.call(this,value,...args)}
 })
 await prepare(page)
 await page.evaluate(async()=>{
  const {RaceEngine}=await import('/src/physics/RaceEngine.js'),start=RaceEngine.prototype.start
  RaceEngine.prototype.start=function(){const ok=start.call(this);this.obstacles=[];this.gates=[];this.balls.forEach((b,i)=>Object.assign(b,{stage:3,route:'stage3',x:i<2?1000:1100,y:450-i*30,vx:0,vy:0}));return ok}
 })
 await page.getByRole('button',{name:'출발',exact:true}).click()
 let found=false
 for(let i=0;i<20;i++){await page.clock.runFor(50);if(await page.locator('.stun-card').count()>=2){found=true;break}}
 expect(found).toBe(true)
 expect(await page.locator('.stun-card').count()).toBeGreaterThanOrEqual(2)
 await expect(page.locator('.stun-card').first()).toContainText('의 대포에 맞았습니다')
 expect(await page.locator('.stun-countdown').evaluateAll(nodes=>nodes.every(node=>!node.closest('[role="status"],[aria-live="polite"],[aria-live="assertive"]')))).toBe(true)
 expect(await page.evaluate(()=>window.stunTexts.includes('STUN!'))).toBe(true)
 const verify=async()=>{
  const counts=await page.locator('.stun-card').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,count:Number(n.querySelector('b').textContent)})))
  const balls=await page.evaluate(()=>window.spectatorEngine.balls.map(b=>({id:b.id,remaining:b.stunRemaining})))
  for(const card of counts){const b=balls.find(b=>b.id===card.id);expect(Math.abs(card.count-Math.ceil(b.remaining*10-1e-8))).toBeLessThanOrEqual(1)}
 }
 await verify()
 const paused=await page.evaluate(()=>{window.spectatorEngine.status='READY';return window.spectatorEngine.balls.map(b=>({id:b.id,remaining:b.stunRemaining}))})
 await page.clock.runFor(350)
 expect(await page.evaluate(()=>window.spectatorEngine.balls.map(b=>({id:b.id,remaining:b.stunRemaining})))).toEqual(paused)
 for(const card of await page.locator('.stun-card').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,count:Number(n.querySelector('b').textContent)}))))expect(card.count).toBe(Math.ceil(paused.find(b=>b.id===card.id).remaining*10-1e-8))
 await page.evaluate(()=>{window.spectatorEngine.status='RUNNING'})
 await page.evaluate(()=>{window.spectatorEngine.chaseAttackSystem.settings.maxAttacks=0})
 await page.screenshot({path:'work/spectator-stun.png',fullPage:true})
 await page.clock.runFor(300);await verify()
 await page.clock.runFor(850)
 await expect(page.locator('.stun-card')).toHaveCount(0)
 await expect(page.locator('.recovery-message').first()).toContainText('정신 차리고 다시 출발')
 await page.clock.runFor(1100)
 await expect(page.locator('.recovery-message')).toHaveCount(0)
 expect(await page.locator('.team-token img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
 expect(await page.locator('.commentary-recent li').count()).toBeLessThanOrEqual(3)
 await page.evaluate(()=>{window.spectatorEngine.settings.maxRaceSeconds=window.spectatorEngine.elapsed+.01})
 await page.clock.runFor(700)
 await page.getByRole('button',{name:'다시 경기하기',exact:true}).click();await page.clock.runFor(150)
 await expect(page.locator('.commentary-recent li')).toHaveCount(0)
 await expect(page.locator('.stun-card')).toHaveCount(0)
 expect(errors).toEqual([])
})
