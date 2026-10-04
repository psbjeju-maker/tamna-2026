/* 소별왕의 가짜 해를 쏴라! — 도전형 v2 (탐라문화제 놀이터 미니게임)
   - 작은 이동 표적을 예측해서 쏘고, 콤보로 점수를 올리고, 보스의 잠깐 열리는 약점을 3번 맞히면 클리어.
   - 자체 완결 페이지. 부모 앱(index.html gSun)이 iframe 으로 띄우고
     window.onGameComplete(result) / window.onGameExit() / window.getBest() 를 주입한다.
   - 서버 보상은 부모가 cleared(=보스 처치)일 때만 attemptId 당 1회 요청한다. */
(function(){
'use strict';

/* ---------- 튜닝값 (전부 여기서 조정) ---------- */
var CFG={
  worldW:390, minWorldH:640, maxStageCss:560,
  gameSec:45, bossAt:30,
  fireGapMs:320, cancelPx:8, maxAngle:1.22 /* ±70° */,
  flightSec:0.38,          /* 플레이 영역 한가운데까지 걸리는 비행시간 → 화살 속도 자동 산출 */
  pullSpeedVar:0.06,       /* 당김에 따른 속도 차이(±) — 작게 */
  pullMaxPx:110, arrowLen:66, bowWidth:0.46,
  hitScale:1.08,           /* 몸체 반경 보정 */
  score:{fake:100, trueHit:-100, weak:300, bossKill:1000, perSec:50},
  comboMult:[[10,2],[6,1.5],[3,1.2]],
  grades:[[5500,'S'],[4000,'A'],[2500,'B'],[1500,'C'],[0,'D']],
  heatStart:0.18, heatClearAt:20,
  respawnMin:0.4, respawnMax:0.7,
  gapBodies:1.5,           /* 몸체 간 최소 여유 = 지름 × 1.5 */
  /* 단계: until=늦어도 넘어가는 초, hitsNext=누적 명중 시 조기 진입, r=몸체 반경(px), spd=[최소,최대] px/s */
  phases:[
    {name:'1단계 · 느린 해',   until:10, hitsNext:5,  fakes:3, trues:1, r:15.5, spd:[31,47],  bob:5,  sine:0,  rev:false},
    {name:'2단계 · 춤추는 해', until:22, hitsNext:12, fakes:4, trues:1, r:13.5, spd:[55,78],  bob:4,  sine:20, rev:false},
    {name:'3단계 · 재빠른 해', until:30, hitsNext:0,  fakes:4, trues:2, r:12,   spd:[78,109], bob:4,  sine:10, rev:true, clouds:true}
  ],
  revEvery:[1.2,2.4], revWarn:0.25,
  cloud:{w:130, spd:[330,380], every:[3,5]},
  boss:{r:35, hp:3, spd:40, lastHpSpd:1.15, introSec:0.5,
        weakR:8.5, weakY:0.55, closed:1.3, warn:0.5, open:1.2},
  bodyRatio:{true:0.28, fake:0.27, boss:0.37, weak:0.2, shield:0.41}  /* 이미지 한 변 대비 반경 */
};
var LINES={
  start:'가짜 해 때문에 제주가 너무 뜨거워졌어. 나랑 하늘을 되찾자!',
  control:'아래에서 당겨 조준하고, 손을 놓으면 발사!',
  boss:'제주의 하늘을 되찾았구나!',
  retry:'조금만 더! 보호막이 열릴 때를 노려봐.'
};
var IMG_SRC={bg:'img/01_jeju_background.jpg',trueSun:'img/02_true_sun.png',fake:'img/03_fake_sun.png',
  boss:'img/04_boss_sun.png',bow:'img/05_bow.png',arrow:'img/06_arrow.png',burst:'img/07_hit_burst.png',
  cloud:'img/08_cloud.png',weak:'img/09_boss_weakpoint.png',shield:'img/10_boss_shield.png'};

/* ---------- DOM ---------- */
var $=function(id){return document.getElementById(id)};
var cv=$('cv'),ctx=cv.getContext('2d'),ctrl=$('ctrl');
var overlay=$('overlay'),panel=$('panel'),hud=$('hud'),tipEl=$('tip'),skipBtn=$('skip'),muteBtn=$('mute');
var hudTime=$('hudTime'),hudScore=$('hudScore'),hudBest=$('hudBest'),hudStage=$('hudStage'),
    hudCombo=$('hudCombo'),hudComboN=$('hudComboN'),goalEl=$('goal'),goalText=$('goalText'),goalFill=$('goalFill');
var reduceMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 이미지 ---------- */
var IMG={};
function loadImages(){
  return Promise.all(Object.keys(IMG_SRC).map(function(k){
    return new Promise(function(res,rej){
      var im=new Image();im.onload=function(){IMG[k]=im;res()};im.onerror=rej;im.src=IMG_SRC[k];
    });
  }));
}

/* ---------- 화면 크기 / 논리 좌표 ---------- */
var dpr=1,cssW=0,cssH=0,scale=1,offX=0,WH=700;
var L={};
var BOW_RATIO=342/800;
function resize(){
  cssW=cv.clientWidth||innerWidth;cssH=cv.clientHeight||innerHeight;
  dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);
  scale=Math.min(cssW,CFG.maxStageCss)/CFG.worldW;WH=cssH/scale;
  if(WH<CFG.minWorldH){scale=cssH/CFG.minWorldH;WH=CFG.minWorldH}
  offX=(cssW-CFG.worldW*scale)/2;
  var bw=CFG.worldW*CFG.bowWidth,bh=bw*BOW_RATIO;
  L={top:112,bottom:Math.round(WH*0.58),bowX:CFG.worldW/2,bowY:WH-104,bowW:bw,bowH:bh,stringY:bh*0.24};
  var tipY=L.bowY-(CFG.arrowLen-L.stringY);
  L.arrowSpeed=(tipY-(L.top+L.bottom)/2)/CFG.flightSec;
  /* 조작 영역: 플레이 영역 아래 ~ 바닥 */
  ctrl.style.top=((L.bottom+40)*scale)+'px';
  suns.forEach(function(s){clampSun(s)});
}
function toWorld(e){
  var r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left-offX)/scale,y:(e.clientY-r.top)/scale};
}

