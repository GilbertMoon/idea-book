// User supplied text cannot create Slack mentions, links, or formatting.
const safeText = value => String(value ?? '').replace(/https:\/\/hooks\.slack(?:-gov)?\.com\/\S+/gi, '[비밀 URL 숨김]').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[*_~`]/g, '')
export const arrivalSeconds = entry => Number.isFinite(entry.arrivalTime) ? entry.arrivalTime : Number.isFinite(entry.arrivalFrame) ? entry.arrivalFrame / 60 : null
export class SlackService {
  constructor() { this.webhookUrl = ''; this.runs = new Map() }
  setWebhookUrl(url) { this.webhookUrl = String(url || '').trim() }
  hasWebhookUrl() { return Boolean(this.webhookUrl) }
  sendResult(data, {retry = false} = {}) {
    const key = data.runId || 'legacy'
    const previous = this.runs.get(key)
    if (previous && (!retry || previous.pending || previous.result?.success)) return previous.promise
    const record = {pending:true}
    record.promise = this.postResult(data).then(result => { record.pending=false; record.result=result; return result })
    this.runs.set(key, record)
    return record.promise
  }
  async postResult(data) {
    if (!this.hasWebhookUrl()) return {success:false,message:'Slack 웹훅 URL이 설정되지 않았습니다.'}
    try {
      const response = await fetch(this.webhookUrl, {method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},signal:AbortSignal.timeout(10000),body:JSON.stringify(this.buildPayload(data))})
      if (response.type === 'opaque' || response.type === 'opaqueredirect') return {success:false,message:'Slack 응답을 확인할 수 없습니다. 브라우저 CORS 제한을 확인하세요.'}
      if (!response.ok) return {success:false,message:`Slack 전송 실패 (HTTP ${Number(response.status) || 0}). 웹훅 설정을 확인하세요.`}
      if ((await response.text()).trim() !== 'ok') return {success:false,message:'Slack에서 전송 성공을 확인하지 못했습니다.'}
      return {success:true,message:'Slack 전송 완료'}
    } catch {
      return {success:false,message:'Slack 전송을 확인하지 못했습니다. 네트워크·CORS 제한 또는 시간 초과를 확인하세요. 수동 재전송 시 중복 도착할 수 있습니다.'}
    }
  }
  buildPayload(data) {
    const blocks = [
      {type:'header',text:{type:'plain_text',text:'🎲 조별 발표 순서 확정'}},
      {type:'section',text:{type:'mrkdwn',text:`*일시:* ${safeText(data.resultTimestamp)}\n*총 소요 시간:* ${(Number(data.totalTime)||0).toFixed(2)}초\n*공격 방식:* ${safeText(({cannon:'대포',hook:'낚싯대',off:'사용 안 함'})[data.attackMode] || '미지정')}`}},
      {type:'divider'}, {type:'section',text:{type:'mrkdwn',text:'*최종 순위*'}},
    ]
    for (const entry of data.ranking || []) {
      const seconds = arrivalSeconds(entry)
      const label = entry.dnf || entry.rank == null ? 'DNF (미완주)' : `${entry.rank}등`
      blocks.push({type:'section',text:{type:'mrkdwn',text:`*${label}* · ${safeText(entry.groupName || entry.memberName || '미지정')}\n${entry.dnf ? `사유: ${safeText(({'time-limit':'경기 제한시간 초과',timeout:'경기 제한시간 초과',stalled:'진행 불가'})[entry.dnfReason] || entry.dnfReason || '시간 초과')}` : `소요: ${seconds == null ? '—' : seconds.toFixed(2)+'초'}`} · 충돌: ${Number(entry.collisionCount)||0}회\n복귀 2→1: ${Number(entry.returnFromStage2)||0}회 · 3→2: ${Number(entry.returnFromStage3)||0}회\n공격 시도: ${Number(entry.attackAttempts)||0}회 · ${data.attackMode==='cannon'?'발사':'포획'}: ${Number(entry.attackCount)||0}회 · 성공: ${Number(entry.successfulAttacks)||0}회 · 피격: ${Number(entry.hitCount)||0}회\n대포 발사: ${Number(entry.cannonFired)||0}회 · 명중: ${Number(entry.cannonHits)||0}회 · 기절: ${Number(entry.stunCount)||0}회 (${(Number(entry.totalStunTime)||0).toFixed(2)}초) · 낚싯대 성공: ${Number(entry.hookHits)||0}회\n단계별 성공 1단계: ${Number(entry.attacksByStage?.[1])||0}회 · 2단계: ${Number(entry.attacksByStage?.[2])||0}회 · 3단계: ${Number(entry.attacksByStage?.[3])||0}회`}})
    }
    blocks.push({type:'divider'})
    if (data.groupNames?.length) blocks.push({type:'context',elements:[{type:'mrkdwn',text:`참여 조: ${data.groupNames.map(safeText).join(', ')}`} ]})
    return {blocks}
  }
}
export const slackService = new SlackService()
