/* 소별왕의 가짜 해를 쏴라! — 탐라문화제 놀이터 미니게임
   - 자체 완결 페이지. 부모 앱(index.html gSun)이 iframe 으로 띄우고
     window.onGameComplete(result) / window.onGameExit() / window.getBest() 를 주입한다.
   - 서버 보상은 부모가 cleared 일 때만, attemptId 당 1회 요청한다. */
(function(){
'use strict';

/* ---------- 튜닝값 (전부 여기서 조정) ---------- */
var CFG={
  worldW:390, minWorldH:640,
  gameSec:40, bossAt:32,
  fireGapMs:300, cancelPx:8, maxAngle:1.22 /* ±70° */,
  arrowSpeedMin:950, arrowSpeedMax:1500, pullMaxPx:120, arrowLen:118,
  hitPad:4,                     /* 몸체 반경에 더하는 관대 판정 */
  score:{fake:100, trueHit:-50, bossHit:100, bossKill:500},
  combo:[[10,60],[6,40],[3,20]],
  clearFakes:8, bossHp:5,
  heatStart:0.18, heatClearAt:14,
  respawnMin:0.4, respawnMax:0.8,
  /* 단계: until=끝나는 초, fakes/trues=화면 목표 개수, r=몸체 반경, spd=가짜/진짜 이동속도 */
  phases:[
    {until:10, fakes:2, trues:1, r:39, spdF:8,  spdT:5,  clouds:false},
    {until:16, fakes:3, trues:1, r:36, spdF:26, spdT:16, clouds:false},
    {until:22, fakes:3, trues:2, r:35, spdF:30, spdT:18, clouds:false},
    {until:32, fakes:4, trues:2, r:33, spdF:50, spdT:28, clouds:true}
  ],
  boss:{r:64, spd:42, introSec:0.5},
  bodyRatio:{true:0.28, fake:0.27, boss:0.37}  /* 이미지 한 변 대비 해 몸체 반경 */
};
var LINES={
  start:'가짜 해 때문에 제주가 너무 뜨거워졌어. 나랑 하늘을 되찾자!',
  control:'아래에서 당겨 조준하고, 손을 놓으면 발사!',
  boss:'제주의 하늘을 되찾았구나!',
  clear:'잘했어! 가짜 해가 많이 줄었어.',
  retry:'조금만 더! 보라 불꽃을 잘 찾아봐.'
};
var IMG_SRC={bg:'img/01_jeju_background.jpg',trueSun:'img/02_true_sun.png',fake:'img/03_fake_sun.png',
  boss:'img/04_boss_sun.png',bow:'img/05_bow.png',arrow:'img/06_arrow.png',burst:'img/07_hit_burst.png',cloud:'img/08_cloud.png'};

/* ---------- DOM ---------- */
var $=function(id){return document.getElementById(id)};
var cv=$('cv'),ctx=cv.getContext('2d');
var overlay=$('overlay'),panel=$('panel'),hud=$('hud'),tipEl=$('tip'),skipBtn=$('skip'),muteBtn=$('mute');
var hudTime=$('hudTime'),hudScore=$('hudScore'),hudCombo=$('hudCombo');
var reduceMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 이미지 ---------- */
var IMG={};
function loadImages(){
  var keys=Object.keys(IMG_SRC);
  return Promise.all(keys.map(function(k){
    return new Promise(function(res,rej){
      var im=new Image();im.onload=function(){IMG[k]=im;res()};im.onerror=rej;im.src=IMG_SRC[k];
    });
  }));
}

/* ---------- 화면 크기 / 논리 좌표 ---------- */
var dpr=1,cssW=0,cssH=0,scale=1,offX=0,WH=700; /* WH=논리 세계 높이 */
var L={}; /* 레이아웃 파생값 */
function resize(){
  cssW=cv.clientWidth||innerWidth;cssH=cv.clientHeight||innerHeight;
  dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);
  scale=cssW/CFG.worldW;WH=cssH/scale;offX=0;
  if(WH<CFG.minWorldH){scale=cssH/CFG.minWorldH;WH=CFG.minWorldH;offX=(cssW-CFG.worldW*scale)/2}
  var bw=CFG.worldW*0.72,bh=bw*IMG_RATIO.bow;
  L={top:78,bottom:WH-235,bowX:CFG.worldW/2,bowY:WH-82,bowW:bw,bowH:bh,
     stringY:bh*0.24 /* 180° 돌린 활에서 활줄 위치(피벗 기준) */};
  /* 회전·리사이즈 시 타겟을 화면 안으로 보정 */
  suns.forEach(function(s){clampSun(s)});
}
var IMG_RATIO={bow:342/800};
function toWorld(e){
  var r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left-offX)/scale,y:(e.clientY-r.top)/scale};
}