/* ---------- 사운드 (기존 앱 효과음 + Web Audio 합성) ---------- */
var AC=null,BUF={},muted=false,lastPlay={},voices=0;
try{muted=localStorage.getItem('sobyeolSunMute')==='1'}catch(e){}
function paintMute(){
  muteBtn.classList.toggle('off',muted);muteBtn.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');
  $('muteIcon').setAttribute('d',muted
    ?'M4 9v6h4l5 4V5L8 9H4zm11.6 3 2.7-2.7 1.4 1.4L17 12.4l2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.7-2.7 1.4-1.4z'
    :'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z');
}
muteBtn.onclick=function(){muted=!muted;try{localStorage.setItem('sobyeolSunMute',muted?'1':'0')}catch(e){};paintMute()};
paintMute();
function initAudio(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return}
  ['slice','pop','bonus','boom','fanfare'].forEach(function(n){
    fetch('../../sfx/'+n+'.mp3').then(function(r){return r.arrayBuffer()})
      .then(function(a){return new Promise(function(res,rej){AC.decodeAudioData(a,res,rej)})})
      .then(function(b){BUF[n]=b})['catch'](function(){});
  });
}
function canPlay(key,gap){
  if(muted||!AC||AC.state!=='running'||voices>=6)return false;
  var t=performance.now();if(lastPlay[key]&&t-lastPlay[key]<gap)return false;
  lastPlay[key]=t;return true;
}
function play(name,vol,rate){
  if(!canPlay(name,60))return;
  if(!BUF[name]){synth(name,rate);return}
  var s=AC.createBufferSource(),g=AC.createGain();
  s.buffer=BUF[name];s.playbackRate.value=rate||1;g.gain.value=vol==null?0.6:vol;
  s.connect(g).connect(AC.destination);voices++;s.onended=function(){voices--};s.start();
}
function tone(freq,dur,type,vol,slide){
  if(!AC||muted||AC.state!=='running')return;
  var t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);
  g.gain.setValueAtTime(vol||0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g).connect(AC.destination);voices++;o.onended=function(){voices--};o.start(t);o.stop(t+dur);
}
function synth(name,rate){
  var r=rate||1;
  if(name==='slice')tone(700*r,0.09,'triangle',0.12,1400*r);
  else if(name==='pop')tone(520,0.12,'square',0.12,980);
  else if(name==='bonus')tone(880,0.16,'triangle',0.15,1320);
  else if(name==='boom')tone(180,0.4,'sawtooth',0.18,60);
  else if(name==='fanfare'){tone(523,0.2,'triangle',0.16);setTimeout(function(){tone(659,0.2,'triangle',0.16)},150);setTimeout(function(){tone(784,0.35,'triangle',0.16)},300)}
}
function sTrue(){if(canPlay('true',120))tone(220,0.22,'square',0.12,150)}
function sTing(){if(canPlay('ting',80))tone(1500,0.12,'triangle',0.1,1100)}
function sBeep(hi){if(canPlay('beep'+hi,100))tone(hi?880:600,0.12,'sine',0.18)}
function buzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}

/* ---------- 상태 ---------- */
var state='loading',prevState=null,practiced=false;
var suns=[],arrows=[],fx=[],texts=[],clouds=[],spawnQ=[],boss=null;
var aim=null,lastShot=-1e9,recoil=0,hitStop=0,shake=0,heat=CFG.heatStart,heatTarget=CFG.heatStart;
var gameT=0,score=0,combo=0,bestCombo=0,hits=0,weakHits=0,shots=0,trueHits=0,bossDefeated=false,bossEntered=false;
var phaseIdx=0,countN=0,countT=0,endT=0,attemptId=null,clock=0,cloudT=0;
var seqNext=0,seqApply=0,outcomes={};
var lastTs=0,hudCache={};

function resetRun(){
  suns=[];arrows=[];fx=[];texts=[];clouds=[];spawnQ=[];boss=null;aim=null;
  gameT=0;score=0;combo=0;bestCombo=0;hits=0;weakHits=0;shots=0;trueHits=0;bossDefeated=false;bossEntered=false;
  phaseIdx=0;heat=heatTarget=CFG.heatStart;hitStop=0;shake=0;endT=0;cloudT=CFG.cloud.every[0];
  seqNext=0;seqApply=0;outcomes={};hudCache={};
}
function rnd(a,b){return a+Math.random()*(b-a)}

/* ---------- 해 ---------- */
var uid=0;
function makeSun(type,x,y,r,spd){
  var dir=Math.random()<.5?-1:1;
  return {id:++uid,type:type,x:x,y:y,px:x,py:y,by:y,r:r,rT:r,vx:dir*spd,ph:Math.random()*6.28,
    bob:4,sine:0,alive:true,dying:0,flinch:0,born:0,flash:0,squash:0,leave:0,ring:0,intro:0,
    revT:rnd(CFG.revEvery[0],CFG.revEvery[1]),trail:[],trailT:0};
}
function sunImg(s){return s.type==='true'?IMG.trueSun:s.type==='boss'?IMG.boss:IMG.fake}
function sunDrawSize(s){return s.r/CFG.bodyRatio[s.type]}
function clampSun(s){
  var m=s.type==='boss'?s.r+30:s.r+8;
  s.x=Math.max(m,Math.min(CFG.worldW-m,s.x));
  var top=L.top+s.r+(s.sine||0)+s.bob,bot=Math.max(top+4,L.bottom-s.r-(s.sine||0)-s.bob);
  s.by=Math.max(top,Math.min(bot,s.by));
}
function distSeg(px,py,ax,ay,bx,by){
  var dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));
  var qx=ax+dx*t-px,qy=ay+dy*t-py;return Math.sqrt(qx*qx+qy*qy);
}
function minGap(a,b){return a+b+CFG.gapBodies*(a+b)}  /* 두 몸체 사이 여유 = 평균 지름 × 1.5 */
function placeOk(type,x,y,r){
  for(var i=0;i<suns.length;i++){
    var o=suns[i];if(!o.alive||o.leave||o.dying)continue;
    var dx=o.x-x,dy=o.by-y;if(Math.sqrt(dx*dx+dy*dy)<minGap(o.r,r))return false;
    /* 활 → 가짜 사이에 진짜가 끼는 배치 금지 */
    if(type==='fake'&&o.type==='true'&&distSeg(o.x,o.by,L.bowX,L.bowY,x,y)<o.r+r)return false;
    if(type==='true'&&o.type==='fake'&&distSeg(x,y,L.bowX,L.bowY,o.x,o.by)<r+o.r)return false;
  }
  return true;
}
function phaseSpeed(P){return rnd(P.spd[0],P.spd[1])}
function spawn(type){
  var P=CFG.phases[phaseIdx];
  for(var k=0;k<40;k++){
    var r=P.r,m=r+12;
    var x=rnd(m,CFG.worldW-m);
    var y=rnd(L.top+r+P.sine+6,Math.max(L.top+r+P.sine+16,L.bottom-r-P.sine));
    if(placeOk(type,x,y,r)){
      var s=makeSun(type,x,y,r,phaseSpeed(P)*(type==='true'?0.7:1));
      s.bob=P.bob;s.sine=P.sine;s.born=0.25;suns.push(s);return true;
    }
  }
  return false;
}
function countType(t){var n=0;suns.forEach(function(s){if(s.alive&&!s.leave&&!s.dying&&s.type===t)n++});return n}
function queuedType(t){var n=0;spawnQ.forEach(function(q){if(q.type===t)n++});return n}
function fillPhase(immediate){
  var P=CFG.phases[phaseIdx];
  ['fake','true'].forEach(function(t){
    var want=(t==='fake'?P.fakes:P.trues)-countType(t)-queuedType(t);
    for(var i=0;i<want;i++)spawnQ.push({type:t,at:immediate?0:rnd(CFG.respawnMin,CFG.respawnMax)});
  });
}
function setPhase(i){
  phaseIdx=i;var P=CFG.phases[i];
  /* 기존 해도 새 단계 크기·속도로 부드럽게 맞춘다(순간이동 없음) */
  suns.forEach(function(s){
    if(s.type==='boss'||s.leave)return;
    s.rT=P.r;s.bob=P.bob;s.sine=P.sine;
    var sp=phaseSpeed(P)*(s.type==='true'?0.7:1);s.vx=(s.vx<0?-1:1)*sp;
  });
  fillPhase(false);
}

