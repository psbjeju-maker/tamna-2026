/* 소별왕 — 빼앗긴 하늘을 되찾아라 (v3 하늘 탈환, 탐라문화제 놀이터 미니게임)
   - 어둠이 덮은 하늘에서 가짜 해를 쏘면 그 자리에 빛 구멍이 남고, 구멍이 모여 제주 하늘이 드러난다.
   - 충전형 해는 3초 충전 후 주변을 다시 어둡게 만든다 → 먼저 노릴 이유. 황금 해는 잠깐 지나간다 → 선택.
   - 가까운 가짜 해 최대 2개로 연쇄. 45초 뒤 하늘(ROI) 회복률 75% 이상이면 성공.
   - 자체 완결 페이지. 부모 앱(index.html gSun)이 iframe 으로 띄우고
     window.onGameComplete(result) / window.onGameExit() / window.getBest() 를 주입한다.
   - 서버 보상은 부모가 cleared 일 때만 attemptId 당 1회 요청한다. */
(function(){
'use strict';

/* ---------- 튜닝값 (전부 여기서 조정) ---------- */
var CFG={
  worldW:390, minWorldH:640, maxStageCss:560,
  gameSec:45, lastSec:10, goalPct:75,
  /* 활 조작 — v2 값 그대로 유지 */
  fireGapMs:320, cancelPx:8, maxAngle:1.22, flightSec:0.38, pullSpeedVar:0.06,
  pullMaxPx:110, arrowLen:66, bowWidth:0.46, hitScale:1.08,
  roiBottomFrac:0.585,     /* 배경 이미지 높이 대비 산 정상 바로 위 */
  maskCols:98, fadeLen:44,
  /* 빛 구멍 반경(무대 폭 비율) */
  light:{fake:0.17, charger:0.19, chargerStop:0.23, gold:0.31, growSec:0.24},
  brushCore:0.3,          /* 반경의 이 비율까지만 완전히 밝고 바깥은 부드럽게 흐려짐 */
  trueHitWeakSec:1.0, trueHitWeak:0.5,   /* 진짜 해 직접 명중: 1초 동안 회복 효과 절반 */
  chain:{radius:0.18, max:2, stepSec:0.085},
  score:{fake:100, charger:200, gold:500, chain:100, chain3:150, trueHit:-100},
  r:{fake:15.5, true:15.5, charger:18.5, gold:16.5},       /* 몸체 반경 px(무대 390 기준) */
  spd:{fake:[47,86], true:[30,45], charger:[22,36]},
  charger:{wait:[1.5,2.0], charge:3.0, rest:1.2, stagger:1.5, spreadR:0.18, spreadAmt:0.35, spreadSec:0.4},
  goldAt:[12,27,38], goldSec:3.0,
  /* 시간대별 목표 개수 */
  waves:[
    {until:4,  fakes:5, chargers:0, trues:1},
    {until:15, fakes:5, chargers:1, trues:1},
    {until:45, fakes:5, chargers:2, trues:2}
  ],
  respawn:[0.5,0.8], lastRespawnMul:0.8, clusterChance:0.4,
  bodyRatio:{true:0.28, fake:0.27, charger:0.24, gold:0.154},
  goldBody:{cx:0.72, cy:0.475}   /* 황금 해 이미지 안 몸체 중심(꼬리 제외) */
};
var LINES={
  start:'어둠이 제주 하늘을 덮어 버렸어. 가짜 해를 쏘아 하늘을 되찾자!',
  control:'아래에서 당겨 조준하고, 손을 놓으면 발사!',
  win:'제주의 하늘을 되찾았구나!',
  winFull:'하늘이 완전히 맑아졌어!',
  retry:'조금만 더! 어두운 곳의 해부터 노려봐.'
};
var IMG_SRC={bg:'img/01_jeju_background.jpg',trueSun:'img/02_true_sun.png',fake:'img/03_fake_sun.png',
  bow:'img/05_bow.png',arrow:'img/06_arrow.png',burst:'img/07_hit_burst.png',
  charger:'img/09_darkness_charger.png',gold:'img/10_golden_runner.png',wave:'img/11_light_wave.png',veil:'img/12_darkness_veil.png'};

/* ---------- DOM ---------- */
var $=function(id){return document.getElementById(id)};
var cv=$('cv'),ctx=cv.getContext('2d'),ctrl=$('ctrl');
var overlay=$('overlay'),panel=$('panel'),hud=$('hud'),muteBtn=$('mute');
var hudTime=$('hudTime'),hudScore=$('hudScore'),hudPct=$('hudPct'),hudSky=$('hudSky'),goalEl=$('goal'),goalText=$('goalText');
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
  var W=CFG.worldW,bw=W*CFG.bowWidth,bh=bw*BOW_RATIO;
  var bgK=Math.max(W/768,WH/1152),bgH=1152*bgK;
  var roiBottom=Math.min(bgH*CFG.roiBottomFrac,WH*0.64);
  L={top:62,roiBottom:roiBottom,bowX:W/2,bowY:WH-104,bowW:bw,bowH:bh,stringY:bh*0.24};
  L.maskBottom=roiBottom+CFG.fadeLen;
  var tipY=L.bowY-(CFG.arrowLen-L.stringY);
  L.arrowSpeed=(tipY-(L.top+L.roiBottom)/2)/CFG.flightSec;
  ctrl.style.top=((L.roiBottom+24)*scale)+'px';
  initMaskGeometry();
  suns.forEach(function(s){clampSun(s)});
}
function toWorld(e){
  var r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left-offX)/scale,y:(e.clientY-r.top)/scale};
}

