import { test, expect } from '@playwright/test'
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js'
import { SlackService } from '../src/services/SlackService.js'
test('장애물 상태는 관리자 설정 원본을 변경하지 않는다', () => {
 const source = { type:'rotating', x:100,y:100,radius:20,speed:.1,angle:0 }
 const engine = new PhysicsEngine(800,600)
 engine.setObstacles([source]); engine.updateMovingObstacles()
 expect(source.angle).toBe(0)
})
test('빠른 공이 얇은 장애물을 통과하지 않는다', () => {
 const engine = new PhysicsEngine(800,600,0)
 engine.addBall({id:'a',x:100,y:50,vy:150,radius:10})
 engine.setObstacles([{type:'fixed',x:50,y:100,width:100,height:10}])
 engine.step()
 expect(engine.balls[0].y).toBeLessThan(100)
 expect(engine.balls[0].collisionCount).toBeGreaterThan(0)
})
test('같은 실행의 Slack 전송은 동시에 호출해도 한 번만 시도한다', async () => {
 const service = new SlackService(); service.setWebhookUrl('http://127.0.0.1:1')
 let calls=0
 const original=globalThis.fetch
 globalThis.fetch=async()=>{calls++; return new Response('ok')}
 try {
  await Promise.all([service.sendResult({runId:'run1',ranking:[]}),service.sendResult({runId:'run1',ranking:[]})])
  expect(calls).toBe(1)
 } finally {globalThis.fetch=original}
})
test('회전 장애물은 공의 진입 속도를 반사한다', () => {
 const e = new PhysicsEngine(800,600,0)
 e.addBall({id:'a',x:350,y:290,vy:10,radius:22})
 e.setObstacles([{type:'rotating',x:350,y:350,radius:35,speed:.03}])
 e.step()
 expect(e.balls[0].vy).toBeLessThan(0)
})
test('기본 배치에서 1~30개 조 모두 실제 충돌 후 도착한다', () => {
 for(let n=1;n<=30;n++) {
  const e=new PhysicsEngine(800,600,.6)
  e.setObstacles([
   {type:'fixed',x:200,y:300,width:120,height:20},
   {type:'fixed',x:450,y:500,width:80,height:20},
   {type:'rotating',x:350,y:350,radius:35,speed:.03,angle:0},
   {type:'oscillating',baseX:150,currentX:150,y:250,width:150,height:15,period:90,range:120}
  ])
  for(let i=0;i<n;i++)e.addBall({id:i,x:(i+1)*800/(n+1),y:-30,vx:1.5,radius:22})
  for(let t=0;t<3600&&!e.allArrived();t++){e.updateMovingObstacles();e.step()}
  expect(e.arrivedBalls.length, `${n}개 조`).toBe(n)
  expect(new Set(e.getRanking().map(r=>r.ballId)).size).toBe(n)
 }
})
