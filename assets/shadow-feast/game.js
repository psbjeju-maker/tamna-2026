/* 도채비 그림자 대소동 (shadow-feast v1)
   - 도채비는 고정, 손전등(빛)을 움직이면 그림자가 빛 반대쪽으로 뻗는다.
   - 그림자로 먹이를 덮으면 흡수, 사람 발에 그림자가 밟히면 목숨 -1. 시간 제한 없음.
   - 부모(앱 index.html)는 iframe 로드 뒤 window.onGameComplete(result) / window.onGameExit() / window.getBest() 를 주입한다.
   - 서버 보상은 부모가 cleared 일 때만 attemptId 당 1회 요청한다.
   - ?debug=1 이면 그림자·발 히트박스를 그린다. */
(function(){
'use strict';

/* ---------------- config (튜닝은 여기서만) ---------------- */
var CFG={
  W:390,H:475,O:{x:195,y:275},
  lamp:{x0:25,x1:365,y0:310,y1:451,start:{x:195,y:390}},
  shadow:{k:12000,sub:13,minLen:48,maxLen:243,xMin:27,xMax:363,yMin:34,circles:33,baseR:9},
  lives:3,
  absorbRate:1/0.42,      // 약 0.42초 연속으로 덮으면 흡수
  absorbDecay:3,          // 이탈 시 초당 감소
  foodsKept:3,foodGap:45,
  foodArea:{x0:32,x1:358,y0:65,y1:219},
  firstFoods:[{x:195,y:123,kind:0},{x:99,y:181,kind:1},{x:289,y:175,kind:2}],
  hazardFrom:3,           // 이만큼 먹은 뒤부터 발 등장
  stageEvery:6,           // 단계 = 1 + floor(먹은수/6)
  warn:1.3,               // 발 예고 시간
  invuln:2.3,
  laneY0:85,laneY1:180,
  speed:function(st){return Math.min(95,32+st*7)},
  interval:function(st){return Math.max(2.6,4.4-st*0.3)},
  maxBundles:2,
  foot:{len:31,halfSeg:10,r:5.5,side:7,stride:22},
  comboWindow:2.2,
  clearScore:8,           // 보상 1단계와 같음
  tiers:[8,15,25],        // 보상 단계: 8개 1 · 15개 2 · 25개 3 (진화 문어발·도깨비불·대왕과 같은 지점)
  // 중후반 요소
  moveFrom:6,             // 이만큼 먹은 뒤부터 움직이는 먹이(굴러가는 귤·기어가는 문어)
  rollSpd:function(st){return Math.min(50,26+st*3)},crawlSpd:function(st){return Math.min(30,14+st*2)},
  kindOf:{kid:{from:3,p:0.25,sc:0.72,spd:1.45,label:'아이 발'},line:{from:4,p:0.2,sc:1,spd:0.75,label:'행렬'},run:{from:5,p:0.17,sc:1,spd:2.1,max:175,label:'달리기'}},
  gold:{first:10,every:[8,11],life:7,value:3,absorb:0.9}, // 황금 귤은 발이 걷기 시작할 때 나타나고 0.9초 덮어야 함           // 미션 성공 = 문어발 진화(8개)까지
  forms:[{at:0,name:'꼬마 그림자'},{at:3,name:'돌모자 그림자'},{at:8,name:'문어발 그림자'},{at:15,name:'도깨비불 그림자'},{at:25,name:'그림자 대왕'}]
};
var W=CFG.W,H=CFG.H,O=CFG.O,TAU=Math.PI*2;
var DEBUG=/[?&]debug=1/.test(location.search);

var IMG={ // 빌드 단계에서 투명여백을 잘라낸 사본. b = alpha>20 내용 영역
  bg:{src:'img/background-jeju-alley.jpg'},
  dok:{src:'img/dochaebi-idle.png',b:[4,4,139,296]},
  face:{src:'img/shadow-face.png',b:[4,4,216,207]},
  f0:{src:'img/food-tangerine.png',b:[3,3,197,171]},
  f1:{src:'img/food-hareubang.png',b:[2,2,108,198]},
  f2:{src:'img/food-octopus.png',b:[3,3,217,178]},
  foot:{src:'img/hazard-footprint.png',b:[2,2,64,158]},
  fx:{src:'img/fx-devour-burst.png',b:[3,3,217,206]}
};
var FOOD_SIZE=[[36,33],[30,46],[44,40]];
var FOOD_NAME=['귤','돌하르방','문어'];

/* ---------------- dom ---------------- */
var $=function(id){return document.getElementById(id)};
var cv=$('cv'),c=cv.getContext('2d'),board=$('board'),wrap=$('boardWrap'),pad=$('pad'),
    toastEl=$('toast'),overlay=$('overlay'),panel=$('panel'),mainBtn=$('mainBtn'),muteBtn=$('mute');
var clamp=function(v,a,b){return v<a?a:v>b?b:v};
var lerp=function(a,b,t){return a+(b-a)*t};

/* ---------------- state ---------------- */
var state='loading'; // loading → ready → playing ↔ paused → gameover
var lamp={x:0,y:0},SH=null,score=0,lives=3,stage=1,t=0,inv=0,hazardClock=0,foods=[],dying=[],hazards=[],
    fx=[],parts=[],floaters=[],combo=0,bestCombo=0,lastEat=-99,facePulse=0,faceSquash=0,shake=0,
    attemptId=null,cleared=false,gold=null,goldNext=0,goldPending=false,seen={},formIdx=0,hazardSeq=0,nearCount=0,toastUntil=0,toastPrio=0,safeSpots=[];

/* ---------------- geometry (그리기·판정 공용) ---------------- */
function shadowOf(L){
  var S=CFG.shadow,dx=O.x-L.x,dy=O.y-L.y,d=Math.max(1,Math.hypot(dx,dy)),ux=dx/d,uy=dy/d;
  var len=clamp(S.k/d-S.sub,S.minLen,S.maxLen);
  if(ux>0)len=Math.min(len,(S.xMax-O.x)/ux);
  if(ux<0)len=Math.min(len,(S.xMin-O.x)/ux);
  if(uy<0)len=Math.min(len,(S.yMin-O.y)/uy);
  var er=clamp(13+len*0.09,20,35),n=S.circles-1,circ=[];
  for(var i=0;i<=n;i++){var p=i/n;circ.push({x:O.x+ux*len*p,y:O.y+uy*len*p,r:S.baseR+(er-S.baseR)*p})}
  return {x:O.x+ux*len,y:O.y+uy*len,len:len,ux:ux,uy:uy,r:er,circ:circ};
}
function covers(sh,x,y){for(var i=0;i<sh.circ.length;i++){var p=sh.circ[i];if(Math.hypot(x-p.x,y-p.y)<p.r)return p}return null}
/* 원 중심 → 선분(가로 캡슐) 최소 거리 - 반지름 합. 0 미만이면 겹침 */
function capsuleGap(sh,fx0,fy,half,fr){
  var best=1e9;
  for(var i=0;i<sh.circ.length;i++){var p=sh.circ[i];var qx=clamp(p.x,fx0-half,fx0+half);var g=Math.hypot(p.x-qx,p.y-fy)-p.r-fr;if(g<best)best=g}
  return best;
}
/* 먹이 (x,y)를 그림자 끝으로 덮는 손전등 위치를 역산하고, 같은 도형으로 실제로 덮이는지 확인 */
function lampFor(x,y){
  var vx=x-O.x,vy=y-O.y,d=Math.hypot(vx,vy);if(d<1)return null;
  var ld=CFG.shadow.k/(d+CFG.shadow.sub),L={x:O.x-vx/d*ld,y:O.y-vy/d*ld},LC=CFG.lamp;
  if(L.x<LC.x0||L.x>LC.x1||L.y<LC.y0||L.y>LC.y1)return null;
  return covers(shadowOf(L),x,y)?L:null;
}
/* 손전등 허용 영역 전체를 샘플링해서 덮을 수 있는 먹이 좌표 목록을 미리 만든다(생성 실패 시 안전 좌표) */
function buildSafeSpots(){
  var LC=CFG.lamp,A=CFG.foodArea,hits={};
  for(var lx=LC.x0;lx<=LC.x1;lx+=10)for(var ly=LC.y0;ly<=LC.y1;ly+=10){
    var sh=shadowOf({x:lx,y:ly});
    var gx=Math.round(sh.x/15)*15,gy=Math.round(sh.y/15)*15;
    if(gx>=A.x0&&gx<=A.x1&&gy>=A.y0&&gy<=A.y1&&covers(sh,gx,gy))hits[gx+','+gy]={x:gx,y:gy};
  }
  safeSpots=Object.keys(hits).map(function(k){return hits[k]});
}

/* ---------------- assets ---------------- */
var loaded=0,total=0,loadFail=false;
function loadAssets(done){
  var keys=Object.keys(IMG);total=keys.length;loaded=0;loadFail=false;
  keys.forEach(function(k){
    var im=new Image();
    im.onload=function(){IMG[k].im=im;if(!IMG[k].b)IMG[k].b=[0,0,im.naturalWidth,im.naturalHeight];if(++loaded===total)done(true)};
    im.onerror=function(){if(!loadFail){loadFail=true;done(false)}};
    im.src=IMG[k].src;
  });
}
function sprite(k,x,y,w,h,alpha,rot,sx,sy){
  var a=IMG[k];if(!a||!a.im)return;
  var b=a.b,bw=b[2]-b[0],bh=b[3]-b[1],fit=Math.min(w/bw,h/bh),dw=bw*fit,dh=bh*fit;
  c.save();c.translate(x,y);if(rot)c.rotate(rot);if(sx||sy)c.scale(sx||1,sy||1);
  if(alpha!=null)c.globalAlpha*=alpha;
  c.drawImage(a.im,b[0],b[1],bw,bh,-dw/2,-dh/2,dw,dh);c.restore();
}

/* ---------------- audio (첫 조작 뒤 합성음) ---------------- */
var AC=null,master=null,muted=false;
try{muted=localStorage.getItem('shadowFeastMute')==='1'}catch(e){}
function audioInit(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=muted?0:0.45;master.connect(AC.destination)}catch(e){AC=null}
}
function tone(f,dur,type,vol,f2,delay){
  if(!AC||muted)return;
  var t0=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(f,t0);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t0+dur);
  g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(vol||0.3,t0+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g);g.connect(master);o.start(t0);o.stop(t0+dur+0.02);
}
var SND={
  gulp:function(n){var b=330*Math.pow(1.06,Math.min(n,12));tone(b,0.12,'sine',0.35,b*2.2);tone(b*1.5,0.08,'triangle',0.15,null,0.06)},
  warn:function(){tone(880,0.07,'square',0.08);tone(880,0.07,'square',0.08,null,0.14)},
  hit:function(){tone(140,0.28,'sawtooth',0.3,60);tone(90,0.2,'square',0.15,null,0.03)},
  near:function(){tone(600,0.14,'triangle',0.16,1400)},
  evolve:function(){[523,659,784,1047].forEach(function(f,i){tone(f,0.16,'triangle',0.22,null,i*0.07)})},
  stage:function(){tone(392,0.12,'triangle',0.2,null,0);tone(587,0.18,'triangle',0.2,null,0.09)},
  over:function(){[392,330,262].forEach(function(f,i){tone(f,0.22,'triangle',0.2,null,i*0.15)})}
};
function paintMute(){muteBtn.classList.toggle('off',muted);muteBtn.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');
  $('muteIcon').setAttribute('d',muted?'M4 9v6h4l5 4V5L8 9H4zm12.3 3l2.6-2.6-1.1-1.1-2.6 2.6-2.6-2.6-1.1 1.1 2.6 2.6-2.6 2.6 1.1 1.1 2.6-2.6 2.6 2.6 1.1-1.1z':'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z')}