/* ---------- 이펙트 (동시 4개 제한) ---------- */
function addFx(o){fx.push(o);while(fx.length>4)fx.shift()}
function addText(x,y,str,color,size){texts.push({x:x,y:y,s:str,c:color||'#fff',z:size||18,t:0});while(texts.length>4)texts.shift()}

/* ---------- 입력: 하단 조작 영역에서 새총식 당겨 쏘기 ---------- */
ctrl.addEventListener('pointerdown',function(e){
  if(aim||!(state==='play'||state==='practice'))return;
  initAudio();
  var p=toWorld(e);
  try{ctrl.setPointerCapture(e.pointerId)}catch(err){}
  aim={id:e.pointerId,sx:p.x,sy:p.y,x:p.x,y:p.y,armed:false,a:0,t:0};
  e.preventDefault();
});
ctrl.addEventListener('pointermove',function(e){
  if(!aim||e.pointerId!==aim.id)return;
  var p=toWorld(e);aim.x=p.x;aim.y=p.y;updAim();
});
ctrl.addEventListener('pointerup',function(e){
  if(!aim||e.pointerId!==aim.id)return;
  var p=toWorld(e);aim.x=p.x;aim.y=p.y;updAim();
  var a=aim;aim=null;
  if(a.armed&&(state==='play'||state==='practice'))fire(a.a,a.t);
});
function cancelAim(e){if(aim&&(!e||e.pointerId===aim.id))aim=null}
ctrl.addEventListener('pointercancel',cancelAim);
ctrl.addEventListener('lostpointercapture',cancelAim);
function updAim(){
  var dx=aim.x-aim.sx,dy=aim.y-aim.sy,len=Math.sqrt(dx*dx+dy*dy);
  aim.armed=len>=CFG.cancelPx;
  if(!aim.armed){aim.t=0;return}
  var a=Math.atan2(-dx,Math.max(dy,6)); /* 당긴 반대 방향, 위쪽 부채꼴 */
  aim.a=Math.max(-CFG.maxAngle,Math.min(CFG.maxAngle,a));
  aim.t=Math.min(1,len/CFG.pullMaxPx);
}
function fireReady(){return clock*1000-lastShot>=CFG.fireGapMs}
function fire(a,t){
  if(!fireReady())return; /* 320ms 안의 재발사는 무시(자동 연사 없음) */
  lastShot=clock*1000;
  var ux=Math.sin(a),uy=-Math.cos(a);
  var tipD=CFG.arrowLen-L.stringY;
  var tx=L.bowX+ux*tipD,ty=L.bowY+uy*tipD;
  var sp=L.arrowSpeed*(1-CFG.pullSpeedVar+2*CFG.pullSpeedVar*t);
  var ar={x:tx,y:ty,px:tx,py:ty,vx:ux*sp,vy:uy*sp,a:a,seq:-1};
  if(state==='play'){ar.seq=seqNext++;shots++}
  arrows.push(ar);
  recoil=0.08;
  var tier=combo>=10?3:combo>=6?2:combo>=3?1:0;
  play('slice',0.35,1.15+tier*0.09); /* 콤보가 오를수록 발사음 음정 상승 */
}

/* ---------- 판정 ---------- */
/* 표적도 움직이므로 표적 기준 상대 선분으로 판정(빠른 화살이 작은 해를 뚫고 지나가는 누락 방지) */
function relHit(ar,cx0,cy0,cx1,cy1,r){
  var x0=ar.px-cx0,y0=ar.py-cy0,x1=ar.x-cx1,y1=ar.y-cy1;
  var dx=x1-x0,dy=y1-y0,A=dx*dx+dy*dy,B=2*(x0*dx+y0*dy),C=x0*x0+y0*y0-r*r;
  if(C<=0)return 0;if(A===0)return -1;
  var D=B*B-4*A*C;if(D<0)return -1;
  var s=(-B-Math.sqrt(D))/(2*A);return s>=0&&s<=1?s:-1;
}
function weakPos(b,usePrev){
  var x=usePrev?b.px:b.x,y=usePrev?b.py:b.y;return {x:x,y:y+b.r*CFG.boss.weakY};
}
function hitTest(ar){
  var best=null,bs=2,kind=null;
  suns.forEach(function(s){
    if(!s.alive||s.dying||s.leave||s.born>0.15)return;
    if(s.type==='boss'){
      if(s.intro>0)return;
      if(s.shield==='open'){ /* 열림이면 약점을 먼저 확인 */
        var w0=weakPos(s,true),w1=weakPos(s,false);
        var sw=relHit(ar,w0.x,w0.y,w1.x,w1.y,CFG.boss.weakR*CFG.hitScale);
        if(sw>=0&&sw<bs){bs=sw;best=s;kind='weak';return}
      }
      var sb=relHit(ar,s.px,s.py,s.x,s.y,s.r*1.1);
      if(sb>=0&&sb<bs){bs=sb;best=s;kind='shield'}
      return;
    }
    var sc=relHit(ar,s.px,s.py,s.x,s.y,s.r*CFG.hitScale);
    if(sc>=0&&sc<bs){bs=sc;best=s;kind=s.type}
  });
  return best?{s:best,kind:kind}:null;
}
function comboMult(c){for(var i=0;i<CFG.comboMult.length;i++)if(c>=CFG.comboMult[i][0])return CFG.comboMult[i][1];return 1}

