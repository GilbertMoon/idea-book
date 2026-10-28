/**
 * 효과음 관리 모듈
 * Web Audio API를 사용하여 낙하·충돌·도착Effect을 재생
 */

export class SoundManager {
  constructor() {
    this.ctx = null
    this.enabled = true
    this.eventTimes = new Map()
    this.hookVoices = 0
  }

  /**
   * 오디오 컨텍스트 초기화 (사용자 상호작용 후 호출)
   */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.warn('Web Audio API 지원 불가:', e)
      this.enabled = false
    }
  }

  playEvent(type) {
    if (!this.ctx || !this.enabled) return
    const now = this.ctx.currentTime
    const interval = type === 'collision' || type === 'paddle' ? 0.09 : 0.12
    const last = this.eventTimes.get(type) ?? -Infinity
    if (now - last < interval) return
    this.eventTimes.set(type, now)
    if (type.startsWith('hook-') || type.startsWith('cannon-') || type.startsWith('stun-')) this.playHook(type)
    else if (type === 'result') this.playResult()
    else if (type === 'start') this.playFall()
    else if (type === 'arrival') this.playArrival()
    else if (type === 'return' || type === 'paddle') {
      const osc=this.ctx.createOscillator(),gain=this.ctx.createGain()
      osc.type='sine'
      osc.frequency.setValueAtTime(type==='return'?700:300,now)
      osc.frequency.exponentialRampToValueAtTime(type==='return'?180:500,now+.12)
      gain.gain.setValueAtTime(.06,now);gain.gain.exponentialRampToValueAtTime(.001,now+.15)
      osc.connect(gain);gain.connect(this.ctx.destination);osc.start(now);osc.stop(now+.15)
    } else this.playCollision()
  }

  playHook(type) {
    const voices = {
      'hook-cast': ['sine', 380, 1100, .14],
      'hook-hit': ['triangle', 920, 660, .12],
      'hook-throw': ['sine', 520, 120, .2],
      'hook-miss': ['triangle', 240, 170, .1],
      'cannon-fire': ['sawtooth', 180, 55, .16],
      'cannon-hit': ['triangle', 320, 90, .18],
      'cannon-miss': ['sine', 300, 180, .1],
      'stun-start': ['sine', 750, 1050, .2],
      'stun-end': ['sine', 500, 900, .18],
    }
    const tone = voices[type]
    if (!tone || !this.ctx || !this.enabled || this.hookVoices >= 4) return
    let oscillator, gain, registered = false
    try {
      const now = this.ctx.currentTime
      oscillator = this.ctx.createOscillator();gain = this.ctx.createGain()
      oscillator.type = tone[0]
      oscillator.frequency.setValueAtTime(tone[1], now)
      oscillator.frequency.exponentialRampToValueAtTime(tone[2], now + tone[3])
      gain.gain.setValueAtTime(.045, now)
      gain.gain.exponentialRampToValueAtTime(.001, now + tone[3])
      oscillator.connect(gain);gain.connect(this.ctx.destination)
      oscillator.onended = () => { this.hookVoices--;oscillator.disconnect();gain.disconnect() }
      this.hookVoices++;registered = true
      oscillator.start(now);oscillator.stop(now + tone[3])
    } catch {
      if (registered) this.hookVoices--
      if (oscillator) { oscillator.onended = null;oscillator.disconnect() }
      gain?.disconnect()
    }
  }

  /**
   * 음소거 토글
   */
  toggle() {
    this.enabled = !this.enabled
  }

  /**
   * OGG/WAV 파일 재생 (사전 로딩 필요)
   */
  async loadSound(url) {
    if (!this.ctx || !this.enabled) return null
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)
      return audioBuffer
    } catch (e) {
      console.warn('사운드 로딩 실패:', url, e)
      return null
    }
  }

  /**
   * 버퍼 재생
   */
  playBuffer(buffer, volume = 0.3) {
    if (!this.ctx || !this.enabled || !buffer) return
    try {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      const gain = this.ctx.createGain()
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(this.ctx.destination)
      source.start()
    } catch (e) {
      console.warn('사운드 재생 실패:', e)
    }
  }

  /**
   * 낙하Effect (간단한 신스톤)
   */
  playFall() {
    if (!this.ctx || !this.enabled) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(200, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.3)
    } catch (e) {
      console.warn('낙하Effect 재생 실패:', e)
    }
  }

  /**
   * 충돌Effect
   */
  playCollision() {
    if (!this.ctx || !this.enabled) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(150, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.1)
    } catch (e) {
      console.warn('충돌Effect 재생 실패:', e)
    }
  }

  /**
   * 도착Effect
   */
  playArrival() {
    if (!this.ctx || !this.enabled) return
    try {
      const now = this.ctx.currentTime
      // 짧은 상승 신스톤
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(400, now)
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.2)
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start(now)
      osc.stop(now + 0.25)

      // 두 번째 음
      const osc2 = this.ctx.createOscillator()
      const gain2 = this.ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(600, now + 0.1)
      osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.3)
      gain2.gain.setValueAtTime(0.2, now + 0.1)
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(this.ctx.destination)
      osc2.start(now + 0.1)
      osc2.stop(now + 0.35)
    } catch (e) {
      console.warn('도착Effect 재생 실패:', e)
    }
  }

  /**
   * 결과 발표Effect
   */
  playResult() {
    if (!this.ctx || !this.enabled) return
    try {
      const now = this.ctx.currentTime
      const frequencies = [523, 659, 784, 1047]
      frequencies.forEach((freq, i) => {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, now + i * 0.15)
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3)
        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(now + i * 0.15)
        osc.stop(now + i * 0.15 + 0.3)
      })
    } catch (e) {
      console.warn('결과Effect 재생 실패:', e)
    }
  }
}

// 싱글톤 인스턴스
export const soundManager = new SoundManager()