muteBtn.onclick=function(){muted=!muted;try{localStorage.setItem('shadowFeastMute',muted?'1':'0')}catch(e){}audioInit();if(master)master.gain.value=muted?0:0.45;paintMute()};
function buzz(ms){try{var ua=navigator.userActivation;if(navigator.vibrate&&(!ua||ua.hasBeenActive))navigator.vibrate(ms)}catch(e){}}

function tierOf(n){var k=0;for(var i=0;i<CFG.tiers.length;i++)if(n>=CFG.tiers[i])k=i+1;return k}
function coinLbl(){try{if(typeof window.coinName==='function')return window.coinName()}catch(e){}return 'MH머니'}
function tierLine(){return CFG.tiers.map(function(v,i){return v+'개 '+(i+1)+'개'}).join(' · ')}

/* ---------------- HUD / toast ---------------- */
var HEART='<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
function formOf(n){var k=0;for(var i=0;i<CFG.forms.length;i++)if(n>=CFG.forms[i].at)k=i;return k}
function hud(){
  $('hudScore').textContent=score;
  var h='';for(var i=0;i<CFG.lives;i++)h+=HEART.replace('<svg','<svg class="'+(i<lives?'':'lost')+'"');
  $('hudLife').innerHTML=h;$('hudLife').setAttribute('aria-label','목숨 '+lives+'개');
  $('hudStage').textContent='골목 · '+stage+'단계';
  $('form').textContent=CFG.forms[formOf(score)].name+' · 시간 제한 없음';
}
function popEl(id,cls){var e=$(id);e.classList.remove(cls);void e.offsetWidth;e.classList.add(cls)}
function tell(msg,sec,kind,prio){
  prio=prio||0;if(t<toastUntil&&prio<toastPrio)return;
  toastEl.textContent=msg;toastEl.className='toast'+(kind?' '+kind:'');toastUntil=t+(sec||2.5);toastPrio=prio;
}
function idleHint(){
  if(t<toastUntil)return;toastPrio=0;toastEl.className='toast';
  var hz=hazards.some(function(h){return h.age>=0});
  toastEl.textContent=hz?'발이 오면 손전등을 아래로 빼서 그림자를 접어요!':
    score<1?'손전등을 위로 밀면 그림자가 길어져요.':
    score<CFG.hazardFrom?'손전등 반대쪽으로 그림자가 뻗어요.':'먹이를 덮어 꿀꺽, 분홍 발은 피하기!';
}