/* ---------- 사운드 (기존 앱 효과음 재사용 + Web Audio 합성) ---------- */
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
  if(muted||!AC||voices>=6)return false;
  var t=performance.now();if(lastPlay[key]&&t-lastPlay[key]<gap)return false;
  lastPlay[key]=t;return true;
}
function play(name,vol,rate){
  if(!canPlay(name,60))return;
  if(!BUF[name]){synth(name);return}
  var s=AC.createBufferSource(),g=AC.createGain();
  s.buffer=BUF[name];s.playbackRate.value=rate||1;g.gain.value=vol==null?0.6:vol;
  s.connect(g).connect(AC.destination);voices++;s.onended=function(){voices--};s.start();
}
function tone(freq,dur,type,vol,slide){
  if(!AC||muted)return;
  var t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,t+dur);
  g.gain.setValueAtTime(vol||0.2,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g).connect(AC.destination);voices++;o.onended=function(){voices--};o.start(t);o.stop(t+dur);
}
function synth(name){ /* 파일이 아직 안 왔거나 실패했을 때의 대체음 */
  if(name==='slice')tone(700,0.09,'triangle',0.12,1400);
  else if(name==='pop')tone(520,0.12,'square',0.12,980);
  else if(name==='bonus')tone(880,0.16,'triangle',0.15,1320);
  else if(name==='boom')tone(180,0.4,'sawtooth',0.18,60);
  else if(name==='fanfare'){tone(523,0.2,'triangle',0.16);setTimeout(function(){tone(659,0.2,'triangle',0.16)},150);setTimeout(function(){tone(784,0.35,'triangle',0.16)},300)}
}
function sTrue(){if(canPlay('true',120))tone(220,0.22,'square',0.12,150)}
function sBeep(hi){if(canPlay('beep'+hi,100))tone(hi?880:600,0.12,'sine',0.18)}
function buzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}

/* ---------- 상태 ---------- */
var state='loading',prevState=null;
var suns=[],arrows=[],fx=[],texts=[],clouds=[],spawnQ=[];
var aim=null,lastShot=-1e9,recoil=0,hitStop=0,slowMo=0,shake=0,heat=CFG.heatStart,heatTarget=CFG.heatStart;
var gameT=0,score=0,combo=0,bestCombo=0,fakesRemoved=0,trueHits=0,bossDefeated=false,bossEntered=false;
var phaseIdx=0,countT=0,countN=0,endT=0,attemptId=null,clock=0,practiceDone=false,startedAt=0,cloudT=0;
var rafId=0,lastTs=0;

function resetRun(){
  suns=[];arrows=[];fx=[];texts=[];clouds=[];spawnQ=[];aim=null;
  gameT=0;score=0;combo=0;bestCombo=0;fakesRemoved=0;trueHits=0;bossDefeated=false;bossEntered=false;
  phaseIdx=0;heat=heatTarget=CFG.heatStart;slowMo=0;hitStop=0;shake=0;endT=0;cloudT=4;
  hudCache={};
}

/* ---------- 해 ---------- */
var uid=0;
function makeSun(type,x,y,r,spd){
  var dir=Math.random()<.5?-1:1;
  return {id:++uid,type:type,x:x,y:y,by:y,r:r,vx:dir*spd*(0.7+Math.random()*0.6),
    ph:Math.random()*6.28,bob:6+Math.random()*6,alive:true,dying:0,flinch:0,
    hp:type==='boss'?CFG.bossHp:1,intro:type==='boss'?CFG.boss.introSec:0,squash:0,flash:0,leave:0};
}
function sunImg(s){return s.type==='true'?IMG.trueSun:s.type==='boss'?IMG.boss:IMG.fake}
function sunDrawSize(s){return s.r/CFG.bodyRatio[s.type]}
function clampSun(s){
  var m=s.r+6;
  s.x=Math.max(m,Math.min(CFG.worldW-m,s.x));
  var top=L.top+s.r,bot=Math.max(top+10,L.bottom-s.r);
  s.by=Math.max(top+s.bob,Math.min(bot-s.bob,s.by));
}
function distSeg(px,py,ax,ay,bx,by){
  var dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));
  var qx=ax+dx*t-px,qy=ay+dy*t-py;return Math.sqrt(qx*qx+qy*qy);
}
/* 억울한 배치 금지: 몸체 간격 확보 + 활→가짜 사이에 진짜가 끼지 않게 */
function placeOk(type,x,y,r){
  for(var i=0;i<suns.length;i++){
    var o=suns[i];if(!o.alive||o.leave)continue;
    var dx=o.x-x,dy=o.by-y;if(Math.sqrt(dx*dx+dy*dy)<o.r+r+22)return false;
    if(type!=='true'&&o.type==='true'&&distSeg(o.x,o.by,L.bowX,L.bowY,x,y)<o.r+r*0.5)return false;
    if(type==='true'&&o.type!=='true'&&distSeg(x,y,L.bowX,L.bowY,o.x,o.by)<r+o.r*0.5)return false;
  }
  return true;
}
function spawn(type){
  var P=CFG.phases[phaseIdx];
  for(var k=0;k<40;k++){
    var r=P.r,m=r+10;
    var x=m+Math.random()*(CFG.worldW-2*m);
    var y=L.top+r+10+Math.random()*Math.max(10,(L.bottom-r)-(L.top+r+10));
    if(placeOk(type,x,y,r)){
      var s=makeSun(type,x,y,r,type==='true'?P.spdT:P.spdF);s.born=0.25;suns.push(s);return true;
    }
  }
  return false;
}
function countType(t){var n=0;suns.forEach(function(s){if(s.alive&&!s.leave&&s.type===t)n++});return n}
function queuedType(t){var n=0;spawnQ.forEach(function(q){if(q.type===t)n++});return n}
function fillPhase(immediate){
  var P=CFG.phases[phaseIdx];
  ['fake','true'].forEach(function(t){
    var want=(t==='fake'?P.fakes:P.trues)-countType(t)-queuedType(t);
    for(var i=0;i<want;i++)spawnQ.push({type:t,at:immediate?0:CFG.respawnMin+Math.random()*(CFG.respawnMax-CFG.respawnMin)});
  });
}