/* 화살 결과: 그림 반응은 즉시, 점수·콤보는 발사 순서대로 적용 */
function resolve(ar,res){
  if(ar.seq<0)return;
  outcomes[ar.seq]=res;
  while(outcomes[seqApply]){applyOutcome(outcomes[seqApply]);delete outcomes[seqApply];seqApply++}
}
function applyOutcome(o){
  if(o.kind==='fake'){
    combo++;bestCombo=Math.max(bestCombo,combo);hits++;
    var m=comboMult(combo),p=Math.round(CFG.score.fake*m);score+=p;
    addText(o.x,o.y-18,'+'+p+(m>1?'  ×'+m:''),'#F5B331',m>1?19:17);
    heatTarget=CFG.heatStart*Math.max(0,1-hits/CFG.heatClearAt);
    comboFx();checkEarlyPhase();
  }else if(o.kind==='weak'){
    combo++;bestCombo=Math.max(bestCombo,combo);weakHits++;
    score+=CFG.score.weak;addText(o.x,o.y-26,'+'+CFG.score.weak,'#7FE3C6',21);comboFx();
    if(o.kill){
      var left=Math.max(0,Math.floor(CFG.gameSec-gameT)),bonus=CFG.score.bossKill+left*CFG.score.perSec;
      score+=bonus;addText(CFG.worldW/2,(L.top+L.bottom)/2,'+'+bonus,'#F5B331',28);
    }
  }else if(o.kind==='true'){
    combo=0;trueHits++;score=Math.max(0,score+CFG.score.trueHit);
    addText(o.x,o.y+20,String(CFG.score.trueHit),'#FF8A84',16);
  }else{ /* shield, miss */
    combo=0;
  }
  updHud();
}
function comboFx(){
  if(combo===3||combo===6||combo===10||(combo>10&&combo%5===0)){
    addText(L.bowX,L.bowY-L.bowH-40,combo+' 콤보!','#7FE3C6',21);play('bonus',0.4);
    hudCombo.classList.remove('pop');void hudCombo.offsetWidth;hudCombo.classList.add('pop');
  }
}
function checkEarlyPhase(){
  if(bossEntered)return;
  var P=CFG.phases[phaseIdx];
  if(P.hitsNext&&hits>=P.hitsNext&&phaseIdx<CFG.phases.length-1)setPhase(phaseIdx+1);
}
function onHit(h,ar){
  var s=h.s;
  if(h.kind==='true'){
    s.flinch=0.45;
    addText(s.x,s.y-s.r-16,'진짜 해는 지켜줘!','#FF8A84',16);
    sTrue();buzz(40);resolve(ar,{kind:'true',x:s.x,y:s.y});
    if(state==='practice')tipEl.textContent='웃는 해는 진짜 해야. 보라 불꽃 해를 맞혀!';
    return;
  }
  if(h.kind==='shield'){
    s.ring=0.25;sTing();
    addFx({ring:true,x:s.x,y:s.y,size:s.r*1.25,t:0,dur:0.25});
    if(s.shield!=='open')addText(s.x,s.y-s.r-14,'보호막!','#C9E9FF',15);
    resolve(ar,{kind:'shield'});return;
  }
  hitStop=0.04;buzz(15);
  if(h.kind==='weak'){
    s.hp--;s.squash=0.2;s.flash=0.15;s.shield='closed';s.cyc=0;
    var wp=weakPos(s,false);
    addFx({img:'burst',x:wp.x,y:wp.y,size:CFG.boss.weakR*6,t:0,dur:0.25});
    var kill=s.hp<=0;
    if(kill){
      s.dying=0.45;bossDefeated=true;heatTarget=0;
      addFx({img:'burst',x:s.x,y:s.y,size:sunDrawSize(s)*1.7,t:0,dur:0.5});
      play('boom',0.7);buzz(60);shake=reduceMotion?0:0.15;
      endT=0.5; /* 500ms 정착 후 결과 */
    }else{play('pop',0.55,0.8);shake=reduceMotion?0:0.08;
      if(s.hp===1)s.vx*=CFG.boss.lastHpSpd;}
    resolve(ar,{kind:'weak',x:wp.x,y:wp.y,kill:kill});
    return;
  }
  /* 가짜 해 */
  s.dying=0.12;s.flash=0.12;
  addFx({img:'burst',x:s.x,y:s.y,size:sunDrawSize(s)*1.3,t:0,dur:0.26});
  play('pop',0.6);
  if(state==='practice'){practiceHit();return}
  resolve(ar,{kind:'fake',x:s.x,y:s.y});
}

