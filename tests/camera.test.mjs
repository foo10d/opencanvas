import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraErrorMessage} from '../dist/camera-runtime.mjs';
test('camera errors identify actionable permission, device and timeout failures',()=>{
 assert.match(cameraErrorMessage({name:'NotAllowedError'}),/website settings/);
 assert.match(cameraErrorMessage({name:'NotReadableError'}),/busy/);
 assert.match(cameraErrorMessage({name:'NotFoundError'}),/no camera/);
 assert.match(cameraErrorMessage({name:'TimeoutError'}),/permission prompt/);
 assert.match(cameraErrorMessage({name:'Other',message:'detail'}),/detail/);
});
