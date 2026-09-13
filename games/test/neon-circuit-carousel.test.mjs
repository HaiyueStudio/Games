import assert from 'node:assert/strict';
import test from 'node:test';
import { carouselOffset, projectCard, cardUv, hitCarousel, swipeStep, carouselRelease, carouselMetrics } from '../neon-circuit/CarouselMath.ts';

test('carousel wraps three or four courses without losing the unwrapped rotation', () => {
  for (const count of [3,4]) {
    assert.equal(carouselOffset(0,count-1,count),1); assert.equal(carouselOffset(count-1,0,count),-1);
    assert.equal(carouselOffset(0,count,count),0); assert.equal(carouselOffset(count-1,-1,count),0);
    for (let position=-12;position<12;position+=0.07) for(let i=0;i<count;i++) assert.ok(Math.abs(carouselOffset(i,position,count))<=count/2);
  }
});
test('perspective projection and pointer inverse agree across responsive layouts and transitions', () => {
  for(const count of [3,4]) for(const [width,height] of [[1080,380],[358,420],[805,186]]) for(const position of [0,0.3,1,1.9,2.6,3.8]) {
    for(let i=0;i<count;i++) for(const [u,v] of [[0.15,0.2],[0.5,0.5],[0.85,0.8]]) {
      const p=projectCard(i,position,width,height,u,v,count), uv=cardUv(i,position,width,height,p.x,p.y,count);
      assert.ok(Math.abs(uv.u-u)<1e-9 && Math.abs(uv.v-v)<1e-9);
    }
  }
});
test('front card wins, side cards remain clickable and the hidden fourth card never intercepts input', () => {
  for(const count of [3,4]) for(const [width,height] of [[1080,380],[358,420],[805,186]]) for(let position=0;position<count;position++) {
    assert.equal(hitCarousel(position,width,height,width/2,height/2,count),position);
    const visible=new Set();
    for(let y=0;y<height;y+=5) for(let x=0;x<width;x+=5) visible.add(hitCarousel(position,width,height,x,y,count));
    for(const delta of [-1,0,1]) assert.ok(visible.has((position+delta+count)%count));
    if(count===4) assert.ok(!visible.has((position+2)%count));
    assert.equal(hitCarousel(position,width,height,-1,height/2,count),-1);
  }
});
test('swipes ignore tap jitter and vertical movement but accept short horizontal drags', () => {
  assert.equal(swipeStep(-100,10),1); assert.equal(swipeStep(100,10),-1);
  assert.equal(swipeStep(6,2),0); assert.equal(swipeStep(50,100),0);
  assert.equal(swipeStep(-9,0),1); assert.equal(swipeStep(9,0),-1);
  assert.equal(swipeStep(8,0),0);
});

test('every recognised short horizontal drag advances even with zero release velocity', () => {
  for (const [width,height] of [[1080,380],[358,420],[805,186]]) {
    for (const start of [-3,0,2,6]) for (const dx of [-36,-20,-9,9,20,36]) {
      assert.equal(carouselRelease(start,dx,0,width,height,0),start-Math.sign(dx));
    }
    for (const dx of [-8,0,8]) assert.equal(carouselRelease(0,dx,0,width,height,0),null);
    assert.equal(carouselRelease(0,10,30,width,height,0),null);
  }
});


test('fast throws cross multiple cards in their original direction, including full wraps', () => {
  for (const [width, height] of [[1080,380],[358,420]]) {
    const spacing = carouselMetrics(width, height).spacing;
    assert.equal(carouselRelease(0,-spacing * 0.4,0,width,height,0),1);
    const fast = carouselRelease(0,-spacing * 0.4,0,width,height,-spacing * 9);
    assert.ok(fast >= 2);
    assert.equal(carouselRelease(0,spacing * 0.4,0,width,height,spacing * 9),-fast);
    assert.equal(carouselRelease(6,-spacing * 2.6,0,width,height,0),9);
    assert.ok(carouselRelease(0,-spacing,0,width,height,-1e9) <= 5);
    assert.equal(carouselRelease(0,3,0,width,height,-10000),null);
    assert.equal(carouselRelease(0,50,100,width,height,-10000),null);
  }
});