/* ---------- 이펙트 (동시 4개 제한) ---------- */
function addFx(o){fx.push(o);while(fx.length>4)fx.shift()}
function addText(x,y,str,color,size){texts.push({x:x,y:y,s:str,c:color||'#fff',z:size||20,t:0});while(texts.length>4)texts.shift()}

/* ---------- 입력: 새총식 당겨 쏘기 ---------- */
cv.addEventListener('pointerdown',function(e){
  if(aim||!(state==='play'||state==='practice'))return;
  initAudio();
  var p=toWorld(e);
  try{cv.setPointerCapture(e.pointerId)}catch(err){}
  aim={id:e.pointerId,sx:p.x,sy:p.y,x:p.x,y:p.y,armed:false,a:0,t:0};
  e.preventDefault();
});
cv.addEventListener('pointermove',function(e){
  if(!aim||e.pointerId!==aim.id)return;
  var p=toWorld(e);aim.x=p.x;aim.y=p.y;updAim();
});
cv.addEventListener('pointerup',function(e){
  if(!aim||e.pointerId!==aim.id)return;
  var p=toWorld(e);aim.x=p.x;aim.y=p.y;updAim();
  if(aim.armed&&(state==='play'||state==='practice'))fire(aim.a,aim.t);
  aim=null;
});
function cancelAim(e){if(aim&&(!e||e.pointerId===aim.id))aim=null}
cv.addEventListener('pointercancel',cancelAim);
cv.addEventListener('lostpointercapture',cancelAim);
function updAim(){
  var dx=aim.x-aim.sx,dy=aim.y-aim.sy,len=Math.sqrt(dx*dx+dy*dy);
  aim.armed=len>=CFG.cancelPx;
  if(!aim.armed){aim.t=0;return}
  var a=Math.atan2(-dx,Math.max(dy,6)); /* 당긴 반대 방향, 위쪽 부채꼴 */
  aim.a=Math.max(-CFG.maxAngle,Math.min(CFG.maxAngle,a));
  aim.t=Math.min(1,len/CFG.pullMaxPx);
}
function fire(a,t){
  var now=clock*1000,wait=CFG.fireGapMs-(now-lastShot);
  if(wait>0){setTimeout(function(){if(state==='play'||state==='practice')fire(a,t)},wait);return}
  lastShot=now;
  var ux=Math.sin(a),uy=-Math.cos(a);
  /* 화살 끝(촉) 시작점: 피벗에서 활줄까지 + 화살 길이 */
  var tipD=CFG.arrowLen-L.stringY;
  var tx=L.bowX+ux*tipD,ty=L.bowY+uy*tipD;
  var sp=CFG.arrowSpeedMin+(CFG.arrowSpeedMax-CFG.arrowSpeedMin)*t;
  arrows.push({x:tx,y:ty,px:tx,py:ty,vx:ux*sp,vy:uy*sp,a:a,life:0});
  recoil=0.09;play('slice',0.35,1.25);
}

