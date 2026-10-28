import test from 'node:test'
import assert from 'node:assert/strict'
import { RaceEngine } from '../../src/physics/RaceEngine.js'
import { RaceCommentary } from '../../src/game/RaceCommentary.js'

const engineOf = () => new RaceEngine({groups:Array.from({length:5},(_,i)=>({id:`b${i}`,name:`팀 ${i}`}))})
test('countdown reads engine time, preserves independent stuns and prioritizes latest hits',()=>{
 const e=engineOf(), c=new RaceCommentary()
 e.balls[1].stunRemaining=1;c.consume({type:'cannon-hit',attackerId:'b0',targetId:'b1'},e)
 e.balls[2].stunRemaining=2;c.consume({type:'cannon-hit',attackerId:'b3',targetId:'b2'},e)
 let view=c.snapshot(e)
 assert.deepEqual(view.stuns.map(s=>[s.id,s.count]),[['b2',20],['b1',10]])
 assert.match(view.stuns[1].description,/팀 0/)
 assert.deepEqual(c.snapshot(e),view,'no independent wall-clock timer')
 e.balls[1].stunRemaining=.71
 assert.equal(c.snapshot(e).stuns[1].count,8)
 e.balls[1].stunRemaining=0;c.consume({type:'stun-end',ballId:'b1'},e)
 assert.deepEqual(c.snapshot(e).stuns.map(s=>s.id),['b2'])
 assert.match(c.snapshot(e).recoveries[0].description,/정신 차리고 다시 출발/)
 e.elapsed=1.01;assert.equal(c.snapshot(e).recoveries.length,0)
})
test('active stuns cannot be evicted by history; three newest victims and three events are bounded',()=>{
 const e=engineOf(),c=new RaceCommentary()
 for(let i=1;i<5;i++){e.balls[i].stunRemaining=1;c.consume({type:'cannon-hit',attackerId:'b0',targetId:`b${i}`},e)}
 for(let i=0;i<100;i++)c.consume({type:'return',ballId:'b0',fromStage:2},e)
 assert.deepEqual(c.snapshot(e).stuns.map(s=>s.id),['b4','b3','b2'])
 assert.equal(c.snapshot(e).recent.length,3)
 e.balls[4].stunRemaining=0
 assert.deepEqual(c.snapshot(e).stuns.map(s=>s.id),['b3','b2','b1'])
 e.balls[1].dnf=true;assert.equal(c.snapshot(e).stuns.some(s=>s.id==='b1'),false)
 assert.equal(new RaceCommentary().snapshot(engineOf()).recent.length,0)
})
test('hook, return and arrival descriptions use participant names and actual tied ranks',()=>{
 const e=engineOf(),c=new RaceCommentary()
 c.consume({type:'hook-throw',attackerId:'b0',targetId:'b1'},e)
 assert.match(c.snapshot(e).recent[0].description,/팀 0.*팀 1.*뒤로/)
 c.consume({type:'return',ballId:'b2',fromStage:3},e)
 assert.match(c.snapshot(e).recent[0].description,/3단계에서 2단계/)
 e.balls[0].arrivalTime=1;e.balls[1].arrivalTime=1
 c.consume({type:'arrival',ballId:'b1'},e)
 assert.match(c.snapshot(e).recent[0].description,/팀 1, 1위/)
 assert.equal(c.snapshot(e).featured.kind,'attack')
 const before=structuredClone(e.balls);c.snapshot(e);assert.deepEqual(e.balls,before)
})
