/** Current local route geometry only. No historical maximum or displayed rank. */
export const FORWARD_EPSILON = 1e-6
export function getForwardDirection(ball) {
  return { x: 0, y: ball.stage === 2 ? -1 : 1 }
}
export function getForwardGap(attacker, target) {
  if (attacker.stage !== target.stage) return NaN
  return (target.y - attacker.y) * (attacker.stage === 2 ? -1 : 1)
}
export function getDistanceBetweenBalls(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
export function isFreeRaceBall(ball) {
  return Boolean(ball && [1, 2, 3].includes(ball.stage) && ball.route === `stage${ball.stage}` &&
    !ball.transport && !ball.dnf && ball.arrivalTime === null && !(ball.stunRemaining > 0))
}
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function segmentDistance(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
}
/** A .75px hook radius against the exact current finite-thickness obstacle capsule. */
export function hasHookLineOfSight(attacker, target, engine, currentBlockers = null) {
  if (attacker.stage !== target.stage) return false
  const lane = engine.lanes?.find(l => l.stage === attacker.stage)
  if (lane && [attacker, target].some(b => b.x < lane.left + b.radius - FORWARD_EPSILON ||
    b.x > lane.right - b.radius + FORWARD_EPSILON || b.y < (lane.top ?? -Infinity) || b.y > (lane.bottom ?? Infinity))) return false
  const blockers = currentBlockers ?? [...(engine.obstacles ?? []), ...(engine.gates ?? []).filter(g => engine.gateEnabled?.(g) ?? true)]
  for (const obstacle of blockers) {
    if (obstacle.stage !== attacker.stage) continue
    const dx = Math.cos(obstacle.angle) * obstacle.length / 2, dy = Math.sin(obstacle.angle) * obstacle.length / 2
    const a = {x: obstacle.x - dx, y: obstacle.y - dy}, b = {x: obstacle.x + dx, y: obstacle.y + dy}
    if (segmentDistance(attacker, target, a, b) <= (obstacle.thickness ?? 0) / 2 + .75 + FORWARD_EPSILON) return false
  }
  return true
}
