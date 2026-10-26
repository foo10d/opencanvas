import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothPoint,mapHand,isPinched} from '../dist/motion.mjs';
test('smoothing dampens movement and zero smoothing follows exactly',()=>{
 assert.deepEqual(smoothPoint({x:0,y:0},{x:1,y:1},.5),{x:.5,y:.5});
 assert.deepEqual(smoothPoint({x:0,y:0},{x:1,y:1},0),{x:1,y:1});
});
test('calibrated range mirrors horizontal input and clamps edges',()=>{
 assert.deepEqual(mapHand({x:.5,y:.5},{x:.5,y:.5},2),{x:.5,y:.5});
 assert.deepEqual(mapHand({x:0,y:1},{x:.5,y:.5},2),{x:1,y:1});
});
test('pinch thresholds have hysteresis to reduce accidental switching',()=>{
 const pts=Array.from({length:21},()=>({x:0,y:0}));pts[9]={x:0,y:1};pts[8]={x:.4,y:0};
 assert.equal(isPinched(pts,false),false);assert.equal(isPinched(pts,true),true);
 pts[8]={x:.2,y:0};assert.equal(isPinched(pts,false),true);
 pts[8]={x:.6,y:0};assert.equal(isPinched(pts,true),false);
});
import {isPointing,stablePoint,gestureGate} from '../dist/motion.mjs';
test('pinch stays consistent when the hand rotates in 3D',()=>{
 const pts=Array.from({length:21},()=>({x:0,y:0,z:0}));pts[9]={x:0,y:1,z:0};pts[8]={x:.25,y:0,z:0};
 const rotated=pts.map(p=>({x:p.z,y:p.y,z:-p.x}));
 assert.equal(isPinched(pts),true);assert.equal(isPinched(rotated),true);
 pts[8]={x:0,y:0,z:.7};assert.equal(isPinched(pts),false);
});
test('pointing requires index extended and other fingers curled, independent of rotation',()=>{
 const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
 for(const [base,joint,tip] of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){p[base]={x:.1,y:.3,z:0};p[joint]={x:.1,y:.6,z:0};p[tip]={x:.1,y:.35,z:.1}}
 p[8]={x:.1,y:.9,z:0};assert.equal(isPointing(p),true);
 assert.equal(isPointing(p.map(v=>({x:v.z,y:v.x,z:v.y}))),true);
 p[12]={x:.1,y:.9,z:0};assert.equal(isPointing(p),false);
});
test('stabilizer ignores tiny jitter, follows deliberate movement, and resets at reacquisition',()=>{
 const initial={x:.5,y:.5};assert.deepEqual(stablePoint(initial,{x:.501,y:.501},.7),initial);
 const next=stablePoint(initial,{x:.7,y:.5},.7);assert.ok(next.x>.5&&next.x<.7);
 assert.deepEqual(stablePoint(null,{x:.8,y:.8},.7),{x:.8,y:.8});
});
test('gesture must be held briefly to begin ink and stops immediately on release',()=>{
 const state={since:null};assert.equal(gestureGate(state,true,0),false);assert.equal(gestureGate(state,true,121),true);
 assert.equal(gestureGate(state,false,122),false);assert.equal(gestureGate(state,true,123),false);
});

test('fast sweeps stay close to measured positions without overshoot',()=>{
 let filtered={x:.1,y:.5};
 for(let i=1;i<=40;i++){
  const raw={x:.1+i*.018,y:.5};filtered=stablePoint(filtered,raw,.7,1/60);
  assert.ok(raw.x-filtered.x<.012);assert.ok(filtered.x<=raw.x);
 }
 const reversed=stablePoint(filtered,{x:.7,y:.5},.7,1/60);
 assert.ok(reversed.x>=.7&&reversed.x<.72);
});
test('ink starts after 45ms and lifts immediately',()=>{
 const state={since:null};assert.equal(gestureGate(state,true,0),false);
 assert.equal(gestureGate(state,true,44),false);assert.equal(gestureGate(state,true,45),true);
 assert.equal(gestureGate(state,false,46),false);
});

function pointingPose(){
 const p=Array.from({length:21},()=>({x:0,y:0,z:0}));
 for(const [base,joint,tip] of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]){
  p[base]={x:.1,y:.3,z:0};p[joint]={x:.1,y:.6,z:0};p[tip]={x:.1,y:.35,z:.1};
 }
 p[8]={x:.1,y:.9,z:0};return p;
}
test('point mode rejects slightly bent fingers and partial curls',()=>{
 for(const tip of [12,16,20]){
  const p=pointingPose();p[tip]={x:.35,y:.78,z:0};assert.equal(isPointing(p),false,'slight bend must not draw');
  p[tip]={x:.38,y:.5,z:0};assert.equal(isPointing(p),false,'bend without fingertip returning to palm must not draw');
 }
 assert.equal(isPointing(pointingPose()),true);
 assert.equal(isPointing(Array.from({length:21},()=>({x:0,y:0,z:0}))),false);
});
test('strict curl detection is invariant under camera rotation and hand scale',()=>{
 const p=pointingPose(),a=.73;
 const rotated=p.map(v=>({x:3*(v.x*Math.cos(a)-v.z*Math.sin(a))+.4,y:3*v.y-.2,z:3*(v.x*Math.sin(a)+v.z*Math.cos(a))}));
 assert.equal(isPointing(rotated),true);
});
test('stationary hand micro-movements do not accumulate into a scribble',()=>{
 let p={x:.5,y:.5};
 for(let i=0;i<240;i++)p=stablePoint(p,{x:.5+Math.sin(i*1.8)*.0035,y:.5+Math.cos(i*2.3)*.0035},.7,1/60);
 assert.deepEqual(p,{x:.5,y:.5});
 const deliberate=stablePoint(p,{x:.56,y:.5},.7,1/60);assert.ok(deliberate.x>.55&&deliberate.x<.56);
 assert.deepEqual(stablePoint(p,{x:.501,y:.501},0),{x:.501,y:.501});
});

test('point gesture tolerates small curl changes only after a deliberate start',()=>{
 const p=pointingPose();assert.equal(isPointing(p),true);
 p[12]={x:.28,y:.5,z:0};
 assert.equal(isPointing(p,false),false,'partial curl cannot start ink');
 assert.equal(isPointing(p,true),true,'small relaxation retains an active stroke');
 p[12]={x:.35,y:.78,z:0};assert.equal(isPointing(p,true),false,'opening a finger lifts ink immediately');
 assert.equal(isPointing(null,true),false);
});
