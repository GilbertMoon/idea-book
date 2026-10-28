import {test,expect} from '@playwright/test'
const base=`http://127.0.0.1:${process.env.E2E_PORT || 5188}/`

test('default cannon fires, stuns, recovers and reports results before replay',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  const slack=[]
  await page.route('https://hooks.slack.com/services/**',async route=>{
    slack.push(route.request().postDataJSON())
    await route.fulfill({status:200,body:'ok',headers:{'access-control-allow-origin':'*'}})
  })
  await page.addInitScript(()=>{
    const arc=CanvasRenderingContext2D.prototype.arc
    const fillText=CanvasRenderingContext2D.prototype.fillText
    window.projectileDraws=0;window.stunDraws=0;window.protectionDraws=0
    CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){
      if(r===5&&this.fillStyle==='#ffdc78')window.projectileDraws++
      if(r===18&&this.strokeStyle==='#78f3c6')window.protectionDraws++
      return arc.call(this,x,y,r,...rest)
    }
    CanvasRenderingContext2D.prototype.fillText=function(text,...rest){
      if(text==='★')window.stunDraws++
      return fillText.call(this,text,...rest)
    }
  })
  await page.clock.install();await page.goto(base)
  await expect(page.getByLabel('대포 공격',{exact:true})).toBeChecked()
  await expect(page.getByLabel('기절 지속시간 (초)',{exact:true})).toHaveValue('1')
  await page.getByLabel('Slack 웹훅 URL',{exact:true}).fill('https://hooks.slack.com/services/mock/cannon/result')
  for(let i=0;i<20;i++){
    await page.getByPlaceholder('조 이름 (예: 1조, 2조...)').fill(`대포 ${i+1}`)
    await page.getByRole('button',{name:'조 추가',exact:true}).click()
  }
  await page.getByLabel('경기 제한시간 (초)',{exact:true}).fill('30')
  await page.getByRole('button',{name:'경기 준비',exact:true}).click()
  await page.getByRole('button',{name:'출발',exact:true}).click()
  let fired=false,stunned=null
  for(let i=0;i<400&&!stunned;i++){
    await page.clock.runFor(50)
    if(await page.evaluate(()=>window.projectileDraws>0))fired=true
    stunned=await page.locator('.team-progress').evaluateAll(rows=>rows.map(row=>({...row.dataset})).find(data=>Number(data.stunRemaining)>.6) || null)
  }
  expect(fired,'visible flying projectile').toBe(true)
  expect(stunned,'a real ball is stunned').not.toBeNull()
  expect(await page.evaluate(()=>window.stunDraws)).toBeGreaterThan(0)
  await page.clock.runFor(200)
  const frozen=await page.locator('.team-progress').evaluateAll((rows,id)=>({...rows.find(row=>row.dataset.id===id).dataset}),stunned.id)
  expect([frozen.x,frozen.y]).toEqual([stunned.x,stunned.y])
  await page.clock.runFor(1300)
  const recovered=await page.locator('.team-progress').evaluateAll((rows,id)=>({...rows.find(row=>row.dataset.id===id).dataset}),stunned.id)
  expect(Number(recovered.stunRemaining)).toBe(0)
  expect([recovered.x,recovered.y]).not.toEqual([stunned.x,stunned.y])
  expect(await page.evaluate(()=>window.protectionDraws)).toBeGreaterThan(0)
  await page.clock.runFor(31000)
  await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
  await expect(page.locator('.ranking-row').first()).toContainText('대포 발사')
  await expect(page.locator('.ranking-row').first()).toContainText('기절 피해')
  await expect(page.getByRole('status').filter({hasText:'Slack 전송 완료'})).toBeVisible()
  expect(slack).toHaveLength(1)
  expect(JSON.stringify(slack[0])).toContain('공격 방식:* 대포')
  expect(JSON.stringify(slack[0])).toContain('대포 발사:')
  await page.getByRole('button',{name:'다시 경기하기',exact:true}).click()
  await page.clock.runFor(100)
  await expect(page.locator('canvas')).toHaveAttribute('data-status','READY')
  expect(errors).toEqual([])
})