/* ---------- 흐름 ---------- */
function showPanel(html,bare){
  frameDirty=true;
  panel.innerHTML=html;overlay.hidden=false;overlay.classList.toggle('panel-wrap--bare',!!bare);
  panel.style.background=bare?'transparent':'';
}
function hidePanel(){overlay.hidden=true}
function setPlayUi(on){hud.hidden=!on;goalEl.hidden=!on;if(!on){hudCombo.hidden=true}}
function showIntro(){
  state='intro';resetRun();setPlayUi(false);skipBtn.hidden=true;tipEl.hidden=true;
  var best=getBest();
  showPanel(
    '<h1>소별왕의 가짜 해를 쏴라!</h1>'+
    '<p class="panel__line">'+LINES.start+'</p>'+
    '<div class="pair">'+
      '<figure><img src="'+IMG_SRC.fake+'" alt="가짜 해"><figcaption class="is-fake">가짜 해</figcaption><small>보라 불꽃<br>맞히면 점수</small></figure>'+
      '<figure><img src="'+IMG_SRC.trueSun+'" alt="진짜 해"><figcaption class="is-true">진짜 해</figcaption><small>다정한 미소<br>맞히면 -100</small></figure>'+
      '<figure><img src="'+IMG_SRC.weak+'" alt="보스 약점"><figcaption class="is-boss">보스 약점</figcaption><small>보호막이 열릴 때<br>3번 맞히면 성공</small></figure>'+
    '</div>'+
    '<div class="guide" aria-hidden="true"><i class="guide__arrow"></i><i class="guide__dot"></i><span class="guide__cap">왼쪽으로 당기면 오른쪽으로</span></div>'+
    '<p class="panel__line panel__line--muted">'+LINES.control+' 해가 움직이는 길을 예측해서 쏘세요.</p>'+
    (best?'<p class="panel__line panel__line--muted">내 최고 '+best+'점</p>':'')+
    '<button class="btn btn--primary" id="bGo">시작</button>');
  $('bGo').onclick=function(){initAudio();if(practiced)startCountdown();else startPractice()};
}
function startPractice(){
  resetRun();state='practice';hidePanel();
  var s=makeSun('fake',CFG.worldW/2,L.top+(L.bottom-L.top)*0.55,CFG.phases[0].r,22);s.bob=3;suns.push(s);
  tipEl.textContent=LINES.control;tipEl.hidden=false;skipBtn.hidden=false;
}
function practiceHit(){
  practiced=true;tipEl.textContent='좋아! 이제 진짜 시작이야.';skipBtn.hidden=true;
  setTimeout(function(){if(state==='practice')startCountdown()},700);
}
skipBtn.onclick=function(){if(state==='practice'){practiced=true;startCountdown()}};
function startCountdown(){
  resetRun();tipEl.hidden=true;skipBtn.hidden=true;setPlayUi(true);
  state='countdown';countT=0;countN=3;phaseIdx=0;
  spawnQ=[];fillPhase(true);spawnQ.forEach(function(q){spawn(q.type)});spawnQ=[];
  suns.forEach(function(s){s.born=0});
  updHud(true);
  showPanel('<div class="count" id="cnt">3</div>',true);sBeep(false);
}
function beginPlay(){
  state='play';hidePanel();gameT=0;
  attemptId='sun-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  sBeep(true);
}
function enterBoss(){
  bossEntered=true;spawnQ=[];clouds=[];
  var keep=null;
  suns.forEach(function(s){
    if(!s.alive||s.dying)return;
    if(s.type==='fake')s.leave=1;
    else if(s.type==='true'){if(!keep)keep=s;else s.leave=1}
  });
  if(!keep){keep=makeSun('true',60,L.top+40,CFG.phases[1].r,0);keep.born=0.25;suns.push(keep)}
  keep.goX=keep.x<CFG.worldW/2?40:CFG.worldW-40;keep.goY=L.top+30;keep.vx=0;keep.rT=CFG.phases[1].r;keep.sine=0;keep.bob=3;
  var b=makeSun('boss',CFG.worldW/2,L.top+(L.bottom-L.top)*0.5,CFG.boss.r,CFG.boss.spd);
  b.hp=CFG.boss.hp;b.intro=CFG.boss.introSec;b.bob=6;b.shield='closed';b.cyc=0;
  suns.push(b);boss=b;
  addText(CFG.worldW/2,L.top+14,'보스 · 약점 공략','#C9A6FF',18);
  play('boom',0.4,1.3);
}
function gradeOf(sc){for(var i=0;i<CFG.grades.length;i++)if(sc>=CFG.grades[i][0])return CFG.grades[i][1];return 'D'}
function nextGoal(cleared,best){
  if(!cleared){
    var hp=boss?Math.max(0,boss.hp):CFG.boss.hp;
    return '약점 '+hp+'회 더 맞히면 성공!';
  }
  for(var i=CFG.grades.length-1;i>=0;i--){
    if(score<CFG.grades[i][0])return CFG.grades[i][1]+'등급까지 '+(CFG.grades[i][0]-score)+'점!';
  }
  if(score<best)return '최고기록까지 '+(best-score)+'점!';
  return 'S등급 달성! 최고기록을 더 높여 봐.';
}
function finish(){
  if(state!=='play')return;
  /* 아직 날아가는 화살은 빗나감으로 정리 */
  arrows.forEach(function(ar){resolve(ar,{kind:'miss'})});arrows=[];
  state='result';aim=null;setPlayUi(false);heatTarget=0;heat=0;
  var cleared=bossDefeated;
  var prevBest=getBest(),isBest=score>prevBest,best=Math.max(prevBest,score);
  if(isBest)setLocalBest(score);
  var grade=gradeOf(score),acc=shots?Math.round((hits+weakHits)/shots*100):0;
  var bossLeft=boss?Math.max(0,boss.hp):CFG.boss.hp;
  showPanel(
    '<span class="badge '+(cleared?'badge--ok':'badge--no')+'">'+(cleared?'성공 · 보스 처치':'클리어 실패')+'</span>'+
    '<h1>'+(cleared?LINES.boss:LINES.retry)+'</h1>'+
    '<div class="scoreline"><div class="grade">'+grade+'</div><div class="big">'+score+'<small style="font-size:17px">점</small></div></div>'+
    '<p class="panel__line panel__line--muted">'+(isBest?'새 최고 기록!':'이번 점수')+'</p>'+
    '<div class="stats">'+
      '<div><small>내 최고</small><strong>'+best+'점</strong></div>'+
      '<div><small>최대 콤보</small><strong>'+bestCombo+'</strong></div>'+
      '<div><small>명중률</small><strong>'+acc+'%</strong></div>'+
      '<div><small>보스 남은 체력</small><strong>'+bossLeft+' / '+CFG.boss.hp+'</strong></div>'+
    '</div>'+
    '<p class="panel__line panel__line--goal">'+nextGoal(cleared,best)+'</p>'+
    '<button class="btn btn--primary" id="bAgain">한 판 더</button>'+
    '<button class="btn btn--ghost" id="bBack">돌아가기</button>');
  $('bAgain').onclick=function(){initAudio();startCountdown()};
  $('bBack').onclick=function(){if(typeof window.onGameExit==='function')window.onGameExit();else showIntro()};
  if(cleared)play('fanfare',0.6);
  var result={gameId:'sobyeol-sun',version:2,attemptId:attemptId,score:score,grade:grade,cleared:cleared,
    bossDefeated:bossDefeated,bossHpLeft:bossLeft,hits:hits,weakHits:weakHits,shots:shots,accuracy:acc,
    bestCombo:bestCombo,trueHits:trueHits,durationMs:Math.round(Math.min(gameT,CFG.gameSec)*1000),isBest:isBest};
  try{if(typeof window.onGameComplete==='function')window.onGameComplete(result)}catch(e){}
}
function getBest(){
  try{if(typeof window.getBest==='function'&&window.getBest!==getBest)return +window.getBest()||0}catch(e){}
  try{return +localStorage.getItem('sobyeolSunBest')||0}catch(e){return 0}
}
function setLocalBest(v){try{localStorage.setItem('sobyeolSunBest',String(v))}catch(e){}}

/* 탭 숨김 → 시간·이동·소리 정지, 복귀 시 계속하기 */
document.addEventListener('visibilitychange',function(){
  if(document.hidden&&(state==='play'||state==='countdown'||state==='practice')){
    prevState=state;state='paused';aim=null;
    try{if(AC)AC.suspend()}catch(e){}
    showPanel('<h1>잠깐 멈췄어요</h1><p class="panel__line panel__line--muted">시간도 같이 멈춰 있어요.</p>'+
      '<button class="btn btn--primary" id="bResume">계속하기</button>');
    $('bResume').onclick=resume;
  }
});
function resume(){
  initAudio();lastTs=0;
  if(prevState==='countdown'){state='countdown';countT=0;countN=3;showPanel('<div class="count" id="cnt">3</div>',true)}
  else{state=prevState;hidePanel()}
  prevState=null;
}

