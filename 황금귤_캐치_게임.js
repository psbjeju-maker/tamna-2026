/* ============================================================
   황금귤 캐치 — 탐라문화제 앱(index.html) 안의 미니게임 코드
   canvas(#gcv)에 손가락으로 슬라이스하는 방식이라 순수 HTML
   마크업은 거의 없고 대부분 JS입니다. 이 파일만 떼서 쓰려면
   아래 "의존 요소"를 먼저 준비해야 합니다.

   ── 의존 요소 (index.html 다른 곳에 있음) ──
   · <canvas id="gcv"></canvas>            게임을 그리는 캔버스
   · var cv=$('#gcv'), ctx=cv.getContext('2d'), raf=null;
   · openStage(title) / stopGame()          게임 화면 열기/닫기
   · sfx(name,vol) / beep(freq,dur,type,vol) 효과음
     → sfx/slice.mp3, sfx/pop.mp3, sfx/boom.mp3, sfx/bonus.mp3, sfx/fanfare.mp3 필요
   · reward(rawPoint,label)                 보상 시트
   · S.best.catch                           오늘 최고 점수 저장소
   ============================================================ */

/* 귤 크기 4단계 — 클수록 여러 번 잘라야 부서지고, 대신 천천히 떨어진다 */
var CATCH_TIERS=[
  {r:20, need:1, val:8,  vMul:1.3,  glow:false}, // 아기 귤
  {r:30, need:1, val:12, vMul:1,    glow:false}, // 보통 귤
  {r:42, need:2, val:26, vMul:0.72, glow:false}, // 큰 귤
  {r:56, need:3, val:46, vMul:0.52, glow:true }  // 왕귤(황금)
];
function pickCatchTier(){
  var r=Math.random();
  if(r<0.42)return CATCH_TIERS[0];
  if(r<0.76)return CATCH_TIERS[1];
  if(r<0.93)return CATCH_TIERS[2];
  return CATCH_TIERS[3];
}
function segPointDist(p0,p1,cx,cy){
  var dx=p1.x-p0.x, dy=p1.y-p0.y, len2=dx*dx+dy*dy;
  if(len2===0)return Math.hypot(cx-p0.x,cy-p0.y);
  var t=Math.max(0,Math.min(1,((cx-p0.x)*dx+(cy-p0.y)*dy)/len2));
  return Math.hypot(cx-(p0.x+t*dx), cy-(p0.y+t*dy));
}
function gCatch(){
  openStage('황금귤 캐치');
  var W=cv.width,H=cv.height,items=[],score=0,t0=performance.now(),dur=30000,spawn=0;
  var lastPt=null, hitSet=null;
  var fx=[], pieces=[], flashes=[], shakeT=0, shakeMag=0;
  var trail=[], lastSliceSnd=0;
  var combo=0, comboUntil=0, popups=[];
  function pt(e){var r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*2,y:(e.clientY-r.top)*2}}
  /* 과즙 스프레이 — 자른 방향과 수직으로 즙이 튄다 */
  function juice(x,y,swipeAngle,c,n){
    n=n||8;
    for(var i=0;i<n;i++){
      var side=(i%2===0)?1:-1, a=swipeAngle+Math.PI/2*side+(Math.random()-.5)*.9, sp=2+Math.random()*6;
      fx.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:1,c:c,sz:3+Math.random()*3,grav:true});
    }
  }
  /* 잘린 귤이 절단면을 보이며 양쪽으로 갈라져 날아간다 */
  function splitFruit(it,swipeAngle){
    [1,-1].forEach(function(side){
      var a=swipeAngle+Math.PI/2*side;
      pieces.push({x:it.x,y:it.y,vx:Math.cos(a)*(2.4+Math.random()*1.6),vy:Math.sin(a)*(2.4+Math.random()*1.6)-1.4,
        rot:it.rot,vr:side*(0.1+Math.random()*.08),r:it.r,ang:swipeAngle+(side>0?0:Math.PI),glow:it.glow,life:1});
    });
  }
  /* 폭탄 — 불꽃 파편 + 확산되는 섬광 + 짧은 화면 흔들림 */
  function explode(x,y,r){
    flashes.push({x:x,y:y,t:0,r0:r*0.3,r1:r*2.3});
    shakeT=16; shakeMag=Math.min(14,r*0.16);
    for(var i=0;i<26;i++){
      var a=Math.random()*Math.PI*2, sp=2.5+Math.random()*7.5;
      var role=i%3;
      fx.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,l:1,
        c:role===0?'#181B2E':(role===1?'#F0605A':'#F5B331'),
        sz:role===0?4:6,grav:true});
    }
  }
  function popText(x,y,txt,c){popups.push({x:x,y:y,txt:txt,c:c,life:1})}
  function slice(p0,p1){
    var swipeAngle=Math.atan2(p1.y-p0.y,p1.x-p0.x);
    var now=performance.now();
    if(now-lastSliceSnd>110){lastSliceSnd=now;sfx('slice',0.35)}
    for(var i=items.length-1;i>=0;i--){var it=items[i];
      if(hitSet.indexOf(it)>=0)continue;
      if(segPointDist(p0,p1,it.x,it.y)<it.r+22){
        hitSet.push(it);
        if(it.bomb){score=Math.max(0,score-30);explode(it.x,it.y,it.r);sfx('boom',0.8);combo=0;items.splice(i,1);continue}
        it.hits++;
        it.marks.push(swipeAngle-it.rot);
        if(it.hits>=it.need){
          score+=it.val;splitFruit(it,swipeAngle);juice(it.x,it.y,swipeAngle,it.glow?'#F5B331':'#F8CB7A',10);
          sfx('pop',0.55);
          if(now<comboUntil)combo++;else combo=1;
          comboUntil=now+900;
          if(combo>=2){var bonus=(combo-1)*3;score+=bonus;popText(it.x,it.y-it.r-14,'COMBO ×'+combo+'  +'+bonus,combo>=5?'#F0605A':'#F5B331');beep(520+combo*40,0.09,'square',0.1)}
          items.splice(i,1);
        }
        else{juice(it.x,it.y,swipeAngle,'#FBEBC9',6)}
      }
    }
  }
  cv.onpointerdown=function(e){hitSet=[];lastPt=pt(e);trail=[{x:lastPt.x,y:lastPt.y,t:performance.now()}];slice(lastPt,lastPt)};
  cv.onpointermove=function(e){if(!lastPt)return;var p=pt(e);slice(lastPt,p);lastPt=p;trail.push({x:p.x,y:p.y,t:performance.now()});if(trail.length>16)trail.shift()};
  cv.onpointerup=function(){lastPt=null;hitSet=null};
  cv.onpointercancel=cv.onpointerup;
  function loop(now){
    var el=now-t0, left=Math.max(0,dur-el);
    if(left<=0){finishCatch(score);return}
    spawn-=16;
    if(spawn<=0){spawn=Math.max(170,540-el/60);
      var bomb=Math.random()<0.18;
      var tier=bomb?null:pickCatchTier();
      /* 폭탄은 귤보다 2~3배 크게 — 눈에 확 띄는 대신 화면을 많이 가려서 더 위협적이다 */
      items.push(bomb
        ? {x:60+Math.random()*(W-120),y:-40,r:26*(2+Math.random()),v:2.2+Math.random()*2.2+el/16000,bomb:true,rot:Math.random()*6}
        : {x:60+Math.random()*(W-120),y:-40,r:tier.r,need:tier.need,hits:0,val:tier.val,glow:tier.glow,marks:[],
           v:(2.2+Math.random()*1.6+el/18000)*tier.vMul,bomb:false,rot:Math.random()*6});
    }
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(shakeT>0){ctx.translate((Math.random()-.5)*shakeMag*2,(Math.random()-.5)*shakeMag*2);shakeT--}
    var grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#181B2E');grd.addColorStop(1,'#0F1120');
    ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
    items.forEach(function(it){
      it.y+=it.v*2.4;it.rot+=.02;
      ctx.save();ctx.translate(it.x,it.y);ctx.rotate(it.rot);
      if(it.bomb){ctx.fillStyle='#21253C';ctx.beginPath();ctx.arc(0,0,it.r,0,7);ctx.fill();
        ctx.fillStyle='#F0605A';ctx.fillRect(-it.r*.15,-it.r-it.r*.5,it.r*.3,it.r*.5);}
      else{var g2=ctx.createRadialGradient(-it.r*.3,-it.r*.3,2,0,0,it.r);
        g2.addColorStop(0,it.glow?'#FBEBC9':'#F8CB7A');g2.addColorStop(1,it.glow?'#C98F22':'#C98F22');
        ctx.fillStyle=g2;ctx.beginPath();ctx.arc(0,0,it.r,0,7);ctx.fill();
        if(it.glow){ctx.strokeStyle='rgba(255,233,150,.6)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,it.r+3,0,7);ctx.stroke();}
        ctx.fillStyle='#2E7F69';ctx.fillRect(-3,-it.r-9,6,10);
        /* 잘린 만큼 흰 칼자국이 남는다 — 큰 귤일수록 여러 줄이 쌓인다 */
        it.marks.forEach(function(a){
          ctx.save();ctx.rotate(a);
          ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=Math.max(2,it.r*0.07);
          ctx.beginPath();ctx.moveTo(-it.r*0.85,0);ctx.lineTo(it.r*0.85,0);ctx.stroke();
          ctx.restore();
        });
      }
      ctx.restore();
    });
    items=items.filter(function(it){return it.y<H+80});
    /* 갈라진 귤 반쪽 — 절단면(흰 테두리)을 보이며 날아간다 */
    pieces.forEach(function(p){
      p.x+=p.vx;p.y+=p.vy;p.vy+=0.22;p.rot+=p.vr;p.life-=0.018;
      ctx.save();ctx.globalAlpha=Math.max(0,p.life);ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      ctx.beginPath();ctx.arc(0,0,p.r,p.ang,p.ang+Math.PI);ctx.closePath();
      var pg=ctx.createRadialGradient(0,0,2,0,0,p.r);
      pg.addColorStop(0,p.glow?'#FBEBC9':'#F8CB7A');pg.addColorStop(1,p.glow?'#C98F22':'#C98F22');
      ctx.fillStyle=pg;ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=Math.max(2,p.r*.08);
      ctx.beginPath();ctx.moveTo(Math.cos(p.ang)*p.r,Math.sin(p.ang)*p.r);
      ctx.lineTo(Math.cos(p.ang+Math.PI)*p.r,Math.sin(p.ang+Math.PI)*p.r);ctx.stroke();
      ctx.restore();ctx.globalAlpha=1;
    });
    pieces=pieces.filter(function(p){return p.life>0&&p.y<H+100});
    /* 폭탄 섬광 */
    flashes.forEach(function(fl){
      fl.t++;var p=Math.min(1,fl.t/18);
      var rad=fl.r0+(fl.r1-fl.r0)*p;
      ctx.globalAlpha=1-p;
      var fg=ctx.createRadialGradient(fl.x,fl.y,0,fl.x,fl.y,rad);
      fg.addColorStop(0,'rgba(255,240,200,.9)');fg.addColorStop(.4,'rgba(255,140,60,.55)');fg.addColorStop(1,'rgba(240,96,90,0)');
      ctx.fillStyle=fg;ctx.beginPath();ctx.arc(fl.x,fl.y,rad,0,7);ctx.fill();ctx.globalAlpha=1;
    });
    flashes=flashes.filter(function(fl){return fl.t/18<1});
    fx.forEach(function(p){p.x+=p.vx*2;p.y+=p.vy*2;if(p.grav)p.vy+=.16;p.l-=.045;
      ctx.globalAlpha=Math.max(0,p.l);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.sz||7,0,7);ctx.fill();ctx.globalAlpha=1});
    fx=fx.filter(function(p){return p.l>0});
    /* 칼날 궤적 — 최근 포인트를 밝은 헤드에서 꼬리로 갈수록 얇고 투명하게 잇는다 */
    var tnow=performance.now();
    trail=trail.filter(function(p){return tnow-p.t<140});
    if(trail.length>1){
      for(var ti=1;ti<trail.length;ti++){
        var a0=trail[ti-1],a1=trail[ti],age=(tnow-a1.t)/140,al=Math.max(0,1-age);
        ctx.strokeStyle='rgba(230,250,255,'+(al*0.95).toFixed(2)+')';
        ctx.lineWidth=Math.max(1.5,10*al);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(a0.x,a0.y);ctx.lineTo(a1.x,a1.y);ctx.stroke();
        ctx.strokeStyle='rgba(79,195,161,'+(al*0.35).toFixed(2)+')';
        ctx.lineWidth=Math.max(3,20*al);
        ctx.beginPath();ctx.moveTo(a0.x,a0.y);ctx.lineTo(a1.x,a1.y);ctx.stroke();
      }
    }
    popups.forEach(function(p){
      p.y-=0.6;p.life-=0.018;
      ctx.globalAlpha=Math.max(0,Math.min(1,p.life*1.4));
      ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';
      ctx.fillStyle=p.c;ctx.fillText(p.txt,p.x,p.y);ctx.globalAlpha=1;
    });
    popups=popups.filter(function(p){return p.life>0});
    ctx.restore();
    /* ---- HUD: 점수 · 콤보 · 시간바 (흔들림 영향 안 받게 restore 이후에 그림) ---- */
    var timePct=Math.max(0,left/dur);
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(0,0,W,7);
    var tbar=ctx.createLinearGradient(0,0,W,0);
    tbar.addColorStop(0,'#4FC3A1');tbar.addColorStop(1,timePct<0.25?'#F0605A':'#F5B331');
    ctx.fillStyle=tbar;ctx.fillRect(0,0,W*timePct,7);
    ctx.textAlign='left';ctx.font='800 15px SCDream, sans-serif';ctx.fillStyle='rgba(234,244,255,.7)';
    ctx.fillText('TIME',22,36);
    ctx.font='800 30px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
    ctx.fillText(Math.ceil(left/1000)+'s',22,66);
    ctx.textAlign='right';ctx.font='800 15px SCDream, sans-serif';ctx.fillStyle='rgba(245,179,49,.75)';
    ctx.fillText('SCORE',W-22,36);
    ctx.font='800 34px SCDream, sans-serif';ctx.fillStyle='#F5B331';
    ctx.shadowColor='rgba(245,179,49,.55)';ctx.shadowBlur=14;
    ctx.fillText(String(score),W-22,70);
    ctx.shadowBlur=0;
    if(combo>=2&&tnow<comboUntil+250){
      ctx.textAlign='center';ctx.font='800 17px SCDream, sans-serif';ctx.fillStyle='#F0605A';
      ctx.fillText('🔥 '+combo+' 콤보',W/2,40);
    }
    ctx.restore();
    raf=requestAnimationFrame(loop);
  }
  raf=requestAnimationFrame(loop);
}
function finishCatch(score){
  stopGame();
  var isBest=score>(S.best.catch||0);
  if(isBest)S.best.catch=score;
  sfx(isBest?'fanfare':'bonus',0.7);
  reward(score/4,'황금귤 캐치 · '+score+'점'+(isBest?' · 신기록!':''));
}
