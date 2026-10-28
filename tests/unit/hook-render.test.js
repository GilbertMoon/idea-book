import test from 'node:test'
import assert from 'node:assert/strict'
import { HookRenderer } from '../../src/game/HookRenderer.js'

function fixture(state='CASTING',elapsed=.1){
 const calls=[]
 const ctx=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:(_,key,value)=>{calls.push(['set',key,value]);return true}})
 const engine={status:'RUNNING',animationTime:1,settings:{chaseAttack:{animationEnabled:true}},balls:[{id:'a',x:100,y:100,radius:12,stage:1},{id:'b',x:130,y:150,radius:12,stage:1}],chaseAttackSystem:{activeAttacks:[{attackerId:'a',targetId:'b',stage:1,state,elapsed,castingDuration:.2,hookedDuration:.15}]}}
 return {calls,ctx,engine,renderer:new HookRenderer(ctx,engine)}
}
test('casting line extends with simulation elapsed and follows current ball positions without mutation',()=>{
 const {calls,engine,renderer}=fixture()
 const before=structuredClone(engine)
 renderer.draw()
 const curve=calls.find(c=>c[0]==='quadraticCurveTo')
 assert.ok(curve,'casting draws a curved fishing line')
 assert.ok(curve[3]>100 && curve[3]<130,'half cast ends between live ball centers')
 assert.deepEqual(engine,before)
 calls.length=0;engine.balls[1].x=160;renderer.draw()
 assert.ok(calls.find(c=>c[0]==='quadraticCurveTo')[3]>curve[3])
})
test('hooked and throwing render distinct outer effects; protection never fills the photo',()=>{
 const f=fixture('HOOKED',.08);f.renderer.draw()
 assert.ok(f.calls.some(c=>c[0]==='quadraticCurveTo'))
 f.calls.length=0;f.engine.chaseAttackSystem.activeAttacks[0].state='THROWING';f.renderer.draw()
 assert.ok(f.calls.some(c=>c[0]==='arc'))
 f.calls.length=0;f.engine.chaseAttackSystem.activeAttacks=[];f.engine.balls[1].hitProtection=2;f.renderer.draw()
 assert.ok(f.calls.some(c=>c[0]==='arc' && c[3]>12))
 assert.ok(!f.calls.some(c=>c[0]==='fill' || c[0]==='fillRect'),'protection is outline only')
})
test('disabled animation, finished race, missing participants and cleared attacks draw nothing',()=>{
 for(const alter of [e=>{e.settings.chaseAttack.animationEnabled=false},e=>{e.status='FINISHED'},e=>{e.balls=[]},e=>{e.chaseAttackSystem.activeAttacks=[]}]){
  const f=fixture();alter(f.engine);f.renderer.draw();assert.equal(f.calls.length,0)
 }
})

test('hooked curve tightens over its duration while endpoints remain tied to live balls',()=>{
 const f=fixture('HOOKED',0)
 f.renderer.draw();const start=f.calls.find(c=>c[0]==='quadraticCurveTo')
 f.calls.length=0;f.engine.chaseAttackSystem.activeAttacks[0].elapsed=.15;f.renderer.draw()
 const end=f.calls.find(c=>c[0]==='quadraticCurveTo')
 assert.equal(start[3],end[3]);assert.equal(start[4],end[4])
 assert.notEqual(start[1],end[1]);assert.notEqual(start[2],end[2])
})
test('Map metadata, protections and invalid states safely use current engine data',()=>{
 const f=fixture();f.engine.chaseAttackSystem.activeAttacks=new Map([['attack',f.engine.chaseAttackSystem.activeAttacks[0]]]);f.renderer.draw()
 assert.ok(f.calls.some(c=>c[0]==='quadraticCurveTo'))
 for(const invalid of [e=>{e.balls[1].transport={id:'return2'}},e=>{e.balls[1].stage=2},e=>{e.balls[1].arrivalTime=1},e=>{e.balls[1].dnf=true},e=>{e.balls[1].x=NaN}]){
  const next=fixture();invalid(next.engine);next.renderer.draw();assert.equal(next.calls.length,0)
 }
 f.calls.length=0;f.engine.chaseAttackSystem.activeAttacks.clear();f.engine.balls[0].hitProtection=1;f.renderer.draw()
 assert.ok(f.calls.some(c=>c[0]==='setLineDash'))
 assert.ok(!f.calls.some(c=>c[0]==='quadraticCurveTo'))
})

test('fully extended hook stays outside the target photo disc',()=>{
 const f=fixture('CASTING',.2);f.renderer.draw()
 const curve=f.calls.find(c=>c[0]==='quadraticCurveTo'),target=f.engine.balls[1]
 assert.ok(Math.hypot(curve[3]-target.x,curve[4]-target.y)>=target.radius+7.9)
})
