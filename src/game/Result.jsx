import { useEffect, useState, useMemo } from 'react'
import { useGameState } from '../state/GameContext'
import { soundManager } from '../sounds/SoundManager'
import { slackService, arrivalSeconds } from '../services/SlackService'
import './Result.css'

function Result({ ranking, groups, onClose, onReplay }) {
  const { runId, setSlackSentStatus, slackSettings } = useGameState()
  const [slackStatus, setSlackStatus] = useState(null)
  const [resultTimestamp] = useState(()=>new Date().toLocaleString('ko-KR'))
  const [brokenPhotos,setBrokenPhotos] = useState({})
  const payload = useMemo(()=>({runId,attackMode:ranking[0]?.attackMode,groupNames:groups.map(g=>g.name),ranking:ranking.map(entry=>({...entry,groupName:groups.find(g=>g.id===entry.groupId)?.name || entry.groupName})),totalTime:Math.max(0,...ranking.map(r=>r.elapsedTime || arrivalSeconds(r) || 0)),resultTimestamp}),[runId,groups,ranking,resultTimestamp])
  useEffect(() => {
    let active = true
    soundManager.init(); soundManager.playEvent('result')
    slackService.setWebhookUrl(slackSettings?.url || '')
    if (!slackService.hasWebhookUrl()) return
    slackService.sendResult(payload).then(result=>{if(active){setSlackStatus(result);setSlackSentStatus(result.success)}})
    return ()=>{active=false}
  }, [payload,slackSettings?.url,setSlackSentStatus])
  const retry = async () => {
    setSlackStatus(null)
    const result=await slackService.sendResult(payload,{retry:true})
    setSlackStatus(result);setSlackSentStatus(result.success)
  }
  return <div className="result-overlay"><div className="result-modal" role="dialog" aria-modal="true" aria-label="경기 결과">
    <div className="result-header"><h2>🎉 발표 순서 확정!</h2><button className="close-btn" onClick={onClose}>닫기</button></div>
    <div className="result-body"><div className="result-section"><h3>최종 순위</h3><div className="ranking-table">
      {ranking.map(entry=>{
        const group=groups.find(g=>g.id===entry.groupId)
        const seconds=arrivalSeconds(entry)
        const dnf=entry.dnf || entry.rank == null
        const shared=!dnf && ranking.filter(r=>r.rank===entry.rank).length>1
        const image=brokenPhotos[entry.groupId] ? null : entry.imageUrl || group?.members?.find(m=>m.imageUrl)?.imageUrl
        return <div key={entry.ballId || entry.id || entry.groupId} className={`ranking-row rank-${entry.rank}`}>
          <div className="rank-number">{dnf?'DNF':entry.rank}</div>
          <div className="rank-ball">{image?<img src={image} alt="" className="rank-avatar" onError={()=>setBrokenPhotos(prev=>({...prev,[entry.groupId]:true}))}/>:<div className="rank-avatar-placeholder">{(group?.name || entry.memberName || '?')[0]}</div>}</div>
          <div className="rank-info"><div className="rank-name">{group?.name || entry.groupName || entry.memberName || '미지정'} {shared?'(공동 순위)':''}</div>
            <div className="rank-group">{dnf?`미완주: ${({'time-limit':'경기 제한시간 초과',timeout:'경기 제한시간 초과',stalled:'진행 불가'})[entry.dnfReason] || entry.dnfReason || '시간 초과'}`:seconds==null?'—':`${seconds.toFixed(2)}초`}</div>
            <div className="rank-group">충돌 {entry.collisionCount ?? 0}회 · 복귀 2→1: {entry.returnFromStage2 ?? 0}회 · 3→2: {entry.returnFromStage3 ?? 0}회</div>
            <div className="rank-group">공격 시도: {entry.attackAttempts ?? 0}회 · {entry.attackMode==='cannon'?'발사':'포획'}: {entry.attackCount ?? 0}회 · 성공: {entry.successfulAttacks ?? 0}회 · 피격: {entry.hitCount ?? 0}회</div>
            <div className="rank-group">대포 발사: {entry.cannonFired ?? 0}회 · 대포 명중: {entry.cannonHits ?? 0}회 · 기절 피해: {entry.stunCount ?? 0}회 ({(entry.totalStunTime ?? 0).toFixed(2)}초) · 낚싯대 성공: {entry.hookHits ?? 0}회</div>
            <div className="rank-group">단계별 공격 성공 1단계: {entry.attacksByStage?.[1] ?? 0}회 · 2단계: {entry.attacksByStage?.[2] ?? 0}회 · 3단계: {entry.attacksByStage?.[3] ?? 0}회</div>
          </div></div>
      })}
    </div></div><div className="result-section slack-section"><h3>Slack 전송</h3>
      <p className="slack-description">경기마다 한 번 자동 전송합니다. 실패한 경우에만 수동 재전송할 수 있습니다.</p>
      {!slackSettings?.url?<p>Slack 웹훅 미설정: 전송하지 않았습니다.</p>:slackStatus===null?<p role="status">Slack 전송 중...</p>:<><div role="status" className={`slack-status ${slackStatus.success?'success':'error'}`}>{slackStatus.message}</div>{!slackStatus.success&&<button className="send-slack-btn" onClick={retry}>Slack 재전송</button>}</>}
    </div></div><div className="result-footer">{onReplay&&<button className="close-btn primary" onClick={onReplay}>다시 경기하기</button>} <button className="close-btn" onClick={onClose}>관리자 화면</button></div>
  </div></div>
}
export default Result