/* ---------- 업데이트 ---------- */
function update(dt){
  clock+=dt;
  recoil=Math.max(0,recoil-dt);shake=Math.max(0,shake-dt);
  heat+=(heatTarget-heat)*Math.min(1,dt*(bossDefeated?8:3));
  if(state==='countdown'){
    countT+=dt;
    if(countT>=0.8){countT-=0.8;countN--;
      if(countN<=0)beginPlay();else{var c=$('cnt');if(c)c.textContent=countN;sBeep(false)}}
    animSuns(dt,true);animFx(dt);return;
  }
  if(state!=='play'&&state!=='practice'){animFx(dt);return}
  if(hitStop>0){hitStop-=dt;animFx(dt);return}

  if(state==='play'){
    if(!bossDefeated)gameT+=dt;
    if(!bossEntered){
      var P=CFG.phases[phaseIdx];
      if(gameT>=P.until&&phaseIdx<CFG.phases.length-1)setPhase(phaseIdx+1);
      if(gameT>=CFG.bossAt)enterBoss();
    }
    if(!bossEntered){
      for(var i=spawnQ.length-1;i>=0;i--){spawnQ[i].at-=dt;
        if(spawnQ[i].at<=0){if(spawn(spawnQ[i].type))spawnQ.splice(i,1);else spawnQ[i].at=0.2}}
      fillPhase(false);
      if(CFG.phases[phaseIdx].clouds){cloudT-=dt;if(cloudT<=0){cloudT=rnd(CFG.cloud.every[0],CFG.cloud.every[1]);
        var dir=Math.random()<.5?1:-1,cw=CFG.cloud.w;
        clouds.push({x:dir>0?-cw/2:CFG.worldW+cw/2,y:rnd(L.top+30,L.bottom-30),w:cw,v:dir*rnd(CFG.cloud.spd[0],CFG.cloud.spd[1])})}}
    }
    if(endT>0){endT-=dt;if(endT<=0){finish();return}}
    else if(gameT>=CFG.gameSec){finish();return}
  }
  clouds.forEach(function(c){c.x+=c.v*dt});
  clouds=clouds.filter(function(c){return c.x>-c.w&&c.x<CFG.worldW+c.w});

  animSuns(dt,false);
  for(var j=arrows.length-1;j>=0;j--){
    var ar=arrows[j];ar.px=ar.x;ar.py=ar.y;ar.x+=ar.vx*dt;ar.y+=ar.vy*dt;
    var h=hitTest(ar);
    if(h){arrows.splice(j,1);onHit(h,ar);continue}
    if(ar.y<-40||ar.x<-40||ar.x>CFG.worldW+40){arrows.splice(j,1);resolve(ar,{kind:'miss'})}
  }
  animFx(dt);
}
function bossShield(b,dt){
  if(b.intro>0||b.dying)return;
  var B=CFG.boss;b.cyc+=dt;
  if(b.shield==='closed'&&b.cyc>=B.closed){b.shield='warn';b.cyc=0}
  else if(b.shield==='warn'&&b.cyc>=B.warn){b.shield='open';b.cyc=0;sBeep(true)}
  else if(b.shield==='open'&&b.cyc>=B.open){b.shield='closed';b.cyc=0}
}
function animSuns(dt,frozen){
  suns.forEach(function(s){
    s.px=s.x;s.py=s.y;
    s.ph+=dt*(s.type==='boss'?1.4:2.0);
    if(s.born>0)s.born=Math.max(0,s.born-dt);
    if(s.flinch>0)s.flinch=Math.max(0,s.flinch-dt);
    if(s.flash>0)s.flash=Math.max(0,s.flash-dt);
    if(s.squash>0)s.squash=Math.max(0,s.squash-dt);
    if(s.ring>0)s.ring=Math.max(0,s.ring-dt);
    if(s.r!==s.rT)s.r+=(s.rT-s.r)*Math.min(1,dt*4);
    if(s.intro>0){s.intro=Math.max(0,s.intro-dt);s.y=s.by;s.px=s.x;s.py=s.y;return}
    if(s.dying){s.dying-=dt;if(s.dying<=0)s.alive=false;return}
    if(s.leave){s.by-=dt*520;s.y=s.by;if(s.by<-120)s.alive=false;return}
    if(frozen){s.y=s.by+Math.sin(s.ph)*s.bob;s.px=s.x;s.py=s.y;return}
    if(s.type==='boss')bossShield(s,dt);
    if(s.goX!=null){s.x+=(s.goX-s.x)*Math.min(1,dt*3);s.by+=(s.goY-s.by)*Math.min(1,dt*3)}
    else{
      /* 3단계: 예고(기울임) 후 방향 반전 */
      if(CFG.phases[phaseIdx].rev&&s.type!=='boss'&&state==='play'&&!bossEntered){
        s.revT-=dt;
        if(s.revT<=0){s.vx=-s.vx;s.revT=rnd(CFG.revEvery[0],CFG.revEvery[1])}
      }
      s.x+=s.vx*dt;
    }
    var m=s.type==='boss'?s.r+30:s.r+8;
    if(s.x<m){s.x=m;s.vx=Math.abs(s.vx)}
    if(s.x>CFG.worldW-m){s.x=CFG.worldW-m;s.vx=-Math.abs(s.vx)}
    s.y=s.by+Math.sin(s.ph)*s.bob+(s.sine?Math.sin(s.ph*0.75+s.id)*s.sine:0);
    /* 이동 흔적 */
    s.trailT-=dt;if(s.trailT<=0&&s.type!=='boss'){s.trailT=0.045;s.trail.push({x:s.x,y:s.y});if(s.trail.length>7)s.trail.shift()}
  });
  /* 서로 너무 붙지 않게 진행 방향을 바꿔 벌린다 */
  for(var i=0;i<suns.length;i++)for(var k=i+1;k<suns.length;k++){
    var a=suns[i],b=suns[k];
    if(!a.alive||!b.alive||a.dying||b.dying||a.leave||b.leave)continue;
    var dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1,min=minGap(a.r,b.r)*0.75;
    if(d<min){
      var push=Math.min(2,(min-d)/2),nx=dx/d;
      if(a.goX==null&&a.type!=='boss')a.x-=nx*push;
      if(b.goX==null&&b.type!=='boss')b.x+=nx*push;
      if(nx>0){if(a.type!=='boss')a.vx=-Math.abs(a.vx);if(b.type!=='boss')b.vx=Math.abs(b.vx)}
      else{if(a.type!=='boss')a.vx=Math.abs(a.vx);if(b.type!=='boss')b.vx=-Math.abs(b.vx)}
    }
  }
  suns=suns.filter(function(s){return s.alive});
}
function animFx(dt){
  fx.forEach(function(f){f.t+=dt});fx=fx.filter(function(f){return f.t<f.dur});
  texts.forEach(function(t){t.t+=dt;t.y-=dt*30});texts=texts.filter(function(t){return t.t<0.9});
}

