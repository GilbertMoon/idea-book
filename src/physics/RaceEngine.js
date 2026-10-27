const FIXED_DT = 1 / 120
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const point = (x,y) => ({x,y})
/** Logical pixels and seconds. Balls intentionally do not collide with one another,
 * matching the old engine. Every transport motor applies identical contact rules. */
export class RaceEngine {
  constructor({groups=[],settings={},obstacleSettings=[],isShuffled=false}={}) {
    this.width=1200;this.height=820;this.status='READY';this.animationTime=0;this.elapsed=0;this.accumulator=0
    this.settings={difficulty:'normal',gatesEnabled:true,stage2Gate:true,stage3Gate:true,maxReturns:2,returnCooldown:1,maxRaceSeconds:90,...settings}
    this.settings.maxReturns=Math.round(clamp(Number(this.settings.maxReturns)||0,0,10))
    this.settings.returnCooldown=clamp(Number(this.settings.returnCooldown)||0,0,30)
    this.settings.maxRaceSeconds=clamp(Number(this.settings.maxRaceSeconds)||90,0.01,600)
    this.lanes=[{stage:1,left:50,right:270,top:80,bottom:700},{stage:2,left:490,right:710,top:80,bottom:700},{stage:3,left:930,right:1150,top:80,bottom:700}]
    this.finishY=700
    this.routes=[
      {id:'conveyor',points:[point(160,720),point(600,720),point(600,700)]},
      {id:'top',points:[point(600,90),point(1040,90),point(1040,140)]},
      {id:'return2',points:[point(500,300),point(380,300),point(380,50),point(160,50),point(160,110)]},
      {id:'return3',points:[point(940,280),point(820,280),point(820,760),point(600,760),point(600,700)]},
      {id:'bypass2',points:[point(690,420),point(690,200),point(600,200)]},
      {id:'bypass3',points:[point(1170,150),point(1170,390),point(1040,390)]},
    ].map(r=>({...r,width:40,mechanical:true}))
    this.obstacles=[]
    for(const stage of [1,3]) {
      const cx=stage===1?160:1040
      for(let i=0;i<4;i++)this.obstacles.push({id:`s${stage}-${i}`,type:i===2?'oscillating':'segment',stage,x:cx+(i%2?42:-42),baseX:cx+(i%2?42:-42),y:stage===3?[175,460,555,650][i]:190+i*112,length:155,thickness:9,angle:i%2?-0.43:0.43,angularVelocity:0})
    }
    this.obstacles=this.obstacles.filter(o=>o.id!=='s3-0')
    for(let i=0;i<3;i++)this.obstacles.push({id:`p${i}`,type:'paddle',stage:2,x:600+(i%2?64:-64),y:[650,580,510][i],length:125,thickness:10,angle:i*1.4,angularVelocity:i%2?-2.2:2.2})
    this.obstacles.push({id:'rotor1',type:'paddle',stage:1,x:90,y:640,length:60,thickness:8,angle:0,angularVelocity:1.6},{id:'rotor3',type:'paddle',stage:3,x:970,y:400,length:60,thickness:8,angle:0,angularVelocity:-1.6})
    // User obstacles retain their type and get translated from the former 800x600 board.
    const custom=Array.isArray(obstacleSettings)?obstacleSettings:Object.entries(obstacleSettings??{}).flatMap(([type,list])=>Array.isArray(list)?list.map(o=>({...o,type})):[])
    for(const o of custom) {
      const sourceX=o.x??o.baseX;if(!Number.isFinite(sourceX)||!Number.isFinite(o.y))continue
      this.obstacles.push({id:o.id,type:o.type==='rotating'?'paddle':o.type==='oscillating'?'oscillating':'segment',stage:1,x:70+sourceX/800*180,baseX:70+sourceX/800*180,y:130+o.y/600*500,length:clamp(o.width??(Number.isFinite(o.radius)?o.radius*2:80),25,120),thickness:8,angle:o.angle??0,amplitude:clamp((o.range??80)/800*180,0,35),frequency:Math.PI*120/clamp(o.period??80,20,600),angularVelocity:o.type==='rotating'?clamp((o.speed??.025)*60,-4,4):0})
    }
    const gateLength=this.settings.difficulty==='easy'?100:this.settings.difficulty==='hard'?145:125
    const speed=this.settings.difficulty==='hard'?3:this.settings.difficulty==='easy'?1.4:2.1
    this.gates=[{id:'gate2',type:'gate',stage:2,x:555,y:300,length:gateLength,thickness:10,angle:0,angularVelocity:-speed},{id:'gate3',type:'gate',stage:3,x:1060,y:280,length:gateLength,thickness:10,angle:0,angularVelocity:-speed}]
    const ordered=[...groups]
    if(isShuffled)for(let i=ordered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]]}
    this.balls=ordered.map((g,i)=>({id:g.id,groupId:g.id,groupName:g.name,memberName:g.name??g.members?.[0]?.name,imageUrl:g.members?.[0]?.imageUrl??g.members?.[0]?.photo??null,x:72+(i+0.5)/Math.max(1,ordered.length)*176,y:105,radius:12,vx:0,vy:0,stage:1,route:'stage1',arrivalTime:null,collisionCount:0,returnFromStage2:0,returnFromStage3:0,returnCount:0,dnf:false,stalled:false,stallDuration:0,stallReason:null,returnCooldown:0,lastGateContact:null}))
    this.events=[]
  }
  start(){if(this.status!=='READY')return false;this.status=this.balls.length?'RUNNING':'FINISHED';return true}
  step(dt=FIXED_DT){
    if(!Number.isFinite(dt)||dt<=0)return
    this.events=[];this.accumulator+=Math.min(dt,0.25)
    while(this.accumulator+1e-10>=FIXED_DT){this.accumulator-=FIXED_DT;this.tick(FIXED_DT)}
  }
  tick(dt){
    if(this.status==='FINISHED')return
    this.animationTime+=dt
    for(const o of [...this.obstacles,...this.gates]){o.angle+=o.angularVelocity*dt;if(o.type==='oscillating'){const previousX=o.x;o.x=o.baseX+Math.sin(this.animationTime*(o.frequency??1.7))*(o.amplitude??18);o.velocityX=(o.x-previousX)/dt}}
    if(this.status!=='RUNNING')return
    const before=this.elapsed;this.elapsed+=dt
    for(const b of this.balls){
      if(b.arrivalTime!==null||b.dnf)continue
      b.returnCooldown=Math.max(0,b.returnCooldown-dt)
      if(b.transport){this.moveTransport(b,dt);continue}
      const py=b.y
      // The ascent has an identical bounded air-lift motor for all balls.
      // Paddles still impart their true rotating surface velocity at contact.
      b.vy+=(b.stage===2?-400:450)*dt
      b.vx*=Math.exp(-0.5*dt)
      b.vx=clamp(b.vx,-260,260);b.vy=clamp(b.vy,-240,300)
      b.x+=b.vx*dt;b.y+=b.vy*dt
      const lane=this.lanes[b.stage-1]
      if(b.x<lane.left+b.radius){b.x=lane.left+b.radius;b.vx=Math.abs(b.vx)*0.65;b.collisionCount++;b.lastContactReason='boundary'}
      if(b.x>lane.right-b.radius){b.x=lane.right-b.radius;b.vx=-Math.abs(b.vx)*0.65;b.collisionCount++;b.lastContactReason='boundary'}
      if(b.y<105&&b.stage!==2){b.y=105;b.vy=Math.abs(b.vy)}
      for(const o of this.obstacles)if(o.stage===b.stage)this.collide(b,o)
      const gate=this.gates.find(g=>g.stage===b.stage)
      if(gate&&this.gateEnabled(gate)){
        const protectedBall=b.returnCount>=this.settings.maxReturns||b.returnCooldown>0
        if(protectedBall&&((b.stage===2&&b.y<435&&b.y>405)||(b.stage===3&&b.y>150&&b.y<170))){this.transport(b,`bypass${b.stage}`);continue}
        const contact=this.collide(b,gate)
        if(contact){b.lastGateContact={stage:b.stage,time:this.elapsed,normalX:contact.nx,normalY:contact.ny}
          // Only an actual leftwards outgoing impulse can engage the return belt.
          if(!protectedBall&&contact.impactApplied&&b.vx < -35&&contact.nx< -0.15){const stage=b.stage;b.returnCount++;b[`returnFromStage${stage}`]++;b.returnCooldown=0;this.transport(b,`return${stage}`);this.events.push({type:'return',ballId:b.id,stage,fromStage:stage,toStage:stage-1});continue}
        }
      }
      if(b.stage===1&&b.y>=680)this.transport(b,'conveyor')
      else if(b.stage===2&&b.y<=110)this.transport(b,'top')
      else if(b.stage===3&&b.y+b.radius>=this.finishY){const fraction=clamp((this.finishY-b.radius-py)/(b.y-py),0,1);b.arrivalTime=before+fraction*dt;b.y=this.finishY-b.radius;b.vx=0;b.vy=0;this.events.push({type:'arrival',ballId:b.id})}
    }
    for(const b of this.balls)this.observeProgress(b)
    if(this.elapsed+1e-8>=this.settings.maxRaceSeconds)for(const b of this.balls)if(b.arrivalTime===null){b.dnf=true;b.dnfReason=b.stalled?'stalled':'time-limit'}
    if(this.balls.every(b=>b.arrivalTime!==null||b.dnf))this.status='FINISHED'
  }
  observeProgress(b){
    if(b.transport||b.arrivalTime!==null){b.stalled=false;b.stallDuration=0;b.stallReason=null;b.progressAnchor=null;return}
    const anchor=b.progressAnchor
    if(!anchor||Math.hypot(b.x-anchor.x,b.y-anchor.y)>14){b.progressAnchor={x:b.x,y:b.y,time:this.elapsed};b.stalled=false;b.stallDuration=0;b.stallReason=null;return}
    b.stallDuration=this.elapsed-anchor.time
    b.stalled=b.stallDuration>=5
    b.stallReason=b.stalled?(b.lastContactReason??'confined-motion'):null
  }
  gateEnabled(g){return this.settings.gatesEnabled&&this.settings[`stage${g.stage}Gate`]}
  transport(b,id){b.route=id;b.transport={id,index:0,start:{x:b.x,y:b.y}};b.vx=0;b.vy=0}
  moveTransport(b,dt){
    const route=this.routes.find(r=>r.id===b.transport.id);const p=route.points[b.transport.index]
    const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy),travel=230*dt
    if(d<=travel){b.x=p.x;b.y=p.y;b.transport.index++;if(b.transport.index===route.points.length){const id=route.id;b.transport=null;if(id==='conveyor'||id==='return3')b.stage=2;else if(id==='top')b.stage=3;else if(id==='return2')b.stage=1;if(id==='return2'||id==='return3')b.returnCooldown=this.settings.returnCooldown;b.route=`stage${b.stage}`;b.vx=0;b.vy=b.stage===2?-80:80}}
    else{b.vx=dx/d*230;b.vy=dy/d*230;b.x+=b.vx*dt;b.y+=b.vy*dt}
  }
  collide(b,o){
    const ux=Math.cos(o.angle),uy=Math.sin(o.angle),dx=b.x-o.x,dy=b.y-o.y
    const t=clamp(dx*ux+dy*uy,-o.length/2,o.length/2)
    const cx=o.x+ux*t,cy=o.y+uy*t,rx=b.x-cx,ry=b.y-cy,d=Math.hypot(rx,ry),r=b.radius+o.thickness/2
    if(d>=r)return null
    b.lastContactReason='obstacle-contact'
    const nx=d>1e-9?rx/d:-uy,ny=d>1e-9?ry/d:ux
    // Continuous substeps keep overlap small; contact depenetration is bounded.
    const correction=Math.min(r-d,3)
    b.x+=nx*correction;b.y+=ny*correction
    const sx=-(cy-o.y)*o.angularVelocity+(o.velocityX??0),sy=(cx-o.x)*o.angularVelocity
    const vn=(b.vx-sx)*nx+(b.vy-sy)*ny
    if(vn<0){b.vx-=1.35*vn*nx;b.vy-=1.35*vn*ny;b.vx=clamp(b.vx,-300,300);b.vy=clamp(b.vy,-350,350);b.collisionCount++;this.events.push({type:o.type==='paddle'?'paddle':'collision',ballId:b.id})}
    return {nx,ny,impactApplied:vn<0}
  }
  getRanking(){
    const sorted=[...this.balls].sort((a,b)=>(a.arrivalTime??Infinity)-(b.arrivalTime??Infinity))
    let rank=0,previous=null
    return sorted.map((b,i)=>{if(b.arrivalTime!==null){if(previous===null||Math.abs(b.arrivalTime-previous)>1e-6)rank=i+1;previous=b.arrivalTime}return {...b,rank:b.arrivalTime===null?null:rank}})
  }
}
export default RaceEngine
