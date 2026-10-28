import {test,expect} from '@playwright/test'
const base=`http://127.0.0.1:${process.env.E2E_PORT || 5188}/`

test('real arrivals animate into separate ranked slots, survive resizing and reset on replay',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(()=>{
    const fillText=CanvasRenderingContext2D.prototype.fillText
    const drawImage=CanvasRenderingContext2D.prototype.drawImage
    window.finishedLabels=[];window.finishedPhotoDraws=0
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
      if(/^\d+위$/.test(text))window.finishedLabels.push({text,x,y})
      return fillText.call(this,text,x,y,...rest)
    }
    CanvasRenderingContext2D.prototype.drawImage=function(image,x,y,...rest){
      if(x>=1200&&y<400)window.finishedPhotoDraws++
      return drawImage.call(this,image,x,y,...rest)
    }
  })
  await page.clock.install();await page.goto(base)
  for(const name of ['먼저 A','먼저 B','나중 C']){
    await page.getByPlaceholder('조 이름 (예: 1조, 2조...)').fill(name)
    await page.getByRole('button',{name:'조 추가',exact:true}).click()
  }
  const card=page.locator('.group-card').first()
  await card.getByRole('button',{name:'▼'}).click()
  await card.getByPlaceholder('조원 이름').fill('사진')
  const chooserPromise=page.waitForEvent('filechooser')
  await card.getByRole('button',{name:'사진 추가 +',exact:true}).click()
  const chooser=await chooserPromise
  await chooser.setFiles({name:'team.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>')})
  await expect(card.locator('.member-avatar')).toBeVisible()
  await page.getByLabel('공격 사용 안 함',{exact:true}).check()
  await page.evaluate(async()=>{
    const {RaceEngine}=await import('/src/physics/RaceEngine.js')
    const start=RaceEngine.prototype.start
    RaceEngine.prototype.start=function(){
      const started=start.call(this)
      this.obstacles=[];this.gates=[]
      this.balls.forEach((ball,i)=>Object.assign(ball,{stage:3,route:'stage3',x:960+i*40,y:i<2?687:400,vx:0,vy:i<2?200:0}))
      window.finishRaceEngine=this
      return started
    }
  })
  await page.getByRole('button',{name:'경기 준비',exact:true}).click()
  await page.getByRole('button',{name:'출발',exact:true}).click()
  await page.clock.runFor(550)
  const order=page.locator('.finish-order li')
  await expect(order).toHaveCount(2)
  expect(await page.locator('.finish-order-text').allTextContents()).toEqual(['1위 · 먼저 A','1위 · 먼저 B'])
  await expect(order.first().locator('img')).toBeVisible()
  expect(await page.locator('canvas').getAttribute('data-finish-count')).toBe('2')
  const original=await page.evaluate(()=>window.finishRaceEngine.balls.slice(0,2).map(b=>({x:b.x,y:b.y,arrivalTime:b.arrivalTime})))
  expect(await page.evaluate(()=>window.finishedLabels.some(v=>v.text==='1위'&&v.x===1222))).toBe(true)
  expect(await page.evaluate(()=>window.finishedLabels.some(v=>v.text==='1위'&&v.x===1260))).toBe(true)
  expect(await page.evaluate(()=>window.finishedPhotoDraws)).toBeGreaterThan(0)
  await page.setViewportSize({width:390,height:844});await page.clock.runFor(100)
  await expect(order).toHaveCount(2)
  expect(await page.evaluate(()=>window.finishRaceEngine.balls.slice(0,2).map(b=>({x:b.x,y:b.y,arrivalTime:b.arrivalTime})))).toEqual(original)
  await page.evaluate(()=>Object.assign(window.finishRaceEngine.balls[2],{y:687,vy:200}))
  await page.clock.runFor(100)
  await expect(page.locator('canvas')).toHaveAttribute('data-status','FINISHED')
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toHaveCount(0)
  await expect(order).toHaveCount(3)
  const displayOrder=await page.locator('.finish-order-text').allTextContents()
  await page.clock.runFor(500)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
  const resultNames=await page.locator('.rank-name').allTextContents()
  expect(resultNames.map(text=>text.replace(' (공동 순위)','').trim())).toEqual(displayOrder.map(text=>text.split(' · ')[1]))
  expect(resultNames.slice(0,2).every(text=>text.includes('공동 순위'))).toBe(true)
  await page.getByRole('button',{name:'다시 경기하기',exact:true}).click()
  await page.clock.runFor(100)
  await expect(page.locator('canvas')).toHaveAttribute('data-status','READY')
  await expect(page.locator('canvas')).toHaveAttribute('data-finish-count','0')
  await expect(page.locator('.finish-order li')).toHaveCount(0)
  expect(errors).toEqual([])
})