/* ---------------- spawn director ---------------- */
var seed=(Date.now()>>>0)||7;
function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function okSpot(x,y){
  var A=CFG.foodArea;if(x<A.x0||x>A.x1||y<A.y0||y>A.y1)return false;
  for(var i=0;i<foods.length;i++)if(Math.hypot(foods[i].x-x,foods[i].y-y)<CFG.foodGap)return false;
  if(SH&&covers(SH,x,y))return false; // 지금 그림자 밑에 바로 생기면 공짜라 제외
  return !!lampFor(x,y);
}
function addFood(){
  var x,y,ok=false;
  for(var i=0;i<80&&!ok;i++){
    var a=-Math.PI/2+(rnd()-0.5)*1.9,d=85+rnd()*143;x=O.x+Math.cos(a)*d;y=O.y+Math.sin(a)*d;ok=okSpot(x,y);
  }
  if(!ok){ // 사전 검증된 안전 좌표
    var cand=safeSpots.filter(function(s){return okSpot(s.x,s.y)});
    if(!cand.length)cand=safeSpots.filter(function(s){return foods.every(function(f){return Math.hypot(f.x-s.x,f.y-s.y)>=CFG.foodGap})});
    var s=cand[Math.floor(rnd()*cand.length)]||{x:195,y:123};x=s.x;y=s.y;
  }
  var kind=Math.floor(rnd()*3),f={x:x,y:y,kind:kind,charge:0,born:t,bob:rnd()*TAU,mv:false,vx:0,vy:0,roll:0,turn:0};
  if(score>=CFG.moveFrom&&kind!==1&&rnd()<(stage>=4?0.8:0.5)){
    f.mv=true;var a;
    if(kind===0){a=(rnd()<0.5?0:Math.PI)+(rnd()-0.5)*0.7;f.spd=CFG.rollSpd(stage)} // 귤: 데굴데굴 (주로 옆으로)
    else{a=rnd()*TAU;f.spd=CFG.crawlSpd(stage)}                                     // 문어: 슬금슬금 방향을 바꾸며
    f.vx=Math.cos(a)*f.spd;f.vy=Math.sin(a)*f.spd;f.turn=1+rnd();
    if(!seen.move){seen.move=1;tell(kind===0?'귤이 굴러가요! 그림자로 따라가며 덮어요.':'문어가 기어가요! 그림자로 따라가요.',3,'good',1)}
  }
  foods.push(f);
}
function laneNearFood(){
  var f=foods[Math.floor(rnd()*foods.length)];
  return clamp((f?f.y:132)+(rnd()-0.5)*20,CFG.laneY0,CFG.laneY1);
}
function laneRandom(){return CFG.laneY0+rnd()*(CFG.laneY1-CFG.laneY0)}
function makeHazard(y,dir,delay,stopAt,type){
  type=type||'walk';var K=CFG.kindOf[type],sp=CFG.speed(stage),members=[0];
  if(K){sp*=K.spd;if(K.max)sp=Math.min(K.max,sp)}
  if(type==='line'){ // 행렬: 여러 사람이 줄지어, 중간에 빈틈 하나
    members=[];var gapAt=1+Math.floor(rnd()*3),o=0;
    for(var i=0;i<6;i++){members.push(o);o+=(i===gapAt)?118:40}
  }
  hazards.push({id:++hazardSeq,y:y,dir:dir,x:dir===1?-30:W+30,age:-(delay||0),speed:sp,type:type,sc:K?K.sc:1,members:members,
    hit:false,near:false,warned:false,dist:0,stopAt:stopAt||null,stopT:0,big:type==='line'});
}
function pickType(){
  var r=rnd(),acc=0,ks=['line','run','kid'];
  for(var i=0;i<ks.length;i++){var K=CFG.kindOf[ks[i]];if(stage<K.from)continue;acc+=K.p;if(r<acc)return ks[i]}
  return 'walk';
}
function spawnPattern(){
  var free=CFG.maxBundles-hazards.length-(hazards.some(function(h){return h.big})?1:0);if(free<=0)return false; // 행렬은 두 묶음으로 친다
  var dir=rnd()<0.5?1:-1,r=rnd();
  if(stage>=3&&free>=2&&r<0.3){ // 두 묶음: 다른 길, 시간차
    var y1=laneRandom(),y2=y1,tries=0;while(Math.abs(y2-y1)<45&&tries++<20)y2=laneRandom();
    if(Math.abs(y2-y1)<45)y2=y1<132?y1+50:y1-50;
    makeHazard(y1,dir,0);makeHazard(clamp(y2,CFG.laneY0,CFG.laneY1),rnd()<0.5?dir:-dir,0.55+rnd()*0.4);
    return true;
  }
  var type=pickType();
  if(type==='line'){if(hazards.length)type='walk';else{makeHazard(clamp(laneNearFood(),100,165),dir,0,null,'line');return true}}
  var y=(stage>=2&&rnd()<0.55)?laneNearFood():laneRandom();
  var stop=(type==='walk'&&stage>=5&&rnd()<0.25)?110+rnd()*170:null; // 멈칫 발: 중간에 잠깐 멈췄다 다시 걷는다
  makeHazard(y,dir,0,stop,type);
  return true;
}

function spawnGold(){ // 황금 귤: 발이 지나갈 길 위에만 나온다
  for(var i=0;i<60;i++){
    var y=95+rnd()*75,x=60+rnd()*270;
    if(!okSpot(x,y))continue;
    var dir=x<195?1:-1; // 발이 들어오는 쪽 가까이에 놓아서 발과 마주치게
    makeHazard(y,dir,0.3,null,'walk');
    gold={x:x,y:y,charge:0,life:CFG.gold.life,born:-1,hz:hazards[hazards.length-1],shown:false};goldPending=false;
    return;
  }
}

