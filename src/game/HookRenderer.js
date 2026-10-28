const TAU = Math.PI * 2
const palette = { rod: '#ffd784', line: '#64e2ff', capture: '#ffbb55', impact: '#ff7cad', protection: '#78f3c6' }
const clamp = value => Math.min(1, Math.max(0, value))

/** Stateless Canvas overlay: all timing and participant positions belong to the engine. */
export class HookRenderer {
  constructor(ctx, engine) { this.ctx = ctx; this.engine = engine }
  draw() {
    const engine = this.engine, options = engine.settings?.chaseAttack
    if (engine.status !== 'RUNNING' || options?.animationEnabled === false || options?.enabled === false || (options?.attackMode && options.attackMode !== 'hook')) return
    const attacks = engine.chaseAttackSystem?.activeAttacks
    for (const attack of attacks instanceof Map ? attacks.values() : attacks || []) {
      if (!['CASTING', 'HOOKED', 'THROWING'].includes(attack.state)) continue
      const attacker = engine.balls.find(ball => ball.id === attack.attackerId)
      const target = engine.balls.find(ball => ball.id === attack.targetId)
      if (!this.valid(attacker, attack.stage) || !this.valid(target, attack.stage)) continue
      if (attack.state === 'THROWING') this.impact(target)
      else this.line(attacker, target, attack)
    }
    for (const ball of engine.balls) if (ball.hitProtection > 0 && this.valid(ball, ball.stage)) {
      this.protect(ball)
      // THROWING lasts one physics tick. Derive a readable flash from the simulation
      // protection timer too, so a 60 Hz display cannot skip the actual hit effect.
      const elapsed = (options?.hitProtection ?? 2) - ball.hitProtection
      if (elapsed >= 0 && elapsed < .18) this.impact(ball, 1 - elapsed / .18)
    }
  }
  valid(ball, stage) {
    return ball && Number.isFinite(ball.x) && Number.isFinite(ball.y) && ball.stage === stage && !ball.transport && !ball.dnf && ball.arrivalTime == null
  }
  line(attacker, target, attack) {
    const ctx = this.ctx, dx = target.x - attacker.x, dy = target.y - attacker.y, distance = Math.hypot(dx, dy)
    if (distance < .001) return
    const ux = dx / distance, uy = dy / distance, nx = -uy, ny = ux
    const ar = attacker.radius || 12, tr = target.radius || 12
    const casting = attack.state === 'CASTING'
    const progress = clamp((attack.elapsed || 0) / (casting ? attack.castingDuration || .2 : attack.hookedDuration || .15))
    // Both endpoints stay outside the photo discs. Curvature contracts as capture tightens.
    const rodLength = Math.min(ar + 13, Math.max(ar, distance - tr - 8))
    const sx = attacker.x + ux * rodLength, sy = attacker.y + uy * rodLength
    const reach = Math.max(0, distance - rodLength - tr - 8) * (casting ? progress : 1)
    const ex = sx + ux * reach, ey = sy + uy * reach
    const sag = Math.min(18, distance * .23) * (casting ? 1 - progress * .5 : 1 - progress)
    ctx.save();ctx.lineCap = 'round';ctx.lineJoin = 'round';ctx.lineWidth = 2
    ctx.strokeStyle = palette.rod
    ctx.beginPath();ctx.moveTo(attacker.x + ux * (ar + 2) + nx * 4, attacker.y + uy * (ar + 2) + ny * 4);ctx.lineTo(sx, sy);ctx.stroke()
    ctx.strokeStyle = casting ? palette.line : palette.capture
    ctx.beginPath();ctx.moveTo(sx, sy);ctx.quadraticCurveTo((sx + ex) / 2 + nx * sag, (sy + ey) / 2 + ny * sag, ex, ey);ctx.stroke()
    // A small J hook is tangent to the line, outside the target's photo boundary.
    ctx.save();ctx.translate(ex, ey);ctx.rotate(Math.atan2(uy, ux));ctx.beginPath();ctx.moveTo(-3, -3);ctx.lineTo(2, -3);ctx.arc(2, 0, 3, -Math.PI / 2, Math.PI);ctx.stroke();ctx.restore()
    ctx.beginPath();ctx.arc(attacker.x, attacker.y, ar + 5, Math.atan2(uy, ux) - .5, Math.atan2(uy, ux) + .5);ctx.stroke()
    if (!casting) {ctx.beginPath();ctx.arc(target.x, target.y, tr + 4, 0, TAU);ctx.stroke()}
    ctx.restore()
  }
  impact(ball, opacity = 1) {
    const ctx = this.ctx, radius = (ball.radius || 12) + 7
    ctx.save();ctx.globalAlpha = opacity;ctx.strokeStyle = palette.impact;ctx.lineWidth = 2
    ctx.beginPath();ctx.arc(ball.x, ball.y, radius, 0, TAU);ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {const angle = i * TAU / 8;ctx.moveTo(ball.x + Math.cos(angle) * (radius + 3), ball.y + Math.sin(angle) * (radius + 3));ctx.lineTo(ball.x + Math.cos(angle) * (radius + 8), ball.y + Math.sin(angle) * (radius + 8))}
    ctx.stroke();ctx.restore()
  }
  protect(ball) {
    const ctx = this.ctx
    ctx.save();ctx.strokeStyle = palette.protection;ctx.lineWidth = 1.6;ctx.setLineDash([4, 4]);ctx.lineDashOffset = -(this.engine.animationTime || 0) * 12
    ctx.beginPath();ctx.arc(ball.x, ball.y, (ball.radius || 12) + 6, 0, TAU);ctx.stroke();ctx.restore()
  }
}