/* ---------- 그리기 ---------- */
function drawImgCover(im,x,y,w,h){
  var k=Math.max(w/im.width,h/im.height),dw=im.width*k,dh=im.height*k;
  ctx.drawImage(im,x+(w-dw)/2,y,dw,dh);
}
var frameDirty=true;
function render(){
  var W=CFG.worldW;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  if(offX>0&&IMG.bg){drawImgCover(IMG.bg,0,0,cssW,cssH);ctx.fillStyle='rgba(15,17,32,.62)';ctx.fillRect(0,0,cssW,cssH)}
  var sx=0,sy=0;
  if(shake>0&&!reduceMotion){sx=(Math.random()-.5)*5;sy=(Math.random()-.5)*5}
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(offX+sx*scale),dpr*sy*scale);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,WH);ctx.clip();
  if(IMG.bg)drawImgCover(IMG.bg,0,0,W,WH);else{ctx.fillStyle='#4aa3c7';ctx.fillRect(0,0,W,WH)}
  if(heat>0.005){ctx.fillStyle='rgba(230,70,30,'+heat.toFixed(3)+')';ctx.fillRect(0,0,W,WH)}
  if(state==='loading'||state==='error'){ctx.restore();return}
  suns.forEach(drawTrail);
  suns.forEach(drawSun);
  clouds.forEach(function(c){ctx.globalAlpha=0.55;ctx.drawImage(IMG.cloud,c.x-c.w/2,c.y-c.w/4,c.w,c.w/2);ctx.globalAlpha=1});
  arrows.forEach(drawArrowFlying);
  fx.forEach(function(f){
    var p=f.t/f.dur,a=p<0.55?1:1-(p-0.55)/0.45;
    if(f.ring){
      ctx.globalAlpha=Math.max(0,1-p);ctx.strokeStyle='#DDF6FF';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(f.x,f.y,f.size*(1+p*0.15),0,6.283);ctx.stroke();ctx.globalAlpha=1;return;
    }
    var s=0.25+0.85*Math.min(1,p/0.6);
    ctx.globalAlpha=Math.max(0,a);var z=f.size*s;
    ctx.drawImage(IMG[f.img],f.x-z/2,f.y-z/2,z,z);ctx.globalAlpha=1;
  });
  if(state==='play'||state==='practice'||state==='countdown'||state==='paused'){
    /* 조작 영역: 바닥을 어둡게 깔아 활이 바위·풀 배경과 섞이지 않게 */
    var gy=L.bowY-L.bowH*1.6,gr=ctx.createLinearGradient(0,gy,0,WH);
    gr.addColorStop(0,'rgba(13,22,44,0)');gr.addColorStop(0.45,'rgba(13,22,44,.5)');gr.addColorStop(1,'rgba(13,22,44,.72)');
    ctx.fillStyle=gr;ctx.fillRect(0,gy,W,WH-gy);
    drawBow();
  }
  texts.forEach(function(t){
    ctx.globalAlpha=t.t<0.65?1:1-(t.t-0.65)/0.25;
    ctx.font='800 '+t.z+'px SCDream, "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=Math.max(3,t.z*0.2);ctx.strokeStyle='rgba(13,22,44,.85)';ctx.strokeText(t.s,t.x,t.y);
    ctx.fillStyle=t.c;ctx.fillText(t.s,t.x,t.y);ctx.globalAlpha=1;
  });
  ctx.restore();
}
function drawTrail(s){
  if(s.type==='boss'||s.dying||s.leave||s.trail.length<2)return;
  ctx.save();ctx.lineCap='round';
  var col=s.type==='fake'?'167,110,255':'255,206,90';
  for(var i=1;i<s.trail.length;i++){
    var p0=s.trail[i-1],p1=s.trail[i],a=i/s.trail.length;
    ctx.strokeStyle='rgba('+col+','+(0.45*a).toFixed(3)+')';ctx.lineWidth=s.r*0.5*a;
    ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();
  }
  ctx.restore();
}
function drawSun(s){
  var im=sunImg(s),z=sunDrawSize(s);
  var k=1+Math.sin(s.ph*1.3)*(s.type==='fake'?0.03:0.015);
  var rot=s.type==='fake'?Math.sin(s.ph*0.9)*0.08:s.type==='boss'?Math.sin(s.ph*0.6)*0.05:0;
  /* 반전 예고: 다음 진행 방향으로 몸을 기울임 */
  if(s.revT<CFG.revWarn&&CFG.phases[phaseIdx].rev&&s.type!=='boss'&&!bossEntered&&state==='play')
    rot+=(s.vx>0?-1:1)*0.35*(1-s.revT/CFG.revWarn);
  var a=1,ox=0;
  if(s.born>0){k*=1-s.born/0.25*0.6;a=1-s.born/0.25}
  if(s.intro>0){var ip=1-s.intro/CFG.boss.introSec;k*=0.4+0.6*ip+Math.sin(ip*Math.PI)*0.15}
  if(s.dying&&s.type!=='boss'){var dp=1-s.dying/0.12;k*=1+0.12*dp;a=dp<0.6?1:1-(dp-0.6)/0.4}
  if(s.dying&&s.type==='boss'){var bp=1-s.dying/0.45;k*=1+0.3*bp;a=1-bp}
  if(s.flinch>0)ox=Math.sin(s.flinch*60)*4*(s.flinch/0.45);
  var sqx=1,sqy=1;if(s.squash>0){var q=s.squash/0.2;sqx=1+0.12*q;sqy=1-0.12*q}
  ctx.save();ctx.globalAlpha=a;ctx.translate(s.x+ox,s.y);ctx.rotate(rot);ctx.scale(k*sqx,k*sqy);
  ctx.drawImage(im,-z/2,-z/2,z,z);
  if(s.flash>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*(s.flash/0.15)*0.6;ctx.drawImage(im,-z/2,-z/2,z,z)}
  ctx.restore();
  if(s.flinch>0){
    ctx.save();ctx.globalAlpha=Math.min(1,s.flinch/0.2);ctx.strokeStyle='#F0605A';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(s.x+ox,s.y,s.r+4,0,6.283);ctx.stroke();ctx.restore();
  }
  if(s.type==='boss')drawBossParts(s,k*sqx,a);
}
function drawBossParts(b,k,alpha){
  if(b.dying)return;
  var B=CFG.boss,wp=weakPos(b,false);
  /* 약점: 닫힘=흐림, 예고=점점 밝아짐, 열림=밝게 맥동 */
  var wa=0.45,ws=1;
  if(b.shield==='warn'){var w=b.cyc/B.warn;wa=0.45+0.5*w;ws=1+0.1*Math.sin(b.cyc*30)}
  if(b.shield==='open'){wa=1;ws=1.08+0.06*Math.sin(clock*14)}
  var wz=B.weakR/CFG.bodyRatio.weak*ws;
  ctx.save();ctx.globalAlpha=alpha*wa;ctx.drawImage(IMG.weak,wp.x-wz/2,wp.y-wz/2,wz,wz);ctx.restore();
  /* 보호막: 닫힘=선명, 예고=깜빡, 열림=벌어지며 옅어짐 */
  var sa=1,ss=1;
  if(b.shield==='warn')sa=0.65+0.35*Math.abs(Math.cos(b.cyc*12));
  if(b.shield==='open'){var o=Math.min(1,b.cyc/0.15);sa=1-0.82*o;ss=1+0.18*o}
  if(b.ring>0)sa=Math.min(1,sa+0.5);
  var sz=b.r*1.18/CFG.bodyRatio.shield*ss*k;
  ctx.save();ctx.globalAlpha=alpha*sa;ctx.translate(b.x,b.y);ctx.rotate(clock*0.4);
  ctx.drawImage(IMG.shield,-sz/2,-sz/2,sz,sz);ctx.restore();
  /* 열림 남은 시간: 약점 주위 얇은 링 */
  if(b.shield==='open'){
    var left=1-b.cyc/B.open;
    ctx.save();ctx.strokeStyle='#7FE3C6';ctx.lineWidth=2;ctx.beginPath();
    ctx.arc(wp.x,wp.y,B.weakR+6,-Math.PI/2,-Math.PI/2+6.283*left);ctx.stroke();ctx.restore();
  }
  /* 체력 */
  var n=B.hp,w2=16,g=5,tw=n*w2+(n-1)*g,x0=b.x-tw/2,y0=b.y-b.r*1.18-16;
  for(var i=0;i<n;i++){
    ctx.fillStyle=i<b.hp?(b.hp<=1?'#F0605A':'#7FE3C6'):'rgba(13,22,44,.6)';
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x0+i*(w2+g),y0,w2,6,3);else ctx.rect(x0+i*(w2+g),y0,w2,6);ctx.fill();
  }
}
function drawArrowAt(len){
  var im=IMG.arrow,dh=len/0.925,dw=dh*im.width/im.height;
  ctx.drawImage(im,-dw/2,-dh*0.955,dw,dh);
}
function drawArrowFlying(ar){
  ctx.save();ctx.translate(ar.x,ar.y);ctx.rotate(ar.a);
  var g=ctx.createLinearGradient(0,0,0,CFG.arrowLen+50);
  g.addColorStop(0,'rgba(190,255,236,0)');g.addColorStop(0.45,'rgba(190,255,236,.5)');g.addColorStop(1,'rgba(190,255,236,0)');
  ctx.fillStyle=g;ctx.fillRect(-2,CFG.arrowLen*0.4,4,CFG.arrowLen+30);
  ctx.translate(0,CFG.arrowLen);drawArrowAt(CFG.arrowLen);ctx.restore();
}
function drawBow(){
  var a=aim&&aim.armed?aim.a:0,t=aim&&aim.armed?aim.t:0;
  var rc=recoil>0?Math.sin((1-recoil/0.08)*Math.PI)*4:0;
  ctx.save();ctx.translate(L.bowX,L.bowY+rc);ctx.rotate(a);
  var tier=combo>=10?3:combo>=6?2:combo>=3?1:0;
  if(tier){ctx.globalAlpha=0.06+tier*0.05;ctx.fillStyle='#7FE3C6';ctx.beginPath();ctx.ellipse(0,0,L.bowW*0.42,L.bowH*0.5,0,0,6.283);ctx.fill();ctx.globalAlpha=1}
  ctx.save();ctx.rotate(Math.PI);ctx.shadowColor='rgba(8,14,30,.9)';ctx.shadowBlur=6;
  /* 바위·풀 배경 위에서도 활이 읽히도록 어두운 테두리 그림자 */
  ctx.drawImage(IMG.bow,-L.bowW/2,-L.bowH/2,L.bowW,L.bowH);ctx.shadowBlur=0;ctx.drawImage(IMG.bow,-L.bowW/2,-L.bowH/2,L.bowW,L.bowH);ctx.restore();
  if(fireReady()||aim){
    var pull=t*20;
    if(aim&&aim.armed){ /* 현재 발사 방향으로만 짧은 점선(자동 조준 없음) */
      ctx.save();ctx.setLineDash([5,7]);ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,.85)';
      var tipY=L.stringY+pull-CFG.arrowLen;
      ctx.beginPath();ctx.moveTo(0,tipY-6);ctx.lineTo(0,tipY-80);ctx.stroke();ctx.restore();
      ctx.globalAlpha=0.25+0.5*t;ctx.fillStyle='#BFFFEA';ctx.beginPath();ctx.arc(0,tipY+3,2+5*t,0,6.283);ctx.fill();ctx.globalAlpha=1;
    }
    ctx.translate(0,L.stringY+pull);drawArrowAt(CFG.arrowLen);
  }
  ctx.restore();
}