/* ---------------- lifecycle ---------------- */
function reset(){
  score=0;lives=CFG.lives;stage=1;t=0;inv=0;hazardClock=0;combo=0;bestCombo=0;lastEat=-99;facePulse=0;faceSquash=0;shake=0;
  foods=CFG.firstFoods.map(function(f){return {x:f.x,y:f.y,kind:f.kind,charge:0,born:-1,bob:rnd()*TAU}});
  dying=[];hazards=[];fx=[];parts=[];floaters=[];cleared=false;formIdx=0;nearCount=0;toastUntil=0;toastPrio=0;gold=null;goldNext=CFG.gold.first;goldPending=false;seen={};
  lamp.x=CFG.lamp.start.x;lamp.y=CFG.lamp.start.y;SH=shadowOf(lamp);endDrag();hud();
}
function setMain(label,cls,disabled){mainBtn.textContent=label;mainBtn.className='btn btn--primary btn--bar'+(cls?' '+cls:'');mainBtn.disabled=!!disabled}
function showPanel(html){panel.innerHTML=html;overlay.hidden=false}
function hidePanel(){overlay.hidden=true}
function getBest(){
  try{if(typeof window.getBest==='function'&&window.getBest!==getBest){var p=window.getBest()||{};return {score:+p.score||0}}}catch(e){}
  try{return {score:+(localStorage.getItem('shadowFeastBest')||0)}}catch(e){return {score:0}}
}
function showIntro(){
  state='ready';reset();
  var b=getBest();
  showPanel('<p class="panel__kicker">TAMNA · SHADOW FEAST</p><h1>도채비 그림자 대소동</h1>'+
    '<p class="panel__line">빛을 움직여 그림자로 꿀꺽!</p>'+
    '<div class="pair">'+
      '<figure><div class="lampdot"></div><figcaption class="is-lamp">손전등</figcaption><small>위로 밀면 길게<br>아래로 빼면 짧게</small></figure>'+
      '<figure><img src="'+IMG.f0.src+'" alt=""><figcaption class="is-food">먹이</figcaption><small>그림자로 덮고<br>잠깐 버티기</small></figure>'+
      '<figure><img src="'+IMG.foot.src+'" alt=""><figcaption class="is-foot">사람 발</figcaption><small>그림자가 밟히면<br>목숨 하나</small></figure>'+
    '</div>'+
    '<p class="panel__line panel__line--goal">시간 제한 없음 · 많이 먹을수록 '+coinLbl()+' 더</p>'+
    '<p class="panel__line panel__line--muted">'+tierLine()+'</p>'+
    (b.score?'<p class="panel__line panel__line--muted">내 최고 '+b.score+'개</p>':'')+
    '<button class="btn btn--primary" id="bStart" type="button">플레이 시작</button>');
  $('bStart').onclick=startPlay;
  setMain('플레이 시작','',false);
  tell('손전등을 위로 밀면 그림자가 길어져요.',99);
}
function startPlay(){
  audioInit();reset();hidePanel();
  attemptId='shadow-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  state='playing';last=0;setMain('잠깐 멈춤','is-pause');
  tell('손전등을 위로! 첫 귤을 그림자로 덮어 보세요.',4,'good');
  try{pad.focus({preventScroll:true})}catch(e){}
}
function pause(why){
  if(state!=='playing')return;
  state='paused';endDrag();setMain('계속하기','',false);
  showPanel('<h1>잠깐 멈췄어요</h1><p class="panel__line panel__line--muted">'+(why||'발도 먹이도 같이 멈춰 있어요.')+'</p>'+
    '<button class="btn btn--primary" id="bResume" type="button">계속하기</button>'+
    '<button class="btn btn--ghost" id="bQuit" type="button">그만하고 결과 보기</button>');
  $('bResume').onclick=resume;$('bQuit').onclick=function(){gameOver(true)};
}
function resume(){if(state!=='paused')return;audioInit();hidePanel();state='playing';last=0;setMain('잠깐 멈춤','is-pause')}
mainBtn.onclick=function(){
  if(state==='ready')startPlay();
  else if(state==='playing')pause();
  else if(state==='paused')resume();
  else if(state==='gameover')startPlay();
};
document.addEventListener('visibilitychange',function(){if(document.hidden)pause('앱을 잠깐 떠나서 멈췄어요.')});
window.addEventListener('blur',function(){pause('앱을 잠깐 떠나서 멈췄어요.')});
window.addEventListener('pagehide',function(){pause()});

function gameOver(quit){
  if(state==='gameover')return;
  state='gameover';endDrag();SND.over();
  var b=getBest(),isBest=score>b.score;
  if(isBest){try{localStorage.setItem('shadowFeastBest',String(score))}catch(e){}}
  cleared=score>=CFG.clearScore;
  var fi=formOf(score),tier=tierOf(score),nxt=CFG.tiers[tier];
  showPanel('<p class="panel__kicker">'+(quit?'그만하기':'그림자가 지쳤어요')+'</p>'+
    '<span class="badge '+(tier?'badge--ok':'badge--no')+'">'+(tier?coinLbl()+' '+tier+'개':CFG.tiers[0]+'개부터 '+coinLbl())+'</span>'+
    '<canvas class="formimg" id="formCv" width="240" height="240"></canvas>'+
    '<div class="big">'+score+'<small style="font-size:18px">개</small></div>'+
    '<p class="panel__line">'+CFG.forms[fi].name+(isBest&&score>0?' · 최고 기록!':'')+'</p>'+
    '<div class="stats"><div><small>단계</small><strong>'+stage+'</strong></div><div><small>최대 연속</small><strong>'+bestCombo+'</strong></div><div><small>아슬아슬</small><strong>'+nearCount+'</strong></div></div>'+
    '<p class="panel__line panel__line--muted">'+(nxt?(nxt-score)+'개 더 먹으면 '+coinLbl()+' '+(tier+1)+'개':'최고 보상 달성!')+(b.score&&!isBest?' · 내 최고 '+b.score+'개':'')+'</p>'+
    '<div class="row"><button class="btn btn--ghost" id="bBack" type="button">놀이터로</button>'+
    '<button class="btn btn--primary" id="bAgain" type="button">다시 도전</button></div>');
  drawFormPreview($('formCv'),score);
  $('bAgain').onclick=startPlay;
  $('bBack').onclick=function(){if(typeof window.onGameExit==='function')window.onGameExit();else showIntro()};
  setMain('다시 도전','',false);
  var result={gameId:'shadow-feast',version:1,attemptId:attemptId,score:score,stage:stage,bestCombo:bestCombo,
    form:CFG.forms[fi].name,cleared:cleared,tier:tier,isBestScore:isBest};
  try{if(typeof window.onGameComplete==='function')window.onGameComplete(result)}catch(e){}
}

/* ---------------- input ---------------- */
var activeId=null,grabOff={x:0,y:0};
function toLogical(e){var r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}}
function canSteer(){return state==='ready'||state==='playing'}
function moveLamp(x,y){var L=CFG.lamp;lamp.x=clamp(x,L.x0,L.x1);lamp.y=clamp(y,L.y0,L.y1)}
function endDrag(){if(activeId!=null){try{pad.releasePointerCapture(activeId)}catch(e){}}activeId=null}
pad.addEventListener('pointerdown',function(e){
  if(activeId!=null||!canSteer())return; // 손가락 하나만
  e.preventDefault();audioInit();
  activeId=e.pointerId;try{pad.setPointerCapture(e.pointerId)}catch(err){}
  var p=toLogical(e);
  if(Math.hypot(p.x-lamp.x,p.y-lamp.y)<60){grabOff.x=lamp.x-p.x;grabOff.y=lamp.y-p.y} // 손전등 근처를 잡으면 상대 이동
  else{grabOff.x=0;grabOff.y=0;moveLamp(p.x,p.y)}
});
pad.addEventListener('pointermove',function(e){
  if(e.pointerId!==activeId||!canSteer())return;
  var p=toLogical(e);moveLamp(p.x+grabOff.x,p.y+grabOff.y);
});
['pointerup','pointercancel','lostpointercapture'].forEach(function(n){pad.addEventListener(n,function(e){if(e.pointerId===activeId)activeId=null})});
window.addEventListener('keydown',function(e){
  var mv={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];
  if(mv&&canSteer()){e.preventDefault();moveLamp(lamp.x+mv[0],lamp.y+mv[1]);return}
  if((e.key==='p'||e.key==='P'||e.key==='Escape')&&state==='playing'){e.preventDefault();pause()}
});

