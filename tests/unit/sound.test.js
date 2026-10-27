import test from 'node:test'
import assert from 'node:assert/strict'
import {SoundManager} from '../../src/sounds/SoundManager.js'
test('동일 시점 충돌 효과음은 중복 폭주하지 않는다',()=>{
 const m=new SoundManager();let starts=0
 m.ctx={currentTime:1, destination:{}, createOscillator:()=>({type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){starts++},stop(){}}), createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})}
 for(let i=0;i<40;i++)m.playEvent('collision')
 assert.equal(starts,1)
 m.ctx.currentTime=1.2;m.playEvent('collision');assert.equal(starts,2)
 m.enabled=false;m.ctx.currentTime=2;m.playEvent('collision');assert.equal(starts,2)
})
