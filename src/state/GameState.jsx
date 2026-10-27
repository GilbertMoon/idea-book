import { useState, useCallback, useEffect, useRef } from 'react'
import { GameStateContext } from './GameContext'
import { StorageService, storageErrorMessage } from '../services/StorageService.js'
import { DEFAULT_SETTINGS, DEFAULT_SLACK_SETTINGS, normalizeSettings } from '../config/defaults.js'

const emptyObstacles = () => ({ fixed: [], rotating: [], oscillating: [] })
const makeId = () => crypto.randomUUID()
export function GameStateProvider({ children }) {
  const [rawGroups, setGroups] = useState([])
  const [obstacleSettings, setObstacleSettings] = useState(emptyObstacles)
  const [isShuffled, setIsShuffled] = useState(false)
  const [settings, setSettings] = useState({...DEFAULT_SETTINGS})
  const [slackSettings, setSlackSettings] = useState({...DEFAULT_SLACK_SETTINGS})
  const [hydrated, setHydrated] = useState(false)
  const [storageError, setStorageError] = useState(null)
  const [storage] = useState(() => new StorageService())
  const [storageStatus, setStorageStatus] = useState('loading')
  const [canPersist, setCanPersist] = useState(false)
  const [photoUrls] = useState(() => new Map())
  const [groups, setDisplayGroups] = useState([])
  useEffect(() => {
    // Object URLs are browser resources created after commit, never during render.
    // oxlint-disable-next-line react/set-state-in-effect
    setDisplayGroups(rawGroups.map(group => ({...group,members:(group.members || []).map(member => {
      if (!(member.photoBlob instanceof Blob)) return member
      if (!photoUrls.has(member.photoBlob)) photoUrls.set(member.photoBlob, URL.createObjectURL(member.photoBlob))
      return {...member,imageUrl:photoUrls.get(member.photoBlob)}
    })})))
  }, [rawGroups, photoUrls])
  useEffect(() => {
    const retained = new Set(groups.flatMap(group => (group.members || []).map(member => member.photoBlob)))
    for (const [blob,url] of photoUrls) if (!retained.has(blob)) { URL.revokeObjectURL(url); photoUrls.delete(blob) }
  },[groups,photoUrls])
  useEffect(() => {
    let active = true
    storage.load().then(data => {
      if (!active) return
      setGroups(data.groups); setSettings(data.settings); setObstacleSettings(data.obstacleSettings)
      setIsShuffled(data.isShuffled); setSlackSettings(data.slackSettings);setCanPersist(true)
    }).catch(error => { if (active) {setStorageError(storageErrorMessage(error));setStorageStatus('error')} }).finally(() => { if (active) setHydrated(true) })
    return () => { active = false }
  }, [storage])
  const lifecycle = useRef({generation:0})
  useEffect(() => {
    const tracker = lifecycle.current
    const generation = ++tracker.generation
    return () => { queueMicrotask(() => {
      if (tracker.generation !== generation) return
      for (const url of photoUrls.values()) URL.revokeObjectURL(url)
      photoUrls.clear()
      storage.queue.finally(() => storage.close()).catch(() => {})
    }) }
  }, [storage,photoUrls])
  useEffect(() => {
    if (!hydrated || !canPersist) return
    // Report the asynchronous browser transaction lifecycle to the administrator.
    // oxlint-disable-next-line react/set-state-in-effect
    setStorageStatus('saving')
    let active = true
    storage.save({groups:rawGroups,obstacleSettings,isShuffled,settings,slackSettings})
      .then(() => { if (active) {setStorageError(null);setStorageStatus('saved')} })
      .catch(error => { if (active) {setStorageError(storageErrorMessage(error));setStorageStatus('error')} })
    return () => { active = false }
  },[hydrated,canPersist,rawGroups,obstacleSettings,isShuffled,settings,slackSettings,storage])
  const [runId, setRunId] = useState(null)
  const [gameStatus, setGameStatusValue] = useState('IDLE')
  const statusRef = useRef('IDLE')
  const setGameStatus = useCallback(next => {
    const status = typeof next === 'function' ? next(statusRef.current) : next
    statusRef.current = status
    setGameStatusValue(status)
  }, [])
  const [ranking, setRanking] = useState([])
  const [arrivalLog, setArrivalLog] = useState([])
  const [showResult, setShowResult] = useState(false)
  const [slackSent, setSlackSent] = useState(false)
  const addGroup = useCallback(group => setGroups(prev => [...prev,{...group,id:makeId(),members:group.members || []}]),[])
  const removeGroup = useCallback(id => setGroups(prev => prev.filter(group => group.id !== id)),[])
  const updateGroup = useCallback((id,updated) => setGroups(prev => prev.map(group => group.id === id ? {...group,...updated,id} : group)),[])
  const addMember = useCallback((id,member) => setGroups(prev => prev.map(group => group.id === id ? {...group,members:[...(group.members || []),{...member,id:makeId()}]} : group)),[])
  const removeMember = useCallback((groupId,memberId) => setGroups(prev => prev.map(group => group.id === groupId ? {...group,members:group.members.filter(member => member.id !== memberId)} : group)),[])
  const updateSettings = useCallback(patch => setSettings(prev => normalizeSettings({...prev,...(typeof patch === 'function' ? patch(prev) : patch)})),[])
  const toggleShuffle = useCallback(() => setIsShuffled(prev => !prev),[])
  const clearRace = useCallback(() => { setRanking([]);setArrivalLog([]);setShowResult(false);setSlackSent(false) },[])
  const prepareGame = useCallback(() => { if (statusRef.current === 'READY' || statusRef.current === 'RUNNING') return;clearRace();setRunId(makeId());setGameStatus('READY') },[clearRace,setGameStatus])
  const startGame = useCallback(() => setGameStatus(prev => prev === 'READY' ? 'RUNNING' : prev),[setGameStatus])
  const finishGame = useCallback(() => { if (statusRef.current !== 'RUNNING') return;setGameStatus('FINISHED');setShowResult(true) },[setGameStatus])
  const resetRace = useCallback(() => { clearRace();setRunId(null);setGameStatus('IDLE') },[clearRace,setGameStatus])
  const clearTeams = useCallback(() => setGroups([]),[])
  const addArrival = useCallback(entry => setArrivalLog(prev => [...prev,entry]),[])
  const value = {groups,setGroups,addGroup,removeGroup,updateGroup,addMember,removeMember,clearTeams,obstacleSettings,setObstacleSettings,updateObstacles:setObstacleSettings,isShuffled,setIsShuffled,toggleShuffle,settings,updateSettings,slackSettings,setSlackSettings,hydrated,storageError,storageStatus,runId,gameStatus,setGameStatus,prepareGame,startGame,finishGame,resetRace,resetAll:resetRace,ranking,setRankingResult:setRanking,arrivalLog,addArrival,showResult,setShowResult,slackSent,setSlackSentStatus:setSlackSent}
  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>
}