/* ---------------- effects ---------------- */
function addParts(x,y,col,n,spd){for(var i=0;i<n&&parts.length<90;i++){var a=rnd()*TAU,s=(0.4+rnd()*0.6)*(spd||90);parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,age:0,life:0.45+rnd()*0.25,col:col,r:1.6+rnd()*2})}}
function floatText(x,y,s,col,size){floaters.push({x:x,y:y,s:s,col:col,size:size||16,age:0})}

/* ---------------- update ---------------- */
function eat(f,touch,val){
  var prev=score;val=val||1;
  dying.push({x:f.x,y:f.y,tx:touch.x,ty:touch.y,kind:f.kind,age:0});
  score+=val;combo=(t-lastEat<CFG.comboWindow)?combo+1:1;lastEat=t;if(combo>bestCombo)bestCombo=combo;
  facePulse=1;SND.gulp(combo);buzz(15);
  hud();popEl('hudScore','pop');
  floatText(f.x,f.y-14,val>1?'황금 꿀꺽! +'+val:combo>=2?combo+'연속 꿀꺽!':'꿀꺽!',combo>=3||val>1?'#edd79d':'#93f8d5',combo>=3||val>1?18:16);
  if(val>1){addParts(f.x,f.y,'#edd79d',16,130);buzz(40)}
  var fi=formOf(score);
  if(fi>formIdx){formIdx=fi;SND.evolve();fx.push({type:'ring',x:SH.x,y:SH.y,age:0});
    tell(CFG.forms[fi].name+'(으)로 진화!'+(prev<CFG.hazardFrom&&score>=CFG.hazardFrom?' 이제 사람 발을 조심해요.':''),3,'gold',2)}
  else if(prev<CFG.hazardFrom&&score>=CFG.hazardFrom)tell('이제 사람 발이 지나가요. 예고선을 보세요!',3,'',2);
  if(score>=CFG.clearScore&&!cleared){cleared=true}
  var tr=tierOf(score);
  if(tr>tierOf(prev)){var nx=CFG.tiers[tr];tell(coinLbl()+' '+tr+'개 확보!'+(nx?' '+nx+'개 먹으면 '+(tr+1)+'개':' 최고 보상이에요.'),3.5,'good',3)}
  var next=1+Math.floor(score/CFG.stageEvery);
  if(next>stage){stage=next;hud();SND.stage();tell(stage+'단계! 발걸음이 더 바빠져요.',2.5,'',1)}
  if(prev<CFG.hazardFrom&&score>=CFG.hazardFrom)hazardClock=CFG.interval(stage)-1.2; // 첫 발은 1.2초 뒤 예고 시작
  if(score>=goldNext&&!gold&&!goldPending){goldPending=true;goldNext=score+CFG.gold.every[0]+Math.floor(rnd()*(CFG.gold.every[1]-CFG.gold.every[0]+1))}
  if(val===1)addFood();
}
function footsOf(h){ // 사람마다 두 발의 중심 좌표 (번갈아 앞으로). 행렬은 여러 사람
  var out=[],sc=h.sc||1,st=CFG.foot.stride*sc,s=CFG.foot.side*sc,mem=h.members||[0];
  for(var m=0;m<mem.length;m++){
    var bx=h.x-h.dir*mem[m],ph=((h.dist+m*st*0.7)/st)%2,tri=ph<1?ph:2-ph,off=(tri-0.5)*16*sc*h.dir;
    out.push({x:bx+off,y:h.y-s,lift:ph<1},{x:bx-off,y:h.y+s,lift:ph>=1});
  }
  return out;
}
function tailOff(h){var mem=h.members||[0];return mem[mem.length-1]}
function movable(x,y){var A=CFG.foodArea;return x>=A.x0&&x<=A.x1&&y>=A.y0&&y<=A.y1&&!!lampFor(x,y)}
function update(dt){
  t+=dt;inv=Math.max(0,inv-dt);facePulse=Math.max(0,facePulse-dt/0.16);faceSquash=Math.max(0,faceSquash-dt/0.25);shake=Math.max(0,shake-dt);
  SH=shadowOf(lamp);
  // 먹이
  for(var i=foods.length-1;i>=0;i--){
    var f=foods[i];
    if(f.mv){ // 덮이는 동안은 절반 속도
      var slow=f.charge>0?0.5:1,nx=f.x+f.vx*dt*slow,ny=f.y+f.vy*dt*slow;
      if(f.kind===2){f.turn-=dt;if(f.turn<=0){f.turn=0.8+rnd()*1.2;var a=rnd()*TAU;f.vx=Math.cos(a)*f.spd;f.vy=Math.sin(a)*f.spd}}
      if(movable(nx,ny)){f.roll+=(nx-f.x)/14;f.x=nx;f.y=ny}
      else if(movable(f.x-f.vx*dt,f.y)){f.vx=-f.vx}else{f.vx=-f.vx;f.vy=-f.vy}
    }
    var p=covers(SH,f.x,f.y);
    f.charge=clamp(f.charge+(p?dt*CFG.absorbRate:-dt*CFG.absorbDecay),0,1);
    if(f.charge>=1){foods.splice(i,1);eat(f,p,1)}
  }
  if(goldPending&&!gold&&hazards.length<=1&&!hazards.some(function(h){return h.big}))spawnGold();
  if(gold&&!gold.shown){ // 발이 걷기 시작하면 등장
    if(gold.hz.age>=CFG.warn||hazards.indexOf(gold.hz)<0){gold.shown=true;gold.born=t;SND.evolve();tell('황금 귤! 발이 지나가는 길 위예요. 먹으면 3개!',3,'gold',2)}
  }
  if(gold&&gold.shown){
    gold.life-=dt;var gp=covers(SH,gold.x,gold.y);
    gold.charge=clamp(gold.charge+(gp?dt/CFG.gold.absorb:-dt*CFG.absorbDecay),0,1);
    if(gold.charge>=1){var g0=gold;gold=null;eat({x:g0.x,y:g0.y,kind:0},gp,CFG.gold.value)}
    else if(gold.life<=0){addParts(gold.x,gold.y,'#edd79d',8,50);floatText(gold.x,gold.y-14,'놓쳤다','#c9b98a',14);gold=null}
  }
  if(t-lastEat>CFG.comboWindow)combo=0;
  // 발
  if(score>=CFG.hazardFrom){hazardClock+=dt;if(hazardClock>=CFG.interval(stage)&&spawnPattern())hazardClock=0}
  for(var j=hazards.length-1;j>=0;j--){
    var h=hazards[j];h.age+=dt;
    if(h.age<0)continue;
    if(!h.warned){h.warned=true;SND.warn();
      if(h.type!=='walk'&&!seen[h.type]){seen[h.type]=1;tell({kid:'작은 아이 발! 빠르게 지나가요.',line:'행렬이 와요! 빈틈에 맞춰 지나가거나 접고 기다려요.',run:'달리는 발! 아주 빨라요.'}[h.type],3,'danger',3)}}
    if(h.age<CFG.warn)continue;
    if(h.stopAt!=null&&h.stopT<0.7&&((h.dir===1&&h.x>=h.stopAt)||(h.dir===-1&&h.x<=W-h.stopAt))){h.stopT+=dt}
    else{var mv=h.speed*dt;h.x+=h.dir*mv;h.dist+=mv}
    var ft=footsOf(h),gap=1e9;
    for(var k=0;k<ft.length;k++)gap=Math.min(gap,capsuleGap(SH,ft[k].x,ft[k].y,CFG.foot.halfSeg*h.sc,CFG.foot.r*h.sc));
    if(gap<0&&inv===0&&!h.hit){
      h.hit=true;lives--;inv=CFG.invuln;faceSquash=1;shake=0.25;combo=0;
      SND.hit();buzz([60,40,60]);addParts(SH.x,SH.y,'#ff9cac',14,120);floatText(SH.x,SH.y-20,'앗, 밟혔다!','#ff9cac',17);
      hud();popEl('hudLife','hurt');
      if(lives<=0){gameOver(false);return}
      tell('밟혔어요! 손전등을 아래로 빼면 그림자가 접혀요.',3,'danger',3);
    }else if(gap>=0&&gap<9&&!h.near&&!h.hit&&inv===0){
      h.near=true;nearCount++;SND.near();floatText(ft[0].x,h.y-18,'아슬아슬!','#edd79d',15);
    }
    var tail=h.x-h.dir*tailOff(h);if((h.dir===1&&tail>W+60)||(h.dir===-1&&tail<-60))hazards.splice(j,1);
  }
  for(var d=dying.length-1;d>=0;d--){var o=dying[d];o.age+=dt;if(o.age>=0.18){dying.splice(d,1);fx.push({type:'burst',x:o.tx,y:o.ty,age:0});addParts(o.tx,o.ty,'#93f8d5',8,80)}}
  stepFx(dt);
  idleHint();
}
function stepFx(dt){
  for(var i=fx.length-1;i>=0;i--){fx[i].age+=dt;if(fx[i].age>0.5)fx.splice(i,1)}
  for(var j=parts.length-1;j>=0;j--){var p=parts[j];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.92;p.vy*=0.92;if(p.age>p.life)parts.splice(j,1)}
  for(var k=floaters.length-1;k>=0;k--){floaters[k].age+=dt;if(floaters[k].age>0.85)floaters.splice(k,1)}
}