/* ---------- 판정 ---------- */
function segCircle(x0,y0,x1,y1,cx,cy,r){
  var dx=x1-x0,dy=y1-y0,fx_=x0-cx,fy=y0-cy;
  var A=dx*dx+dy*dy,B=2*(fx_*dx+fy*dy),C=fx_*fx_+fy*fy-r*r;
  if(C<=0)return 0;if(A===0)return -1;
  var D=B*B-4*A*C;if(D<0)return -1;
  var s=(-B-Math.sqrt(D))/(2*A);return s>=0&&s<=1?s:-1;
}
function hitTest(ar){
  var best=null,bs=2;
  suns.forEach(function(s){
    if(!s.alive||s.dying||s.leave||s.intro>0||(s.born&&s.born>0.15))return;
    var sc=segCircle(ar.px,ar.py,ar.x,ar.y,s.x,s.y,s.r+CFG.hitPad);
    if(sc>=0&&sc<bs){bs=sc;best=s}
  });
  return best;
}
function comboBonus(c){for(var i=0;i<CFG.combo.length;i++)if(c>=CFG.combo[i][0])return CFG.combo[i][1];return 0}
function onHit(s,ar){
  if(s.type==='true'){
    s.flinch=0.45;trueHits++;combo=0;
    if(state==='play')score=Math.max(0,score+CFG.score.trueHit);
    addText(s.x,s.y-s.r-14,'진짜 해는 지켜줘!','#FF8A84',18);
    if(state==='play')addText(s.x,s.y-s.r+8,String(CFG.score.trueHit),'#FF8A84',16);
    sTrue();buzz(40);return;
  }
  hitStop=0.05;buzz(15);
  if(s.type==='boss'){
    s.hp--;s.squash=0.18;s.flash=0.12;combo++;bestCombo=Math.max(bestCombo,combo);
    var b=comboBonus(combo),pts=CFG.score.bossHit+b;score+=pts;
    addText(s.x,s.y-s.r-10,'+'+pts,'#F5B331',22);
    shake=reduceMotion?0:0.12;comboFx();
    if(s.hp<=0){
      s.dying=0.45;bossDefeated=true;score+=CFG.score.bossKill;heatTarget=0;
      addFx({img:'burst',x:s.x,y:s.y,size:s.r*4.2,t:0,dur:0.5});
      addText(s.x,s.y,'+'+CFG.score.bossKill,'#F5B331',30);
      slowMo=0.45;play('boom',0.7);buzz(60);
      endT=1.3; /* 연출 후 즉시 성공 결과로 */
    }else{play('pop',0.55,0.75);addFx({img:'burst',x:ar.x,y:ar.y,size:s.r*1.6,t:0,dur:0.3})}
    return;
  }
  /* 가짜 해 */
  s.dying=0.15;s.flash=0.15;
  addFx({img:'burst',x:s.x,y:s.y,size:s.r*3.2,t:0,dur:0.33});
  play('pop',0.6);
  if(state==='practice'){practiceHit();return}
  fakesRemoved++;combo++;bestCombo=Math.max(bestCombo,combo);
  var bonus=comboBonus(combo),p=CFG.score.fake+bonus;score+=p;
  addText(s.x,s.y-s.r-6,'+'+p,'#F5B331',bonus?24:20);
  heatTarget=CFG.heatStart*Math.max(0,1-fakesRemoved/CFG.heatClearAt);
  comboFx();
}
function comboFx(){
  if(combo===3||combo===6||combo===10||(combo>10&&combo%5===0)){
    addText(L.bowX,L.bowY-L.bowH*0.9,combo+' 콤보!','#7FE3C6',22);play('bonus',0.45);
  }
}

