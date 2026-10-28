import { RaceEngine } from '../physics/RaceEngine.js'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameState } from '../state/GameContext'
import { soundManager } from '../sounds/SoundManager'
import { RaceRenderer } from './RaceRenderer.js'
import { RaceCommentary } from './RaceCommentary.js'
import Result from './Result'
import './Game.css'

const snapshotOf = (engine,commentary) => {
 const arrivals=engine.getRanking().filter(r=>r.arrivalTime!==null&&!r.dnf).map(r=>({id:r.id,name:r.groupName || r.memberName,rank:r.rank,arrivalTime:r.arrivalTime,imageUrl:r.imageUrl,index:engine.balls.findIndex(ball=>ball.id===r.id)}))
 const ranks=new Map(arrivals.map(r=>[r.id,r.rank]))
 return ({
  status:engine.status, elapsed:engine.elapsed, animation:engine.animationTime, arrivals, commentary:commentary.snapshot(engine), hookCount:engine.chaseAttackSystem?.activeAttacks?.length || 0, projectileCount:engine.chaseAttackSystem?.projectiles?.length || 0,
  balls:engine.balls.map(b=>({id:b.id,rank:ranks.get(b.id),name:b.groupName || b.memberName,imageUrl:b.imageUrl,x:b.x,y:b.y,stage:b.stage,route:b.route,arrivalTime:b.arrivalTime,returns:b.returnCount,dnf:b.dnf,stalled:b.stalled,stunRemaining:b.stunRemaining,attackAttempts:b.attackAttempts || 0,successfulAttacks:b.successfulAttacks || 0,hitCount:b.hitCount || 0,attackState:b.attackState || 'IDLE',attackCooldown:b.attackCooldown || 0})),
})
}
function Arena() {
  const navigate=useNavigate()
  const {groups,settings,obstacleSettings,isShuffled,gameStatus,runId,startGame,prepareGame,resetRace,ranking,setRankingResult,finishGame}=useGameState()
  const [engine]=useState(()=>new RaceEngine({groups,settings,obstacleSettings,isShuffled}))
  const [commentary]=useState(()=>new RaceCommentary())
  const [snapshot,setSnapshot]=useState(()=>snapshotOf(engine,commentary))
  const [muted,setMuted]=useState(!soundManager.enabled)
  const canvasRef=useRef(null)
  useEffect(()=>{
    const canvas=canvasRef.current
    const renderer=new RaceRenderer(canvas,engine)
    let request,previous=null,accumulator=0,lastPaint=0,completed=false
    const animate=time=>{
      if(previous===null)previous=time
      // Fixed physics ticks preserve results across refresh rates and Canvas sizes.
      // A background tab pauses the race instead of dropping simulation steps.
      accumulator+=Math.min((time-previous)/1000,.25);previous=time
      while(accumulator>=1/120){
        engine.step(1/120);accumulator-=1/120
        for(const event of engine.events || []){
          soundManager.playEvent(event.type)
          commentary.consume(event,engine)
        }
      }
      const finishAnimating=renderer.draw(time)
      if(time-lastPaint>70 || (engine.status==='FINISHED'&&!finishAnimating)) {setSnapshot(snapshotOf(engine,commentary));lastPaint=time}
      if(engine.status==='FINISHED'&&!finishAnimating&&!completed){
        completed=true
        const results=engine.getRanking().map(r=>({...r,elapsedTime:engine.elapsed,attackMode:engine.settings.chaseAttack.attackMode}))
        setRankingResult(results);finishGame()
        return
      }
      request=requestAnimationFrame(animate)
    }
    request=requestAnimationFrame(animate)
    return ()=>{cancelAnimationFrame(request);renderer.dispose()}
  },[engine,commentary,setRankingResult,finishGame])
  const depart=()=>{
    if(engine.start()) {soundManager.init();soundManager.playEvent('start');startGame();setSnapshot(snapshotOf(engine,commentary))}
  }
  const back=()=>{resetRace();navigate('/')}
  return <main className="race-game">
    <header className="race-header"><div><p className="race-eyebrow">PHYSICS RACE · THREE STAGES</p><h1>순위 정하기 레이스</h1></div>
      <div className="race-actions"><span className={`race-badge ${snapshot.status.toLowerCase()}`}>{snapshot.status==='READY'?'경기 준비':snapshot.status==='RUNNING'?'경기 진행 중':'경기 종료'}</span>
        <button onClick={()=>{soundManager.toggle();setMuted(!soundManager.enabled)}} aria-pressed={muted}>{muted?'소리 켜기':'소리 끄기'}</button>
        <button onClick={back}>관리자 설정</button></div></header>
    <section className="race-stats"><div><span>경기 시간</span><strong className="race-clock">{snapshot.elapsed.toFixed(2)}초</strong></div><div><span>도착</span><strong>{snapshot.balls.filter(b=>b.arrivalTime!==null).length} / {groups.length}</strong></div><div><span>제한시간</span><strong>{settings.maxRaceSeconds}초</strong></div><div><span>복귀 제한</span><strong>{settings.maxReturns}회</strong></div></section>
    <div className="race-layout"><aside className="team-rail"><section className="team-list" aria-label="참가 팀"><h2>참가 팀</h2><p>접촉 위치와 공격 타이밍에 따라 순위가 달라집니다.</p>
      {snapshot.balls.map((b,i)=><div className="team-progress" key={b.id} data-id={b.id} data-x={b.x.toFixed(2)} data-y={b.y.toFixed(2)} data-stage={b.stage} data-route={b.route} data-stun-remaining={b.stunRemaining} data-attack-attempts={b.attackAttempts} data-attack-state={b.attackState} data-successful-attacks={b.successfulAttacks} data-hit-count={b.hitCount}>
        <TeamToken key={`${b.id}-${b.imageUrl}`} imageUrl={b.imageUrl} index={i} /><div><strong>{b.name}</strong><small>{b.dnf?'DNF · 미완주':b.arrivalTime!==null?`${b.rank}위 · 도착 ${b.arrivalTime.toFixed(2)}초`:`${b.stage}단계 · ${b.stalled?'정체 감지':routeName(b.route)}`} · 복귀 {b.returns}회</small><small className="attack-summary">공격 성공 {b.successfulAttacks}회 · 피격 {b.hitCount}회{b.attackCooldown>0?` · 재사용 ${b.attackCooldown.toFixed(1)}초`:b.attackState!=='IDLE'?` · ${({CASTING:'발사 중',HOOKED:'포획 중',THROWING:'투척 중'})[b.attackState] || '대기 중'}`:''}</small></div></div>)}
      <section className="finish-order" aria-label="실시간 도착 순서"><h3>도착 순서</h3><ol>{snapshot.arrivals.map(b=><li key={b.id} data-id={b.id} data-rank={b.rank}><TeamToken imageUrl={b.imageUrl} index={b.index}/><span className="finish-order-text">{b.rank}위 · {b.name}</span></li>)}</ol></section>
    </section><Commentary view={snapshot.commentary}/></aside><section className="race-board" aria-label="3단계 경기장">
      <div className="stage-headings"><span>01 · 하강 ↓</span><span>02 · 패들 상승 ↑</span><span>03 · 최종 하강 ↓</span><span>도착 순서</span></div>
      <div className="race-canvas-wrap"><canvas ref={canvasRef} className="game-canvas" aria-label="하강, 컨베이어, 상승, 최종 하강 경기장과 도착 순서" data-status={snapshot.status} data-animation={snapshot.animation.toFixed(2)} data-finish-count={snapshot.arrivals.length} data-hook-count={snapshot.hookCount} data-projectile-count={snapshot.projectileCount} width={engine.width} height={engine.height}/>
        {snapshot.status==='READY'&&<div className="ready-panel"><span>READY</span><h2>모든 팀, 출발 준비 완료</h2><p>장애물은 움직이고 있습니다. 원하는 순간에 출발하세요.</p><button onClick={depart}>출발</button></div>}
      </div>
      <div className="race-legend"><span>하강 구간</span><span>상승 보조 기류 + 회전 패들</span><span>보라색: 복귀 벨트 · 점선: 보호 우회로</span></div>
    </section></div>
    <p className="race-note">준비 중에는 시간이 측정되지 않습니다. 탭이 비활성화되어 화면 갱신이 멈추면 시뮬레이션도 일시 정지합니다. 제한시간은 실제 시뮬레이션 진행 시간 기준입니다.</p>
    {gameStatus==='FINISHED'&&ranking.length>0&&<Result ranking={ranking} groups={groups} onReplay={()=>prepareGame()} onClose={back} runId={runId}/>}
  </main>
}
function Commentary({view}){
 return <section className="race-commentary" aria-label="실시간 경기 해설">
  <h2>🎙 실시간 경기 해설</h2>
  <p className="commentary-alert" role="status" aria-live="polite" aria-atomic="true">{view.announcement}</p>
  <div className="commentary-current race-announcement">
   {view.stuns.map(stun=><article className="stun-card" key={stun.id} data-id={stun.id}>
    <h3>💥 대포 피격!</h3><strong>{stun.name}</strong><p>{stun.description}</p>
    <div className="stun-countdown" aria-label={`${stun.name} 회복까지 ${stun.remaining.toFixed(1)}초`}>😵 회복까지 <b>{stun.count}</b><small>{stun.remaining.toFixed(1)}초 · 0.1초 단위</small></div>
   </article>)}
   {view.recoveries.map(recovery=><p className="recovery-message" key={recovery.id}>{recovery.description}</p>)}
   {!view.stuns.length&&!view.recoveries.length&&(view.featured?<article className="event-featured"><h3>{view.featured.title}</h3><p>{view.featured.description}</p></article>:<p className="commentary-idle">출발하면 공격·복귀·도착 상황을 알려드립니다.</p>)}
  </div>
  <h3 className="recent-heading">최근 이벤트</h3><ol className="commentary-recent">{view.recent.map(event=><li key={event.id}><strong>{event.title}</strong><span>{event.description}</span></li>)}</ol>
 </section>
}
function TeamToken({imageUrl,index}) {
  const [failed,setFailed]=useState(false)
  return <span className="team-token" style={{background:`hsl(${index*137.5%360} 65% 52%)`}}>{imageUrl&&!failed?<img src={imageUrl} alt="" onError={()=>setFailed(true)}/>:index+1}</span>
}
function routeName(route){return ({conveyor:'컨베이어',top:'상단 연결',return2:'1단계 복귀 벨트',return3:'2단계 복귀 벨트',bypass2:'정상 우회로',bypass3:'정상 우회로'})[route] || '이동 중'}
export default function Game(){
 const {hydrated,gameStatus,runId}=useGameState();const navigate=useNavigate()
 if(!hydrated)return <main className="game idle-screen"><p>저장된 설정을 불러오는 중...</p></main>
 if(gameStatus==='IDLE'||!runId)return <main className="game idle-screen"><h2>경기를 준비해 주세요.</h2><p>관리자 화면에서 팀을 등록한 뒤 경기 준비를 누르세요.</p><button onClick={()=>navigate('/')}>관리자 화면으로</button></main>
 return <Arena key={runId}/>
}
