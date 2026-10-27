export const DEFAULT_SETTINGS = Object.freeze({ difficulty: 'normal', gatesEnabled: true, stage2Gate: true, stage3Gate: true, maxReturns: 2, returnCooldown: 1, maxRaceSeconds: 90 })
export const DEFAULT_OBSTACLES = Object.freeze({ fixed: [], rotating: [], oscillating: [] })
export const DEFAULT_SLACK_SETTINGS = Object.freeze({ url: '', remember: false })
export function normalizeSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const numeric = (key,min,max) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? Math.min(max,Math.max(min,source[key])) : DEFAULT_SETTINGS[key]
  return {difficulty:['easy','normal','hard'].includes(source.difficulty) ? source.difficulty : 'normal',gatesEnabled:typeof source.gatesEnabled === 'boolean' ? source.gatesEnabled : true,stage2Gate:typeof source.stage2Gate === 'boolean' ? source.stage2Gate : true,stage3Gate:typeof source.stage3Gate === 'boolean' ? source.stage3Gate : true,maxReturns:Math.round(numeric('maxReturns',0,10)),returnCooldown:numeric('returnCooldown',0,30),maxRaceSeconds:numeric('maxRaceSeconds',5,600)}
}