/* ---------- 흐름 ---------- */
function showPanel(html,bare){
  panel.innerHTML=html;overlay.hidden=false;overlay.classList.toggle('panel-wrap--bare',!!bare);
  panel.style.background=bare?'transparent':'';
}
function hidePanel(){overlay.hidden=true}
function showIntro(){
  state='intro';resetRun();hud.hidden=true;skipBtn.hidden=true;tipEl.hidden=true;
  var best=getBest();
  showPanel(
    '<h1>소별왕의 가짜 해를 쏴라!</h1>'+
    '<p class="panel__line">'+LINES.start+'</p>'+
    '<div class="pair">'+
      '<figure><img src="'+IMG_SRC.fake+'" alt="가짜 해"><figcaption class="is-fake">가짜 해 · 맞히기</figcaption><small>보라 불꽃 · 장난스러운 표정</small></figure>'+
      '<figure><img src="'+IMG_SRC.trueSun+'" alt="진짜 해"><figcaption class="is-true">진짜 해 · 지키기</figcaption><small>다정한 미소</small></figure>'+
    '</div>'+
    '<p class="panel__line panel__line--muted">'+LINES.control+'</p>'+
    (best?'<p class="panel__line panel__line--muted">최고 '+best+'점</p>':'')+
    '<button class="btn btn--primary" id="bPractice">연습 한 발 쏘고 시작</button>'+
    '<button class="btn btn--ghost" id="bGo">바로 시작</button>');
  $('bPractice').onclick=function(){initAudio();startPractice()};
  $('bGo').onclick=function(){initAudio();startCountdown()};
}
function startPractice(){
  resetRun();state='practice';hidePanel();
  var s=makeSun('fake',CFG.worldW/2,L.top+(L.bottom-L.top)*0.45,40,0);s.bob=4;suns.push(s);
  tipEl.textContent=LINES.control;tipEl.hidden=false;skipBtn.hidden=false;
}
function practiceHit(){
  tipEl.textContent='좋아! 이제 진짜 시작이야.';
  setTimeout(function(){if(state==='practice')startCountdown()},700);
}
skipBtn.onclick=function(){if(state==='practice')startCountdown()};
function startCountdown(){
  resetRun();tipEl.hidden=true;skipBtn.hidden=true;hud.hidden=false;updHud(true);
  state='countdown';countT=0;countN=3;fillPhase(true);
  /* 카운트다운 동안 첫 해들을 바로 배치 */
  spawnQ.forEach(function(q){spawn(q.type)});spawnQ=[];
  suns.forEach(function(s){s.born=0});
  showPanel('<div class="count" id="cnt">3</div>',true);sBeep(false);
}
function beginPlay(){
  state='play';hidePanel();gameT=0;startedAt=Date.now();
  attemptId='sun-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  sBeep(true);
}
function enterBoss(){
  bossEntered=true;spawnQ=[];
  /* 가짜는 하늘 위로 달아나고, 진짜는 한 개만 남겨 구석으로 */
  var keep=null;
  suns.forEach(function(s){
    if(!s.alive)return;
    if(s.type==='fake')s.leave=1;
    else if(s.type==='true'){if(!keep)keep=s;else s.leave=1}
  });
  if(!keep){keep=makeSun('true',60,L.top+50,32,0);keep.born=0.25;suns.push(keep)}
  keep.goX=keep.x<CFG.worldW/2?52:CFG.worldW-52;keep.goY=L.top+46;keep.vx=0;keep.r=Math.min(keep.r,32);
  var b=makeSun('boss',CFG.worldW/2,L.top+64+CFG.boss.r+30,CFG.boss.r,CFG.boss.spd);
  b.by=Math.min(b.by,L.bottom-CFG.boss.r);b.bob=8;suns.push(b);
  addText(CFG.worldW/2,L.top+30,'대장 가짜 해 등장!','#C9A6FF',22);
  play('boom',0.4,1.3);
}
function finish(){
  if(state!=='play')return;
  state='result';aim=null;arrows=[];hud.hidden=true;heatTarget=0;heat=0;
  var cleared=bossDefeated||fakesRemoved>=CFG.clearFakes;
  var prevBest=getBest(),isBest=score>prevBest;
  if(isBest)setLocalBest(score);
  var line=bossDefeated?LINES.boss:cleared?LINES.clear:LINES.retry;
  showPanel(
    '<span class="badge '+(cleared?'badge--ok':'badge--no')+'">'+(cleared?'성공':'아쉬워요')+'</span>'+
    '<h1>'+line+'</h1>'+
    '<div class="big">'+score+'<small style="font-size:18px">점</small></div>'+
    '<p class="panel__line panel__line--muted">'+(isBest?'새 최고 기록!':'최고 '+Math.max(prevBest,score)+'점')+'</p>'+
    '<div class="stats">'+
      '<div><small>가짜 해 제거</small><strong>'+fakesRemoved+'개</strong></div>'+
      '<div><small>대장 가짜 해</small><strong>'+(bossDefeated?'처치':'남음')+'</strong></div>'+
      '<div><small>최고 콤보</small><strong>'+bestCombo+'</strong></div>'+
      '<div><small>진짜 해 맞힘</small><strong>'+trueHits+'번</strong></div>'+
    '</div>'+
    (cleared?'':'<p class="panel__line panel__line--muted">대장 가짜 해를 물리치거나 가짜 해를 '+CFG.clearFakes+'개 이상 없애면 성공이에요.</p>')+
    '<button class="btn btn--primary" id="bAgain">다시 도전</button>'+
    '<button class="btn btn--ghost" id="bBack">돌아가기</button>');
  $('bAgain').onclick=function(){startCountdown()};
  $('bBack').onclick=function(){if(typeof window.onGameExit==='function')window.onGameExit();else showIntro()};
  if(cleared)play('fanfare',0.6);
  var result={gameId:'sobyeol-sun',version:1,attemptId:attemptId,score:score,cleared:cleared,
    bossDefeated:bossDefeated,fakesRemoved:fakesRemoved,bestCombo:bestCombo,trueHits:trueHits,
    durationMs:Math.round(Math.min(gameT,CFG.gameSec)*1000),isBest:isBest};
  try{if(typeof window.onGameComplete==='function')window.onGameComplete(result)}catch(e){}
}
function getBest(){
  try{if(typeof window.getBest==='function'&&window.getBest!==getBest)return +window.getBest()||0}catch(e){}
  try{return +localStorage.getItem('sobyeolSunBest')||0}catch(e){return 0}
}
function setLocalBest(v){try{localStorage.setItem('sobyeolSunBest',String(v))}catch(e){}}

