import test from 'node:test'
import assert from 'node:assert/strict'
import {SoundManager} from '../../src/sounds/SoundManager.js'
function audioFixture(){
 const tones=[]
 const manager=new SoundManager()
 manager.ctx={currentTime:1,destination:{},createOscillator:()=>{const tone={values:[]};tones.push(tone);return {frequency:{setValueAtTime:v=>tone.values.push(v),exponentialRampToValueAtTime:v=>tone.values.push(v)},connect(){},disconnect(){},start(){},stop(){},set type(v){tone.type=v},set onended(fn){tone.end=fn}}},createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}})}
 return {manager,tones}
}
test('four hook events have distinct synth signatures and quiet bounded voices',()=>{
 const signatures=[]
 for(const type of ['hook-cast','hook-hit','hook-throw','hook-miss']){
  const {manager,tones}=audioFixture();manager.playEvent(type);assert.equal(tones.length,1);signatures.push(JSON.stringify(tones[0]))
 }
 assert.equal(new Set(signatures).size,4)
 const {manager,tones}=audioFixture()
 for(let i=0;i<80;i++){manager.ctx.currentTime+=.13;manager.playEvent(['hook-cast','hook-hit','hook-throw','hook-miss'][i%4])}
 assert.ok(tones.length<=4,'at most four concurrently live hook voices')
 tones[0].end();manager.ctx.currentTime+=1;manager.playEvent('hook-cast');assert.equal(tones.length,5)
})
test('hook event throttle suppresses same-frame bursts and honors mute',()=>{
 const {manager,tones}=audioFixture()
 for(let i=0;i<30;i++)manager.playEvent('hook-cast')
 assert.equal(tones.length,1)
 manager.enabled=false;manager.ctx.currentTime+=1;manager.playEvent('hook-hit');assert.equal(tones.length,1)
})
