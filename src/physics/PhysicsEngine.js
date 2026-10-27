/**
 * 물리 엔진 모듈
 * 공의 낙하, 중력, 충돌 판정, 도착 시점 기록을 담당
 */

export class PhysicsEngine {
  /**
   * @param {number} width - 낙하판 너비
   * @param {number} height - 낙하판 높이
   * @param {number} gravity - 중력 가속도 (픽셀/프레임²)
   */
  constructor(width, height, gravity = 0.5) {
    this.width = width
    this.height = height
    this.gravity = gravity
    this.balls = []
    this.obstacles = []
    this.arrivedBalls = []
    this.frame = 0
  }

  /**
   * 공 추가
   * @param {Object} ball - { id, x, y, vx, vy, radius, imageUrl, groupId, memberName }
   */
  addBall(ball) {
    this.balls.push({
      ...ball,
      x: ball.x ?? this.width / 2,
      y: ball.y ?? 0,
      vx: ball.vx ?? 0,
      vy: ball.vy ?? 0,
      radius: ball.radius ?? 20,
      imageUrl: ball.imageUrl ?? null,
      groupId: ball.groupId ?? null,
      memberName: ball.memberName ?? '미지정',
      collisionCount: 0,
      startTime: this.frame,
      arrivalTime: null,
    })
  }

  /**
   * 장애물 추가
   * @param {Object} obstacle - { id, type, x, y, width, height, ...type-specific }
   */
  addObstacle(obstacle) {
    this.obstacles.push({ ...obstacle })
  }

  /**
   * 전체 장애물 제거
   */
  clearObstacles() {
    this.obstacles = []
  }

  /**
   * 장애물 일괄 설정
   * @param {Array} obstacles
   */
  setObstacles(obstacles) {
    this.clearObstacles()
    obstacles.forEach(o => this.addObstacle(o))
  }

  /**
   * 물리 시뮬레이션 한 프레임 진행
   */
  step() {
    this.frame++
    for (const ball of this.balls) {
      if (ball.arrivalTime !== null) continue
      const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) + this.gravity) / Math.max(1, ball.radius / 2)))
      for (let i = 0; i < steps; i++) {
        ball.vy += this.gravity / steps
        ball.x += ball.vx / steps
        ball.y += ball.vy / steps
        if (ball.x < ball.radius) {
          ball.x = ball.radius
          if (ball.vx < 0) { ball.vx *= -0.7; ball.collisionCount++ }
        }
        if (ball.x > this.width - ball.radius) {
          ball.x = this.width - ball.radius
          if (ball.vx > 0) { ball.vx *= -0.7; ball.collisionCount++ }
        }
        for (const obs of this.obstacles) this.checkCollision(ball, obs)
        if (ball.y + ball.radius >= this.height) {
          ball.y = this.height - ball.radius
          ball.arrivalTime = this.frame - 1 + (i + 1) / steps
          ball.vy = 0
          this.arrivedBalls.push(ball)
          break
        }
      }
    }
    return this.frame
  }

  /**
   * 공과 장애물 충돌 판정
   */
  checkCollision(ball, o) {
    if (ball.arrivalTime !== null) return
    let nx, ny, penetration
    let surfaceX = 0, surfaceY = 0
    if (o.type === 'rotating') {
      const dx = ball.x - o.x, dy = ball.y - o.y
      const distance = Math.hypot(dx, dy)
      penetration = ball.radius + o.radius - distance
      if (penetration <= 0) return
      nx = distance ? dx / distance : 0
      ny = distance ? dy / distance : -1
      surfaceX = -ny * o.radius * (o.speed ?? 0.02)
      surfaceY = nx * o.radius * (o.speed ?? 0.02)
    } else if (o.type === 'fixed' || o.type === 'oscillating') {
      const x = o.type === 'oscillating' ? (o.currentX ?? o.baseX) : o.x
      const dx = ball.x - Math.max(x, Math.min(ball.x, x + o.width))
      const dy = ball.y - Math.max(o.y, Math.min(ball.y, o.y + o.height))
      const distance = Math.hypot(dx, dy)
      if (distance >= ball.radius) return
      if (distance > 0) {
        nx = dx / distance; ny = dy / distance
        penetration = ball.radius - distance
      } else {
        const faces = [
          {d:ball.x-x,nx:-1,ny:0}, {d:x+o.width-ball.x,nx:1,ny:0},
          {d:ball.y-o.y,nx:0,ny:-1}, {d:o.y+o.height-ball.y,nx:0,ny:1},
        ].sort((a,b)=>a.d-b.d)
        nx=faces[0].nx; ny=faces[0].ny; penetration=ball.radius+faces[0].d
      }
      if (o.type === 'oscillating') surfaceX = o.velocityX ?? 0
    } else return
    ball.x += nx * penetration
    ball.y += ny * penetration
    const relativeX = ball.vx - surfaceX, relativeY = ball.vy - surfaceY
    const normalSpeed = relativeX * nx + relativeY * ny
    if (normalSpeed < 0) {
      ball.vx -= 1.6 * normalSpeed * nx
      ball.vy -= 1.6 * normalSpeed * ny
      if (o.type === 'rotating') {
        // Contact friction transfers a portion of the rotating surface velocity.
        const tx = -ny, ty = nx
        const tangentSpeed = relativeX * tx + relativeY * ty
        ball.vx -= tangentSpeed * tx * 0.15
        ball.vy -= tangentSpeed * ty * 0.15
      }
      ball.collisionCount++
    }
  }

  /**
   * 동작형 장애물 위치 갱신 (프레임마다 호출)
   */
  updateMovingObstacles() {
    for (const obs of this.obstacles) {
      if (obs.type === 'oscillating') {
        const period = obs.period ?? 60
        const range = obs.range ?? 100
        const nextX = obs.baseX + Math.sin((this.frame / period) * Math.PI * 2) * range
        obs.velocityX = nextX - (obs.currentX ?? obs.baseX)
        obs.currentX = nextX
      }
      if (obs.type === 'rotating') {
        obs.angle = (obs.angle ?? 0) + (obs.speed ?? 0.02)
      }
    }
  }

  /**
   * 모든 공 도착 여부
   */
  allArrived() {
    return this.balls.every(b => b.arrivalTime !== null)
  }

  /**
   * 순위 정렬 (도착 시각 기준, 동점 시 충돌 횟수)
   */
  getRanking() {
    const ranking = this.balls
      .filter(b => b.arrivalTime !== null)
      .sort((a, b) => {
        if (a.arrivalTime !== b.arrivalTime) {
          return a.arrivalTime - b.arrivalTime
        }
        return a.collisionCount - b.collisionCount
      })

    return ranking.map((ball, index) => ({
      rank: index + 1,
      ballId: ball.id,
      memberName: ball.memberName,
      groupId: ball.groupId,
      arrivalFrame: ball.arrivalTime,
      collisionCount: ball.collisionCount,
      imageUrl: ball.imageUrl,
    }))
  }

  /**
   * 상태 초기화
   */
  reset() {
    this.balls = []
    this.arrivedBalls = []
    this.frame = 0
  }
}
