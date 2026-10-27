import test from 'node:test'
import assert from 'node:assert/strict'
import { SlackService } from '../../src/services/SlackService.js'
const data = {runId:'one',ranking:[{rank:1,groupName:'<@everyone>*bad*',arrivalTime:2.5,returnFromStage2:1},{rank:null,dnf:true,dnfReason:'timeout',groupName:'second'}],groupNames:['<tag>'],totalTime:90,resultTimestamp:'today'}
test('coalesces each run, retains successful outcomes across other runs', async t => {
 const service = new SlackService(); service.setWebhookUrl('https://hooks.slack.com/services/MOCK')
 let calls=0; t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,type:'basic',text:async()=> 'ok'}})
 await Promise.all([service.sendResult(data),service.sendResult(data)])
 await service.sendResult({...data,runId:'two'}); await service.sendResult(data,{retry:true})
 assert.equal(calls,2)
})
test('failed sends only retry explicitly and never expose response or thrown secrets', async t=>{
 const service = new SlackService(); service.setWebhookUrl('https://hooks.slack.com/services/SECRET')
 let calls=0; t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error(service.webhookUrl)})
 const failure=await service.sendResult(data); await service.sendResult(data)
 assert.equal(calls,1); assert.ok(!failure.message.includes('SECRET'))
 await service.sendResult(data,{retry:true}); assert.equal(calls,2)
})
test('opaque or unreadable or non-ok Slack body is not successful',async t=>{
 for(const response of [{ok:true,type:'opaque',text:async()=> 'ok'},{ok:true,type:'basic',text:async()=> 'invalid_payload'},{ok:false,status:403,text:async()=> 'SECRET'}]){
  t.mock.method(globalThis,'fetch',async()=>response)
  const service=new SlackService();service.setWebhookUrl('mock');const result=await service.sendResult(data)
  assert.equal(result.success,false);assert.ok(!result.message.includes('SECRET'));t.mock.restoreAll()
 }
})
test('payload retains blocks, seconds, DNF, returns and escapes Slack markup',()=>{
 const payload=new SlackService().buildPayload(data);const text=JSON.stringify(payload)
 assert.ok(text.includes('2.50초'));assert.ok(text.includes('DNF'));assert.ok(text.includes('2→1: 1'));assert.ok(!text.includes('<@everyone>'));assert.ok(!text.includes('*bad*'))
})
test('payload redacts government Slack webhook secrets too',()=>{
 const text=JSON.stringify(new SlackService().buildPayload({...data,groupNames:['https://hooks.slack-gov.com/services/SECRET']}))
 assert.ok(!text.includes('SECRET'))
})
