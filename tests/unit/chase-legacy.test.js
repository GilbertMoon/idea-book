import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {RaceEngine} from '../../src/physics/RaceEngine.js'
const fixture=JSON.parse(await readFile(new URL('../fixtures/pre-hook-trajectory.json',import.meta.url),'utf8'))
test('attack OFF exactly preserves pre-feature positions, collisions, stages and finish times',()=>{
 const engine=new RaceEngine({groups:fixture.groups,settings:{chaseAttack:{enabled:false}}});engine.start()
 for(let tick=1;tick<=10800;tick++){
  engine.step();const expected=fixture.snapshots.find(s=>s.tick===tick)
  if(!expected)continue
  assert.equal(engine.status,expected.status);assert.equal(engine.elapsed,expected.elapsed)
  assert.deepEqual(engine.balls.map(b=>Object.fromEntries(fixture.fields.map(k=>[k,b[k]]))),expected.balls)
 }
})
