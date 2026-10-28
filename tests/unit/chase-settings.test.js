import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/config/defaults.js'
import { SlackService } from '../../src/services/SlackService.js'
test('old settings safely gain complete nested chase defaults without losing race options',()=>{
 const settings=normalizeSettings({difficulty:'hard',maxReturns:3,maxRaceSeconds:120,chaseAttack:{enabled:false,cooldown:12}})
 assert.equal(settings.maxRaceSeconds,120);assert.equal(settings.maxReturns,3);assert.equal(settings.difficulty,'hard')
 assert.equal(settings.chaseAttack.enabled,false);assert.equal(settings.chaseAttack.cooldown,12);assert.equal(settings.chaseAttack.impulse,180)
 assert.equal(normalizeSettings().chaseAttack.rangeMultiplier,3)
 assert.equal(Object.isFrozen(DEFAULT_SETTINGS.chaseAttack),true)
})
test('invalid chase values normalize with bounded finite numbers and strict booleans',()=>{
 const chase=normalizeSettings({chaseAttack:{enabled:'false',animationEnabled:0,rangeMultiplier:Infinity,impulse:-5,cooldown:NaN,maxAttacks:2.8,hitProtection:900,castingDuration:null,hookedDuration:'0.2'}}).chaseAttack
 assert.equal(chase.enabled,true);assert.equal(chase.animationEnabled,true);assert.equal(chase.rangeMultiplier,3);assert.equal(chase.impulse,0);assert.equal(chase.cooldown,8);assert.equal(chase.maxAttacks,3);assert.equal(chase.hitProtection,30);assert.equal(chase.castingDuration,.2);assert.equal(chase.hookedDuration,.15)
})
test('Slack adds attack attempts, successful throws, hits and per-stage statistics',()=>{
 const payload=new SlackService().buildPayload({ranking:[{rank:1,arrivalTime:1,attackAttempts:3,attackCount:2,successfulAttacks:1,hitCount:4,attacksByStage:{1:1,2:0,3:0}}]})
 const text=JSON.stringify(payload)
 assert.ok(text.includes('공격 시도: 3'));assert.ok(text.includes('성공: 1'));assert.ok(text.includes('피격: 4'));assert.ok(text.includes('1단계: 1'))
})