/* ---------------- render ---------------- */
var TINT=['rgba(17,31,44,.22)','rgba(14,40,46,.24)','rgba(30,26,52,.24)','rgba(44,30,30,.22)','rgba(12,22,48,.26)'];
function ell(x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill()}
function txt(s,x,y,size,col,w){c.font=(w||700)+' '+size+'px SCDream,-apple-system,"Malgun Gothic",sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.lineWidth=3;c.strokeStyle='rgba(8,18,26,.75)';c.strokeText(s,x,y);c.fillStyle=col;c.fillText(s,x,y)}
function drawFace(x,y,r,n,tt,squash,pulse,charging){
  var s=r/22,sc=1+0.08*Math.sin(Math.min(1,pulse)*Math.PI)+(charging?0.03*Math.sin(tt*30):0);
  var sx=sc*(1+0.3*squash),sy=sc*(1-0.38*squash);
  c.save();c.translate(x,y);c.scale(sx,sy);
  if(n>=8){ // 문어발: 얼굴 아래로 꿈틀대는 다리 넷
    c.strokeStyle='#14283a';c.lineCap='round';c.lineWidth=4.5*s;
    for(var j=0;j<4;j++){var ox=(j-1.5)*8*s,w=Math.sin(tt*4+j*1.3)*4*s;c.beginPath();c.moveTo(ox,12*s);c.quadraticCurveTo(ox*1.8+w,26*s,ox*2.4-w,30*s);c.stroke()}
    c.strokeStyle='rgba(145,239,210,.35)';c.lineWidth=1.2*s;
    for(j=0;j<4;j++){ox=(j-1.5)*8*s;w=Math.sin(tt*4+j*1.3)*4*s;c.beginPath();c.moveTo(ox,14*s);c.quadraticCurveTo(ox*1.8+w,26*s,ox*2.4-w,30*s);c.stroke()}
  }
  sprite('face',0,0,46*s,46*s);
  if(n>=3){ // 돌모자(돌하르방 모자 모양)
    c.fillStyle='#22313c';c.strokeStyle='rgba(145,239,210,.45)';c.lineWidth=1*s;
    c.beginPath();c.ellipse(0,-17*s,19*s,5*s,0,0,TAU);c.fill();c.stroke();
    c.beginPath();c.ellipse(0,-22*s,12*s,10*s,0,Math.PI,TAU);c.closePath();c.fill();c.stroke();
    c.fillStyle='rgba(145,239,210,.35)';[[-5,-25],[3,-27],[6,-21],[-2,-20]].forEach(function(q){c.beginPath();c.arc(q[0]*s,q[1]*s,1*s,0,TAU);c.fill()});
  }
  if(n>=25){ // 대왕: 돌모자에 금띠 + 양옆 금방울 (뿔은 쓰지 않는다 — 도채비는 뿔 없음)
    c.strokeStyle='#edd79d';c.lineWidth=2.4*s;c.beginPath();c.ellipse(0,-18.5*s,12.5*s,3*s,0,0,Math.PI);c.stroke();
    [-1,1].forEach(function(sd){var bx=sd*17*s,by=-12*s+Math.sin(tt*5+sd)*1.2*s;
      c.strokeStyle='rgba(237,215,157,.8)';c.lineWidth=1*s;c.beginPath();c.moveTo(sd*15*s,-17*s);c.lineTo(bx,by-3.5*s);c.stroke();
      c.fillStyle='#edd79d';c.beginPath();c.arc(bx,by,3.6*s,0,TAU);c.fill();
      c.fillStyle='#8a6a2a';c.fillRect(bx-2.2*s,by+0.6*s,4.4*s,0.9*s)});
  }
  c.restore();
  if(n>=15){ // 도깨비불 두 개가 얼굴 주위를 돈다
    for(var k=0;k<2;k++){var a=tt*2.4+k*Math.PI,fx0=x+Math.cos(a)*28*s,fy0=y+Math.sin(a)*14*s-4*s;
      var g=c.createRadialGradient(fx0,fy0,0,fx0,fy0,7*s);g.addColorStop(0,'rgba(220,255,240,.95)');g.addColorStop(0.5,'rgba(145,239,210,.6)');g.addColorStop(1,'rgba(145,239,210,0)');
      c.fillStyle=g;c.beginPath();c.arc(fx0,fy0,7*s,0,TAU);c.fill()}
  }
}
function drawShadowBody(sh,alpha){
  c.save();c.globalAlpha=alpha;c.fillStyle='#101d2c';c.shadowBlur=9;c.shadowColor='rgba(128,230,201,.55)';
  c.beginPath();for(var i=0;i<sh.circ.length;i++){var p=sh.circ[i];c.moveTo(p.x+p.r,p.y);c.arc(p.x,p.y,p.r,0,TAU)}c.fill();c.restore();
}
function drawFoot(x,y,dir,lift,alpha,mirror,sc){
  var L=CFG.foot.len*(sc||1)*(lift?1.08:1);
  if(lift)ell(x,y+3,L/2-2,5,'rgba(0,0,0,.25)');
  sprite('foot',x,y-(lift?2:0),L,L,alpha,dir===1?Math.PI/2:-Math.PI/2,mirror?-1:1,1);
}
function draw(){
  c.save();
  if(shake>0)c.translate((rnd()-0.5)*8*shake/0.25,(rnd()-0.5)*8*shake/0.25);
  // 1-2 배경 + 남색 오버레이(단계별로 조명색만 살짝)
  if(IMG.bg.im)c.drawImage(IMG.bg.im,0,0,W,H);else{c.fillStyle='#1b303c';c.fillRect(0,0,W,H)}
  c.fillStyle=TINT[(stage-1)%TINT.length];c.fillRect(0,0,W,H);
  var sh=SH||shadowOf(lamp);
  // 3 손전등 조명
  var g=c.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,230);g.addColorStop(0,'rgba(255,233,163,.17)');g.addColorStop(1,'rgba(255,233,163,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);
  c.fillStyle='rgba(255,227,161,.05)';c.beginPath();c.moveTo(lamp.x,lamp.y);c.lineTo(O.x-sh.uy*38,O.y+sh.ux*38);c.lineTo(O.x+sh.uy*38,O.y-sh.ux*38);c.closePath();c.fill();
  // 4-5 그림자 몸통 + 얼굴
  var blink=inv>0?0.6+0.25*Math.cos(t*14):0.92;
  drawShadowBody(sh,blink);
  var charging=foods.some(function(f){return f.charge>0});
  c.save();c.globalAlpha=blink+0.08;drawFace(sh.x,sh.y,sh.r,score,t,faceSquash,facePulse,charging&&state==='playing');c.restore();
  // 6 먹이 + 흡수 게이지
  for(var i=0;i<foods.length;i++){var f=foods[i],sz=FOOD_SIZE[f.kind],by=Math.sin(t*2.2+f.bob)*1.5,
      grow=f.born<0?1:clamp((t-f.born)/0.25,0,1);
    ell(f.x,f.y+sz[1]*0.42,16,5,'rgba(8,24,32,.45)');
    if(f.mv&&f.kind===2)by+=Math.sin(t*9+f.bob)*1.5;
    sprite('f'+f.kind,f.x,f.y+by,sz[0]*grow,sz[1]*grow,1,f.mv&&f.kind===0?f.roll:(f.mv?Math.sin(t*6+f.bob)*0.12:0));
    if(f.charge>0){c.strokeStyle='rgba(16,40,44,.6)';c.lineWidth=5;c.beginPath();c.arc(f.x,f.y,25,0,TAU);c.stroke();
      c.strokeStyle='#91efd2';c.lineWidth=3;c.lineCap='round';c.beginPath();c.arc(f.x,f.y,25,-Math.PI/2,-Math.PI/2+TAU*f.charge);c.stroke()}
  }
  if(gold&&gold.shown){var G=gold,gg=c.createRadialGradient(G.x,G.y,0,G.x,G.y,34),gs=1.12+0.06*Math.sin(t*8);
    gg.addColorStop(0,'rgba(255,222,140,.55)');gg.addColorStop(1,'rgba(255,222,140,0)');c.fillStyle=gg;c.beginPath();c.arc(G.x,G.y,34,0,TAU);c.fill();
    gs*=clamp((t-G.born)/0.25,0,1);
    sprite('f0',G.x,G.y,FOOD_SIZE[0][0]*gs,FOOD_SIZE[0][1]*gs);
    c.save();c.globalCompositeOperation='overlay';c.fillStyle='rgba(255,200,60,.55)';c.beginPath();c.arc(G.x,G.y,17*gs,0,TAU);c.fill();c.restore();
    c.strokeStyle='rgba(237,215,157,.45)';c.lineWidth=2;c.beginPath();c.arc(G.x,G.y,29,-Math.PI/2,-Math.PI/2+TAU*Math.max(0,G.life/CFG.gold.life));c.stroke();
    if(G.charge>0){c.strokeStyle='#ffd77a';c.lineWidth=3;c.lineCap='round';c.beginPath();c.arc(G.x,G.y,24,-Math.PI/2,-Math.PI/2+TAU*G.charge);c.stroke()}
    txt('×3',G.x+22,G.y-22,13,'#ffe39a',800)}
  for(var d=0;d<dying.length;d++){var o=dying[d],k=o.age/0.18,s2=lerp(1,0.25,k),z=FOOD_SIZE[o.kind];
    sprite('f'+o.kind,lerp(o.x,o.tx,k),lerp(o.y,o.ty,k),z[0]*s2,z[1]*s2,1-k*0.4)}
  // 7 발 예고 + 발자국
  for(var j=0;j<hazards.length;j++){var h=hazards[j];if(h.age<0)continue;
    if(h.age<CFG.warn){
      var pulse=0.45+0.35*Math.sin(h.age*12),prog=h.age/CFG.warn;
      c.save();c.globalAlpha=pulse;c.fillStyle=h.type==='run'?'rgba(255,120,140,.22)':'rgba(255,156,172,.13)';c.fillRect(0,h.y-16,W,32);
      c.setLineDash([6,6]);c.lineDashOffset=-h.dir*t*40;c.strokeStyle='#ff9cac';c.lineWidth=1.5;c.beginPath();c.moveTo(20,h.y);c.lineTo(W-20,h.y);c.stroke();c.setLineDash([]);c.restore();
      var ex=h.dir===1?26:W-26;
      c.save();c.globalAlpha=0.85;drawFoot(ex,h.y,h.dir,false,0.9,false,h.sc);c.restore();
      if(h.type!=='walk')txt(CFG.kindOf[h.type].label,ex+h.dir*44,h.y-22,12,'#ffb7c2',800);
      for(var a=0;a<3;a++){var ax=ex+h.dir*(30+a*14+((t*60)%14));c.fillStyle='rgba(255,183,194,'+(0.8-a*0.22)+')';c.beginPath();c.moveTo(ax+h.dir*7,h.y);c.lineTo(ax-h.dir*3,h.y-6);c.lineTo(ax-h.dir*3,h.y+6);c.closePath();c.fill()}
      c.strokeStyle='#ff9cac';c.lineWidth=3;c.beginPath();c.arc(ex,h.y,20,-Math.PI/2,-Math.PI/2+TAU*(1-prog));c.stroke();
      continue;
    }
    var ft=footsOf(h);for(var q=0;q<ft.length;q++){if(ft[q].x<-30||ft[q].x>W+30)continue;drawFoot(ft[q].x,ft[q].y,h.dir,ft[q].lift,1,q%2===1,h.sc)}
    if(h.type==='run'){c.strokeStyle='rgba(255,183,194,.5)';c.lineWidth=2;for(var sl=0;sl<3;sl++){var sx0=h.x-h.dir*(22+sl*9);c.beginPath();c.moveTo(sx0,h.y-10+sl*10);c.lineTo(sx0-h.dir*16,h.y-10+sl*10);c.stroke()}}
    if(h.stopAt!=null&&h.stopT>0&&h.stopT<0.7)txt('멈칫',h.x,h.y-24,12,'#ffb7c2');
  }
  // 8 고정 도채비
  ell(O.x,O.y+2,24,7,'rgba(8,24,32,.55)');
  sprite('dok',O.x,O.y-36,66,74);
  // 9 파티클
  for(var e=0;e<fx.length;e++){var X=fx[e];
    if(X.type==='burst'&&X.age<0.28){var sz2=48+X.age/0.28*24;sprite('fx',X.x,X.y,sz2,sz2,0.65*(1-X.age/0.28),X.age*3)}
    if(X.type==='ring'){c.strokeStyle='rgba(237,215,157,'+(1-X.age/0.5)+')';c.lineWidth=3;c.beginPath();c.arc(X.x,X.y,20+X.age*90,0,TAU);c.stroke()}
  }
  for(var p=0;p<parts.length;p++){var P=parts[p];c.globalAlpha=1-P.age/P.life;ell(P.x,P.y,P.r,P.r,P.col)}c.globalAlpha=1;
  for(var fl=0;fl<floaters.length;fl++){var F=floaters[fl];c.globalAlpha=1-F.age/0.85;txt(F.s,F.x,F.y-F.age*40,F.size,F.col,800)}c.globalAlpha=1;
  // 10 조작 패드
  c.fillStyle='rgba(13,35,50,.74)';c.fillRect(0,310,W,165);
  c.strokeStyle='rgba(107,145,131,.35)';c.lineWidth=1;c.beginPath();c.moveTo(25,311);c.lineTo(365,311);c.stroke();
  txt('위로: 길게 펼치기',195,326,11.5,'#98b8ac',600);txt('아래로: 짧게 접기',195,463,11.5,'#98b8ac',600);
  var lg=c.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,46);lg.addColorStop(0,'rgba(255,228,163,.3)');lg.addColorStop(1,'rgba(255,228,163,0)');
  c.fillStyle=lg;c.beginPath();c.arc(lamp.x,lamp.y,46,0,TAU);c.fill();
  ell(lamp.x,lamp.y,23,23,'#edd79d');ell(lamp.x,lamp.y,15,15,'#fff3c8');ell(lamp.x,lamp.y,6,6,'#fffbe6');
  if(activeId!=null){c.strokeStyle='rgba(255,243,200,.7)';c.lineWidth=2;c.beginPath();c.arc(lamp.x,lamp.y,28,0,TAU);c.stroke()}
  // 디버그: 실제 판정 도형
  if(DEBUG){
    c.strokeStyle='rgba(0,255,0,.7)';c.lineWidth=1;for(var z2=0;z2<sh.circ.length;z2++){var C=sh.circ[z2];c.beginPath();c.arc(C.x,C.y,C.r,0,TAU);c.stroke()}
    c.strokeStyle='rgba(255,0,255,.9)';for(j=0;j<hazards.length;j++){h=hazards[j];if(h.age<CFG.warn)continue;ft=footsOf(h);
      for(q=0;q<2;q++){var hs=CFG.foot.halfSeg,rr=CFG.foot.r;c.beginPath();c.arc(ft[q].x-hs,ft[q].y,rr,Math.PI/2,Math.PI*1.5);c.lineTo(ft[q].x+hs,ft[q].y-rr);c.arc(ft[q].x+hs,ft[q].y,rr,-Math.PI/2,Math.PI/2);c.closePath();c.stroke()}}
    for(i=0;i<foods.length;i++){ell(foods[i].x,foods[i].y,2,2,'#f0f')}
  }
  c.restore();
}
/* 결과 화면의 최종 그림자 모습 */
function drawFormPreview(el,n){
  if(!el)return;var g=el.getContext('2d'),keep=c;c=g;
  g.clearRect(0,0,240,240);g.save();g.scale(240/80,240/80);
  var r=24;g.fillStyle='#101d2c';g.beginPath();g.ellipse(40,46,r*0.95,r*0.85,0,0,TAU);g.fill();
  drawFace(40,44,r,n,t,0,0,false);g.restore();c=keep;
}