/* ---------- HUD ---------- */
function setTxt(el,key,v){if(hudCache[key]!==v){hudCache[key]=v;el.textContent=v}}
function updHud(force){
  if(force)hudCache={};
  var left=Math.max(0,CFG.gameSec-gameT);
  setTxt(hudTime,'t',left.toFixed(1));hudTime.classList.toggle('low',left<=5);
  setTxt(hudScore,'s',String(score));
  setTxt(hudBest,'b',String(Math.max(getBest(),0)));
  setTxt(hudStage,'p',bossEntered?'보스 · 약점 공략':CFG.phases[phaseIdx].name);
  hudCombo.hidden=combo<2;setTxt(hudComboN,'c',String(combo));
  var txt,fill;
  if(bossEntered){
    var done=CFG.boss.hp-(boss?Math.max(0,boss.hp):CFG.boss.hp);
    txt='보스 약점 '+done+'/'+CFG.boss.hp;fill=done/CFG.boss.hp;goalEl.classList.add('boss');
  }else{
    goalEl.classList.remove('boss');
    var P=CFG.phases[phaseIdx],prev=phaseIdx?CFG.phases[phaseIdx-1].hitsNext:0;
    if(P.hitsNext){var need=Math.max(0,P.hitsNext-hits);txt='다음 단계까지 '+need+'명중';fill=Math.min(1,(hits-prev)/(P.hitsNext-prev))}
    else{var sl=Math.max(0,Math.ceil(CFG.bossAt-gameT));txt='보스 등장까지 '+sl+'초';fill=1-sl/(CFG.bossAt-CFG.phases[phaseIdx-1].until)}
  }
  setTxt(goalText,'g',txt);
  var fw=Math.round(Math.max(0,Math.min(1,fill))*100)+'%';if(hudCache.f!==fw){hudCache.f=fw;goalFill.style.width=fw}
}

/* ---------- 루프 ---------- */
function frame(ts){
  requestAnimationFrame(frame);
  if(state==='result'||state==='intro'||state==='error'||state==='paused'){
    if(frameDirty){render();frameDirty=false}
    lastTs=0;return; /* 결과·대기 화면에서는 갱신 멈춤 */
  }
  frameDirty=true;
  var dt=lastTs?Math.min(0.05,(ts-lastTs)/1000):0;lastTs=ts;
  update(dt);render();
  if(state==='play')updHud();
}
window.addEventListener('resize',function(){resize();frameDirty=true});
window.addEventListener('orientationchange',function(){setTimeout(function(){resize();frameDirty=true},200)});

function boot(){
  state='loading';showPanel('<p class="panel__line">그림을 불러오는 중이에요…</p>');
  loadImages().then(function(){resize();showIntro()},function(){
    state='error';
    showPanel('<p class="panel__line">그림을 불러오지 못했어요. 다시 시도해 주세요.</p><button class="btn btn--primary" id="bRetry">다시 시도</button>');
    $('bRetry').onclick=boot;
  });
}
resize();
requestAnimationFrame(frame);
boot();
/* 테스트용 노출 */
window.__sun={aim:function(){return aim},CFG:CFG,L:function(){return L},get state(){return state},get suns(){return suns},get score(){return score},
  get boss(){return boss},get phase(){return phaseIdx},get combo(){return combo},
  stats:function(){return {hits:hits,weakHits:weakHits,shots:shots,trueHits:trueHits,bestCombo:bestCombo,gameT:gameT}},
  setTime:function(t){gameT=t}};
})();