/* 탭 숨김 → 시간·이동 정지, 복귀 시 계속하기 */
document.addEventListener('visibilitychange',function(){
  if(document.hidden&&(state==='play'||state==='countdown'||state==='practice')){
    prevState=state;state='paused';aim=null;
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
  heat+=(heatTarget-heat)*Math.min(1,dt*3);
  if(state==='countdown'){
    countT+=dt;
    if(countT>=0.8){countT-=0.8;countN--;
      if(countN<=0){beginPlay()}else{var c=$('cnt');if(c)c.textContent=countN;sBeep(false)}}
    animSuns(dt,true);return;
  }
  if(state!=='play'&&state!=='practice'){animFx(dt);return}

  if(hitStop>0){hitStop-=dt;animFx(dt);return}
  var sdt=dt;if(slowMo>0){slowMo-=dt;sdt=dt*0.3}

  if(state==='play'){
    if(!bossDefeated)gameT+=dt; /* 보스 등장 중에도 타이머는 멈추지 않는다 */
    if(!bossEntered){
      var pi=0;while(pi<CFG.phases.length-1&&gameT>=CFG.phases[pi].until)pi++;
      if(pi!==phaseIdx){phaseIdx=pi;fillPhase(false)}
      if(gameT>=CFG.bossAt)enterBoss();
    }
    for(var i=spawnQ.length-1;i>=0;i--){spawnQ[i].at-=sdt;if(spawnQ[i].at<=0){
      if(!bossEntered&&spawn(spawnQ[i].type))spawnQ.splice(i,1);else if(bossEntered)spawnQ.splice(i,1);else spawnQ[i].at=0.2}}
    if(!bossEntered)fillPhase(false);
    /* 구름 */
    if(CFG.phases[phaseIdx].clouds&&!bossEntered){cloudT-=sdt;if(cloudT<=0){cloudT=3+Math.random()*2.5;
      var dir=Math.random()<.5?1:-1,cw=220;
      clouds.push({x:dir>0?-cw/2:CFG.worldW+cw/2,y:L.top+40+Math.random()*(L.bottom-L.top-80),w:cw,v:dir*(150+Math.random()*60)})}}
    if(endT>0){endT-=dt;if(endT<=0){finish();return}}
    else if(gameT>=CFG.gameSec){finish();return}
  }
  clouds.forEach(function(c){c.x+=c.v*sdt});
  clouds=clouds.filter(function(c){return c.x>-c.w&&c.x<CFG.worldW+c.w});

  animSuns(sdt,false);
  /* 화살 */
  for(var j=arrows.length-1;j>=0;j--){
    var ar=arrows[j];ar.px=ar.x;ar.py=ar.y;ar.x+=ar.vx*sdt;ar.y+=ar.vy*sdt;ar.life+=sdt;
    var hit=hitTest(ar);
    if(hit){arrows.splice(j,1);onHit(hit,ar);continue}
    if(ar.y<-40||ar.x<-40||ar.x>CFG.worldW+40){
      arrows.splice(j,1);
      if(state==='play'&&combo>0){combo=0}
    }
  }
  animFx(dt);
}
function animSuns(dt,frozen){
  suns.forEach(function(s){
    s.ph+=dt*(s.type==='boss'?1.6:2.2);
    if(s.born>0)s.born=Math.max(0,s.born-dt);
    if(s.flinch>0)s.flinch=Math.max(0,s.flinch-dt);
    if(s.flash>0)s.flash=Math.max(0,s.flash-dt);
    if(s.squash>0)s.squash=Math.max(0,s.squash-dt);
    if(s.intro>0){s.intro=Math.max(0,s.intro-dt);s.y=s.by;return}
    if(s.dying){s.dying-=dt;if(s.dying<=0){s.alive=false}return}
    if(s.leave){s.by-=dt*520;s.y=s.by;if(s.by<-120)s.alive=false;return}
    if(frozen){s.y=s.by+Math.sin(s.ph)*s.bob;return}
    if(s.goX!=null){s.x+=(s.goX-s.x)*Math.min(1,dt*3);s.by+=(s.goY-s.by)*Math.min(1,dt*3)}
    else s.x+=s.vx*dt;
    var m=s.r+6;
    if(s.type==='boss')m=s.r+24;
    if(s.x<m){s.x=m;s.vx=Math.abs(s.vx)}
    if(s.x>CFG.worldW-m){s.x=CFG.worldW-m;s.vx=-Math.abs(s.vx)}
    s.y=s.by+Math.sin(s.ph)*s.bob;
  });
  /* 서로 겹치지 않게 밀어내기 */
  for(var i=0;i<suns.length;i++)for(var k=i+1;k<suns.length;k++){
    var a=suns[i],b=suns[k];
    if(!a.alive||!b.alive||a.dying||b.dying||a.leave||b.leave)continue;
    var dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1,min=a.r+b.r+14;
    if(d<min){
      var push=(min-d)/2,nx=dx/d;
      if(a.goX==null&&a.type!=='boss')a.x-=nx*push;
      if(b.goX==null&&b.type!=='boss')b.x+=nx*push;
      if(nx>0){a.vx=-Math.abs(a.vx);b.vx=Math.abs(b.vx)}else{a.vx=Math.abs(a.vx);b.vx=-Math.abs(b.vx)}
    }
  }
  var before=suns.length;
  suns=suns.filter(function(s){return s.alive});
  if(state==='play'&&!bossEntered&&suns.length!==before)fillPhase(false);
}
function animFx(dt){
  fx.forEach(function(f){f.t+=dt});fx=fx.filter(function(f){return f.t<f.dur});
  texts.forEach(function(t){t.t+=dt;t.y-=dt*34});texts=texts.filter(function(t){return t.t<0.9});
}

/* ---------- 그리기 ---------- */
function drawImgCover(im,x,y,w,h){
  var k=Math.max(w/im.width,h/im.height),dw=im.width*k,dh=im.height*k;
  ctx.drawImage(im,x+(w-dw)/2,y,dw,dh); /* 위쪽(하늘) 우선 보존 */
}
function render(){
  var W=CFG.worldW;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  if(offX>0&&IMG.bg){ /* 가로 태블릿: 양옆은 흐린(어둡게 깐) 배경 */
    drawImgCover(IMG.bg,0,0,cssW,cssH);ctx.fillStyle='rgba(15,17,32,.62)';ctx.fillRect(0,0,cssW,cssH);
  }
  var sx=0,sy=0;
  if(shake>0&&!reduceMotion){sx=(Math.random()-.5)*6;sy=(Math.random()-.5)*6}
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(offX+sx*scale),dpr*sy*scale);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,WH);ctx.clip();
  /* 1. 배경 */
  if(IMG.bg)drawImgCover(IMG.bg,0,0,W,WH);else{ctx.fillStyle='#4aa3c7';ctx.fillRect(0,0,W,WH)}
  /* 2. 더위 오버레이 */
  if(heat>0.005){ctx.fillStyle='rgba(230,70,30,'+heat.toFixed(3)+')';ctx.fillRect(0,0,W,WH)}
  if(state==='loading'||state==='error'){ctx.restore();return}
  /* 3. 해 */
  suns.forEach(drawSun);
  /* 4. 구름 */
  clouds.forEach(function(c){ctx.globalAlpha=0.6;ctx.drawImage(IMG.cloud,c.x-c.w/2,c.y-c.w/4,c.w,c.w/2);ctx.globalAlpha=1});
  /* 5. 화살·명중 */
  arrows.forEach(drawArrowFlying);
  fx.forEach(function(f){
    var p=f.t/f.dur,s=0.25+0.85*Math.min(1,p/0.6),a=p<0.55?1:1-(p-0.55)/0.45;
    ctx.globalAlpha=Math.max(0,a);var z=f.size*s;
    ctx.drawImage(IMG[f.img],f.x-z/2,f.y-z/2,z,z);ctx.globalAlpha=1;
  });
  /* 6. 활 */
  if(state==='play'||state==='practice'||state==='countdown'||state==='paused')drawBow();
  /* 7. 떠오르는 글자 */
  texts.forEach(function(t){
    ctx.globalAlpha=t.t<0.65?1:1-(t.t-0.65)/0.25;
    ctx.font='800 '+t.z+'px SCDream, "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=Math.max(3,t.z*0.18);ctx.strokeStyle='rgba(15,17,32,.85)';ctx.strokeText(t.s,t.x,t.y);
    ctx.fillStyle=t.c;ctx.fillText(t.s,t.x,t.y);ctx.globalAlpha=1;
  });
  ctx.restore();
}
function drawSun(s){
  var im=sunImg(s),z=sunDrawSize(s);
  var k=1+Math.sin(s.ph*1.3)*(s.type==='fake'?0.03:0.015); /* 숨쉬듯 2~4% */
  var rot=s.type==='fake'?Math.sin(s.ph*0.9)*0.08:s.type==='boss'?Math.sin(s.ph*0.6)*0.05:0;
  var a=1,ox=0;
  if(s.born>0){k*=1-s.born/0.25*0.6;a=1-s.born/0.25}
  if(s.intro>0){var ip=1-s.intro/CFG.boss.introSec;k*=0.4+0.6*ip+Math.sin(ip*Math.PI)*0.15}
  if(s.dying&&s.type!=='boss'){var dp=1-s.dying/0.15;k*=1+0.25*dp;a=1-dp}
  if(s.dying&&s.type==='boss'){var bp=1-s.dying/0.45;k*=1+0.3*bp;a=1-bp}
  if(s.flinch>0)ox=Math.sin(s.flinch*60)*5*(s.flinch/0.45);
  var sqx=1,sqy=1;if(s.squash>0){var q=s.squash/0.18;sqx=1+0.12*q;sqy=1-0.12*q}
  ctx.save();ctx.globalAlpha=a;ctx.translate(s.x+ox,s.y);ctx.rotate(rot);ctx.scale(k*sqx,k*sqy);
  ctx.drawImage(im,-z/2,-z/2,z,z);
  if(s.flash>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*(s.flash/0.15)*0.6;ctx.drawImage(im,-z/2,-z/2,z,z)}
  ctx.restore();
  if(s.flinch>0){ /* 진짜 해: 짧은 붉은 테두리 */
    ctx.save();ctx.globalAlpha=Math.min(1,s.flinch/0.2);ctx.strokeStyle='#F0605A';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(s.x+ox,s.y,s.r+6,0,6.283);ctx.stroke();ctx.restore();
  }
  if(s.type==='boss'&&!s.dying&&s.intro<=0){ /* 보스 체력 */
    var n=CFG.bossHp,w=14,g=5,tw=n*w+(n-1)*g,x0=s.x-tw/2,y0=s.y+s.r+18;
    for(var i=0;i<n;i++){
      ctx.fillStyle=i<s.hp?(s.hp<=2?'#F0605A':'#F5B331'):'rgba(15,17,32,.55)';
      ctx.beginPath();ctx.roundRect?ctx.roundRect(x0+i*(w+g),y0,w,8,4):ctx.rect(x0+i*(w+g),y0,w,8);ctx.fill();
    }
  }
}
function drawArrowAt(len){ /* 원점=화살 오늬(꼬리), 위(-y)로 향함 */
  var im=IMG.arrow,dh=len/0.925,dw=dh*im.width/im.height;
  ctx.drawImage(im,-dw/2,-dh*0.955,dw,dh);
}
function drawArrowFlying(ar){
  ctx.save();ctx.translate(ar.x,ar.y);ctx.rotate(ar.a);
  /* 빛 꼬리 */
  var g=ctx.createLinearGradient(0,0,0,CFG.arrowLen+70);
  g.addColorStop(0,'rgba(190,255,236,0)');g.addColorStop(0.45,'rgba(190,255,236,.55)');g.addColorStop(1,'rgba(190,255,236,0)');
  ctx.fillStyle=g;ctx.fillRect(-2.5,CFG.arrowLen*0.4,5,CFG.arrowLen+40);
  ctx.translate(0,CFG.arrowLen);drawArrowAt(CFG.arrowLen);ctx.restore();
}
function drawBow(){
  var a=aim&&aim.armed?aim.a:0,t=aim&&aim.armed?aim.t:0;
  var rc=recoil>0?Math.sin((1-recoil/0.09)*Math.PI)*5:0;
  ctx.save();ctx.translate(L.bowX,L.bowY+rc);ctx.rotate(a);
  /* 콤보 발광 */
  var tier=combo>=10?3:combo>=6?2:combo>=3?1:0;
  if(tier){ctx.globalAlpha=0.07+tier*0.05;ctx.fillStyle="#7FE3C6";ctx.beginPath();ctx.ellipse(0,0,L.bowW*0.42,L.bowH*0.42,0,0,6.283);ctx.fill();ctx.globalAlpha=1}
  ctx.save();ctx.rotate(Math.PI);ctx.drawImage(IMG.bow,-L.bowW/2,-L.bowH/2,L.bowW,L.bowH);ctx.restore();
  var ready=(clock*1000-lastShot)>=CFG.fireGapMs;
  if(ready||aim){
    var pull=t*28;
    /* 조준선: 화살촉 앞쪽 짧은 점선 */
    if(aim&&aim.armed){
      ctx.save();ctx.setLineDash([6,8]);ctx.lineWidth=2.5;ctx.strokeStyle='rgba(255,255,255,.85)';
      ctx.beginPath();var tipY=L.stringY+pull-CFG.arrowLen;ctx.moveTo(0,tipY-8);ctx.lineTo(0,tipY-90-60*t);ctx.stroke();ctx.restore();
      /* 장력: 촉에 민트 빛이 모임 */
      ctx.globalAlpha=0.25+0.5*t;ctx.fillStyle='#BFFFEA';ctx.beginPath();ctx.arc(0,tipY+4,3+7*t,0,6.283);ctx.fill();ctx.globalAlpha=1;
    }
    ctx.translate(0,L.stringY+pull);drawArrowAt(CFG.arrowLen);
  }
  ctx.restore();
}

