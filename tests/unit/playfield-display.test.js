import test from 'node:test'
import assert from 'node:assert/strict'
import * as display from '../../src/game/FinishLineDisplay.js'
import {RaceRenderer} from '../../src/game/RaceRenderer.js'
import {RaceEngine} from '../../src/physics/RaceEngine.js'

test('full-sized 1200x820 world has a separate narrower finish viewport without clipping any route',()=>{
 assert.equal(display.RACE_DISPLAY_SCALE,1,'remove the old 20% reduction of the world')
 const e=new RaceEngine(),view=display.DISPLAY_VIEWPORT
 assert.equal(e.width,1200);assert.equal(e.height,820)
 assert.equal(display.FINISH_LAYOUT.left,e.width)
 assert.equal(view.height,e.height)
 assert.equal(view.width-display.FINISH_LAYOUT.left,200)
 for(const route of e.routes)for(const p of route.points){
  assert.ok(p.x-route.width/2>=0&&p.x+route.width/2<=e.width)
  assert.ok(p.y-route.width/2>=0&&p.y+route.width/2<=e.height)
 }
 const slots=new display.FinishLineDisplay().update(Array.from({length:30},(_,i)=>({id:i,rank:i+1,arrivalTime:i,x:1000,y:688})),0)
 for(const p of slots){assert.ok(p.targetX-display.FINISH_LAYOUT.radius>=e.width);assert.ok(p.targetX+display.FINISH_LAYOUT.radius<=view.width)}
})
for(const mode of ['off','hook','cannon'])test(`rendering at different sizes and DPR preserves identical ${mode} physics and rankings`,()=>{
 const options={groups:Array.from({length:10},(_,i)=>({id:`team-${i}`,name:`팀 ${i}`})),settings:{maxRaceSeconds:30,chaseAttack:{attackMode:mode}}}
 const baseline=new RaceEngine(options),rendered=new RaceEngine(options)
 const ctx=new Proxy({},{get:()=>()=>{},set:()=>true}),canvas={style:{},getContext:()=>ctx}
 const renderer=new RaceRenderer(canvas,rendered),oldWindow=globalThis.window
 globalThis.window={devicePixelRatio:1}
 try{
  baseline.start();rendered.start()
  for(let i=0;i<3601;i++){
   baseline.step(1/120);rendered.step(1/120)
   if(i%60===0){globalThis.window.devicePixelRatio=1+Math.floor(i/60)%3;canvas.style.width=`${600+i%800}px`;renderer.draw(i*1000/120)}
  }
  assert.deepEqual(rendered.balls,baseline.balls)
  assert.deepEqual(rendered.getRanking(),baseline.getRanking())
  assert.equal(rendered.status,'FINISHED')
 }finally{globalThis.window=oldWindow}
})
