const nameOf = ball => ball?.groupName || ball?.memberName || '참가 팀'
const active = ball => !ball.dnf && ball.arrivalTime === null
const priority = {attack:1,return:2,arrival:3}

/** Display-only state. Countdown and message expiry always use simulation time. */
export class RaceCommentary {
 constructor(){this.hits=new Map();this.recovered=new Map();this.recent=[];this.sequence=0;this.announcement=''}
 consume(event,engine){
  const find=id=>engine.balls.find(ball=>ball.id===id)
  const attacker=nameOf(find(event.attackerId)),target=nameOf(find(event.targetId)),ball=nameOf(find(event.ballId))
  let title,description,kind='attack'
  if(event.type==='cannon-hit'){
   this.hits.set(event.targetId,{sequence:++this.sequence,attacker})
   this.recovered.delete(event.targetId)
   title='💥 대포 피격!';description=`${target}, ${attacker}의 대포에 맞았습니다!`
  }else if(event.type==='stun-end'){
   this.hits.delete(event.ballId)
   this.recovered.set(event.ballId,{id:event.ballId,description:`✅ ${ball}, 정신 차리고 다시 출발!`,until:engine.elapsed+1})
   this.announcement=`✅ ${ball}, 정신 차리고 다시 출발!`
  }else if(event.type.startsWith('cannon-')){
   title=event.type==='cannon-fire'?'💥 대포 발사!':'💨 대포 빗나감'
   description=`${attacker} → ${target}`
  }else if(event.type.startsWith('hook-')){
   title='🎣 낚싯대 공격!'
   const action={'hook-cast':'낚싯대 발사','hook-hit':'낚아채기','hook-throw':'뒤로 던져졌습니다.','hook-miss':'낚싯대 공격 취소'}[event.type]
   description=`${attacker} → ${target} · ${action || '낚싯대'}`
  }else if(event.type==='return'){
   kind='return';title='↩ 역회전 복귀!'
   const stage=event.fromStage || event.stage
   description=`${ball}, ${stage}단계에서 ${event.toStage || stage-1}단계로 복귀했습니다.`
  }else if(event.type==='arrival'){
   kind='arrival';title='🏁 결승선 도착!'
   description=`${ball}, ${engine.getRanking().find(b=>b.id===event.ballId)?.rank}위로 도착했습니다!`
  }
  if(title){this.recent=[{id:++this.sequence,kind,title,description},...this.recent].slice(0,3);this.announcement=`${title} ${description}`}
 }
 snapshot(engine){
  const stuns=engine.balls.filter(ball=>active(ball)&&ball.stunRemaining>0)
   .sort((a,b)=>(this.hits.get(b.id)?.sequence || 0)-(this.hits.get(a.id)?.sequence || 0))
   .slice(0,3).map(ball=>({id:ball.id,name:nameOf(ball),remaining:ball.stunRemaining,
    count:Math.max(0,Math.ceil(ball.stunRemaining*10-1e-8)),
    description:`${this.hits.get(ball.id)?.attacker || '상대 팀'}의 대포에 맞았습니다!`}))
  for(const [id,recovery] of this.recovered)if(engine.elapsed>=recovery.until || !active(engine.balls.find(b=>b.id===id) || {dnf:true}))this.recovered.delete(id)
  const recoveries=[...this.recovered.values()].reverse().slice(0,3)
  const featured=[...this.recent].sort((a,b)=>priority[a.kind]-priority[b.kind] || b.id-a.id)[0] || null
  return {stuns,recoveries,recent:this.recent,featured,announcement:this.announcement}
 }
}
