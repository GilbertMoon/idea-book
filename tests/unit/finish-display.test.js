import test from 'node:test'
import assert from 'node:assert/strict'
import { FinishLineDisplay, FINISH_ANIMATION_MS, FINISH_LAYOUT, RACE_DISPLAY_SCALE } from '../../src/game/FinishLineDisplay.js'
import { RaceRenderer } from '../../src/game/RaceRenderer.js'
import { RaceEngine } from '../../src/physics/RaceEngine.js'

const makeEngine = (count=3,settings={}) => new RaceEngine({
  groups:Array.from({length:count},(_,i)=>({id:`b${i}`,name:`Team ${i}`})),settings,
})
const arrived = (ball,time,x=1000,y=688) => Object.assign(ball,{arrivalTime:time,x,y,stage:3,route:'stage3'})

test('one to thirty finishers occupy stable left-to-right slots with bounded rows and no overlaps',()=>{
  for(const count of [1,2,3,5,10,30]){
    const e=makeEngine(count),display=new FinishLineDisplay()
    e.balls.forEach((ball,i)=>arrived(ball,i+1))
    const entries=display.update(e.getRanking(),0)
    assert.equal(entries.length,count)
    for(let i=0;i<count;i++){
      const {targetX:x,targetY:y,index}=entries[i]
      assert.equal(index,i)
      assert.equal(x,FINISH_LAYOUT.firstX+(i%FINISH_LAYOUT.columns)*FINISH_LAYOUT.spacingX)
      assert.equal(y,FINISH_LAYOUT.firstY+Math.floor(i/FINISH_LAYOUT.columns)*FINISH_LAYOUT.spacingY)
      assert.ok(x-FINISH_LAYOUT.radius>=FINISH_LAYOUT.left&&x+FINISH_LAYOUT.radius<=e.width)
      assert.ok(y-FINISH_LAYOUT.radius>=FINISH_LAYOUT.top&&y+FINISH_LAYOUT.radius<=e.height)
      for(let j=0;j<i;j++)assert.ok(Math.hypot(x-entries[j].targetX,y-entries[j].targetY)>=FINISH_LAYOUT.radius*2)
    }
  }
})

test('ease-out movement begins at the finish, finishes in 400ms, and leaves previous slots fixed',()=>{
  const e=makeEngine(),display=new FinishLineDisplay()
  arrived(e.balls[0],1)
  let entries=display.update(e.getRanking(),1000)
  assert.deepEqual([entries[0].x,entries[0].y],[1000*RACE_DISPLAY_SCALE,688*RACE_DISPLAY_SCALE])
  entries=display.update(e.getRanking(),1100)
  assert.equal(entries[0].progress,.25)
  assert.ok(entries[0].x>1000*RACE_DISPLAY_SCALE&&entries[0].x<entries[0].targetX)
  arrived(e.balls[1],1.01,1050)
  entries=display.update(e.getRanking(),1100)
  assert.equal(entries[1].progress,0)
  entries=display.update(e.getRanking(),1400)
  assert.equal(entries[0].progress,1)
  const first=[entries[0].x,entries[0].y]
  entries=display.update(e.getRanking(),1400+FINISH_ANIMATION_MS)
  assert.deepEqual([entries[0].x,entries[0].y],first)
  assert.equal(entries[1].progress,1)
  assert.equal(new FinishLineDisplay().update([],2000).length,0)
})

test('ties retain engine ranks and separate slots; near-simultaneous finish order excludes DNF',()=>{
  const e=makeEngine(4),display=new FinishLineDisplay()
  arrived(e.balls[2],2.0000005);arrived(e.balls[0],2);arrived(e.balls[1],2.1)
  e.balls[3].dnf=true
  const before=structuredClone(e.balls)
  const ranking=e.getRanking(),entries=display.update(ranking,0)
  assert.deepEqual(entries.map(item=>item.ball.id),['b0','b2','b1'])
  assert.deepEqual(entries.map(item=>item.rank),[1,1,3])
  assert.equal(new Set(entries.map(item=>`${item.targetX},${item.targetY}`)).size,3)
  assert.deepEqual(e.balls,before)
  assert.deepEqual(entries.map(item=>item.ball.id),ranking.filter(ball=>ball.arrivalTime!==null).map(ball=>ball.id))
})

test('renderer draws rank and team photo in the finish area without changing physics',()=>{
  const calls=[]
  const ctx=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true})
  const canvas={style:{},getContext:()=>ctx}
  const oldWindow=globalThis.window,oldImage=globalThis.Image
  globalThis.window={devicePixelRatio:1}
  globalThis.Image=class {constructor(){this.complete=true;this.naturalWidth=32}}
  try{
    const e=makeEngine(2);arrived(e.balls[0],1);e.balls[0].imageUrl='blob:test'
    const before=structuredClone(e.balls),renderer=new RaceRenderer(canvas,e)
    assert.equal(renderer.draw(100),true)
    assert.equal(renderer.draw(500),false)
    assert.ok(calls.some(call=>call[0]==='fillText'&&call[1]==='1위'))
    assert.ok(calls.some(call=>call[0]==='drawImage'&&call[2]===FINISH_LAYOUT.firstX-FINISH_LAYOUT.radius))
    assert.deepEqual(e.balls,before)
    assert.equal(canvas.width,1200);assert.equal(canvas.height,820)
    globalThis.window.devicePixelRatio=2
    assert.equal(renderer.draw(600),false)
    assert.equal(canvas.width,2400);assert.equal(canvas.height,1640)
    assert.equal(renderer.finishDisplay.update(e.getRanking(),600)[0].x,FINISH_LAYOUT.firstX)
    assert.deepEqual(e.balls,before)
    renderer.dispose()
  }finally{globalThis.window=oldWindow;globalThis.Image=oldImage}
})

