import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothPosition, chaseLayout, riderTravel } from '../fallback/src/chase-motion.ts';
test('骑乘动画分别跟随各自进度，静止一方车轮不转',()=>{
  assert.deepEqual(riderTravel(2,-2,'police'),[2,0]);
  assert.deepEqual(riderTravel(2,2,'thief'),[0,2]);
  assert.deepEqual(riderTravel(0,2,'police'),[0,2]);
});
test('移动平滑且不会越过实际位置',()=>{
  const next=smoothPosition(0,2,1/60);
  assert.ok(next>0&&next<2);
  let x=0;for(let i=0;i<120;i++) x=smoothPosition(x,2,1/60);
  assert.ok(Math.abs(x-2)<.001);
  assert.equal(smoothPosition(2,2,1/60),2);
});
test('两种角色视角都保留追逐双方且远距离适当压缩',()=>{
  for(const role of ['police','thief'] as const){
    for(const gap of [0,20,100,500]){
      const layout=chaseLayout(gap,role);
      assert.ok(layout.policeZ>=layout.thiefZ);
      assert.ok(Math.abs(layout.policeZ)<=12&&Math.abs(layout.thiefZ)<=12);
      assert.equal(layout.compressed,gap>30);
    }
  }
});
