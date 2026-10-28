import {test,expect} from '@playwright/test'
const base=`http://127.0.0.1:${process.env.E2E_PORT || 5188}/`
// Same-browser measurements on c70809f, before the viewport change.
const before={1920:{width:1019.700015,height:696.787510,finish:254.925},1600:{width:808.975012,height:552.787508,finish:202.24375},1366:{width:654.437510,height:447.187507,finish:163.609375}}
for(const viewport of [{width:1920,height:1080},{width:1600,height:900},{width:1366,height:768}])test(`playfield expands uniformly without overflow or lost routes at ${viewport.width}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize(viewport)
 await page.addInitScript(()=>{
  const fillText=CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(text==='START'){const m=this.getTransform();window.playfieldScale={x:m.a,y:m.d}}return fillText.call(this,text,...args)}
 })
 await page.goto(base)
 await expect(page.locator('.save-status')).toContainText('이 브라우저에 저장됨')
 await page.evaluate(async()=>{
  const {StorageService}=await import('/src/services/StorageService.js'),s=new StorageService()
  await s.save({groups:Array.from({length:30},(_,i)=>({id:`view-${i}`,name:`검증 ${i+1}조`,members:[]})),settings:{chaseAttack:{attackMode:'off'}},slackSettings:{url:'',remember:false},obstacleSettings:{fixed:[],rotating:[],oscillating:[]},isShuffled:false});s.close()
 })
 await page.reload();await expect(page.locator('.group-card')).toHaveCount(30)
 await page.getByRole('button',{name:'경기 준비',exact:true}).click()
 await page.waitForFunction(()=>window.playfieldScale)
 const result=await page.evaluate(async()=>{
  const {FINISH_LAYOUT}=await import('/src/game/FinishLineDisplay.js'),{RaceEngine}=await import('/src/physics/RaceEngine.js'),engine=new RaceEngine()
  const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect(),x=window.playfieldScale.x*r.width/canvas.width,y=window.playfieldScale.y*r.height/canvas.height
  return {width:engine.width*x,height:engine.height*y,x,y,sidebar:document.querySelector('.team-rail').getBoundingClientRect().width,
   finish:(canvas.width/devicePixelRatio-FINISH_LAYOUT.left)*r.width/(canvas.width/devicePixelRatio),
   routes:engine.routes.flatMap(route=>route.points.map(p=>({x:r.x+p.x*x,y:r.y+p.y*y,r:route.width/2*x}))),
   finishLine:{x:r.x+1150*x,y:r.y+737*y},bottom:r.bottom,
   overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight}
 })
 expect(result.width/before[viewport.width].width).toBeGreaterThanOrEqual(1.2)
 expect(result.height/before[viewport.width].height).toBeGreaterThanOrEqual(1.2)
 expect(result.x).toBeCloseTo(result.y,3)
 expect(result.width/result.height).toBeCloseTo(1200/820,3)
 expect(result.finish).toBeLessThan(before[viewport.width].finish*.9)
 expect(result.sidebar).toBe(260)
 expect(result.bottom).toBeLessThanOrEqual(viewport.height)
 expect(result.overflow).toBe(false)
 for(const p of result.routes){expect(p.x-p.r).toBeGreaterThanOrEqual(0);expect(p.x+p.r).toBeLessThanOrEqual(viewport.width);expect(p.y-p.r).toBeGreaterThanOrEqual(0);expect(p.y+p.r).toBeLessThanOrEqual(viewport.height)}
 expect(result.finishLine.x).toBeLessThan(viewport.width);expect(result.finishLine.y).toBeLessThan(viewport.height)
 await expect(page.getByRole('region',{name:'실시간 경기 해설'})).toBeVisible()
 expect(errors).toEqual([])
})
