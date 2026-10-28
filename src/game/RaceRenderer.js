import { HookRenderer } from './HookRenderer.js'
import { FinishLineDisplay, FINISH_LAYOUT, RACE_DISPLAY_SCALE } from './FinishLineDisplay.js'
const colors={background:'#0b1023',lane:'#172139',line:'#3f567c',blue:'#53c9ff',green:'#6de7ba',purple:'#bd8bff',gold:'#ffc76c'}
export class RaceRenderer {
 constructor(canvas,engine){this.canvas=canvas;this.engine=engine;this.images=new Map();this.ctx=canvas.getContext('2d');this.dpr=0;this.hooks=new HookRenderer(this.ctx,engine);this.finishDisplay=new FinishLineDisplay()}
 dispose(){this.images.clear()}
 draw(time=0){
  const e=this.engine,ctx=this.ctx,ratio=Math.min(window.devicePixelRatio||1,3)
  if(this.dpr!==ratio){this.dpr=ratio;this.canvas.width=e.width*ratio;this.canvas.height=e.height*ratio;this.canvas.style.aspectRatio=`${e.width} / ${e.height}`}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,e.width,e.height);ctx.fillStyle=colors.background;ctx.fillRect(0,0,e.width,e.height)
  ctx.save();ctx.scale(RACE_DISPLAY_SCALE,RACE_DISPLAY_SCALE)
  for(const lane of e.lanes || []){
   ctx.fillStyle=colors.lane;ctx.fillRect(lane.left,lane.top,lane.right-lane.left,lane.bottom-lane.top)
   ctx.strokeStyle=colors.line;ctx.lineWidth=3
   // Mouths are open where captive belts enter/leave the lanes.
   const openings = lane.stage===2 ? {left:[[240,355]],right:[[70,125]]} : lane.stage===3 ? {left:[[70,135],[195,365]],right:[[125,425]]} : {left:[],right:[]}
   for (const side of ['left','right']) {
     let cursor=lane.top
     for(const [start,end] of openings[side]) {ctx.beginPath();ctx.moveTo(lane[side],cursor);ctx.lineTo(lane[side],Math.max(cursor,start));ctx.stroke();cursor=Math.max(cursor,end)}
     ctx.beginPath();ctx.moveTo(lane[side],cursor);ctx.lineTo(lane[side],lane.bottom);ctx.stroke()
   }
   ctx.save();ctx.beginPath();ctx.rect(lane.left,lane.top,lane.right-lane.left,lane.bottom-lane.top);ctx.clip()
   ctx.fillStyle=lane.stage===2?'#6de7ba18':'#53c9ff0c'
   for(let y=lane.top;y<lane.bottom;y+=50){const offset=e.animationTime*(lane.stage===2?-35:25)%50;ctx.fillRect(lane.left,y+offset,lane.right-lane.left,5)}
   if(lane.stage===2){ctx.font='24px system-ui';ctx.textAlign='center';ctx.fillStyle='#6de7ba35';for(let y=lane.top+40;y<lane.bottom;y+=85)ctx.fillText('↑ ↑ ↑',(lane.left+lane.right)/2,y)}
   ctx.restore()
  }
  for(const route of e.routes || []) this.drawRoute(route)
  for(const b of e.balls) if(b.transport?.start) {
    const route=e.routes.find(r=>r.id===b.transport.id)
    if(route) this.drawRoute({...route,points:[b.transport.start,route.points[0]],id:`mouth-${route.id}`})
  }
  for(const o of e.obstacles || [])this.drawObstacle(o)
  for(const gate of e.gates || [])if(e.gateEnabled ? e.gateEnabled(gate) : true)this.drawObstacle(gate)
  // Start rack is released as a whole, never one team at a time.
  if(e.status==='READY'){ctx.strokeStyle=colors.green;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(60,120);ctx.lineTo(260,120);ctx.stroke()}
  ctx.textAlign='left';ctx.font='bold 13px system-ui';ctx.fillStyle=colors.green;ctx.fillText('START',58,72)
  ctx.fillStyle=colors.gold;ctx.fillText('FINISH',935,737)
  for(let i=0;i<14;i++){ctx.fillStyle=i%2?'#e8f1ff':'#293449';ctx.fillRect(930+i*220/14,e.finishY || 700,220/14,10)}
  e.balls.forEach((b,i)=>{if(b.arrivalTime===null)this.drawBall(b,i)})
  this.hooks.draw()
  this.drawCannon()
  ctx.restore()
  const finished=this.finishDisplay.update(e.getRanking(),time)
  this.drawFinished(finished)
  return finished.some(entry=>entry.progress<1)
 }
 drawFinished(finished){
  const ctx=this.ctx
  ctx.save();ctx.fillStyle='#111c30';ctx.fillRect(FINISH_LAYOUT.left,FINISH_LAYOUT.top,this.engine.width-FINISH_LAYOUT.left,this.engine.height-FINISH_LAYOUT.top)
  ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(FINISH_LAYOUT.left,FINISH_LAYOUT.top);ctx.lineTo(FINISH_LAYOUT.left,this.engine.height);ctx.stroke()
  ctx.fillStyle=colors.gold;ctx.textAlign='center';ctx.font='bold 14px system-ui';ctx.fillText('도착 순서',1080,80)
  ctx.restore()
  for(const entry of finished){
   const index=this.engine.balls.findIndex(ball=>ball.id===entry.ball.id)
   this.drawBall({...entry.ball,x:entry.x,y:entry.y,radius:FINISH_LAYOUT.radius},index,`${entry.rank}위`,true)
   if(entry.progress<1){
    ctx.save();ctx.globalAlpha=(1-entry.progress)*.7;ctx.strokeStyle=colors.gold;ctx.lineWidth=2
    ctx.beginPath();ctx.arc(entry.x,entry.y,FINISH_LAYOUT.radius+4+entry.progress*8,0,Math.PI*2);ctx.stroke();ctx.restore()
   }
  }
 }
 drawCannon(){
  const e=this.engine,ctx=this.ctx,system=e.chaseAttackSystem
  if(!system||e.status!=='RUNNING'||e.settings.chaseAttack.attackMode!=='cannon')return
  for(const shot of system.projectiles){
   ctx.save();ctx.strokeStyle='#ffae52';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(shot.previousX??shot.x,shot.previousY??shot.y);ctx.lineTo(shot.x,shot.y);ctx.stroke()
   ctx.fillStyle='#ffdc78';ctx.beginPath();ctx.arc(shot.x,shot.y,shot.radius,0,Math.PI*2);ctx.fill();ctx.restore()
  }
  if(!e.settings.chaseAttack.animationEnabled)return
  for(const flash of system.flashes){
   ctx.save();ctx.globalAlpha=Math.min(1,flash.time*5);ctx.translate(flash.x,flash.y)
   if(flash.type==='fire'){ctx.rotate(flash.angle);ctx.fillStyle='#a5afc5';ctx.fillRect(7,-4,15,8);ctx.fillStyle='#ffd770';ctx.beginPath();ctx.arc(24,0,5,0,Math.PI*2);ctx.fill()}
   else{
    ctx.strokeStyle='#ffb467';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,7+(0.25-flash.time)*55,0,Math.PI*2);ctx.stroke()
    const progress=Math.min(1,(.25-flash.time)/.12)
    if(progress<1){ctx.fillStyle='#ffdc78';ctx.beginPath();ctx.arc((flash.startX-flash.x)*(1-progress),(flash.startY-flash.y)*(1-progress),5,0,Math.PI*2);ctx.fill()}
   }
   ctx.restore()
  }
  for(const ball of e.balls){
   if(ball.dnf||ball.arrivalTime!==null)continue
   const fade=ball.stunRemaining>0?1:Math.max(0,1-(e.settings.chaseAttack.hitProtection-ball.hitProtection)/.25)
   if(ball.stunRemaining>0||(ball.hitProtection>0&&fade>0)){
    ctx.save();ctx.globalAlpha=fade;ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe677'
    for(let i=0;i<3;i++){const angle=e.animationTime*5+i*Math.PI*2/3;ctx.fillText('★',ball.x+Math.cos(angle)*15,ball.y-ball.radius-12+Math.sin(angle)*4)}
    ctx.restore()
   }
   if(ball.stunRemaining<=0&&ball.hitProtection>0&&e.settings.chaseAttack.attackMode==='cannon'){
    ctx.save();ctx.strokeStyle='#78f3c6';ctx.globalAlpha=Math.min(1,ball.hitProtection*2);ctx.lineWidth=2;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.radius+6,0,Math.PI*2);ctx.stroke();ctx.restore()
   }
  }
 }
 drawRoute(route){
  const ctx=this.ctx,isReturn=route.id.includes('return'),isBypass=route.id.includes('bypass')
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();route.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineWidth=route.width || 40;ctx.strokeStyle=isReturn?'#5c3b76':isBypass?'#21493e':'#34414d';ctx.stroke();ctx.lineWidth=(route.width||40)-8;ctx.strokeStyle=isReturn?'#291d42':'#192a30';ctx.stroke()
  ctx.setLineDash(isBypass?[7,10]:[3,13]);ctx.lineDashOffset=-this.engine.animationTime*50;ctx.strokeStyle=isReturn?colors.purple:isBypass?colors.green:colors.gold;ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([])
  for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));ctx.strokeStyle=isReturn?colors.purple:colors.gold;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(2,0);ctx.lineTo(-6,6);ctx.stroke();ctx.restore()}
  const p=route.points[0];ctx.font='11px system-ui';ctx.fillStyle=isReturn?colors.purple:colors.gold;ctx.textAlign='center';ctx.fillText(({conveyor:'컨베이어 →',top:'상단 연결 →',return2:'2 → 1 복귀 리프트',return3:'3 → 2 복귀 벨트',bypass2:'보호 우회로',bypass3:'보호 우회로'})[route.id] || '',p.x,p.y+30);ctx.restore()
 }
 drawObstacle(o){
  const ctx=this.ctx,gate=o.type==='gate',paddle=o.type==='paddle',angle=o.angle || 0,length=o.length || o.width || 60
  ctx.save();ctx.translate(o.x,o.y);ctx.rotate(angle);ctx.lineCap='round';ctx.lineWidth=o.thickness || 9;ctx.strokeStyle=gate?colors.purple:paddle?colors.green:o.type==='oscillating'?colors.gold:colors.blue
  ctx.beginPath();ctx.moveTo(-length/2,0);ctx.lineTo(length/2,0);ctx.stroke()
  if(paddle||gate){ctx.fillStyle='#e8f1ff';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill()}
  ctx.restore()
 }
 drawBall(b,index,label=String(index+1).padStart(2,'0'),finished=false){
  const ctx=this.ctx,r=b.radius||12;ctx.save();ctx.globalAlpha=b.dnf?.45:finished?1:b.arrivalTime!==null?.65:1
  ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);ctx.fillStyle=`hsl(${index*137.5%360} 65% 52%)`;ctx.fill()
  if(b.imageUrl){let img=this.images.get(b.imageUrl);if(!img){img=new Image();img.src=b.imageUrl;this.images.set(b.imageUrl,img)}if(img.complete&&img.naturalWidth){ctx.save();ctx.clip();ctx.drawImage(img,b.x-r,b.y-r,r*2,r*2);ctx.restore()}}
  ctx.strokeStyle='#f4f8ff';ctx.lineWidth=1.5;ctx.stroke();ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(label,b.x,b.y-r-7)
  if(!finished&&b.returnCooldown>0){ctx.strokeStyle=colors.purple;ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,r+5,0,Math.PI*2);ctx.stroke()}
  ctx.restore()
 }
}
