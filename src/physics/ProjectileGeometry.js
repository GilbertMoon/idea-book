// Earliest intersection fraction of a moving point and a stationary circle.
export function segmentCircle(start, end, center, radius) {
  const dx = end.x - start.x, dy = end.y - start.y
  const x = start.x - center.x, y = start.y - center.y
  const a = dx * dx + dy * dy, c = x * x + y * y - radius * radius
  if (c <= 0) return 0
  if (!a) return Infinity
  const b = 2 * (x * dx + y * dy), discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Infinity
  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  return t >= 0 && t <= 1 ? t : Infinity
}

// A capsule is a rectangle in obstacle coordinates plus its two round ends.
export function segmentCapsule(start, end, obstacle, radius) {
  const c = Math.cos(obstacle.angle), s = Math.sin(obstacle.angle)
  const local = p => ({x:(p.x-obstacle.x)*c+(p.y-obstacle.y)*s,y:-(p.x-obstacle.x)*s+(p.y-obstacle.y)*c})
  const a = local(start), b = local(end), half = obstacle.length / 2
  const r = radius + obstacle.thickness / 2
  let enter = 0, exit = 1
  for (const [pos, delta, min, max] of [[a.x,b.x-a.x,-half,half],[a.y,b.y-a.y,-r,r]]) {
    if (Math.abs(delta) < 1e-12) {
      if (pos < min || pos > max) { enter = Infinity; break }
    } else {
      const t1 = (min-pos)/delta, t2 = (max-pos)/delta
      enter = Math.max(enter,Math.min(t1,t2)); exit = Math.min(exit,Math.max(t1,t2))
    }
  }
  const rect = enter <= exit && enter <= 1 ? enter : Infinity
  return Math.min(rect, segmentCircle(a,b,{x:-half,y:0},r),segmentCircle(a,b,{x:half,y:0},r))
}

export function segmentLaneExit(start, end, lane, radius) {
  let exit = 1
  for (const [pos,delta,min,max] of [[start.x,end.x-start.x,lane.left+radius,lane.right-radius],[start.y,end.y-start.y,lane.top+radius,lane.bottom-radius]]) {
    if (pos < min || pos > max) return 0
    if (delta > 0) exit = Math.min(exit,(max-pos)/delta)
    else if (delta < 0) exit = Math.min(exit,(min-pos)/delta)
  }
  return exit < 1 ? Math.max(0,exit) : Infinity
}
