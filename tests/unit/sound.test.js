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

test('result event schedules four ascending notes without a playback warning',()=>{
 const manager=new SoundManager(),notes=[],warnings=[]
 manager.ctx={currentTime:2,destination:{},createOscillator:()=>{const note={};notes.push(note);return {type:'',frequency:{set value(value){note.frequency=value}},connect(){},start(time){note.start=time},stop(time){note.stop=time}}},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})}
 const originalWarn=console.warn
 console.warn=(...args)=>warnings.push(args)
 try {manager.playEvent('result')} finally {console.warn=originalWarn}
 assert.equal(warnings.length,0,'result sound must not swallow a playback failure')
 assert.deepEqual(notes.map(note=>note.frequency),[523,659,784,1047])
 assert.deepEqual(notes.map(note=>note.start),[2,2.15,2.3,2.45])
 assert.ok(notes.every(note=>note.stop>note.start))
})
