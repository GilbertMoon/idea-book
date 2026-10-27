import test from 'node:test'
import assert from 'node:assert/strict'
import {RaceEngine} from '../../src/physics/RaceEngine.js'
test('different READY departure phases complete the default course across difficulties',()=>{
 for(const phase of [0,.3,1,2,4,8])for(const difficulty of ['easy','normal','hard']){
  const e=new RaceEngine({groups:Array.from({length:30},(_,id)=>({id,name:`T${id}`})),settings:{difficulty}})
  for(let i=0;i<phase*120;i++)e.step()
  e.start();while(e.status!=='FINISHED')e.step()
  assert.equal(e.balls.filter(b=>b.dnf).length,0,`phase ${phase}, ${difficulty}`)
  assert.equal(e.getRanking().length,30)
 }
})
