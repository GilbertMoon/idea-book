import { normalizeChaseSettings } from '../config/defaults.js'
import { FORWARD_EPSILON, getForwardDirection, getForwardGap, getDistanceBetweenBalls, isFreeRaceBall, hasHookLineOfSight } from './RaceProgress.js'
import { segmentCircle, segmentCapsule, segmentLaneExit } from './ProjectileGeometry.js'

const clampSpeed = value => Math.max(-350, Math.min(350, value))
const sameGeometry = (a, b) => Math.abs(a.gap - b.gap) <= FORWARD_EPSILON && Math.abs(a.distance - b.distance) <= FORWARD_EPSILON

/** Fixed-step, simultaneous proposals. Rendering only reads activeAttacks. */
export class ChaseAttackSystem {
  constructor(engine, settings = {}) {
    this.engine = engine
    this.settings = normalizeChaseSettings(settings)
    this.activeAttacks = []
    this.projectiles = []
    this.flashes = []
    this.stepBlockers = null
    this.reservations = new Set()
    this.tickParticipants = new Set()
    for (const ball of engine.balls) Object.assign(ball, {
      attackAttempts: 0, attackCount: 0, successfulAttacks: 0, hitCount: 0,
      cannonFired: 0, cannonHits: 0, stunCount: 0, totalStunTime: 0, hookHits: 0, stunRemaining: 0,
      attackCooldown: 0, hitProtection: 0, attackState: 'IDLE', attacksByStage: {1: 0, 2: 0, 3: 0},
    })
  }
  hasHookLineOfSight(attacker, target) { return hasHookLineOfSight(attacker, target, this.engine, this.stepBlockers) }
  geometryEligible(attacker, target) {
    return this.settings.enabled && this.engine.status === 'RUNNING' && attacker !== target &&
      isFreeRaceBall(attacker) && isFreeRaceBall(target) && attacker.stage === target.stage &&
      !(attacker.hitProtection > 0) && !(target.hitProtection > 0) &&
      getForwardGap(attacker, target) > FORWARD_EPSILON &&
      (this.settings.attackMode !== 'cannon' || getDistanceBetweenBalls(attacker,target) > target.radius+5) &&
      getDistanceBetweenBalls(attacker, target) <= attacker.radius * 2 * this.settings.rangeMultiplier + FORWARD_EPSILON &&
      this.hasHookLineOfSight(attacker, target)
  }
  canAttack(attacker, target) {
    return this.geometryEligible(attacker, target) && !(attacker.attackCooldown > 0) &&
      attacker.attackCount < this.settings.maxAttacks && attacker.attackState === 'IDLE' &&
      target.attackState !== 'CASTING' && target.attackState !== 'HOOKED' && target.attackState !== 'THROWING' &&
      !this.reservations.has(attacker.id) && !this.reservations.has(target.id) &&
      !this.tickParticipants.has(attacker.id) && !this.tickParticipants.has(target.id)
  }
  findAttackTarget(attacker) {
    let best = null, tied = false
    for (const target of this.engine.balls) {
      if (!this.canAttack(attacker, target)) continue
      const candidate = {target, gap: getForwardGap(attacker, target), distance: getDistanceBetweenBalls(attacker, target)}
      if (!best || candidate.gap < best.gap - FORWARD_EPSILON ||
        (Math.abs(candidate.gap - best.gap) <= FORWARD_EPSILON && candidate.distance < best.distance - FORWARD_EPSILON)) {
        best = candidate
        tied = false
      } else if (sameGeometry(candidate, best)) tied = true
    }
    return tied ? null : best?.target ?? null
  }
  emit(type, attack, extra = {}) {
    this.engine.events.push({type, attackerId: attack.attackerId, targetId: attack.targetId, stage: attack.stage, ...extra})
  }
  release(attack, miss = false) {
    this.reservations.delete(attack.attackerId); this.reservations.delete(attack.targetId)
    const attacker = this.engine.balls.find(b => b.id === attack.attackerId)
    if (attacker) {
      if (miss) attacker.attackCooldown = 1
      attacker.attackState = attacker.attackCooldown > 0 ? 'COOLDOWN' : 'IDLE'
    }
    if (miss) this.emit('hook-miss', attack)
  }
  cancelAll() {
    for (const attack of this.activeAttacks) this.release(attack, attack.state !== 'THROWING')
    for (const projectile of this.projectiles) this.emit('cannon-miss', projectile)
    this.activeAttacks = []
    this.projectiles = []
    this.flashes = []
    this.stepBlockers = null; this.reservations.clear()
  }
  step(dt) {
    if (this.engine.status !== 'RUNNING' || !this.settings.enabled) { this.cancelAll(); return }
    this.stepBlockers = [...this.engine.obstacles, ...this.engine.gates.filter(g => this.engine.gateEnabled?.(g) ?? true)]
    this.tickParticipants = new Set(this.reservations)
    for (const ball of this.engine.balls) {
      ball.attackCooldown = Math.max(0, ball.attackCooldown - dt)
      ball.hitProtection = Math.max(0, ball.hitProtection - dt)
      if (ball.attackState === 'COOLDOWN' && ball.attackCooldown <= FORWARD_EPSILON) {
        ball.attackCooldown = 0; ball.attackState = 'IDLE'
      }
    }
    this.flashes = this.flashes.filter(flash => (flash.time -= dt) > 0)
    if (this.settings.attackMode === 'cannon') this.updateProjectiles(dt)
    const remaining = []
    for (const attack of this.activeAttacks) {
      const attacker = this.engine.balls.find(b => b.id === attack.attackerId)
      const target = this.engine.balls.find(b => b.id === attack.targetId)
      if (attack.state === 'THROWING') { this.release(attack); continue }
      if (!attacker || !target || attacker.stage !== attack.stage || target.stage !== attack.stage ||
        !this.geometryEligible(attacker, target)) { this.release(attack, true); continue }
      attack.elapsed += dt
      if (attack.state === 'CASTING' && attack.elapsed + FORWARD_EPSILON >= attack.castingDuration) {
        attack.state = 'HOOKED'; attack.elapsed = 0; attacker.attackState = 'HOOKED'
        attacker.attackCount++ // Actual capture spends one use, even if the later throw is canceled.
        this.emit('hook-hit', attack)
      } else if (attack.state === 'HOOKED' && attack.elapsed + FORWARD_EPSILON >= attack.hookedDuration) {
        attack.state = 'THROWING'; attack.elapsed = 0; attacker.attackState = 'THROWING'
        const direction = getForwardDirection(target), previousVX = target.vx, previousVY = target.vy
        target.vx = clampSpeed(target.vx - direction.x * this.settings.impulse)
        target.vy = clampSpeed(target.vy - direction.y * this.settings.impulse)
        target.hitCount++; target.hitProtection = this.settings.hitProtection
        attacker.successfulAttacks++; attacker.hookHits++; attacker.attacksByStage[attack.stage]++
        attacker.attackCooldown = this.settings.cooldown
        this.emit('hook-throw', attack, {impulse: Math.hypot(target.vx - previousVX, target.vy - previousVY)})
      }
      remaining.push(attack)
    }
    this.activeAttacks = remaining
    const proposals = []
    for (const attacker of this.engine.balls) {
      const target = this.findAttackTarget(attacker)
      if (target) proposals.push({attacker, target, gap: getForwardGap(attacker, target), distance: getDistanceBetweenBalls(attacker, target)})
    }
    proposals.sort((a, b) => a.gap - b.gap || a.distance - b.distance)
    for (let i = 0; i < proposals.length;) {
      let end = i + 1
      while (end < proposals.length && sameGeometry(proposals[i], proposals[end])) end++
      const group = proposals.slice(i, end).filter(p => !this.reservations.has(p.attacker.id) && !this.reservations.has(p.target.id))
      const counts = new Map()
      for (const p of group) for (const id of [p.attacker.id, p.target.id]) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const p of group) {
        if (counts.get(p.attacker.id) > 1 || counts.get(p.target.id) > 1) continue
        if (this.settings.attackMode === 'cannon') {
          this.fireCannon(p.attacker,p.target)
          continue
        }
        const attack = {attackerId: p.attacker.id, targetId: p.target.id, stage: p.attacker.stage,
          state: 'CASTING', elapsed: 0, castingDuration: this.settings.castingDuration, hookedDuration: this.settings.hookedDuration}
        this.reservations.add(p.attacker.id); this.reservations.add(p.target.id)
        p.attacker.attackAttempts++; p.attacker.attackState = 'CASTING'
        this.activeAttacks.push(attack); this.emit('hook-cast', attack)
      }
      i = end
    }
    this.stepBlockers = null
  }
  fireCannon(attacker,target) {
    const dx = target.x-attacker.x, dy = target.y-attacker.y, distance = Math.hypot(dx,dy)
    const projectile = {attackerId:attacker.id,targetId:target.id,stage:attacker.stage,
      x:attacker.x,y:attacker.y,originX:attacker.x,originY:attacker.y,vx:dx/distance*this.settings.projectileSpeed,
      vy:dy/distance*this.settings.projectileSpeed,radius:5,age:0}
    this.reservations.add(attacker.id); this.reservations.add(target.id)
    attacker.attackAttempts++; attacker.attackCount++; attacker.cannonFired++
    attacker.attackCooldown = this.settings.cooldown; attacker.attackState = 'COOLDOWN'
    this.projectiles.push(projectile)
    this.flashes.push({type:'fire',x:attacker.x,y:attacker.y,angle:Math.atan2(dy,dx),time:.18})
    this.emit('cannon-fire',projectile)
  }
  updateProjectiles(dt) {
    const remaining = []
    for (const shot of this.projectiles) {
      const target = this.engine.balls.find(ball => ball.id === shot.targetId)
      const attacker = this.engine.balls.find(ball => ball.id === shot.attackerId)
      const release = () => {this.reservations.delete(shot.attackerId);this.reservations.delete(shot.targetId)}
      if (!target || !attacker || !isFreeRaceBall(target) || target.stage !== shot.stage || target.hitProtection > 0) {
        release(); this.emit('cannon-miss',shot); continue
      }
      const start = {x:shot.x,y:shot.y}, end = {x:shot.x+shot.vx*dt,y:shot.y+shot.vy*dt}
      const previous = target.previousPosition ?? target
      const relativeStart = {x:start.x-previous.x,y:start.y-previous.y}
      const relativeEnd = {x:end.x-target.x,y:end.y-target.y}
      const hit = segmentCircle(relativeStart,relativeEnd,{x:0,y:0},target.radius+shot.radius)
      const lane = this.engine.lanes.find(item => item.stage === shot.stage)
      let blocked = lane ? segmentLaneExit(start,end,lane,shot.radius) : Infinity
      for (const obstacle of this.stepBlockers) if (obstacle.stage === shot.stage)
        blocked = Math.min(blocked,segmentCapsule(start,end,obstacle,shot.radius))
      shot.age += dt
      if (hit <= 1 && hit < blocked) {
        release(); target.stunRemaining = this.settings.stunDuration
        target.stunCount++; target.hitCount++; target.hitProtection = this.settings.stunDuration+this.settings.hitProtection
        target.vx = 0; target.vy = 0
        attacker.cannonHits++; attacker.successfulAttacks++; attacker.attacksByStage[shot.stage]++
        this.flashes.push({type:'hit',x:start.x+(end.x-start.x)*hit,y:start.y+(end.y-start.y)*hit,startX:shot.originX,startY:shot.originY,time:.25})
        this.emit('cannon-hit',shot)
        this.engine.events.push({type:'stun-start',ballId:target.id,duration:this.settings.stunDuration})
      } else if (blocked <= 1 || shot.age >= .5) {
        release(); this.emit('cannon-miss',shot)
      } else {
        shot.previousX = shot.x; shot.previousY = shot.y; shot.x = end.x; shot.y = end.y
        remaining.push(shot)
      }
    }
    this.projectiles = remaining
  }
}
export default ChaseAttackSystem