/* ---------- 하늘 회복 마스크 (0=어둠, 1=밝음) ---------- */
var MC=CFG.maskCols,CELL=CFG.worldW/MC,MAXR=300;
var mask=new Float32Array(MC*MAXR),mRows=0,roiR0=0,roiR1=0;
var maskCv=document.createElement('canvas'),maskCtx=maskCv.getContext('2d'),maskImg=null;
var veilCv=document.createElement('canvas'),veilCtx=veilCv.getContext('2d');
var veilDirty=true,veilFade=1,recovery=0,statT=0;
function initMaskGeometry(){
  mRows=Math.min(MAXR,Math.ceil(L.maskBottom/CELL)+1);
  roiR0=Math.floor(L.top/CELL);roiR1=Math.min(mRows,Math.ceil(L.roiBottom/CELL));
  maskCv.width=MC;maskCv.height=mRows;maskImg=maskCtx.createImageData(MC,mRows);
  var Q=1.5;veilCv.width=Math.round(CFG.worldW*Q);veilCv.height=Math.round(mRows*CELL*Q);
  veilDirty=true;
}
function clearMask(){mask.fill(0);veilDirty=true;recovery=0}
function smooth(v){v=v<0?0:v>1?1:v;return v*v*(3-2*v)}
/* 부드러운 원형 브러시: 중심부만 꽉 차고 가장자리로 갈수록 흐려짐(겹쳐 맞혀야 완전히 걷힘) */
function brush(x,y,R,fn){
  var c0=Math.max(0,Math.floor((x-R)/CELL)),c1=Math.min(MC-1,Math.ceil((x+R)/CELL));
  var r0=Math.max(0,Math.floor((y-R)/CELL)),r1=Math.min(mRows-1,Math.ceil((y+R)/CELL));
  for(var r=r0;r<=r1;r++){
    var cy=(r+0.5)*CELL-y;
    for(var c=c0;c<=c1;c++){
      var cx=(c+0.5)*CELL-x,d=Math.sqrt(cx*cx+cy*cy);
      if(d>=R)continue;
      fn(r*MC+c,smooth((1-d/R)/(1-CFG.brushCore)));
    }
  }
  veilDirty=true;
}
function lighten(x,y,R,str){brush(x,y,R,function(i,v){var t=v*str;if(t>mask[i])mask[i]=t})}
function darken(x,y,R,amt){brush(x,y,R,function(i,v){mask[i]=Math.max(0,mask[i]-v*amt)})}
function calcRecovery(){
  var sum=0,n=0;
  for(var r=roiR0;r<roiR1;r++)for(var c=0;c<MC;c++){sum+=mask[r*MC+c];n++}
  recovery=n?sum/n:0;return recovery;
}
function rebuildVeil(){
  if(!IMG.veil)return;
  var d=maskImg.data;
  for(var r=0;r<mRows;r++){
    var y=(r+0.5)*CELL,fade=y<L.roiBottom?1:Math.max(0,1-(y-L.roiBottom)/CFG.fadeLen);
    for(var c=0;c<MC;c++){
      var i=r*MC+c,a=(1-mask[i])*fade*veilFade;
      d[i*4+3]=Math.round(a*255);
    }
  }
  maskCtx.putImageData(maskImg,0,0);
  var w=veilCv.width,h=veilCv.height;
  veilCtx.globalCompositeOperation='source-over';veilCtx.clearRect(0,0,w,h);
  var im=IMG.veil,k=Math.max(w/im.width,h/im.height);
  veilCtx.drawImage(im,(w-im.width*k)/2,0,im.width*k,im.height*k);
  /* 어둠 질감에 역마스크 적용 → 밝아진 곳은 구멍 */
  veilCtx.globalCompositeOperation='destination-in';veilCtx.imageSmoothingEnabled=true;
  veilCtx.drawImage(maskCv,0,0,w,h);
  veilCtx.globalCompositeOperation='source-over';
  veilDirty=false;
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
  ['slice','pop','bonus','fanfare'].forEach(function(n){
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
  else if(name==='bonus')tone(880*r,0.16,'triangle',0.15,1320*r);
  else if(name==='fanfare'){tone(523,0.2,'triangle',0.16);setTimeout(function(){tone(659,0.2,'triangle',0.16)},150);setTimeout(function(){tone(784,0.35,'triangle',0.16)},300)}
}
function sChain(k){if(canPlay('chain'+k,40))tone(660*Math.pow(1.26,k),0.12,'triangle',0.13,990*Math.pow(1.26,k))}
function sTrue(){if(canPlay('true',120))tone(220,0.22,'square',0.12,150)}
function sWarn(){if(canPlay('warn',200))tone(420,0.1,'square',0.07,380)}
function sSpread(){if(canPlay('spread',150))tone(150,0.38,'sawtooth',0.1,70)}
function sBeep(hi){if(canPlay('beep'+hi,100))tone(hi?880:600,0.12,'sine',0.18)}
function buzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}

/* ---------- 상태 ---------- */
var state='loading',prevState=null;
var suns=[],arrows=[],fx=[],lines=[],texts=[],spawnQ=[],lights=[],darks=[],chains=[];
var aim=null,lastShot=-1e9,recoil=0,hitStop=0,shake=0;
var gameT=0,score=0,directHits=0,chainKills=0,maxChain=1,chargersStopped=0,golds=0,trueHits=0,shots=0;
var waveIdx=0,countN=0,countT=0,attemptId=null,clock=0,weakT=0,lastChargeStart=-99,goldNext=0,lastBanner=false;
var victoryT=0,lastTs=0,hudCache={},uid=0,gid=0;

function resetRun(){
  suns=[];arrows=[];fx=[];lines=[];texts=[];spawnQ=[];lights=[];darks=[];chains=[];aim=null;
  gameT=0;score=0;directHits=0;chainKills=0;maxChain=1;chargersStopped=0;golds=0;trueHits=0;shots=0;
  waveIdx=0;weakT=0;lastChargeStart=-99;goldNext=0;lastBanner=false;victoryT=0;hitStop=0;shake=0;
  veilFade=1;clearMask();hudCache={};
}
function rnd(a,b){return a+Math.random()*(b-a)}
function W_(f){return CFG.worldW*f}

/* ---------- 해 ---------- */
function makeSun(type,x,y,vx){
  return {id:++uid,type:type,x:x,y:y,px:x,py:y,by:y,r:CFG.r[type],vx:vx,ph:Math.random()*6.28,
    bob:type==='gold'?0:4,alive:true,dying:0,flinch:0,born:0.25,flash:0,leave:0,group:0,
    cs:'wait',ct:rnd(CFG.charger.wait[0],CFG.charger.wait[1]),warned:false};
}
function sunImg(s){return s.type==='true'?IMG.trueSun:s.type==='charger'?IMG.charger:s.type==='gold'?IMG.gold:IMG.fake}
function sunDrawSize(s){return s.r/CFG.bodyRatio[s.type]}
function playTop(r){return L.top+r+10}
function playBot(r){return L.roiBottom-r-8}
function clampSun(s){
  if(s.type==='gold')return;
  var m=s.r+8;
  s.x=Math.max(m,Math.min(CFG.worldW-m,s.x));
  s.by=Math.max(playTop(s.r)+s.bob,Math.min(Math.max(playTop(s.r)+s.bob,playBot(s.r)-s.bob),s.by));
}
function live(s){return s.alive&&!s.dying&&!s.leave}
function spaceOk(x,y,r,ignoreGroup){
  for(var i=0;i<suns.length;i++){
    var o=suns[i];if(!live(o)||o.type==='gold')continue;
    if(ignoreGroup&&o.group===ignoreGroup)continue;
    var dx=o.x-x,dy=o.by-y;if(Math.sqrt(dx*dx+dy*dy)<o.r+r+30)return false;
  }
  return true;
}
function randSpeed(type){var a=CFG.spd[type];return rnd(a[0],a[1])*(Math.random()<.5?-1:1)}
function spawnOne(type){
  var r=CFG.r[type];
  for(var k=0;k<40;k++){
    var x=rnd(r+12,CFG.worldW-r-12),y=rnd(playTop(r)+4,playBot(r)-4);
    if(spaceOk(x,y,r)){suns.push(makeSun(type,x,y,randSpeed(type)));return true}
  }
  return false;
}
/* 일반 가짜 2~3개 무리: 같은 속도로 함께 움직여 연쇄를 노릴 수 있게 */
function spawnCluster(n,cx,cy){
  var r=CFG.r.fake,g=++gid,vx=randSpeed('fake')*0.8;
  for(var k=0;k<30;k++){
    var x=cx!=null&&k===0?cx:rnd(r+60,CFG.worldW-r-60),y=cy!=null&&k===0?cy:rnd(playTop(r)+30,playBot(r)-30);
    var pts=[{x:x,y:y}],ang=rnd(0,6.28);
    for(var j=1;j<n;j++){var d=rnd(46,56),a=ang+j*2.2;pts.push({x:x+Math.cos(a)*d,y:y+Math.sin(a)*d*0.8})}
    var ok=pts.every(function(p){return p.x>r+10&&p.x<CFG.worldW-r-10&&p.y>playTop(r)&&p.y<playBot(r)&&spaceOk(p.x,p.y,r)});
    if(ok){pts.forEach(function(p){var s=makeSun('fake',p.x,p.y,vx);s.group=g;suns.push(s)});return n}
  }
  return 0;
}
function count(t){var n=0;suns.forEach(function(s){if(live(s)&&s.type===t)n++});return n}
function queued(t){var n=0;spawnQ.forEach(function(q){if(q.type===t)n++});return n}
function respawnDelay(){var d=rnd(CFG.respawn[0],CFG.respawn[1]);return gameT>=CFG.gameSec-CFG.lastSec?d*CFG.lastRespawnMul:d}
function fillWave(){
  var w=CFG.waves[waveIdx];
  [['fake',w.fakes],['charger',w.chargers],['true',w.trues]].forEach(function(p){
    var want=p[1]-count(p[0])-queued(p[0]);
    for(var i=0;i<want;i++)spawnQ.push({type:p[0],at:respawnDelay()});
  });
}
function processSpawns(dt){
  for(var i=spawnQ.length-1;i>=0;i--){
    var q=spawnQ[i];q.at-=dt;if(q.at>0)continue;
    if(q.type==='fake'){
      var more=spawnQ.filter(function(o){return o.type==='fake'&&o!==q&&o.at<0.4}).length;
      if(more>=1&&Math.random()<CFG.clusterChance){
        var n=Math.min(3,more+1),made=spawnCluster(n);
        if(made){var left=made-1;spawnQ.splice(i,1);
          for(var j=spawnQ.length-1;j>=0&&left>0;j--)if(spawnQ[j].type==='fake'&&spawnQ[j].at<0.4){spawnQ.splice(j,1);left--}
          i=Math.min(i,spawnQ.length);continue}
      }
    }
    if(spawnOne(q.type))spawnQ.splice(i,1);else q.at=0.2;
  }
}
function spawnGold(){
  var r=CFG.r.gold,y=L.top+(L.roiBottom-L.top)*rnd(0.18,0.42);
  var s=makeSun('gold',-r*3,y,(CFG.worldW+r*6)/CFG.goldSec);s.born=0;s.by=y;
  suns.push(s);
  play('bonus',0.35,1.3);
}

/* ---------- 이펙트 ---------- */
function addFx(o){fx.push(o);while(fx.length>4)fx.shift()}
function addText(x,y,str,color,size){
  var half=Math.min(CFG.worldW/2-8,String(str).length*(size||18)*0.32+8);x=Math.max(half,Math.min(CFG.worldW-half,x)); /* 화면 밖으로 잘리지 않게 */
  texts.push({x:x,y:y,s:str,c:color||'#fff',z:size||18,t:0});while(texts.length>5)texts.shift()}
function addLight(x,y,R){lights.push({x:x,y:y,R:R,t:0,str:weakT>0?CFG.trueHitWeak:1})}

/* ---------- 입력: 하단 조작 영역에서 새총식 당겨 쏘기 (v2와 동일) ---------- */
ctrl.addEventListener('pointerdown',function(e){
  if(aim||state!=='play')return;
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
  if(a.armed&&state==='play')fire(a.a,a.t);
});
function cancelAim(e){if(aim&&(!e||e.pointerId===aim.id))aim=null}
ctrl.addEventListener('pointercancel',cancelAim);
ctrl.addEventListener('lostpointercapture',cancelAim);
function updAim(){
  var dx=aim.x-aim.sx,dy=aim.y-aim.sy,len=Math.sqrt(dx*dx+dy*dy);
  aim.armed=len>=CFG.cancelPx;
  if(!aim.armed){aim.t=0;return}
  var a=Math.atan2(-dx,Math.max(dy,6));
  aim.a=Math.max(-CFG.maxAngle,Math.min(CFG.maxAngle,a));
  aim.t=Math.min(1,len/CFG.pullMaxPx);
}
function fireReady(){return clock*1000-lastShot>=CFG.fireGapMs}
function fire(a,t){
  if(!fireReady())return;
  lastShot=clock*1000;
  var ux=Math.sin(a),uy=-Math.cos(a),tipD=CFG.arrowLen-L.stringY;
  var tx=L.bowX+ux*tipD,ty=L.bowY+uy*tipD;
  var sp=L.arrowSpeed*(1-CFG.pullSpeedVar+2*CFG.pullSpeedVar*t);
  arrows.push({x:tx,y:ty,px:tx,py:ty,vx:ux*sp,vy:uy*sp,a:a});shots++;
  recoil=0.08;play('slice',0.35,1.15);
}

/* ---------- 판정 ---------- */
function relHit(ar,cx0,cy0,cx1,cy1,r){
  var x0=ar.px-cx0,y0=ar.py-cy0,x1=ar.x-cx1,y1=ar.y-cy1;
  var dx=x1-x0,dy=y1-y0,A=dx*dx+dy*dy,B=2*(x0*dx+y0*dy),C=x0*x0+y0*y0-r*r;
  if(C<=0)return 0;if(A===0)return -1;
  var D=B*B-4*A*C;if(D<0)return -1;
  var s=(-B-Math.sqrt(D))/(2*A);return s>=0&&s<=1?s:-1;
}
function hitTest(ar){
  var best=null,bs=2;
  suns.forEach(function(s){
    if(!live(s)||s.born>0.15)return;
    var sc=relHit(ar,s.px,s.py,s.x,s.y,s.r*CFG.hitScale);
    if(sc>=0&&sc<bs){bs=sc;best=s}
  });
  return best;
}
function killSun(s,R,pts,label,color){
  s.dying=0.15;s.flash=0.15;
  addFx({img:'burst',x:s.x,y:s.y,size:sunDrawSize(s)*1.2,t:0,dur:0.2});
  addFx({img:'wave',x:s.x,y:s.y,size:R*2,t:0,dur:0.34,delay:0.06});
  addLight(s.x,s.y,R);
  score+=pts;
  addText(s.x,s.y-s.r-10,label||'+'+pts,color||'#F5B331',pts>=300?22:17);
}
function onHit(s,ar){
  if(s.type==='true'){
    s.flinch=0.45;trueHits++;score=Math.max(0,score+CFG.score.trueHit);weakT=CFG.trueHitWeakSec;
    addText(s.x,s.y-s.r-16,'진짜 해는 지켜줘!','#FF8A84',16);
    addText(s.x,s.y+s.r+12,String(CFG.score.trueHit),'#FF8A84',15);
    sTrue();buzz(40);shake=reduceMotion?0:0.12;return;
  }
  hitStop=0.05;buzz(15);directHits++;
  if(s.type==='gold'){
    golds++;killSun(s,W_(CFG.light.gold),CFG.score.gold,'+'+CFG.score.gold+' 황금 해!','#FFD45C');
    play('fanfare',0.45);return;
  }
  var R=W_(CFG.light.fake),pts=CFG.score.fake;
  if(s.type==='charger'){
    pts=CFG.score.charger;
    if(s.cs==='charge'){R=W_(CFG.light.chargerStop);chargersStopped++;addText(s.x,s.y+s.r+14,'충전 차단!','#D9B8FF',15)}
    else R=W_(CFG.light.charger);
  }
  killSun(s,R,pts);play('pop',0.6);
  startChain(s);
}
/* 연쇄: 명중 순간 위치 기준 반경 0.18W 안의 가까운 가짜(충전형 포함) 최대 2개 */
function startChain(src){
  var R=W_(CFG.chain.radius),hx=src.x,hy=src.y;
  var cand=suns.filter(function(o){return o!==src&&live(o)&&o.born<=0.15&&(o.type==='fake'||o.type==='charger')})
    .map(function(o){var dx=o.x-hx,dy=o.y-hy;return {s:o,d:Math.sqrt(dx*dx+dy*dy)}})
    .filter(function(c){return c.d<=R}).sort(function(a,b){return a.d-b.d}).slice(0,CFG.chain.max);
  if(!cand.length)return;
  var job={from:{x:hx,y:hy},list:cand.map(function(c){return c.s}),i:0,t:0,kills:0};
  chains.push(job);
}
function stepChains(dt){
  for(var i=chains.length-1;i>=0;i--){
    var j=chains[i];j.t+=dt;
    while(j.i<j.list.length&&j.t>=CFG.chain.stepSec*(j.i+1)){
      var s=j.list[j.i];j.i++;
      if(live(s)){ /* 도달 시점에 아직 살아 있는 적만 */
        lines.push({x0:j.from.x,y0:j.from.y,x1:s.x,y1:s.y,t:0,dur:0.3});
        j.kills++;chainKills++;
        if(s.type==='charger'&&s.cs==='charge')chargersStopped++;
        killSun(s,W_(CFG.light.fake),CFG.score.chain);
        sChain(j.kills);
        j.from={x:s.x,y:s.y};
      }
    }
    if(j.i>=j.list.length){
      var total=j.kills+1;maxChain=Math.max(maxChain,total);
      if(total===3){score+=CFG.score.chain3;addText(j.from.x,j.from.y-34,'3연쇄! +'+CFG.score.chain3,'#7FE3C6',21)}
      else if(total===2)addText(j.from.x,j.from.y-34,'2연쇄!','#7FE3C6',18);
      chains.splice(i,1);
    }
  }
}

/* ---------- 흐름 ---------- */
var frameDirty=true;
function showPanel(html,bare){
  frameDirty=true;
  panel.innerHTML=html;overlay.hidden=false;overlay.classList.toggle('panel-wrap--bare',!!bare);
  panel.style.background=bare?'transparent':'';
}
function hidePanel(){overlay.hidden=true}
function setPlayUi(on){hud.hidden=!on;goalEl.hidden=!on}
function showIntro(){
  state='intro';resetRun();setPlayUi(false);
  var b=getBest();
  showPanel(
    '<h1>소별왕 — 빼앗긴 하늘을 되찾아라</h1>'+
    '<p class="panel__line">'+LINES.start+'</p>'+
    '<div class="pair">'+
      '<figure><img src="'+IMG_SRC.fake+'" alt=""><figcaption class="is-fake">가짜 해</figcaption><small>맞히면 하늘이 밝아지고 옆 해로 연쇄</small></figure>'+
      '<figure><img src="'+IMG_SRC.charger+'" alt=""><figcaption class="is-charger">충전 해</figcaption><small>3초 뒤 어둠을 퍼뜨림 · 먼저!</small></figure>'+
      '<figure><img src="'+IMG_SRC.gold+'" alt=""><figcaption class="is-gold">황금 해</figcaption><small>잠깐 지나감 · 500점</small></figure>'+
      '<figure><img src="'+IMG_SRC.trueSun+'" alt=""><figcaption class="is-true">진짜 해</figcaption><small>지켜줘 · -100</small></figure>'+
    '</div>'+
    '<div class="guide" aria-hidden="true"><i class="guide__arrow"></i><i class="guide__dot"></i><span class="guide__cap">왼쪽으로 당기면 오른쪽으로</span></div>'+
    '<p class="panel__line panel__line--muted">'+LINES.control+' 45초 안에 하늘을 '+CFG.goalPct+'% 이상 되찾으면 성공!</p>'+
    (b.score?'<p class="panel__line panel__line--muted">내 최고 '+b.score+'점 · 하늘 '+b.pct+'%</p>':'')+
    '<button class="btn btn--primary" id="bGo">시작</button>');
  $('bGo').onclick=function(){initAudio();startCountdown()};
}
function startCountdown(){
  resetRun();setPlayUi(true);
  state='countdown';countT=0;countN=3;waveIdx=0;
  /* 첫 4초: 가운데 쯤 3개 무리 + 2개 → 첫 발로 연쇄와 밝아짐을 경험 */
  spawnCluster(3,CFG.worldW*rnd(0.4,0.6),L.top+(L.roiBottom-L.top)*0.5);
  spawnOne('fake');spawnOne('fake');
  /* 진짜 해는 첫 무리 반대편 위쪽에 — 첫 발이 진짜 해에 막히지 않게 */
  var cl=suns[0],tx=cl.x<CFG.worldW/2?rnd(CFG.worldW*0.7,CFG.worldW-30):rnd(30,CFG.worldW*0.3);
  suns.push(makeSun('true',tx,playTop(CFG.r.true)+8,randSpeed('true')*0.5));
  suns.forEach(function(s){s.born=0});
  updHud(true);
  showPanel('<div class="count" id="cnt">3</div>',true);sBeep(false);
}
function beginPlay(){
  state='play';hidePanel();gameT=0;
  attemptId='sky-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  sBeep(true);
}
function endPlay(){
  if(state!=='play')return;
  arrows=[];aim=null;chains=[];
  calcRecovery();
  /* 진행 중인 빛 구멍은 끝까지 반영한 뒤 판정 */
  lights.forEach(function(l){lighten(l.x,l.y,l.R,l.str)});lights=[];
  var pct=Math.floor(calcRecovery()*100);
  if(pct>=CFG.goalPct){state='victory';victoryT=0;play('fanfare',0.6);addText(CFG.worldW/2,(L.top+L.roiBottom)/2,pct>=100?'완전 탈환!':'하늘 탈환!','#F5B331',30)}
  else finish(pct);
}
function finish(pct){
  state='result';setPlayUi(false);
  var cleared=pct>=CFG.goalPct;
  var b=getBest(),isBestScore=score>b.score,isBestPct=pct>b.pct;
  setLocalBest(Math.max(score,b.score),Math.max(pct,b.pct));
  var bestScore=Math.max(b.score,score),bestPct=Math.max(b.pct,pct);
  var goal;
  if(!cleared)goal='하늘 '+(CFG.goalPct-pct)+'% 더 되찾으면 성공!';
  else if(pct<100)goal='완전 탈환까지 '+(100-pct)+'%!';
  else if(score<bestScore)goal='최고점까지 '+(bestScore-score)+'점!';
  else goal='완벽한 하늘! 최고점을 더 높여 봐.';
  showPanel(
    '<span class="badge '+(cleared?'badge--ok':'badge--no')+'">'+(cleared?'성공 · 하늘 탈환':'아쉬워요')+'</span>'+
    '<h1>'+(cleared?(pct>=100?LINES.winFull:LINES.win):LINES.retry)+'</h1>'+
    '<div class="big">'+pct+'<small style="font-size:18px">%</small></div>'+
    '<p class="panel__line panel__line--muted">되찾은 하늘 (목표 '+CFG.goalPct+'%)'+(isBestPct?' · 최고 기록!':'')+'</p>'+
    '<div class="stats">'+
      '<div><small>점수</small><strong>'+score+(isBestScore?' <span style="color:var(--mint);font-size:11px">최고!</span>':'')+'</strong></div>'+
      '<div><small>내 최고</small><strong>'+bestScore+'점 · '+bestPct+'%</strong></div>'+
      '<div><small>최대 연쇄</small><strong>'+maxChain+'</strong></div>'+
      '<div><small>충전 차단 · 황금 해</small><strong>'+chargersStopped+' · '+golds+'</strong></div>'+
    '</div>'+
    '<p class="panel__line panel__line--goal">'+goal+'</p>'+
    '<button class="btn btn--primary" id="bAgain">한 판 더</button>'+
    '<button class="btn btn--ghost" id="bBack">돌아가기</button>');
  $('bAgain').onclick=function(){initAudio();startCountdown()};
  $('bBack').onclick=function(){if(typeof window.onGameExit==='function')window.onGameExit();else showIntro()};
  var result={gameId:'sobyeol-sky',version:3,attemptId:attemptId,score:score,recoveryPct:pct,cleared:cleared,
    directHits:directHits,chainKills:chainKills,maxChain:maxChain,chargersStopped:chargersStopped,golds:golds,
    trueHits:trueHits,shots:shots,durationMs:Math.round(Math.min(gameT,CFG.gameSec)*1000),
    isBestScore:isBestScore,isBestPct:isBestPct};
  try{if(typeof window.onGameComplete==='function')window.onGameComplete(result)}catch(e){}
}
function getBest(){
  try{if(typeof window.getBest==='function'&&window.getBest!==getBest){var p=window.getBest()||{};return {score:+p.score||0,pct:+p.pct||0}}}catch(e){}
  try{var o=JSON.parse(localStorage.getItem('sobyeolSkyBest')||'{}');return {score:+o.score||0,pct:+o.pct||0}}catch(e){return {score:0,pct:0}}
}
function setLocalBest(sc,pct){try{localStorage.setItem('sobyeolSkyBest',JSON.stringify({score:sc,pct:pct}))}catch(e){}}

/* 탭 숨김 → 시간·이동·소리 정지, 복귀 시 계속하기 */
document.addEventListener('visibilitychange',function(){
  if(document.hidden&&(state==='play'||state==='countdown')){
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
  if(state==='countdown'){
    countT+=dt;
    if(countT>=0.8){countT-=0.8;countN--;
      if(countN<=0)beginPlay();else{var c=$('cnt');if(c)c.textContent=countN;sBeep(false)}}
    animSuns(dt,true);animFx(dt);return;
  }
  if(state==='victory'){ /* 성공 판정 뒤에만 남은 어둠이 걷힌다(플레이 중 마스크 조작 없음) */
    victoryT+=dt;veilFade=Math.max(0,1-victoryT/0.9);veilDirty=true;animFx(dt);
    if(victoryT>=1.2)finish(Math.floor(recovery*100));
    return;
  }
  if(state!=='play'){animFx(dt);return}
  if(hitStop>0){hitStop-=dt;animFx(dt);return}

  gameT+=dt;weakT=Math.max(0,weakT-dt);
  while(waveIdx<CFG.waves.length-1&&gameT>=CFG.waves[waveIdx].until)waveIdx++;
  if(goldNext<CFG.goldAt.length&&gameT>=CFG.goldAt[goldNext]){goldNext++;spawnGold()}
  if(!lastBanner&&gameT>=CFG.gameSec-CFG.lastSec){lastBanner=true;
    addText(CFG.worldW/2,(L.top+L.roiBottom)/2,'마지막 빛을 되찾아라!','#F5B331',24);sBeep(true)}
  fillWave();processSpawns(dt);

  animSuns(dt,false);
  for(var j=arrows.length-1;j>=0;j--){
    var ar=arrows[j];ar.px=ar.x;ar.py=ar.y;ar.x+=ar.vx*dt;ar.y+=ar.vy*dt;
    var h=hitTest(ar);
    if(h){arrows.splice(j,1);onHit(h,ar);continue}
    if(ar.y<-40||ar.x<-40||ar.x>CFG.worldW+40)arrows.splice(j,1);
  }
  stepChains(dt);
  /* 빛 구멍: 180~300ms 동안 퍼지고 그대로 남는다 */
  for(var i=lights.length-1;i>=0;i--){
    var l=lights[i];l.t+=dt;var p=Math.min(1,l.t/CFG.light.growSec);
    lighten(l.x,l.y,l.R*(0.35+0.65*smooth(p)),l.str);
    if(p>=1)lights.splice(i,1);
  }
  /* 어둠 확산: 국소 브러시로 조금씩(총 0.35) */
  for(var k=darks.length-1;k>=0;k--){
    var d=darks[k],step=Math.min(dt,CFG.charger.spreadSec-d.t);d.t+=dt;
    if(step>0)darken(d.x,d.y,d.R,CFG.charger.spreadAmt*step/CFG.charger.spreadSec);
    if(d.t>=CFG.charger.spreadSec)darks.splice(k,1);
  }
  statT-=dt;if(statT<=0){statT=0.12;calcRecovery();
    if(recovery>=0.995){endPlay();return}}
  animFx(dt);
  if(gameT>=CFG.gameSec)endPlay();
}
function chargerStep(s,dt){
  var C=CFG.charger;s.ct-=dt;
  if(s.cs==='wait'||s.cs==='rest'){
    if(s.ct<=0){
      /* 충전 시작은 다른 충전 해와 1.5초 이상 엇갈리게 */
      if(clock-lastChargeStart>=C.stagger){s.cs='charge';s.ct=C.charge;s.warned=false;lastChargeStart=clock}
      else s.ct=0.2;
    }
  }else if(s.cs==='charge'){
    if(!s.warned&&s.ct<=0.8){s.warned=true;sWarn()}
    if(s.ct<=0){
      s.cs='rest';s.ct=C.rest;
      darks.push({x:s.x,y:s.y,R:W_(C.spreadR),t:0});
      fx.push({ring:true,x:s.x,y:s.y,size:W_(C.spreadR),t:0,dur:C.spreadSec});
      sSpread();addText(s.x,s.y-s.r-14,'어둠 확산!','#D9B8FF',15);
    }
  }
}
function animSuns(dt,frozen){
  var flip={};
  suns.forEach(function(s){
    s.px=s.x;s.py=s.y;
    s.ph+=dt*2.0;
    if(s.born>0)s.born=Math.max(0,s.born-dt);
    if(s.flinch>0)s.flinch=Math.max(0,s.flinch-dt);
    if(s.flash>0)s.flash=Math.max(0,s.flash-dt);
    if(s.dying){s.dying-=dt;if(s.dying<=0)s.alive=false;return}
    if(frozen){s.y=s.by+Math.sin(s.ph)*s.bob;s.px=s.x;s.py=s.y;return}
    if(s.type==='gold'){
      s.x+=s.vx*dt;s.y=s.by+Math.sin(s.x/60)*16;
      if(s.x>CFG.worldW+s.r*4)s.alive=false;
      return;
    }
    if(s.type==='charger')chargerStep(s,dt);
    var sp=s.type==='charger'&&s.cs==='charge'?0.5:1;
    s.x+=s.vx*dt*sp;
    var m=s.r+8;
    if(s.x<m){s.x=m;if(s.group)flip[s.group]=1;else s.vx=Math.abs(s.vx)}
    if(s.x>CFG.worldW-m){s.x=CFG.worldW-m;if(s.group)flip[s.group]=-1;else s.vx=-Math.abs(s.vx)}
    s.y=s.by+Math.sin(s.ph)*s.bob;
  });
  /* 무리는 함께 방향을 바꾼다 */
  suns.forEach(function(s){if(s.group&&flip[s.group])s.vx=Math.abs(s.vx)*flip[s.group]});
  /* 서로 한 점에 겹치지 않게(같은 무리는 제외) */
  for(var i=0;i<suns.length;i++)for(var k=i+1;k<suns.length;k++){
    var a=suns[i],b=suns[k];
    if(!live(a)||!live(b)||a.type==='gold'||b.type==='gold')continue;
    if(a.group&&a.group===b.group)continue;
    var dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1,min=a.r+b.r+6;
    if(d<min){var push=Math.min(1.5,(min-d)/2),nx=dx/d,ny=dy/d;a.x-=nx*push;b.x+=nx*push;a.by-=ny*push;b.by+=ny*push}
  }
  suns=suns.filter(function(s){return s.alive});
}
function animFx(dt){
  fx.forEach(function(f){f.t+=dt});fx=fx.filter(function(f){return f.t<f.dur+(f.delay||0)});
  lines.forEach(function(l){l.t+=dt});lines=lines.filter(function(l){return l.t<l.dur});
  texts.forEach(function(t){t.t+=dt;t.y-=dt*28});texts=texts.filter(function(t){return t.t<1.0});
}

/* ---------- 그리기 ---------- */
function drawImgCover(im,x,y,w,h){
  var k=Math.max(w/im.width,h/im.height),dw=im.width*k,dh=im.height*k;
  ctx.drawImage(im,x+(w-dw)/2,y,dw,dh);
}
function render(){
  var W=CFG.worldW;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  if(offX>0&&IMG.bg){drawImgCover(IMG.bg,0,0,cssW,cssH);ctx.fillStyle='rgba(15,17,32,.7)';ctx.fillRect(0,0,cssW,cssH)}
  var sx=0,sy=0;
  if(shake>0&&!reduceMotion){sx=(Math.random()-.5)*4;sy=(Math.random()-.5)*4}
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(offX+sx*scale),dpr*sy*scale);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,WH);ctx.clip();
  /* 1. 밝은 제주 배경 */
  if(IMG.bg)drawImgCover(IMG.bg,0,0,W,WH);else{ctx.fillStyle='#4aa3c7';ctx.fillRect(0,0,W,WH)}
  if(state==='loading'||state==='error'){ctx.restore();return}
  /* 2. 어둠 질감 + 회복 마스크 */
  if(veilDirty)rebuildVeil();
  if(veilFade>0)ctx.drawImage(veilCv,0,0,W,mRows*CELL);
  /* 3. 해들 */
  suns.forEach(drawSun);
  /* 4. 연쇄선 · 파동 · 폭발 · 화살 */
  lines.forEach(drawChainLine);
  fx.forEach(drawFx);
  arrows.forEach(drawArrowFlying);
  /* 5. 하단 조작 영역 + 활 */
  if(state==='play'||state==='countdown'||state==='paused'){
    var gy=L.bowY-L.bowH*1.6,gr=ctx.createLinearGradient(0,gy,0,WH);
    gr.addColorStop(0,'rgba(13,22,44,0)');gr.addColorStop(0.45,'rgba(13,22,44,.5)');gr.addColorStop(1,'rgba(13,22,44,.72)');
    ctx.fillStyle=gr;ctx.fillRect(0,gy,W,WH-gy);
    drawBow();
  }
  texts.forEach(function(t){
    ctx.globalAlpha=t.t<0.7?1:1-(t.t-0.7)/0.3;
    ctx.font='800 '+t.z+'px SCDream, "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=Math.max(3,t.z*0.2);ctx.strokeStyle='rgba(13,22,44,.85)';ctx.strokeText(t.s,t.x,t.y);
    ctx.fillStyle=t.c;ctx.fillText(t.s,t.x,t.y);ctx.globalAlpha=1;
  });
  ctx.restore();
}
function drawFx(f){
  var tt=f.t-(f.delay||0);if(tt<0)return;
  var p=tt/f.dur;
  if(f.ring){ /* 어둠 확산: 얇은 보라 파동 */
    ctx.save();ctx.globalAlpha=Math.max(0,1-p)*0.9;ctx.strokeStyle='#A877FF';ctx.lineWidth=3*(1-p)+1;
    ctx.beginPath();ctx.arc(f.x,f.y,f.size*(0.3+0.7*p),0,6.283);ctx.stroke();ctx.restore();return;
  }
  var s,a;
  if(f.img==='wave'){s=0.3+0.7*smooth(p);a=0.6*(1-p)}
  else{s=0.25+0.85*Math.min(1,p/0.6);a=p<0.55?1:1-(p-0.55)/0.45}
  var z=f.size*s;
  ctx.globalAlpha=Math.max(0,a);ctx.drawImage(IMG[f.img],f.x-z/2,f.y-z/2,z,z);ctx.globalAlpha=1;
}
function drawChainLine(l){
  var p=l.t/l.dur,a=1-p;
  var mx=(l.x0+l.x1)/2+(l.y1-l.y0)*0.18,my=(l.y0+l.y1)/2-(l.x1-l.x0)*0.18;
  ctx.save();ctx.lineCap='round';
  ctx.strokeStyle='rgba(255,236,170,'+(0.35*a).toFixed(3)+')';ctx.lineWidth=7;
  ctx.beginPath();ctx.moveTo(l.x0,l.y0);ctx.quadraticCurveTo(mx,my,l.x1,l.y1);ctx.stroke();
  ctx.strokeStyle='rgba(255,252,235,'+a.toFixed(3)+')';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(l.x0,l.y0);ctx.quadraticCurveTo(mx,my,l.x1,l.y1);ctx.stroke();
  ctx.restore();
}
function drawSun(s){
  var im=sunImg(s),z=sunDrawSize(s);
  var k=1+Math.sin(s.ph*1.3)*(s.type==='fake'?0.03:0.015);
  var rot=s.type==='fake'?Math.sin(s.ph*0.9)*0.08:0;
  var a=1,ox=0;
  if(s.born>0){k*=1-s.born/0.25*0.6;a=1-s.born/0.25}
  if(s.dying){var dp=1-s.dying/0.15;k*=1+0.15*dp;a=dp<0.6?1:1-(dp-0.6)/0.4}
  if(s.flinch>0)ox=Math.sin(s.flinch*60)*4*(s.flinch/0.45);
  if(s.type==='charger'&&s.cs==='charge'&&!s.dying){
    var cp=1-s.ct/CFG.charger.charge,fast=s.ct<0.8;
    k*=1+(fast?0.08:0.04)*Math.abs(Math.sin(clock*(fast?16:7)));
    /* 충전 원: 진행률 + 막바지 맥동 */
    ctx.save();ctx.lineCap='round';
    ctx.strokeStyle='rgba(13,22,44,.55)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(s.x,s.y,s.r+9,0,6.283);ctx.stroke();
    ctx.strokeStyle=fast?'#E2C6FF':'#A877FF';ctx.lineWidth=3.5;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r+9,-Math.PI/2,-Math.PI/2+6.283*cp);ctx.stroke();
    if(fast){ctx.globalAlpha=0.5+0.5*Math.sin(clock*16);ctx.font='800 11px SCDream, "Malgun Gothic", sans-serif';
      ctx.textAlign='center';ctx.fillStyle='#E2C6FF';ctx.strokeStyle='rgba(13,22,44,.9)';ctx.lineWidth=3;
      ctx.strokeText('어둠 확산 임박',s.x,s.y-s.r-18);ctx.fillText('어둠 확산 임박',s.x,s.y-s.r-18)}
    ctx.restore();
  }
  ctx.save();ctx.globalAlpha=a;ctx.translate(s.x+ox,s.y);ctx.rotate(rot);ctx.scale(k,k);
  if(s.type==='true'){ctx.shadowColor='rgba(13,22,44,.75)';ctx.shadowBlur=6} /* 밝은 구멍 안에서도 윤곽 */
  if(s.type==='gold')ctx.drawImage(im,-z*CFG.goldBody.cx,-z*CFG.goldBody.cy,z,z);
  else ctx.drawImage(im,-z/2,-z/2,z,z);
  ctx.shadowBlur=0;
  if(s.flash>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*(s.flash/0.15)*0.6;
    if(s.type==='gold')ctx.drawImage(im,-z*CFG.goldBody.cx,-z*CFG.goldBody.cy,z,z);else ctx.drawImage(im,-z/2,-z/2,z,z)}
  ctx.restore();
  if(s.flinch>0){
    ctx.save();ctx.globalAlpha=Math.min(1,s.flinch/0.2);ctx.strokeStyle='#F0605A';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(s.x+ox,s.y,s.r+4,0,6.283);ctx.stroke();ctx.restore();
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
  ctx.save();ctx.rotate(Math.PI);ctx.shadowColor='rgba(8,14,30,.9)';ctx.shadowBlur=6;
  ctx.drawImage(IMG.bow,-L.bowW/2,-L.bowH/2,L.bowW,L.bowH);ctx.shadowBlur=0;ctx.drawImage(IMG.bow,-L.bowW/2,-L.bowH/2,L.bowW,L.bowH);ctx.restore();
  if(fireReady()||aim){
    var pull=t*20;
    if(aim&&aim.armed){
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
  var left=Math.max(0,CFG.gameSec-gameT),pct=Math.floor(recovery*100);
  setTxt(hudTime,'t',left.toFixed(1));hudTime.classList.toggle('low',left<=CFG.lastSec);
  setTxt(hudScore,'s',String(score));setTxt(hudPct,'p',pct+'%');
  var w=pct+'%';if(hudCache.w!==w){hudCache.w=w;hudSky.style.width=w;hudSky.parentNode.classList.toggle('done',pct>=CFG.goalPct)}
  /* 상황 안내 한 줄: 위협 > 기회 > 마지막 > 기본 */
  var msg='어두운 곳의 해를 노려라 · 목표 '+CFG.goalPct+'%',cls='';
  var charging=suns.some(function(s){return live(s)&&s.type==='charger'&&s.cs==='charge'&&s.ct<1.6});
  var gold=suns.some(function(s){return live(s)&&s.type==='gold'});
  if(charging){msg='어둠을 퍼뜨리는 해부터 쏴라!';cls='warn'}
  else if(gold){msg='황금 해가 지나간다! 500점';cls='last'}
  else if(left<=CFG.lastSec){msg='마지막 빛을 되찾아라!';cls='last'}
  else if(pct>=CFG.goalPct)msg='목표 달성! 완전 탈환에 도전';
  setTxt(goalText,'g',msg);
  if(hudCache.cls!==cls){hudCache.cls=cls;goalEl.className='goal'+(cls?' '+cls:'')}
}

/* ---------- 루프 ---------- */
function frame(ts){
  requestAnimationFrame(frame);
  if(state==='result'||state==='intro'||state==='error'||state==='paused'||state==='loading'){
    if(frameDirty){render();frameDirty=false}
    lastTs=0;return;
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
window.__sun={CFG:CFG,L:function(){return L},get state(){return state},get suns(){return suns},get score(){return score},
  get recovery(){return recovery},aim:function(){return aim},
  maskAt:function(x,y){var c=Math.max(0,Math.min(MC-1,Math.floor(x/CELL))),r=Math.max(0,Math.min(mRows-1,Math.floor(y/CELL)));return mask[r*MC+c]},
  stats:function(){return {directHits:directHits,chainKills:chainKills,maxChain:maxChain,chargersStopped:chargersStopped,golds:golds,trueHits:trueHits,shots:shots,gameT:gameT}},
  setTime:function(t){gameT=t}};
})();
