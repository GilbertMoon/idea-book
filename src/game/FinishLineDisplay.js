export const RACE_DISPLAY_SCALE = 0.8
export const FINISH_ANIMATION_MS = 400
export const FINISH_LAYOUT = Object.freeze({left:960,top:55,columns:6,firstX:983,firstY:125,spacingX:35,spacingY:48,radius:13})

export class FinishLineDisplay {
  constructor() {
    this.entries = new Map()
  }

  update(ranking, now) {
    for (const ball of ranking) {
      if (ball.arrivalTime == null || ball.dnf || this.entries.has(ball.id)) continue
      const index = this.entries.size
      this.entries.set(ball.id, {
        index,
        startX:ball.x * RACE_DISPLAY_SCALE,
        startY:ball.y * RACE_DISPLAY_SCALE,
        targetX:FINISH_LAYOUT.firstX + (index % FINISH_LAYOUT.columns) * FINISH_LAYOUT.spacingX,
        targetY:FINISH_LAYOUT.firstY + Math.floor(index / FINISH_LAYOUT.columns) * FINISH_LAYOUT.spacingY,
        startedAt:now,
      })
    }
    return ranking.filter(ball => ball.arrivalTime != null && !ball.dnf).map(ball => {
      const entry = this.entries.get(ball.id)
      const progress = Math.max(0,Math.min(1,(now-entry.startedAt)/FINISH_ANIMATION_MS))
      const eased = 1 - (1-progress) ** 3
      return {
        ball, index:entry.index, rank:ball.rank, progress,
        x:entry.startX+(entry.targetX-entry.startX)*eased,
        y:entry.startY+(entry.targetY-entry.startY)*eased,
        targetX:entry.targetX, targetY:entry.targetY,
      }
    })
  }
}
