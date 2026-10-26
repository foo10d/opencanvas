import test from 'node:test';
import assert from 'node:assert/strict';
import {floodFill,contains} from '../dist/paint.mjs';
test('fill respects a closed boundary and does not wrap across rows',()=>{
 const image={width:7,height:7,data:new Uint8ClampedArray(7*7*4)};
 for(let y=1;y<=5;y++)for(let x=1;x<=5;x++)if(x===1||x===5||y===1||y===5)image.data[(y*7+x)*4+3]=255;
 floodFill(image,3,3);
 assert.equal(image.data[(3*7+3)*4+3],255);assert.equal(image.data[3],0);assert.equal(image.data[(6*7+6)*4+3],0);
 const before=image.data.slice();floodFill(image,3,3);assert.deepEqual(image.data,before);
});
test('lasso hit testing handles concave selections',()=>{
 const poly=[{x:0,y:0},{x:1,y:0},{x:1,y:.3},{x:.3,y:.3},{x:.3,y:1},{x:0,y:1}];
 assert.equal(contains(poly,{x:.1,y:.8}),true);assert.equal(contains(poly,{x:.8,y:.8}),false);
});

test('fill can recolor opaque black and leaves a distinct neighbor alone',()=>{
 const image={width:3,height:1,data:new Uint8ClampedArray([0,0,0,255,0,0,0,255,255,255,255,255])};
 floodFill(image,0,0,28,'#d47aef');
 assert.deepEqual([...image.data],[212,122,239,255,212,122,239,255,255,255,255,255]);
 floodFill(image,0,0,28,'#ffffff');
 assert.deepEqual([...image.data],Array(12).fill(255));
});
