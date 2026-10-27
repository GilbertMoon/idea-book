import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameState } from '../state/GameContext'
import { soundManager } from '../sounds/SoundManager'
import './Admin.css'
import { validatePhoto } from './photo.js'

function Admin() {
  const navigate = useNavigate()
  const {
    groups, addGroup, updateGroup, removeGroup, clearTeams, addMember, removeMember,
    updateObstacles, obstacleSettings, settings, updateSettings, slackSettings, setSlackSettings, hydrated, storageError, storageStatus,
    isShuffled, toggleShuffle,
    prepareGame,
  } = useGameState()

  const fileInputRef = useRef(null)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [memberName, setMemberName] = useState('')

  const [inputError, setInputError] = useState('')
  const uploadTarget = useRef(null)
  const mounted = useRef(false)
  const liveGroups = useRef(groups)
  const [brokenPhotos, setBrokenPhotos] = useState({})
  useEffect(() => {liveGroups.current = groups}, [groups])
  useEffect(() => {mounted.current = true; return () => {mounted.current = false}}, [])
  const fixedObs = obstacleSettings.fixed || []
  const rotatingObs = obstacleSettings.rotating || []
  const oscillatingObs = obstacleSettings.oscillating || []
  const setObstacles = (key, updater) => updateObstacles({...obstacleSettings,[key]:updater(obstacleSettings[key] || [])})
  const setFixedObs = updater => setObstacles('fixed',updater)
  const setRotatingObs = updater => setObstacles('rotating',updater)
  const setOscillatingObs = updater => setObstacles('oscillating',updater)
  const slackValid = !slackSettings.url || /^https:\/\/hooks\.slack(?:-gov)?\.com\/services\/[^\s]+$/.test(slackSettings.url)
  const setNumber = (key, value, min, max) => {
    if (value === '') return
    const number = Number(value)
    if (Number.isFinite(number)) updateSettings({[key]:Math.max(min,Math.min(max,number))})
  }
  /**
   * 조 추가
   */
  const handleAddGroup = () => {
    if (!newGroupName.trim()) return
    addGroup({ name: newGroupName.trim(), members: [] })
    setNewGroupName('')
  }

  /**
   * 조원 추가 (사진 업로드 포함)
   */
  const handleAddMember = () => {
    if (!activeGroupId || !memberName.trim()) return

    // 파일 입력 트리거
    uploadTarget.current = {groupId:activeGroupId,name:memberName.trim()}
    fileInputRef.current?.click()
  }

  /**
   * 파일 선택 처리
   */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const target = uploadTarget.current
    if (!file || !target || !groups.some(g=>g.id===target.groupId)) return
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setInputError('10MB 이하의 이미지 파일을 선택하세요.')
      return
    }
    try { await validatePhoto(file) }
    catch { if (mounted.current) setInputError('사진을 읽을 수 없습니다. 손상되지 않은 이미지 파일을 선택하세요.'); return }
    if (!mounted.current || !liveGroups.current.some(g=>g.id===target.groupId)) return
    addMember(target.groupId, {name:target.name,photoBlob:file})
    setMemberName('');setInputError('')
  }

  /**
   * 게임 시작
   */
  const handleStart = () => {
    if (!hydrated || !groups.length || !slackValid) return
    soundManager.init()
    prepareGame()
    navigate('/game')
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>조별 발표 순서 배정기</h1>
        <p className="admin-subtitle">공을 떨어뜨려 발표 순서를 정하는 몰입형 시스템</p>
      </header>

      {!hydrated && <p role="status">저장된 설정을 불러오는 중...</p>}
      {hydrated && <p role="status" className="save-status">{storageStatus === 'saving' ? '설정 저장 중...' : storageStatus === 'saved' ? '이 브라우저에 저장됨' : storageStatus === 'error' ? '저장 실패: 현재 브라우저에서만 임시 사용 중' : ''}</p>}
      {storageError && <p role="alert">{storageError}</p>}
      {inputError && <p role="alert">{inputError}</p>}
      <fieldset disabled={!hydrated} className="admin-controls"><div className="admin-content">
        {/* 왼쪽: 조 설정 */}
        <section className="admin-section admin-section-groups">
          <h2>조 설정</h2>

          {/* 조 추가 */}
          <div className="group-add">
            <input
              type="text"
              placeholder="조 이름 (예: 1조, 2조...)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            />
            <button onClick={handleAddGroup} disabled={!newGroupName.trim()}>조 추가</button>
          </div>

          <button className="remove-btn" disabled={!groups.length} onClick={()=>{if(window.confirm('모든 조와 조원 사진을 삭제할까요?')) clearTeams()}}>전체 팀 초기화</button>
          <p>첫 번째 조원 사진이 팀 공에 표시됩니다. 팀과 사진은 자동 저장됩니다.</p>
          {/* 조 목록 */}
          <div className="group-list">
            {groups.length === 0 && (
              <p className="empty-message">아직 추가된 조가 없습니다. 조 이름을 입력해 추가하세요.</p>
            )}
            {groups.map(group => (
              <div key={group.id} className={`group-card ${activeGroupId === group.id ? 'active' : ''}`}>
                <div className="group-header">
                  <input className="group-name-edit" aria-label={`${group.name} 이름 수정`} defaultValue={group.name} maxLength={80} onBlur={e=>{const name=e.target.value.trim();if(name)updateGroup(group.id,{name});else e.target.value=group.name}} />
                  <button
                    className="icon-btn"
                    onClick={() => { setActiveGroupId(activeGroupId === group.id ? null : group.id) }}
                  >
                    {activeGroupId === group.id ? '▲' : '▼'}
                  </button>
                  <button
                    className="remove-btn"
                    onClick={() => {if(window.confirm(`${group.name} 및 조원 사진을 삭제할까요?`)) removeGroup(group.id)}}
                    title="조 삭제"
                  >
                    ×
                  </button>
                </div>

                {activeGroupId === group.id && (
                  <div className="group-members">
                    {/* 조원 추가 */}
                    <div className="member-add">
                      <input
                        type="text"
                        placeholder="조원 이름"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                      />
                      <button onClick={handleAddMember} disabled={!memberName.trim()}>
                        사진 추가 +
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                      />
                    </div>

                    {/* 조원 목록 */}
                    {(group.members || []).length === 0 && (
                      <p className="empty-message" style={{ fontSize: '0.85rem' }}>조원이 없습니다.</p>
                    )}
                    {(group.members || []).map(member => (
                      <div key={member.id} className="member-item">
                        {!brokenPhotos[member.id] && member.imageUrl ? <img
                          src={member.imageUrl}
                          alt={member.name}
                          className="member-avatar"
                          onError={()=>setBrokenPhotos(prev=>({...prev,[member.id]:true}))}
                        /> : <span className="member-avatar photo-fallback" role="img" aria-label="사진을 읽을 수 없음">{member.name?.[0] || '?'}</span>}
                        <span className="member-name">{member.name}</span>
                        <button
                          className="remove-btn small"
                          onClick={() => removeMember(group.id, member.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 오른쪽: 장애물 설정 */}
        <section className="admin-section admin-section-obstacles">
          <h2>장애물 설정</h2>

          {/* 고정형 장애물 */}
          <div className="obstacle-type">
            <h3>고정형 장애물</h3>
            <div className="obstacle-list">
              {fixedObs.map(obs => (
                <div key={obs.id} className="obstacle-item">
                  <span>직사각형</span>
                  <span>
                    위치: ({Math.round(obs.x)}, {Math.round(obs.y)}) ·
                    크기: {obs.width}×{obs.height}
                  </span>
                  <button onClick={() => setFixedObs(prev => prev.filter(o => o.id !== obs.id))}>삭제</button>
                </div>
              ))}
              <button
                className="add-btn"
                onClick={() => {
                  const lastX = fixedObs.length > 0
                    ? Math.min(600, (fixedObs[fixedObs.length - 1].x + 100))
                    : 200
                  const lastY = fixedObs.length > 0
                    ? Math.min(600, (fixedObs[fixedObs.length - 1].y + 80))
                    : 250
                  setFixedObs(prev => [
                    ...prev,
                    { id: 'fixed_' + Date.now(), type: 'fixed', x: lastX, y: lastY, width: 100, height: 20 },
                  ])
                }}
              >
                + 고정 장애물 추가
              </button>
            </div>
          </div>

          {/* 동작형: 물래방아 */}
          <div className="obstacle-type">
            <h3>동작형 — 물래방아</h3>
            <div className="obstacle-list">
              {rotatingObs.map(obs => (
                <div key={obs.id} className="obstacle-item">
                  <span>물래방아</span>
                  <span>
                    중심: ({Math.round(obs.x)}, {Math.round(obs.y)}) ·
                    반지름: {obs.radius}px · 속도: {obs.speed}
                  </span>
                  <button onClick={() => setRotatingObs(prev => prev.filter(o => o.id !== obs.id))}>삭제</button>
                </div>
              ))}
              <button
                className="add-btn"
                onClick={() => {
                  setRotatingObs(prev => [
                    ...prev,
                    { id: 'rot_' + Date.now(), type: 'rotating', x: 300, y: 400, radius: 30, speed: 0.03, angle: 0 },
                  ])
                }}
              >
                + 물래방아 추가
              </button>
            </div>
          </div>

          {/* 동작형: 장애불 */}
          <div className="obstacle-type">
            <h3>동작형 — 장애불 (좌우 진동 막대기)</h3>
            <div className="obstacle-list">
              {oscillatingObs.map(obs => (
                <div key={obs.id} className="obstacle-item">
                  <span>장애불</span>
                  <span>
                    기준 위치: ({Math.round(obs.baseX)}, {Math.round(obs.y)}) ·
                    너비: {obs.width}px · 주기: {obs.period}프레임 · 범위: {obs.range}px
                  </span>
                  <button onClick={() => setOscillatingObs(prev => prev.filter(o => o.id !== obs.id))}>삭제</button>
                </div>
              ))}
              <button
                className="add-btn"
                onClick={() => {
                  setOscillatingObs(prev => [
                    ...prev,
                    { id: 'osc_' + Date.now(), type: 'oscillating', baseX: 200, currentX: 200, y: 200, width: 120, height: 15, period: 80, range: 100 },
                  ])
                }}
              >
                + 장애불 추가
              </button>
            </div>
          </div>

          {/* 셔플 */}
          <div className="shuffle-option">
            <label>
              <input
                type="checkbox"
                checked={isShuffled}
                onChange={toggleShuffle}
              />
              공 위치 셔플 (시작 전 랜덤 배치)
            </label>
          </div>

          <div className="race-settings">
            <h3>경기 설정</h3>
            <label>난이도 <select aria-label="난이도" value={settings.difficulty} onChange={e=>updateSettings({difficulty:e.target.value,maxReturns:{easy:1,normal:2,hard:3}[e.target.value]})}><option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option></select></label>
            {[['gatesEnabled','역회전 복귀문 사용'],['stage2Gate','2단계 복귀문'],['stage3Gate','3단계 복귀문']].map(([key,label])=><label key={key}><input type="checkbox" checked={settings[key]} onChange={e=>updateSettings({[key]:e.target.checked})}/>{label}</label>)}
            <label>최대 복귀 횟수 <input aria-label="최대 복귀 횟수" type="number" min="0" max="10" step="1" value={settings.maxReturns} onChange={e=>setNumber('maxReturns',Math.floor(Number(e.target.value)),0,10)}/></label>
            <label>복귀 보호시간 (초) <input aria-label="복귀 보호시간 (초)" type="number" min="0" max="10" step="0.1" value={settings.returnCooldown} onChange={e=>setNumber('returnCooldown',e.target.value,0,10)}/></label>
            <label>경기 제한시간 (초) <input aria-label="경기 제한시간 (초)" type="number" min="10" max="600" value={settings.maxRaceSeconds} onChange={e=>setNumber('maxRaceSeconds',e.target.value,10,600)}/></label>
          </div>
          <div className="shuffle-option slack-settings">
            <label>Slack 웹훅 URL <input type="password" placeholder="https://hooks.slack.com/services/... (선택)" aria-label="Slack 웹훅 URL" autoComplete="off" value={slackSettings.url} onChange={e=>setSlackSettings(prev=>({...prev,url:e.target.value.trim()}))}/></label>
            {!slackValid && <p role="alert">올바른 Slack Incoming Webhook HTTPS URL을 입력하세요.</p>}
            <label><input type="checkbox" checked={slackSettings.remember} onChange={e=>setSlackSettings(prev=>({...prev,remember:e.target.checked}))}/>이 브라우저에 저장</label>
            <button className="remove-btn" onClick={()=>setSlackSettings({url:'',remember:false})}>Webhook 삭제</button>
            <p>선택한 경우에만 이 브라우저에 URL을 저장합니다. 해당 브라우저에 접근하는 사용자나 코드는 전송 권한이 있는 이 비밀 URL을 읽을 수 있습니다.</p>
            <p>결과 확정 시 자동 전송합니다. 브라우저 CORS 제한으로 성공을 확인하지 못하면 실패로 표시됩니다.</p>
          </div>
          {/* 시작 버튼 */}
          <button
            className="start-btn"
            onClick={handleStart}
            disabled={!hydrated || groups.length === 0 || !slackValid}
          >
            경기 준비
          </button>
        </section>
      </div></fieldset>

      <footer className="admin-footer">
        <p>순위는 공의 실제 낙하·충돌 물리 결과만으로 결정됩니다. 순위 조작 없음.</p>
        <p>경기 결과는 저장하지 않으며, 팀·사진·경기 설정은 재경기 후에도 유지됩니다.</p>
      </footer>
    </div>
  )
}

export default Admin