/* ---------------- canvas sizing ---------------- */
var DPR=1,scale=1;
function fit(){
  var r=wrap.getBoundingClientRect(),aw=Math.max(100,r.width-12),ah=Math.max(100,r.height-8);
  var bw=Math.min(aw,ah*W/H,520),bh=bw*H/W;
  board.style.width=Math.floor(bw)+'px';board.style.height=Math.floor(bh)+'px';
  DPR=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.round(Math.floor(bw)*DPR);cv.height=Math.round(Math.floor(bh)*DPR);
  scale=cv.width/W;c.setTransform(scale,0,0,scale,0,0);c.imageSmoothingQuality='high';
}
if(window.ResizeObserver)new ResizeObserver(fit).observe(wrap);else window.addEventListener('resize',fit);

/* ---------------- loop (rAF 하나만) ---------------- */
var last=0;
function frame(now){
  var dt=last?Math.min(0.04,(now-last)/1000):0;last=now;
  if(state==='playing')update(dt);
  else if(state==='ready'){SH=shadowOf(lamp);t+=dt;stepFx(dt)}
  c.setTransform(scale,0,0,scale,0,0);draw();
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
paintMute();fit();reset();buildSafeSpots();
function boot(){
  state='loading';setMain('준비 중','',true);
  showPanel('<p class="panel__line">그림을 불러오는 중이에요…</p>');
  loadAssets(function(ok){
    if(!ok){showPanel('<p class="panel__line">그림을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p><button class="btn btn--primary" id="bRetry" type="button">다시 시도</button>');
      $('bRetry').onclick=boot;setMain('불러오기 실패','',true);return}
    showIntro();
  });
}
boot();
requestAnimationFrame(frame);

/* 테스트 훅(자동 플레이 검증용) */
window.__sf={get state(){return state},get score(){return score},get lives(){return lives},get stage(){return stage},
  get foods(){return foods},get hazards(){return hazards},get lamp(){return lamp},get t(){return t},
  shadowOf:shadowOf,lampFor:lampFor,covers:covers,capsuleGap:capsuleGap,footsOf:footsOf,moveLamp:moveLamp,CFG:CFG,start:startPlay,pause:pause,resume:resume,
  step:function(dt){if(state==='playing')update(dt)},get nearCount(){return nearCount},get gold(){return gold},makeHazard:makeHazard,spawnGold:function(){goldPending=true},get bestCombo(){return bestCombo}};
})();