test('already arrived balls cannot be attacked by pending hook or cannon shots',()=>{
  for(const mode of ['hook','cannon']){
    const e=makeEngine(2,{chaseAttack:{attackMode:mode}})
    e.start();e.obstacles=[];e.gates=[]
    Object.assign(e.balls[0],{stage:3,route:'stage3',x:960,y:650,vx:0,vy:0})
    Object.assign(e.balls[1],{stage:3,route:'stage3',x:960,y:685,vx:0,vy:150})
    const events=[]
    for(let i=0;i<60;i++){e.step();events.push(...e.events)}
    assert.ok(events.some(event=>event.type===`${mode==='hook'?'hook-cast':'cannon-fire'}`))
    assert.notEqual(e.balls[1].arrivalTime,null)
    assert.equal(e.balls[1].hitCount,0)
    assert.equal(e.balls[1].stunCount,0)
    assert.ok(!events.some(event=>event.type==='hook-throw'||event.type==='cannon-hit'))
    assert.equal(e.chaseAttackSystem.canAttack(e.balls[0],e.balls[1]),false)
  }
})

test('active balls render once in the scaled board and arrived balls once in unscaled finish space',()=>{
  const transforms=[],stack=[];let current=[1,0,0,1,0,0]
  const ctx=new Proxy({}, {get:(_,key)=>{
    if(key==='save')return ()=>stack.push([...current])
    if(key==='restore')return ()=>{current=stack.pop()}
    if(key==='setTransform')return (...matrix)=>{current=matrix}
    if(key==='scale')return (x,y)=>{current=[current[0]*x,current[1]*x,current[2]*y,current[3]*y,current[4],current[5]]}
    return ()=>{}
  },set:()=>true})
  const oldWindow=globalThis.window
  globalThis.window={devicePixelRatio:2}
  try{
    const e=makeEngine(3);arrived(e.balls[0],1);e.balls[2].dnf=true
    const before=structuredClone(e.balls),renderer=new RaceRenderer({style:{},getContext:()=>ctx},e)
    const drawBall=renderer.drawBall.bind(renderer)
    renderer.drawBall=(b,index,label,finished)=>{transforms.push({id:b.id,finished:!!finished,scale:current[0]});drawBall(b,index,label,finished)}
    renderer.draw(0);transforms.length=0;renderer.draw(FINISH_ANIMATION_MS)
    assert.deepEqual(transforms.map(item=>item.id).sort(),e.balls.map(b=>b.id).sort())
    assert.deepEqual(transforms.filter(item=>item.finished).map(item=>item.id),['b0'])
    assert.ok(transforms.filter(item=>!item.finished).every(item=>item.scale===2*RACE_DISPLAY_SCALE))
    assert.equal(transforms.find(item=>item.finished).scale,2)
    assert.deepEqual(current,[2,0,0,2,0,0]);assert.equal(stack.length,0)
    assert.deepEqual(e.balls,before);assert.equal(e.width,1200);assert.equal(e.height,820)
  }finally{globalThis.window=oldWindow}
})

test('incremental simultaneous arrivals have unique slots with engine ranks and DNF never waits',()=>{
  const e=makeEngine(30),display=new FinishLineDisplay()
  e.balls[29].dnf=true
  for(let count=1;count<=29;count++){
    arrived(e.balls[count-1],Math.ceil(count/2))
    const entries=display.update(e.getRanking(),count*500)
    assert.equal(entries.length,count)
    assert.equal(new Set(entries.map(item=>item.index)).size,count)
    assert.deepEqual(entries.map(item=>item.rank),e.getRanking().filter(b=>b.arrivalTime!==null&&!b.dnf).map(b=>b.rank))
    const settled=display.update(e.getRanking(),count*500+FINISH_ANIMATION_MS)
    assert.ok(settled.every(item=>item.progress===1))
    assert.ok(!settled.some(item=>item.ball.dnf))
  }
  assert.deepEqual(new FinishLineDisplay().update(e.balls.map(b=>({...b,arrivalTime:null,dnf:true})),0),[])
})


test('finish heading and first-row rank labels remain vertically separated',()=>{
  const labels=[],styles={}
  const ctx=new Proxy({}, {get:(_,key)=>key==='fillText'?(text,x,y)=>labels.push({text,x,y,font:styles.font}):()=>{},set:(_,key,value)=>{styles[key]=value;return true}})
  const oldWindow=globalThis.window;globalThis.window={devicePixelRatio:1}
  try{
    const e=makeEngine(6);e.balls.forEach((b,i)=>arrived(b,i+1));const renderer=new RaceRenderer({style:{},getContext:()=>ctx},e)
    renderer.draw(0);labels.length=0;renderer.draw(FINISH_ANIMATION_MS)
    const heading=labels.find(item=>item.text==='도착 순서')
    for(const rank of labels.filter(item=>/^\d+위$/.test(item.text))){
      const height=Number(rank.font.match(/([\d.]+)px/)[1])
      assert.ok(rank.y-height>heading.y+4,'rank labels must clear the heading instead of overprinting it')
    }
  }finally{globalThis.window=oldWindow}
})
