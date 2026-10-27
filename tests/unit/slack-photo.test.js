import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePhoto } from '../../src/admin/photo.js'
globalThis.Image = class {}
test('photo decoder rejects corrupt bytes and always releases temporary URL',async t=>{
 let revoked=0
 t.mock.method(URL,'createObjectURL',()=> 'blob:test')
 t.mock.method(URL,'revokeObjectURL',()=>revoked++)
 t.mock.property(globalThis,'Image',class{set src(value){queueMicrotask(()=>this.onerror())}})
 await assert.rejects(validatePhoto(new Blob(['bad'],{type:'image/png'})))
 assert.equal(revoked,1)
})
test('photo decoder accepts browser-decoded SVG and releases temporary URL',async t=>{
 let revoked=0
 t.mock.method(URL,'createObjectURL',()=> 'blob:test')
 t.mock.method(URL,'revokeObjectURL',()=>revoked++)
 t.mock.property(globalThis,'Image',class{naturalWidth=10;naturalHeight=10;set src(value){queueMicrotask(()=>this.onload())}})
 await validatePhoto(new Blob(['<svg/>'],{type:'image/svg+xml'}))
 assert.equal(revoked,1)
})
