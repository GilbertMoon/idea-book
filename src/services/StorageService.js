import { normalizeSettings, DEFAULT_SLACK_SETTINGS } from '../config/defaults.js'

const STORES = ['teams', 'members', 'photos', 'gameSettings']
const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export function storageErrorMessage(error) {
  if (error?.name === 'QuotaExceededError') return '저장 공간이 부족합니다. 사진 크기를 줄이거나 팀을 삭제해 주세요.'
  return '브라우저 저장소를 사용할 수 없거나 저장 데이터가 손상되었습니다. 변경 사항이 저장되지 않을 수 있습니다.'
}
export class StorageService {
  constructor(name = 'ranking-race') { this.name = name; this.queue = Promise.resolve(); this.db = null; this.opening = null }
  async open() {
    if (this.db) return this.db
    if (this.opening) return this.opening
    this.opening = this.openDatabase()
    try { return await this.opening } finally { this.opening = null }
  }
  async openDatabase() {
    if (!globalThis.indexedDB) throw new Error('Storage unavailable')
    const request = indexedDB.open(this.name, 1)
    request.onupgradeneeded = () => {
      for (const name of STORES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' })
    }
    const db = await new Promise((resolve, reject) => {
      let blocked = false
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
      request.onerror = () => reject(request.error)
      request.onblocked = () => { blocked = true; reject(new Error('Storage blocked')) }
    })
    if (!STORES.every(name => db.objectStoreNames.contains(name) && db.transaction(name).objectStore(name).keyPath === 'id')) { db.close(); throw new Error('Storage schema conflict') }
    db.onversionchange = () => { db.close(); this.db = null }
    this.db = db
    return db
  }
  async load() {
    await this.queue
    const db = await this.open()
    const tx = db.transaction(STORES, 'readonly')
    const [teams, members, photos, values] = await Promise.all(STORES.map(name => requestResult(tx.objectStore(name).getAll())))
    const config = values.find(value => value.id === 'configuration') || {}
    const groups = teams.sort((a,b) => a.order - b.order).map(team => ({ id:team.id, name:team.name, members:members.filter(m => m.groupId === team.id).sort((a,b) => a.order-b.order).map(member => {
      const photo = photos.find(p => p.id === member.id)
      if (photo && !(photo.blob instanceof Blob)) throw new Error('Corrupt photo')
      return { id:member.id,name:member.name,...(photo ? {photoBlob:photo.blob} : {}) }
    }) }))
    return {groups,settings:normalizeSettings(config.settings),obstacleSettings:Object.fromEntries(['fixed','rotating','oscillating'].map(name => [name,Array.isArray(config.obstacleSettings?.[name]) ? config.obstacleSettings[name] : []])),isShuffled:!!config.isShuffled,slackSettings:config.slackSettings?.remember === true && typeof config.slackSettings.url === 'string' ? {url:config.slackSettings.url,remember:true} : {...DEFAULT_SLACK_SETTINGS}}
  }
  save(snapshot) {
    // Capture before queueing: later React state changes cannot mutate this snapshot.
    let captured
    try { captured = structuredClone(snapshot) } catch (error) { return Promise.reject(error) }
    const job = this.queue.catch(() => {}).then(async () => {
      const groups = await Promise.all(captured.groups.map(async group => ({...group,members:await Promise.all((group.members || []).map(async member => {
        let photoBlob = member.photoBlob
        if (!photoBlob && member.imageUrl?.startsWith('data:')) photoBlob = await (await fetch(member.imageUrl)).blob()
        return {...member,photoBlob}
      }))})))
      const db = await this.open()
      await new Promise((resolve,reject) => {
        const tx = db.transaction(STORES,'readwrite')
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'))
        try {
        for (const name of STORES) tx.objectStore(name).clear()
        groups.forEach((group,order) => {
          tx.objectStore('teams').put({id:group.id,name:group.name,order})
          group.members.forEach((member,memberOrder) => {
            tx.objectStore('members').put({id:member.id,groupId:group.id,name:member.name,order:memberOrder})
            if (member.photoBlob) tx.objectStore('photos').put({id:member.id,blob:member.photoBlob})
          })
        })
        tx.objectStore('gameSettings').put({id:'configuration',settings:captured.settings,obstacleSettings:captured.obstacleSettings,isShuffled:captured.isShuffled,slackSettings:captured.slackSettings?.remember ? captured.slackSettings : {...DEFAULT_SLACK_SETTINGS}})
        } catch (error) { tx.abort(); reject(error) }
      })
    })
    this.queue = job
    return job
  }
  close() { this.db?.close(); this.db = null }
}
