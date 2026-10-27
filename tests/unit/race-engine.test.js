import test from 'node:test'
import assert from 'node:assert/strict'
const {RaceEngine}=await import('../../src/physics/RaceEngine.js').catch(()=>({RaceEngine:undefined}))
const groups=Array.from({length:8},(_,i)=>({id:`g${i}`,name:`Team ${i}`,members:[{name:'member'}]}))
test('READY animates machinery but holds all balls; start is idempotent',()=>{
 assert.equal(typeof RaceEngine,'function','race engine is implemented')
 const e=new RaceEngine({groups}); const before=e.balls.map(b=>[b.x,b.y]);e.step();assert.deepEqual(e.balls.map(b=>[b.x,b.y]),before);assert.equal(e.elapsed,0);assert.ok(e.animationTime>0);assert.equal(e.start(),true);assert.equal(e.start(),false);e.step();assert.ok(e.balls.some((b,i)=>b.y!==before[i][1]))
})
test('complete races traverse all three stages with bounded continuous motion',()=>{
 for(const difficulty of ['easy','normal','hard']) for(const maxReturns of [0,2]){
 const e=new RaceEngine({groups,settings:{difficulty,maxReturns,maxRaceSeconds:90}});e.start();const seen=new Map(e.balls.map(b=>[b.id,new Set([1])]))
 for(let i=0;i<10801&&e.status!=='FINISHED';i++) {const prev=e.balls.map(b=>[b.x,b.y]);e.step();e.balls.forEach((b,j)=>{seen.get(b.id).add(b.stage);assert.ok(Math.hypot(b.x-prev[j][0],b.y-prev[j][1])<14,'no teleport');assert.ok(b.returnCount<=maxReturns)})}
 assert.equal(e.status,'FINISHED');for(const b of e.balls){assert.equal(b.dnf,false,`${difficulty}/${maxReturns} ${b.id} route ${b.route} y${b.y}`);assert.deepEqual([...seen.get(b.id)].sort(),[1,2,3]);assert.ok(b.collisionCount>0)}
 }
})
test('time limit marks DNF without inventing arrival or rank',()=>{const e=new RaceEngine({groups,settings:{maxRaceSeconds:0.1}});e.start();for(let i=0;i<20;i++)e.step();assert.equal(e.status,'FINISHED');assert.ok(e.getRanking().every(b=>b.dnf&&b.arrivalTime===null&&b.rank===null))})
test('finish times interpolate crossing and equal times share ranks',()=>{const e=new RaceEngine({groups:groups.slice(0,2)});e.start();for(const b of e.balls)Object.assign(b,{stage:3,route:'stage3',x:1000,y:687,vx:0,vy:200});e.step();const r=e.getRanking();assert.equal(r[0].rank,1);assert.equal(r[1].rank,1);assert.ok(r[0].arrivalTime>0&&r[0].arrivalTime<1/120)})
test('both gates select return only from a real left-directed contact and traverse a continuous corridor',()=>{
 for(const stage of [2,3]){
 const e=new RaceEngine({groups:groups.slice(0,1)});e.start();const gate=e.gates[stage-2];gate.angle=stage===2?.2:1.8;const b=e.balls[0]
 Object.assign(b,{stage,route:`stage${stage}`,x:gate.x-(stage===2?40:5),y:gate.y-(stage===2?5:45),vx:-100,vy:stage===2?-120:120})
 e.step();assert.equal(b.route,`return${stage}`);assert.equal(b.returnCount,1);assert.equal(b.lastGateContact.stage,stage)
 let ticks=0;while(b.transport&&ticks++<1200){const prev=[b.x,b.y];e.step();assert.ok(Math.hypot(b.x-prev[0],b.y-prev[1])<=230/120+.001)}
 assert.equal(b.stage,stage-1);assert.equal(b.returnCount,1);assert.equal(b[`returnFromStage${stage}`],1)
 const normal=new RaceEngine({groups:groups.slice(0,1)});normal.start();const n=normal.balls[0];Object.assign(n,{stage,route:`stage${stage}`,x:stage===2?680:1120,y:stage===2?305:260,vy:stage===2?-150:150});for(let i=0;i<5;i++)normal.step();assert.equal(n.returnCount,0)
 }
})
test('cooldown and exhausted limit keep contact solid and use a distinct physical bypass',()=>{
 for(const protection of [{returnCount:2},{returnCooldown:1}]){
 const e=new RaceEngine({groups:groups.slice(0,1)});e.start();const b=e.balls[0];Object.assign(b,{stage:2,route:'stage2',x:600,y:420,vy:-150,...protection});e.step();assert.equal(b.route,'bypass2');const count=b.returnCount;for(let i=0;i<200;i++)e.step();assert.equal(b.returnCount,count);assert.ok(b.y<300)
 }
})
test('fixed substeps make frame batching produce identical trajectories and results',()=>{
 const a=new RaceEngine({groups}),b=new RaceEngine({groups});a.start();b.start();for(let i=0;i<360;i++){a.step(1/30);for(let j=0;j<4;j++)b.step(1/120)}assert.deepEqual(a.balls,b.balls)
})

