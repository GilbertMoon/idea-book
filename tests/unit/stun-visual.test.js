import test from 'node:test'
import assert from 'node:assert/strict'
import { RaceEngine } from '../../src/physics/RaceEngine.js'
import { RaceRenderer } from '../../src/game/RaceRenderer.js'
test('stun overlay keeps photo area clear, shows real remaining seconds, and disappears immediately',()=>{
 const texts=[],arcs=[]
 const ctx=new Proxy({}, {get:(_,key)=>key==='fillText'?(...args)=>texts.push(args):key==='arc'?(...args)=>arcs.push(args):()=>{},set:()=>true})
 const e=new RaceEngine({groups:[{id:'a',name:'A'}]});e.start()
 const b=e.balls[0];b.stunRemaining=.7
 const r=new RaceRenderer({getContext:()=>ctx},e)
 const before=structuredClone(b);r.drawCannon()
 assert.ok(texts.some(([s])=>s==='STUN!'))
 assert.ok(texts.some(([s])=>s==='0.7s'))
 assert.equal(texts.filter(([s])=>s==='★').length,3)
 assert.ok(arcs.some(([x,y,radius])=>x===b.x&&y===b.y&&radius>b.radius))
 for(const [s,x,y] of texts)if(s==='★')assert.ok(Math.hypot(x-b.x,y-b.y)>b.radius+5)
 assert.deepEqual(b,before)
 texts.length=0;b.stunRemaining=0;b.hitProtection=1;r.drawCannon()
 assert.equal(texts.length,0)
})