for(const count of [1,2,5,10,30])test(`${count} finishers fit the independent area; ties and last animation agree with results`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.clock.install();await page.goto(base)
  await expect(page.locator('.save-status')).toContainText('이 브라우저에 저장됨')
  await page.evaluate(async count=>{
    const {StorageService}=await import('/src/services/StorageService.js')
    const service=new StorageService()
    const photo=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'],{type:'image/svg+xml'})
    await service.save({groups:Array.from({length:count},(_,i)=>({id:`finish-${i}`,name:`팀 ${i+1}`,members:i===0?[{id:'photo-member',name:'사진',photoBlob:photo}]:[]})),settings:{chaseAttack:{enabled:false}},slackSettings:{url:'',remember:false},obstacleSettings:{fixed:[],rotating:[],oscillating:[]},isShuffled:false})
    service.close()
  },count)
  await page.reload();await expect(page.locator('.group-card')).toHaveCount(count)
  await page.evaluate(async()=>{
    const {RaceEngine}=await import('/src/physics/RaceEngine.js')
    const {RaceRenderer}=await import('/src/game/RaceRenderer.js')
    const start=RaceEngine.prototype.start,drawFinished=RaceRenderer.prototype.drawFinished
    RaceEngine.prototype.start=function(){
      const success=start.call(this);this.obstacles=[];this.gates=[]
      this.balls.forEach((ball,i)=>Object.assign(ball,{stage:3,route:'stage3',x:960+i*160/Math.max(1,this.balls.length),y:i<2?687:687-i*4,vx:0,vy:180}))
      window.alignmentEngine=this
      return success
    }
    RaceRenderer.prototype.drawFinished=function(entries){window.alignmentEntries=entries.map(e=>({id:e.ball.id,rank:e.rank,x:e.x,y:e.y,targetX:e.targetX,targetY:e.targetY,progress:e.progress}));return drawFinished.call(this,entries)}
  })
  await page.getByRole('button',{name:'경기 준비',exact:true}).click()
  await page.getByRole('button',{name:'출발',exact:true}).click()
  await page.clock.runFor(200)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toHaveCount(0)
  await page.clock.runFor(1200)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
  await expect(page.locator('.finish-order li')).toHaveCount(count)
  const entries=await page.evaluate(()=>window.alignmentEntries)
  expect(entries).toHaveLength(count)
  expect(entries.every(e=>e.progress===1)).toBe(true)
  expect(new Set(entries.map(e=>`${e.x},${e.y}`)).size).toBe(count)
  for(let i=0;i<entries.length;i++){
    const e=entries[i]
    expect(e.x-13).toBeGreaterThanOrEqual(1200);expect(e.x+13).toBeLessThanOrEqual(1400)
    expect(e.y-13).toBeGreaterThanOrEqual(55);expect(e.y+13).toBeLessThanOrEqual(820)
    for(let j=0;j<i;j++)expect(Math.hypot(e.x-entries[j].x,e.y-entries[j].y)).toBeGreaterThanOrEqual(26)
  }
  const ranking=await page.evaluate(()=>window.alignmentEngine.getRanking().map(b=>({id:b.id,rank:b.rank})))
  expect(entries.map(e=>({id:e.id,rank:e.rank}))).toEqual(ranking)
  if(count>1)expect(entries.slice(0,2).map(e=>e.rank)).toEqual([1,1])
  expect(await page.locator('.finish-order li').first().locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true)
  const physics=await page.evaluate(()=>({width:window.alignmentEngine.width,height:window.alignmentEngine.height,balls:window.alignmentEngine.balls.map(b=>({x:b.x,y:b.y,arrivalTime:b.arrivalTime}))}))
  expect(physics.width).toBe(1200);expect(physics.height).toBe(820)
  await page.setViewportSize({width:390,height:844});await page.clock.runFor(100)
  expect(await page.evaluate(()=>window.alignmentEngine.balls.map(b=>({x:b.x,y:b.y,arrivalTime:b.arrivalTime})))).toEqual(physics.balls)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(errors).toEqual([])
})

test('all-DNF and mixed-DNF finish without phantom arrival slots or waiting forever',async({page})=>{
  await page.clock.install();await page.goto(base)
  for(const name of ['완주','미완주']){await page.getByPlaceholder('조 이름 (예: 1조, 2조...)').fill(name);await page.getByRole('button',{name:'조 추가',exact:true}).click()}
  await page.getByLabel('공격 사용 안 함',{exact:true}).check()
  await page.evaluate(async()=>{
    const {RaceEngine}=await import('/src/physics/RaceEngine.js');const start=RaceEngine.prototype.start
    window.allDnf=false
    RaceEngine.prototype.start=function(){const ok=start.call(this);this.obstacles=[];this.gates=[];this.balls.forEach((b,i)=>Object.assign(b,{stage:3,route:'stage3',x:1000+i*30,y:687,vy:200,dnf:window.allDnf||i===1,dnfReason:'time-limit'}));return ok}
  })
  await page.getByRole('button',{name:'경기 준비',exact:true}).click();await page.getByRole('button',{name:'출발',exact:true}).click()
  await page.clock.runFor(600)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
  await expect(page.locator('.finish-order li')).toHaveCount(1)
  await expect(page.locator('.ranking-row')).toHaveCount(2)
  await expect(page.locator('.ranking-row').last()).toContainText('DNF')
  await page.evaluate(()=>{window.allDnf=true})
  await page.getByRole('button',{name:'다시 경기하기',exact:true}).click();await page.getByRole('button',{name:'출발',exact:true}).click()
  await page.clock.runFor(80)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
  await expect(page.locator('.finish-order li')).toHaveCount(0)
  expect((await page.locator('.ranking-row').allTextContents()).every(row=>row.includes('DNF'))).toBe(true)
})