/* ---------- HUD ---------- */
var hudCache={};
function setTxt(el,key,v){if(hudCache[key]!==v){hudCache[key]=v;el.textContent=v}}
function updHud(force){
  if(force)hudCache={};
  var left=Math.max(0,Math.ceil(CFG.gameSec-gameT));
  setTxt(hudTime,'t',String(left));hudTime.classList.toggle('low',left<=5);
  setTxt(hudScore,'s',String(score));setTxt(hudCombo,'c',String(combo));
}

/* ---------- 루프 ---------- */
function frame(ts){
  rafId=requestAnimationFrame(frame);
  if(state==='result'||state==='intro'||state==='error'||state==='paused'){
    if(!frame.drawnOnce||state==='paused'){render();frame.drawnOnce=true}
    lastTs=0;return; /* 결과·대기 화면에서는 갱신 멈춤 */
  }
  frame.drawnOnce=false;
  var dt=lastTs?Math.min(0.05,(ts-lastTs)/1000):0;lastTs=ts;
  update(dt);render();
  if(state==='play')updHud();
}
/* 정지 화면 전환 시 한 번 더 그리도록 */
var _show=showPanel;showPanel=function(h,b){frame.drawnOnce=false;_show(h,b)};

window.addEventListener('resize',function(){resize();frame.drawnOnce=false});
window.addEventListener('orientationchange',function(){setTimeout(function(){resize();frame.drawnOnce=false},200)});

function boot(){
  state='loading';showPanel('<p class="panel__line">그림을 불러오는 중이에요…</p>');
  loadImages().then(function(){resize();showIntro()},function(){
    state='error';
    showPanel('<p class="panel__line">그림을 불러오지 못했어요. 다시 시도해 주세요.</p><button class="btn btn--primary" id="bRetry">다시 시도</button>');
    $('bRetry').onclick=boot;
  });
}
resize();
rafId=requestAnimationFrame(frame);
boot();
/* 테스트용 노출 */
window.__sun={CFG:CFG,get state(){return state},get suns(){return suns},get score(){return score},
  fire:fire,startCountdown:startCountdown,finish:finish,setTime:function(t){gameT=t}};
})();
