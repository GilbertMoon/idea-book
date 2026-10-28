import test from 'node:test'
import assert from 'node:assert/strict'
import { RaceEngine } from '../../src/physics/RaceEngine.js'
import { normalizeSettings } from '../../src/config/defaults.js'
import { segmentCapsule, segmentCircle, segmentLaneExit } from '../../src/physics/ProjectileGeometry.js'
import { SlackService } from '../../src/services/SlackService.js'

const dt = 1/120
function race(settings = {}, count = 2) {
  const engine = new RaceEngine({groups:Array.from({length:count},(_,i)=>({id:`b${i}`,name:`Team ${i}`})),settings})
  engine.obstacles=[];engine.gates=[];engine.start()
  engine.balls.forEach((ball,i)=>Object.assign(ball,{x:160,y:200+i*50,vx:0,vy:0}))
  return engine
}
const tick = (engine,n) => {const events=[];for(let i=0;i<n;i++){engine.step();events.push(...engine.events)}return events}

test('default cannon and explicit hook/off migrations preserve legacy choices',()=>{
  assert.equal(normalizeSettings().chaseAttack.attackMode,'cannon')
  assert.equal(normalizeSettings({chaseAttack:{enabled:true,impulse:220}}).chaseAttack.attackMode,'hook')
  assert.equal(normalizeSettings({chaseAttack:{enabled:false}}).chaseAttack.attackMode,'off')
  assert.equal(normalizeSettings({chaseAttack:{attackMode:'cannon',enabled:false}}).chaseAttack.attackMode,'cannon')
  const off=race({chaseAttack:{attackMode:'off'}});tick(off,40)
  assert.equal(off.balls[0].attackAttempts,0)
})
test('continuous segment collisions choose actual circle, thick obstacle and boundary crossings',()=>{
  assert.equal(segmentCircle({x:0,y:0},{x:100,y:0},{x:50,y:0},10),.4)
  assert.equal(segmentCircle({x:0,y:20},{x:100,y:20},{x:50,y:0},10),Infinity)
  assert.equal(segmentCapsule({x:0,y:0},{x:100,y:0},{x:30,y:0,length:40,angle:Math.PI/2,thickness:10},5),.2)
  assert.equal(segmentLaneExit({x:20,y:20},{x:110,y:20},{left:0,right:100,top:0,bottom:100},5),75/90)
})
test('cannon travels without homing, hits, freezes for one simulated second, and protects after recovery',()=>{
  const e=race(),[attacker,target]=e.balls
  let events=tick(e,1);assert.ok(events.some(event=>event.type==='cannon-fire'))
  const shot=e.chaseAttackSystem.projectiles[0], direction=[shot.vx,shot.vy]
  events=tick(e,2);assert.ok(e.chaseAttackSystem.projectiles.length);assert.deepEqual([shot.vx,shot.vy],direction)
  for(let i=0;i<20&&!target.stunRemaining;i++)events.push(...tick(e,1))
  assert.ok(events.some(event=>event.type==='cannon-hit'))
  assert.ok(events.some(event=>event.type==='stun-start'&&event.duration===1))
  assert.equal(attacker.cannonFired,1);assert.equal(attacker.cannonHits,1);assert.equal(target.stunCount,1)
  const position=[target.x,target.y]
  events=tick(e,119);assert.deepEqual([target.x,target.y],position);assert.ok(target.stunRemaining>0)
  events.push(...tick(e,1));assert.deepEqual([target.x,target.y],position)
  assert.equal(target.stunRemaining,0);assert.ok(Math.abs(target.totalStunTime-1)<1e-8)
  assert.ok(events.some(event=>event.type==='stun-end'));assert.ok(target.hitProtection>1.99)
  tick(e,1);assert.notDeepEqual([target.x,target.y],position)
  assert.equal(e.chaseAttackSystem.canAttack(attacker,target),false)
})
test('projectile misses a moved target or target entering transport instead of homing',()=>{
  for(const change of [target=>{target.x=240},target=>{target.route='return2';target.transport={id:'return2',index:0,start:{x:target.x,y:target.y}}}]){
    const e=race(),target=e.balls[1];tick(e,1);change(target)
    const events=tick(e,70)
    assert.ok(events.some(event=>event.type==='cannon-miss'));assert.equal(target.stunCount,0)
    assert.equal(e.balls[0].cannonFired,1)
  }
})
test('obstacle or lane boundary before target consumes projectile and cannot cause a hit',()=>{
  const e=race();tick(e,1)
  e.obstacles.push({stage:1,x:160,y:225,length:100,thickness:8,angle:0,angularVelocity:0,type:'segment'})
  const events=tick(e,20);assert.ok(events.some(event=>event.type==='cannon-miss'))
  assert.equal(e.balls[1].stunCount,0)
  const w=race();tick(w,1)
  const shot=w.chaseAttackSystem.projectiles[0];shot.x=263;shot.vx=500;shot.vy=0
  assert.ok(tick(w,1).some(event=>event.type==='cannon-miss'))
})
test('stunned ball ignores moving obstacles and other balls; recovery suppresses violent overlap impulse',()=>{
  const e=race(),target=e.balls[1];tick(e,20)
  assert.ok(target.stunRemaining>0)
  const position=[target.x,target.y]
  e.obstacles=[{stage:1,x:target.x,y:target.y,length:100,thickness:10,angle:0,angularVelocity:2,type:'paddle'}]
  Object.assign(e.balls[0],{x:target.x,y:target.y,attackCooldown:20})
  tick(e,100);assert.deepEqual([target.x,target.y],position)
  tick(e,30);assert.ok(Math.abs(target.vx)<=300&&Math.abs(target.vy)<=350)
  assert.equal(target.stunCount,1)
})
test('reservation prevents duplicate hits and attack limits and cooldown are spent on firing',()=>{
  const e=race({},3),[a,b,target]=e.balls
  Object.assign(a,{x:115,y:200});Object.assign(b,{x:205,y:205});Object.assign(target,{x:160,y:250})
  tick(e,1);assert.equal(e.chaseAttackSystem.projectiles.length,1)
  tick(e,30);assert.equal(target.stunCount,1)
  assert.ok(a.cannonFired+b.cannonFired<=1)
  assert.ok([a,b].some(ball=>ball.attackCooldown>7))
  const limited=race({chaseAttack:{attackMode:'cannon',maxAttacks:0}});tick(limited,20)
  assert.equal(limited.balls[0].cannonFired,0)
})
test('time limit remains authoritative while target is stunned and cancellation clears pending shots',()=>{
  const e=race({maxRaceSeconds:.1});tick(e,20)
  assert.equal(e.status,'FINISHED');assert.ok(e.balls.every(ball=>ball.dnf&&ball.arrivalTime===null))
  assert.ok(e.balls.some(ball=>ball.stunCount===1));assert.equal(e.getRanking()[0].rank,null)
  const cancel=race();tick(cancel,1);cancel.status='FINISHED';cancel.chaseAttackSystem.step(dt)
  assert.equal(cancel.chaseAttackSystem.projectiles.length,0);assert.equal(cancel.chaseAttackSystem.reservations.size,0)
})
test('Slack includes mode and accurate cannon and hook statistics',()=>{
  const text=JSON.stringify(new SlackService().buildPayload({attackMode:'cannon',ranking:[{rank:1,cannonFired:2,cannonHits:1,stunCount:1,totalStunTime:.5,hookHits:3}]}))
  for(const part of ['대포 발사: 2','명중: 1','기절: 1','0.50초','낚싯대 성공: 3','공격 방식'])assert.ok(text.includes(part),part)
})
