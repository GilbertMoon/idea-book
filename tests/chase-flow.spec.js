import {test,expect} from '@playwright/test'
const base=`http://127.0.0.1:${process.env.E2E_PORT || 5188}/`
async function register(page,count){
 for(let i=0;i<count;i++){
  await page.getByPlaceholder('조 이름 (예: 1조, 2조...)').fill(`공격테스트 ${i+1}조`)
  await page.getByRole('button',{name:'조 추가',exact:true}).click()
 }
}
test('자동 추격 공격은 진행 중 표시되고 종료 후 결과·재경기에 반영된다',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.clock.install()
 await page.goto(base);await register(page,10)
 await page.getByLabel('낚싯대 공격',{exact:true}).check()
 await page.getByLabel('경기 제한시간 (초)',{exact:true}).fill('10')
 await page.getByRole('button',{name:'경기 준비',exact:true}).click()
 await page.clock.runFor(500)
 await expect(page.locator('canvas')).toHaveAttribute('data-hook-count','0')
 await page.getByRole('button',{name:'출발',exact:true}).click()
 let observed=false
 for(let i=0;i<60;i++){
  await page.clock.runFor(100)
  if(Number(await page.locator('canvas').getAttribute('data-hook-count'))>0){observed=true;break}
 }
 expect(observed,'실제 엔진의 활성 낚싯대 공격이 있어야 함').toBe(true)
 await expect(page.locator('.race-announcement')).toContainText(/낚싯대|낚아|투척/)
 const attempts=await page.locator('.team-progress').evaluateAll(rows=>rows.reduce((n,row)=>n+Number(row.dataset.attackAttempts||0),0))
 expect(attempts).toBeGreaterThan(0)
 await page.clock.runFor(11000)
 await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
 await expect(page.locator('.ranking-row').first()).toContainText('공격')
 await expect(page.locator('.ranking-row').first()).toContainText('피격')
 await expect(page.locator('canvas')).toHaveAttribute('data-hook-count','0')
 await page.getByRole('button',{name:'다시 경기하기',exact:true}).click()
 await page.clock.runFor(100)
 await expect(page.locator('canvas')).toHaveAttribute('data-status','READY')
 expect(await page.locator('.team-progress').evaluateAll(rows=>rows.reduce((n,row)=>n+Number(row.dataset.attackAttempts||0),0))).toBe(0)
 expect(errors).toEqual([])
})
test('공격 OFF 경기와 모바일 축소는 공격을 생성하지 않는다',async({page})=>{
 await page.clock.install();await page.setViewportSize({width:390,height:844})
 await page.goto(base);await register(page,10)
 await page.getByLabel('공격 사용 안 함',{exact:true}).check()
 await page.getByLabel('경기 제한시간 (초)',{exact:true}).fill('5')
 await page.getByRole('button',{name:'경기 준비',exact:true}).click()
 await page.getByRole('button',{name:'출발',exact:true}).click()
 await page.clock.runFor(6000)
 await expect(page.getByRole('dialog',{name:'경기 결과'})).toBeVisible()
 await expect(page.locator('canvas')).toHaveAttribute('data-hook-count','0')
 expect(await page.locator('.team-progress').evaluateAll(rows=>rows.reduce((n,row)=>n+Number(row.dataset.attackAttempts||0),0))).toBe(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
