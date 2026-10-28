export const DEFAULT_CHASE_SETTINGS = Object.freeze({attackMode:'cannon',enabled:true,rangeMultiplier:3,impulse:180,cooldown:8,maxAttacks:2,hitProtection:2,stunDuration:1,projectileSpeed:500,castingDuration:.2,hookedDuration:.15,animationEnabled:true})
export const CHASE_LIMITS = Object.freeze({rangeMultiplier:[.5,10],impulse:[0,600],cooldown:[.1,60],maxAttacks:[0,10],hitProtection:[0,30],stunDuration:[.1,10],projectileSpeed:[100,1200],castingDuration:[.05,2],hookedDuration:[.05,2]})
export function normalizeChaseSettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  const result = {...DEFAULT_CHASE_SETTINGS}
  result.attackMode = ['cannon','hook','off'].includes(source.attackMode) ? source.attackMode
    : typeof source.enabled === 'boolean' ? (source.enabled ? 'hook' : 'off') : 'cannon'
  result.enabled = result.attackMode !== 'off'
  if (typeof source.animationEnabled === 'boolean') result.animationEnabled = source.animationEnabled
  for (const [key,[min,max]] of Object.entries(CHASE_LIMITS)) if (typeof source[key] === 'number' && Number.isFinite(source[key])) result[key] = Math.min(max,Math.max(min,source[key]))
  result.maxAttacks = Math.round(result.maxAttacks)
  return result
}
export const DEFAULT_SETTINGS = Object.freeze({ difficulty: 'normal', gatesEnabled: true, stage2Gate: true, stage3Gate: true, maxReturns: 2, returnCooldown: 1, maxRaceSeconds: 90, chaseAttack:DEFAULT_CHASE_SETTINGS })
export const DEFAULT_OBSTACLES = Object.freeze({ fixed: [], rotating: [], oscillating: [] })
export const DEFAULT_SLACK_SETTINGS = Object.freeze({ url: '', remember: false })
export function normalizeSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const numeric = (key,min,max) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? Math.min(max,Math.max(min,source[key])) : DEFAULT_SETTINGS[key]
  return {difficulty:['easy','normal','hard'].includes(source.difficulty) ? source.difficulty : 'normal',gatesEnabled:typeof source.gatesEnabled === 'boolean' ? source.gatesEnabled : true,stage2Gate:typeof source.stage2Gate === 'boolean' ? source.stage2Gate : true,stage3Gate:typeof source.stage3Gate === 'boolean' ? source.stage3Gate : true,maxReturns:Math.round(numeric('maxReturns',0,10)),returnCooldown:numeric('returnCooldown',0,30),maxRaceSeconds:numeric('maxRaceSeconds',5,600),chaseAttack:normalizeChaseSettings(source.chaseAttack)}
}