test('batched steps retain arrivals until the consumer reads this step events',()=>{const e=new RaceEngine({groups:groups.slice(0,2)});e.start();Object.assign(e.balls[0],{stage:3,route:'stage3',x:1000,y:687,vy:200});e.step(1/30);assert.ok(e.events.some(v=>v.type==='arrival'&&v.ballId==='g0'));e.step();assert.ok(!e.events.some(v=>v.type==='arrival'))})
test('default crowds naturally exercise both return gates and complete',()=>{
 let returns2=0,returns3=0;for(const difficulty of ['easy','normal','hard']){const e=new RaceEngine({groups:Array.from({length:30},(_,id)=>({id,name:`T${id}`})),settings:{difficulty}});e.start();while(e.status!=='FINISHED')e.step();assert.equal(e.balls.filter(b=>b.dnf).length,0);returns2+=e.balls.reduce((n,b)=>n+b.returnFromStage2,0);returns3+=e.balls.reduce((n,b)=>n+b.returnFromStage3,0);assert.ok(e.balls.every(b=>b.returnCount<=2))}assert.ok(returns2>0);assert.ok(returns3>0)
})
test('moving obstacle transfers its translational surface velocity on contact',()=>{const e=new RaceEngine({groups:groups.slice(0,1)});e.start();e.obstacles=[{id:'moving',type:'oscillating',stage:1,x:100,baseX:100,y:220,length:80,thickness:10,angle:Math.PI/2,angularVelocity:0}];Object.assign(e.balls[0],{x:116,y:220,vx:0,vy:0});e.step();assert.ok(e.balls[0].vx>20,'moving wall must impart momentum')})


test('protected physical bypass belts clear every blade and board along their entire route',()=>{
 for(const difficulty of ['easy','normal','hard'])for(const stage of [2,3])for(const intakeX of (stage===2?[502,550,600,650,698]:[942,990,1040,1090,1138])){
 const e=new RaceEngine({groups:groups.slice(0,1),settings:{maxReturns:0,difficulty}});e.start();const b=e.balls[0];Object.assign(b,{stage,route:`stage${stage}`,x:intakeX,y:stage===2?420:155,vy:stage===2?-150:150});e.step();assert.equal(b.route,`bypass${stage}`)
 let ticks=0;while(b.transport&&ticks++<700){e.step();for(const o of [...e.obstacles,...e.gates].filter(o=>o.stage===stage)){
 const ux=Math.cos(o.angle),uy=Math.sin(o.angle),projection=Math.max(-o.length/2,Math.min(o.length/2,(b.x-o.x)*ux+(b.y-o.y)*uy));const d=Math.hypot(b.x-o.x-ux*projection,b.y-o.y-uy*projection);assert.ok(d>=b.radius+o.thickness/2-0.001,`${difficulty} bypass${stage} intersects ${o.id}`)
 }}assert.ok(ticks<700)
 }
})
test('administrator oscillating obstacles using baseX are included and respect configured motion',()=>{const e=new RaceEngine({groups,obstacleSettings:{oscillating:[{id:'custom',baseX:200,y:200,width:120,period:80,range:100}]}});const o=e.obstacles.find(v=>v.id==='custom');assert.ok(o,'baseX obstacle must not be silently discarded');const x=o.x;for(let i=0;i<40;i++)e.step();assert.ok(Math.abs(o.x-x)>20)})
test('both descent stages expose moving rotating collision geometry',()=>{const e=new RaceEngine({groups});for(const stage of [1,3]){const rotating=e.obstacles.find(o=>o.stage===stage&&o.angularVelocity!==0);assert.ok(rotating,`stage${stage} rotating obstacle`);const angle=rotating.angle;e.step();assert.notEqual(rotating.angle,angle)}})

test('confined obstacle contact is observed as a stall and becomes honest stalled DNF',()=>{const e=new RaceEngine({groups:groups.slice(0,1),settings:{maxRaceSeconds:7}});e.start();e.obstacles=[{id:'trap',type:'segment',stage:1,x:160,y:150,length:220,thickness:10,angle:0,angularVelocity:0}];Object.assign(e.balls[0],{x:160,y:120,vx:0,vy:0});for(let i=0;i<841;i++)e.step();const b=e.balls[0];assert.equal(b.stalled,true);assert.ok(b.stallDuration>=5);assert.equal(b.stallReason,'obstacle-contact');assert.equal(b.dnfReason,'stalled');assert.equal(b.arrivalTime,null);assert.equal(e.getRanking()[0].rank,null)})
test('READY and normal moving or captive belt balls do not acquire false stalls',()=>{const e=new RaceEngine({groups:groups.slice(0,1)});for(let i=0;i<800;i++)e.step();assert.equal(e.balls[0].stalled,false);e.start();while(e.status!=='FINISHED'){e.step();assert.equal(e.balls[0].stalled,false)}assert.equal(e.balls[0].dnf,false)})
test('stall observation clears when ordinary gravity escapes a removed obstruction',()=>{const e=new RaceEngine({groups:groups.slice(0,1)});e.start();e.obstacles=[{id:'trap',type:'segment',stage:1,x:160,y:150,length:220,thickness:10,angle:0,angularVelocity:0}];Object.assign(e.balls[0],{x:160,y:120,vx:0,vy:0});for(let i=0;i<730;i++)e.step();assert.equal(e.balls[0].stalled,true);e.obstacles=[];for(let i=0;i<80;i++)e.step();assert.equal(e.balls[0].stalled,false);assert.equal(e.balls[0].stallReason,null);assert.equal(e.balls[0].dnf,false)})
