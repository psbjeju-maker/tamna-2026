'use strict';
/* 영등할망의 바람탑 — 10개 선택 → 왕복 크레인 탭 낙하 → Matter.js 강체 쌓기 → 바람 개입 → 결과.
   docs/01~04 규약대로 자체완결 게임을 구현. 부모 앱(탐라 index.html)에는 onGameComplete(result)로만 결과를 넘긴다. */

var RULE_VERSION='wind-stack-design-1';
var WORLD={width:390,height:720,platformTop:620,platformWidth:196,platformHeight:26,failY:735};
var CRANE={speed:95,minX:54,maxX:336,releaseVelocityRatio:0.1};
var DROP_HEIGHT=420; // 크레인이 탑 꼭대기보다 얼마나 높은 곳(멀리서)에서 물건을 내려놓기 시작하는지
var SETTLE={speedThreshold:6,angularSpeedThreshold:0.06,stableSeconds:0.65,advanceAfterSeconds:6,finalTimeoutSeconds:12};
var SCORE={stableItem:100,heightPerPixel:2,clearBonus:500};
var MATTER_BASE_DELTA=1000/60; // Matter.Body._baseDelta와 동일(내부 상수, 버전 의존 위험을 피하려 직접 정의)
var OFFSCREEN_FAIL_SECONDS=0.3;
var STEP=1/120;

var ITEMS=[
 {id:'citrus_crate',name:'귤 상자',description:'넓고 든든한 첫 단',image:'assets/items/citrus_crate.png',sourceRect:{x:78,y:179,width:1378,height:664},renderSize:{width:128,height:61.68},grip:[0.5,0.03],mass:2.3,friction:0.7,restitution:0.04,windResponse:0.7,difficultyBonus:0,material:'wood',collision:{type:'convexPolygon',vertices:[[0.01,0.1],[0.99,0.1],[0.99,0.98],[0.01,0.98]]}},
 {id:'basalt_brick',name:'현무암',description:'무겁고 잘 버텨요',image:'assets/items/basalt_brick.png',sourceRect:{x:153,y:215,width:1470,height:507},renderSize:{width:110,height:37.94},grip:[0.5,0.03],mass:3.5,friction:0.85,restitution:0.02,windResponse:0.35,difficultyBonus:0,material:'stone',collision:{type:'convexPolygon',vertices:[[0.08,0.99],[0.01,0.86],[0.01,0.19],[0.08,0.02],[0.91,0.01],[0.99,0.17],[0.99,0.82],[0.92,0.99]]}},
 {id:'wood_plank',name:'바다 판자',description:'넓게 받치지만 얇아요',image:'assets/items/wood_plank.png',sourceRect:{x:51,y:197,width:2069,height:327},renderSize:{width:156,height:24.66},grip:[0.5,0.03],mass:1.3,friction:0.62,restitution:0.06,windResponse:1.1,difficultyBonus:40,material:'wood',collision:{type:'convexPolygon',vertices:[[0.03,0.99],[0.005,0.75],[0.005,0.28],[0.03,0.06],[0.96,0.03],[0.997,0.25],[0.997,0.77],[0.965,0.97]]}},
 {id:'tangerine',name:'제주 귤',description:'둥글어서 잘 굴러요',image:'assets/items/tangerine.png',sourceRect:{x:146,y:133,width:974,height:1008},renderSize:{width:64,height:66.23},grip:[0.5,0.12],mass:0.8,friction:0.4,restitution:0.12,windResponse:1.2,difficultyBonus:80,material:'soft',collision:{type:'circle',center:[0.5,0.575],radius:0.422}},
 {id:'buoy',name:'바다 부표',description:'가볍고 통통 튀어요',image:'assets/items/buoy.png',sourceRect:{x:129,y:159,width:997,height:938},renderSize:{width:74,height:69.62},grip:[0.5,0.03],mass:0.6,friction:0.38,restitution:0.2,windResponse:1.5,difficultyBonus:80,material:'soft',collision:{type:'circle',center:[0.5,0.5],radius:0.48}},
 {id:'tea_tin',name:'차 통',description:'작고 반듯한 받침',image:'assets/items/tea_tin.png',sourceRect:{x:192,y:141,width:943,height:909},renderSize:{width:68,height:65.55},grip:[0.5,0.03],mass:1.1,friction:0.58,restitution:0.05,windResponse:0.85,difficultyBonus:0,material:'metal',collision:{type:'convexPolygon',vertices:[[0.99,0.12],[0.99,0.94],[0.91,0.99],[0.08,0.99],[0.01,0.94],[0.01,0.13],[0.07,0.01],[0.92,0.01]]}},
 {id:'shell',name:'조개껍데기',description:'넓은 위, 좁은 아래',image:'assets/items/shell.png',sourceRect:{x:41,y:60,width:1293,height:1028},renderSize:{width:86,height:68.37},grip:[0.5,0.03],mass:0.9,friction:0.55,restitution:0.05,windResponse:1.25,difficultyBonus:80,material:'ceramic',collision:{type:'convexPolygon',vertices:[[0.005,0.55],[0.07,0.3],[0.25,0.12],[0.5,0.01],[0.77,0.09],[0.94,0.31],[0.995,0.57],[0.89,0.77],[0.69,0.99],[0.31,0.99],[0.1,0.75]]}},
 {id:'lava_jar',name:'제주 옹기',description:'둥근 어깨를 조심',image:'assets/items/lava_jar.png',sourceRect:{x:167,y:150,width:980,height:927},renderSize:{width:70,height:66.21},grip:[0.5,0.03],mass:2.4,friction:0.65,restitution:0.03,windResponse:0.55,difficultyBonus:40,material:'ceramic',collision:{type:'convexPolygon',vertices:[[0.01,0.65],[0.07,0.4],[0.27,0.02],[0.73,0.02],[0.93,0.4],[0.99,0.65],[0.87,0.91],[0.76,0.99],[0.24,0.99],[0.1,0.9]]}},
 {id:'fish_block',name:'나무 물고기',description:'울퉁불퉁한 모양',image:'assets/items/fish_block.png',sourceRect:{x:134,y:69,width:1501,height:735},renderSize:{width:112,height:54.84},grip:[0.5,0.03],mass:1.1,friction:0.6,restitution:0.06,windResponse:1.15,difficultyBonus:80,material:'wood',collision:{type:'convexPolygon',vertices:[[0.01,0.9],[0.01,0.22],[0.44,0.01],[0.59,0.11],[0.79,0.25],[0.99,0.55],[0.95,0.72],[0.75,0.9],[0.58,0.995]]}},
 {id:'straw_hat',name:'밀짚모자',description:'가벼워 바람에 약해요',image:'assets/items/straw_hat.png',sourceRect:{x:38,y:179,width:1698,height:540},renderSize:{width:124,height:39.43},grip:[0.5,0.03],mass:0.4,friction:0.52,restitution:0.03,windResponse:1.8,difficultyBonus:80,material:'soft',collision:{type:'convexPolygon',vertices:[[0.27,0.04],[0.57,0.01],[0.67,0.12],[0.98,0.73],[0.99,0.84],[0.9,0.95],[0.5,0.995],[0.1,0.95],[0.01,0.83],[0.02,0.74]]}},
 {id:'gift_box',name:'선물 상자',description:'반듯하고 가벼워요',image:'assets/items/gift_box.png',sourceRect:{x:261,y:248,width:854,height:648},renderSize:{width:80,height:60.7},grip:[0.5,0.03],mass:0.8,friction:0.65,restitution:0.03,windResponse:1.1,difficultyBonus:0,material:'soft',collision:{type:'convexPolygon',vertices:[[0.01,0.92],[0.01,0.13],[0.07,0.01],[0.94,0.01],[0.99,0.12],[0.99,0.92],[0.94,0.99],[0.06,0.99]]}},
 {id:'lifering',name:'구명환',description:'둥근 몸체가 데굴데굴',image:'assets/items/lifering.png',sourceRect:{x:107,y:113,width:1044,height:1026},renderSize:{width:78,height:76.66},grip:[0.5,0.03],mass:0.55,friction:0.42,restitution:0.16,windResponse:1.6,difficultyBonus:80,material:'soft',collision:{type:'circle',center:[0.5,0.5],radius:0.48}}
];
var ITEMS_BY_ID={};ITEMS.forEach(function(it){ITEMS_BY_ID[it.id]=it});

var WIND_TIMING={enter:0.25,warning:1,anticipation:0.15,active:1.4,exit:0.4};
var WIND_TOTAL=WIND_TIMING.enter+WIND_TIMING.warning+WIND_TIMING.anticipation+WIND_TIMING.active+WIND_TIMING.exit;
var WIND_EVENTS_BY_SLOT={
 4:{slot:4,kind:'gust',direction:1,acceleration:24,line:'후후, 이번엔 이쪽으로 불어 볼까?'},
 7:{slot:7,kind:'help',gravityScale:0.75,line:'살살… 이번엔 내가 받쳐 주마.'},
 9:{slot:9,kind:'gust',direction:-1,acceleration:40,line:'이번엔 반대쪽이란다!'}
};

var $=function(s){return document.querySelector(s)};
var stage=$('#stage'),cv=$('#game'),ctx=cv.getContext('2d'),overlay=$('#overlay'),panel=$('#panel'),windBubble=$('#windBubble'),toastEl=$('#toast');
var DPR=2;

/* ---------------- 오디오 ---------------- */
var _actx=null,soundOn=true;
function beep(freq,dur,type,vol){
 if(!soundOn)return;
 try{
  _actx=_actx||new (window.AudioContext||window.webkitAudioContext)();
  var t0=_actx.currentTime,osc=_actx.createOscillator(),g=_actx.createGain();
  osc.type=type||'sine';osc.frequency.setValueAtTime(freq,t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(50,freq*0.4),t0+dur);
  g.gain.setValueAtTime(vol==null?0.18:vol,t0);
  g.gain.exponentialRampToValueAtTime(0.001,t0+dur);
  osc.connect(g);g.connect(_actx.destination);
  osc.start(t0);osc.stop(t0+dur);
 }catch(e){}
}
var MATERIAL_TONE={wood:320,stone:180,metal:520,ceramic:420,soft:260};
function landSound(material,strong){beep((MATERIAL_TONE[material]||300)*(strong?0.85:1),strong?0.22:0.09,'triangle',strong?0.22:0.11)}
function windSound(kind){kind==='help'?beep(660,0.5,'sine',0.14):beep(200,0.3,'sawtooth',0.12)}
function collapseSound(){beep(120,0.5,'sawtooth',0.22);setTimeout(function(){beep(90,0.4,'sawtooth',0.18)},90)}
function clearSound(){[520,660,780,980].forEach(function(f,i){setTimeout(function(){beep(f,0.28,'sine',0.16)},i*90)})}
$('#sound').onclick=function(){soundOn=!soundOn;$('#sound').classList.toggle('active',soundOn);$('#sound').textContent=soundOn?'♪':'✕'};

/* ---------------- 이미지 로딩 ---------------- */
var imgCache={};
function loadImg(url){
 if(imgCache[url])return imgCache[url];
 var img=new Image();img.src=url;imgCache[url]=img;return img;
}
ITEMS.forEach(function(it){loadImg(it.image)});
var CHAR_SMILE=loadImg('assets/characters/yeongdeung_smile.png');
var CHAR_BLOW=loadImg('assets/characters/yeongdeung_blow.png');
var BG=loadImg('assets/backgrounds/jeju_coast.png');
var UI={};['crane_rail','crane_trolley','crane_claw_open','crane_claw_closed','platform','wind_gust','wind_help','impact_ring','sparkle'].forEach(function(n){UI[n]=loadImg('assets/ui/'+n+'.svg')});

/* ---------------- 상태 ---------------- */
var S={
 phase:'SELECT', // SELECT, HELD, FALLING, SETTLING, COLLAPSE, RESULT_CLEAR, RESULT_FAIL, RESULT_UNSTABLE
 picked:[], // ordered array of item ids, up to 10
 order:[], // confirmed order at round start (copy of picked)
 released:0, // count of items dropped so far
 score:0, itemScore:0, heightPx:0,
 craneX:CRANE.minX, craneDir:1, heldY:0, cameraTargetY:0, cameraY:0,
 windEvent:null, windTimer:0, windSide:1,
 settlingElapsed:0, stableTimer:0, shownStuckToast:false,
 bodies:[], currentBody:null,
 attemptId:null, seed:null, startedAt:0, collapseTimer:0,
 best:0, paused:false, toastUntil:0, shakeUntil:0
};

/* ---------------- Matter 세팅 ---------------- */
var engine,world,platformBody;
var GRAVITY_SCALE=0.0015; // Matter 엔진 중력 스케일(px 단위, 실측 튜닝값). body.force 기반이라 setVelocity를 매 틱 직접 건드리지 않는다.
function initPhysics(){
 engine=Matter.Engine.create();
 engine.gravity.y=1;engine.gravity.scale=GRAVITY_SCALE;
 engine.enableSleeping=true; // 느려진 물건을 확실히 재워서 "계속 흔들림/굴러감" 방지 — Sleeping.set이 speed/angularSpeed를 0으로 고정
 world=engine.world;
 platformBody=Matter.Bodies.rectangle(195,WORLD.platformTop+WORLD.platformHeight/2,WORLD.platformWidth,WORLD.platformHeight,{isStatic:true,friction:0.85,label:'platform'});
 Matter.World.add(world,[platformBody]);
}
function clearPhysics(){
 if(world)Matter.World.clear(world,false);
 if(engine)Matter.Engine.clear(engine);
 S.bodies=[];S.currentBody=null;
}

function verticesFromNormalized(norm,w,h){
 return norm.map(function(p){return {x:(p[0]-0.5)*w,y:(p[1]-0.5)*h}});
}
function spawnItemBody(item,x,y){
 var w=item.renderSize.width,h=item.renderSize.height,body,off;
 // frictionAir를 디자인팩 원안(0.012)보다 높여 회전·미끄러짐이 더 빨리 잦아들게 함(둥근 물건이 계속 구르는 문제 완화)
 var opts={friction:item.friction,restitution:item.restitution,frictionAir:0.045,sleepThreshold:30,label:item.id};
 if(item.collision.type==='circle'){
  var r=item.collision.radius*Math.min(w,h);
  var cx=(item.collision.center[0]-0.5)*w,cy=(item.collision.center[1]-0.5)*h;
  body=Matter.Bodies.circle(x+cx,y+cy,r,opts);
 } else {
  var verts=verticesFromNormalized(item.collision.vertices,w,h);
  body=Matter.Bodies.fromVertices(x,y,[verts],opts,true);
 }
 off={x:x-body.position.x,y:y-body.position.y};
 Matter.Body.setMass(body,Math.max(0.05,item.mass)*9);
 body.plugin={item:item,spriteOffset:off,stableAwarded:false,offScreenTimer:0};
 Matter.World.add(world,[body]);
 S.bodies.push(body);
 return body;
}

/* ---------------- 시작 화면 (물건은 매판 무작위로 정해짐) ---------------- */
function shuffledTen(){
 var pool=ITEMS.map(function(it){return it.id});
 for(var i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=pool[i];pool[i]=pool[j];pool[j]=t}
 return pool.slice(0,10);
}
function renderSelect(){
 overlay.classList.remove('hidden');
 S.picked=shuffledTen();
 var preview=S.picked.map(function(id){var it=ITEMS_BY_ID[id];return '<img src="'+it.image+'" alt="'+it.name+'" title="'+it.name+'">'}).join('');
 panel.innerHTML='<h2>오늘은 무엇을 쌓을까?</h2><p>"어디까지 쌓나 볼까?" 열 가지 물건이 무작위로 정해져요. 크레인이 순서대로 가져다줘요.</p>'+
  '<div class="itemgrid itemgrid--preview">'+preview+'</div>'+
  '<button class="primary" id="btnStart">내 탑 쌓기 시작</button>';
 var btn=$('#btnStart');
 if(btn)btn.onclick=function(){startRound()};
}

/* ---------------- 라운드 진행 ---------------- */
function startRound(){
 clearPhysics();initPhysics();
 S.order=S.picked.slice();
 S.released=0;S.score=0;S.itemScore=0;S.heightPx=0;
 S.cameraY=0;S.cameraTargetY=0;
 S.attemptId=Date.now()+'-'+Math.random().toString(36).slice(2,8);
 S.seed=Date.now();
 S.startedAt=performance.now();
 S.craneX=CRANE.minX;S.craneDir=1;
 S.windEvent=null;S.windTimer=0;
 S.settlingElapsed=0;S.stableTimer=0;S.shownStuckToast=false;
 S.collapseTimer=0;
 overlay.classList.add('hidden');
 setPhase('HELD');
}
function currentItem(){return ITEMS_BY_ID[S.order[S.released]]}
function towerTopY(){
 if(!S.bodies.length)return WORLD.platformTop;
 var top=WORLD.platformTop;
 S.bodies.forEach(function(b){var m=Matter.Bounds; var minY=b.bounds.min.y; if(minY<top)top=minY});
 return top;
}
function setPhase(p){
 S.phase=p;
 if(p==='HELD'){
  var item=currentItem();
  if(!item)return; // shouldn't happen (RESULT_CLEAR handled elsewhere)
  S.heldY=Math.max(90,towerTopY()-DROP_HEIGHT);
  S.cameraTargetY=Math.min(S.cameraTargetY,S.heldY-160);
  S.craneX=CRANE.minX;S.craneDir=1;
  var slot=S.released+1;
  var ev=WIND_EVENTS_BY_SLOT[slot];
  if(ev && !ev._used){ev._used=true;S.windEvent=Object.assign({},ev);S.windTimer=0;}
  $('#phase').textContent=item.name+' · '+item.description;
 }
}

/* ---------------- 입력: 탭/스페이스로 낙하 ---------------- */
function tryDrop(){
 if(S.phase!=='HELD')return;
 var item=currentItem();if(!item)return;
 var w=item.renderSize.width,h=item.renderSize.height;
 var gx=(item.grip[0]-0.5)*w,gy=(item.grip[1]-0.5)*h;
 var cx=S.craneX-gx,cy=S.heldY-gy;
 var body=spawnItemBody(item,cx,cy);
 // Matter의 setVelocity는 "baseDelta(1000/60ms)당 이동 픽셀" 단위를 기대하므로 px/s 값을 그 비율로 변환해야 한다.
 var vx=CRANE.speed*S.craneDir*CRANE.releaseVelocityRatio*(MATTER_BASE_DELTA/1000);
 Matter.Body.setVelocity(body,{x:vx,y:0});
 S.currentBody=body;
 S.released++;
 setPhase('FALLING');
 beep(700,0.06,'square',0.1);
}
cv.addEventListener('pointerdown',function(e){e.preventDefault();tryDrop()},{passive:false});
window.addEventListener('keydown',function(e){
 if(e.code==='Space'&&!e.repeat){e.preventDefault();tryDrop()}
});

/* ---------------- 물리 틱 ---------------- */
function applyCustomForces(dt){
 // 크레인 왕복 (HELD 동안만)
 if(S.phase==='HELD'){
  S.craneX+=CRANE.speed*S.craneDir*dt;
  if(S.craneX>CRANE.maxX){S.craneX=CRANE.maxX;S.craneDir=-1}
  if(S.craneX<CRANE.minX){S.craneX=CRANE.minX;S.craneDir=1}
 }
 // 바람 타임라인
 if(S.windEvent){
  S.windTimer+=dt;
  var t=S.windTimer;
  var activeStart=WIND_TIMING.enter+WIND_TIMING.warning+WIND_TIMING.anticipation;
  var activeEnd=activeStart+WIND_TIMING.active;
  if(t>=activeStart&&t<activeEnd){
   applyWindForce(dt,S.windEvent);
  }
  if(t>=WIND_TOTAL){S.windEvent=null}
 }
}
/* 바람/도움 힘은 전부 Matter.Body.applyForce로 적용한다(엔진 내장 중력과 동일한 force/mass*dt^2 적분 경로를
   타므로 안전함). setVelocity를 매 틱 반복 호출하면 Matter의 Verlet 적분(baseDelta 기준 스케일)과
   충돌해 값이 폭주한다 — 실기기 테스트에서 실제로 발견한 버그, 재도입 금지. */
var WIND_FORCE_PER_ACCEL=GRAVITY_SCALE/1380; // acceleration(px/s^2 근사치) → gravity.scale과 동일 축척의 힘 계수
function applyWindForce(dt,ev){
 if(ev.kind==='gust'){
  windSoundOnce(ev);
  S.bodies.forEach(function(b){
   if(b.isStatic)return;
   var wr=(b.plugin&&b.plugin.item&&b.plugin.item.windResponse)||1;
   var f=b.mass*ev.acceleration*wr*ev.direction*WIND_FORCE_PER_ACCEL;
   Matter.Body.applyForce(b,b.position,{x:f,y:0});
  });
 } else if(ev.kind==='help'){
  windSoundOnce(ev);
  var target=S.currentBody;
  if(target && S.bodies.indexOf(target)>=0){
   var relief=(1-ev.gravityScale)*target.mass*engine.gravity.y*engine.gravity.scale;
   Matter.Body.applyForce(target,target.position,{x:0,y:-relief});
   target.anglePrev=target.angle-(target.angle-target.anglePrev)*0.94;
  }
 }
}
var _windSoundFired=null;
function windSoundOnce(ev){
 if(_windSoundFired===ev)return;_windSoundFired=ev;windSound(ev.kind);
 setTimeout(function(){if(_windSoundFired===ev)_windSoundFired=null},1500);
}

/* engine.pairs.list는 쓰지 않는다 — Matter는 두 바디가 모두 static/sleeping이면 그 쌍을
   브로드페이즈에서 아예 건너뛰어(Detector.collisions) 잠든 물건의 접촉쌍이 곧 stale해진다
   (재현: 물건이 잠들자마자 연결이 끊긴 것처럼 보여 안정 판정이 영원히 리셋되는 버그 발견).
   대신 매 틱 바운딩박스 근접 여부로 직접 연결 그래프를 만든다 — sleep 상태와 무관하게 항상 정확함. */
function boundsTouching(a,b,eps){
 return !(a.max.x<b.min.x-eps||a.min.x>b.max.x+eps||a.max.y<b.min.y-eps||a.min.y>b.max.y+eps);
}
function buildContactGraph(){
 var all=S.bodies.concat([platformBody]);
 var visited={};visited[platformBody.id]=true;
 var queue=[platformBody];
 var eps=2.5;
 while(queue.length){
  var cur=queue.shift();
  all.forEach(function(b){
   if(visited[b.id])return;
   if(boundsTouching(cur.bounds,b.bounds,eps)){visited[b.id]=true;queue.push(b)}
  });
 }
 return visited;
}

function resetOffscreenTimers(){S.bodies.forEach(function(b){if(b.plugin)b.plugin.offScreenTimer=0})}
function checkFailure(dt){
 var failed=false;
 S.bodies.forEach(function(b){
  if(!b.plugin)return;
  var out=b.bounds.min.y>WORLD.failY || b.bounds.max.x<0 || b.bounds.min.x>WORLD.width;
  if(out){b.plugin.offScreenTimer+=dt;if(b.plugin.offScreenTimer>=OFFSCREEN_FAIL_SECONDS)failed=true;}
  else b.plugin.offScreenTimer=0;
 });
 return failed;
}

function tick(dt){
 if(S.paused)return;
 if(S.phase==='HELD'||S.phase==='FALLING'||S.phase==='SETTLING'){
  applyCustomForces(dt);
  Matter.Engine.update(engine,dt*1000);
  var visited=buildContactGraph();
  if(checkFailure(dt)){beginCollapse();return}
  if(S.phase==='FALLING'&&S.currentBody){
   if(visited[S.currentBody.id]){
    S.phase='SETTLING';S.settlingElapsed=0;S.stableTimer=0;
    landSound(S.currentBody.plugin.item.material,S.currentBody.velocity.y>4);
   }
  }
  if(S.phase==='SETTLING'){
   S.settlingElapsed+=dt;
   var allStable=true,anyChecked=false;
   S.bodies.forEach(function(b){
    if(!visited[b.id])return; // 붕괴로 분리된 물건은 실패 판정에서 처리
    anyChecked=true;
    var sp=Math.hypot(b.velocity.x,b.velocity.y);
    if(sp>=SETTLE.speedThreshold||Math.abs(b.angularVelocity)>=SETTLE.angularSpeedThreshold)allStable=false;
   });
   if(anyChecked&&allStable)S.stableTimer+=dt;else S.stableTimer=0;
   if(S.stableTimer>=SETTLE.stableSeconds){
    confirmStable(visited);
   } else if(S.settlingElapsed>=SETTLE.advanceAfterSeconds && S.released<10){
    if(!S.shownStuckToast){showToast('아직 흔들려요');S.shownStuckToast=true}
    setPhase('HELD');
   } else if(S.released===10 && S.settlingElapsed>=SETTLE.finalTimeoutSeconds){
    finishRound('unstable');
   }
  }
 } else if(S.phase==='COLLAPSE'){
  Matter.Engine.update(engine,dt*1000);
  S.collapseTimer+=dt;
  if(S.collapseTimer>=0.8)finishRound('fall');
 }
}
function confirmStable(visited){
 S.bodies.forEach(function(b){
  if(!visited[b.id]||!b.plugin||b.plugin.stableAwarded)return;
  b.plugin.stableAwarded=true;
  S.itemScore+=SCORE.stableItem+b.plugin.item.difficultyBonus;
 });
 var top=WORLD.platformTop;
 S.bodies.forEach(function(b){if(visited[b.id]&&b.bounds.min.y<top)top=b.bounds.min.y});
 S.heightPx=Math.max(0,WORLD.platformTop-top);
 S.score=S.itemScore+Math.round(S.heightPx*SCORE.heightPerPixel);
 S.shownStuckToast=false;
 if(S.released===10){finishRound('clear');return}
 setPhase('HELD');
}
function beginCollapse(){
 S.phase='COLLAPSE';S.collapseTimer=0;S.windEvent=null;
 showToast('아이고, 와르르!');
 collapseSound();
}
function showToast(msg){
 toastEl.textContent=msg;toastEl.classList.add('on');
 clearTimeout(showToast._t);
 showToast._t=setTimeout(function(){toastEl.classList.remove('on')},1400);
}
function finishRound(outcome){
 if(outcome==='clear'){S.score+=SCORE.clearBonus;clearSound()}
 S.phase=outcome==='clear'?'RESULT_CLEAR':(outcome==='fall'?'RESULT_FAIL':'RESULT_UNSTABLE');
 var durationMs=Math.round(performance.now()-S.startedAt);
 var result={
  gameId:'wind-stack',ruleVersion:RULE_VERSION,attemptId:S.attemptId,seed:S.seed,
  selectedIds:S.order.slice(),placedCount:S.bodies.filter(function(b){return b.plugin&&b.plugin.stableAwarded}).length,
  stableHeight:Math.round(S.heightPx),score:S.score,outcome:outcome,durationMs:durationMs
 };
 if(S.score>S.best)S.best=S.score;
 renderResult(result,outcome);
 try{if(window.onGameComplete)window.onGameComplete(result)}catch(e){}
}
function renderResult(result,outcome){
 overlay.classList.remove('hidden');
 var title=outcome==='clear'?'열 개를 다 올렸구나!':(outcome==='fall'?'아이고, 와르르!':'아직 흔들려요');
 var sub=outcome==='clear'?'제법인데?':(outcome==='fall'?'이번엔 순서를 바꿔 볼까?':'시간이 다 되어 여기서 마무리할게요.');
 panel.innerHTML='<h2>'+title+'</h2><p>'+sub+'</p>'+
  '<div class="big-score">'+result.score+'<small> 점</small></div>'+
  '<div class="stats"><div><b>'+result.stableHeight+'px</b>높이</div><div><b>'+result.placedCount+'/10</b>쌓은 개수</div><div><b>'+Math.round(result.durationMs/1000)+'초</b>걸린 시간</div></div>'+
  '<button class="primary" id="btnRetry">같은 순서로 다시하기</button>'+
  '<button class="secondary" id="btnReselect">다른 물건으로 다시하기</button>';
 $('#btnRetry').onclick=function(){S.picked=S.order.slice();startRound()};
 $('#btnReselect').onclick=function(){renderSelect()};
}

/* ---------------- 렌더 ---------------- */
function drawSourceItem(img,item,worldX,worldY,angle){
 if(!img.complete||!img.naturalWidth)return;
 var sr=item.sourceRect,rs=item.renderSize;
 ctx.save();ctx.translate(worldX,worldY);ctx.rotate(angle||0);
 ctx.drawImage(img,sr.x,sr.y,sr.width,sr.height,-rs.width/2,-rs.height/2,rs.width,rs.height);
 ctx.restore();
}
function drawBackground(){
 ctx.fillStyle='#dff2ec';ctx.fillRect(0,0,WORLD.width,WORLD.height+400);
 if(BG.complete&&BG.naturalWidth){
  var parallax=S.cameraY*0.2;
  var bh=WORLD.height*1.4;
  ctx.drawImage(BG,0,parallax-100,WORLD.width,bh);
 }
}
function drawPlatform(){
 var img=UI.platform;
 if(img.complete&&img.naturalWidth){
  ctx.drawImage(img,195-120,WORLD.platformTop-11,240,54);
 } else {
  ctx.fillStyle='#354e50';ctx.fillRect(195-98,WORLD.platformTop,196,26);
 }
}
function drawCrane(){
 if(S.phase!=='HELD'&&S.phase!=='FALLING'&&S.phase!=='SETTLING')return;
 var railY=S.heldY-70;
 if(UI.crane_rail.complete&&UI.crane_rail.naturalWidth)ctx.drawImage(UI.crane_rail,CRANE.minX-20,railY-16,CRANE.maxX-CRANE.minX+40,32);
 var trolleyImg=UI.crane_trolley;
 if(trolleyImg.complete&&trolleyImg.naturalWidth)ctx.drawImage(trolleyImg,S.craneX-40,railY-10,80,54);
 // 케이블
 var clawY=S.heldY-29;
 ctx.strokeStyle='#204b50';ctx.lineWidth=2.5;
 ctx.beginPath();ctx.moveTo(S.craneX,railY+35);ctx.lineTo(S.craneX,clawY);ctx.stroke();
 var claw=S.phase==='HELD'?UI.crane_claw_open:UI.crane_claw_closed;
 if(claw.complete&&claw.naturalWidth){
  var cw=claw.naturalWidth>0?(claw===UI.crane_claw_open?104:80):90,ch=74;
  ctx.drawImage(claw,S.craneX-cw/2,clawY,cw,ch);
 }
 if(S.phase==='HELD'){
  var item=currentItem();
  if(item){
   var w=item.renderSize.width,h=item.renderSize.height;
   var gx=(item.grip[0]-0.5)*w,gy=(item.grip[1]-0.5)*h;
   drawSourceItem(loadImg(item.image),item,S.craneX-gx,S.heldY-gy,0);
  }
 }
}
function drawBodies(){
 S.bodies.forEach(function(b){
  var pl=b.plugin;if(!pl)return;
  var img=loadImg(pl.item.image);
  var px=b.position.x+pl.spriteOffset.x*Math.cos(b.angle)-pl.spriteOffset.y*Math.sin(b.angle);
  var py=b.position.y+pl.spriteOffset.x*Math.sin(b.angle)+pl.spriteOffset.y*Math.cos(b.angle);
  drawSourceItem(img,pl.item,px,py,b.angle);
 });
}
function faceAnchorDraw(img,anchorPx,previewScale,cx,cy,flip){
 if(!img.complete||!img.naturalWidth)return;
 var scale=previewScale*1.55;
 var w=img.naturalWidth*scale,h=img.naturalHeight*scale;
 var ax=anchorPx[0]*scale,ay=anchorPx[1]*scale;
 ctx.save();
 ctx.translate(cx,cy);
 if(flip)ctx.scale(-1,1);
 ctx.drawImage(img,-ax,-ay,w,h);
 ctx.restore();
}
function drawWindCharacter(){
 if(!S.windEvent)return;
 var t=S.windTimer,ev=S.windEvent;
 var enterEnd=WIND_TIMING.enter,warnEnd=enterEnd+WIND_TIMING.warning,antEnd=warnEnd+WIND_TIMING.anticipation,activeEnd=antEnd+WIND_TIMING.active;
 var visY=S.heldY-40;
 var dir=ev.direction||1;
 var fromRight=dir>0; // 방향으로 부는 바람: 캐릭터는 반대편(부는 방향의 시작점)에 위치
 var sideX=fromRight?40:WORLD.width-40;
 var enterProgress=Math.min(1,t/Math.max(0.001,enterEnd));
 var alpha=1;
 if(t<enterEnd)alpha=enterProgress;
 else if(t>activeEnd)alpha=Math.max(0,1-(t-activeEnd)/WIND_TIMING.exit);
 if(alpha<=0)return;
 var blowing=t>=warnEnd;
 var img=blowing?CHAR_BLOW:CHAR_SMILE;
 var anchor=blowing?[607,435]:[495,525];
 ctx.save();ctx.globalAlpha=alpha;
 faceAnchorDraw(img,anchor,0.135,sideX,visY,!fromRight);
 ctx.restore();
 // 바람선 (active 구간)
 if(t>=antEnd&&t<activeEnd){
  var wimg=ev.kind==='help'?UI.wind_help:UI.wind_gust;
  if(wimg.complete&&wimg.naturalWidth){
   ctx.save();ctx.globalAlpha=0.85;
   var wx=fromRight?sideX+20:sideX-340;
   ctx.drawImage(wimg,wx,visY-40,320,120);
   ctx.restore();
  }
 }
 // 말풍선(DOM)
 var showBubble=t<activeEnd;
 if(showBubble){
  windBubble.textContent=ev.line;
  windBubble.classList.add('on');
  var screenX=(sideX/WORLD.width)*stage.clientWidth;
  var screenY=((visY-S.cameraY)/WORLD.height)*stage.clientHeight;
  windBubble.style.left=Math.max(6,Math.min(stage.clientWidth-windBubble.offsetWidth-6,screenX-20))+'px';
  windBubble.style.top=Math.max(4,screenY-70)+'px';
 } else windBubble.classList.remove('on');
}

function updateCamera(){
 S.cameraY+=(S.cameraTargetY-S.cameraY)*0.08;
 if(S.cameraY>0)S.cameraY=0;
}
function updateHud(){
 $('#hudLeft').innerHTML=(10-S.released)+'<span>개</span>';
 $('#hudScore').textContent=S.score;
 $('#hudHeight').innerHTML=Math.round(S.heightPx)+'<span>px</span>';
}

function render(){
 ctx.save();
 ctx.setTransform(DPR,0,0,DPR,0,0);
 ctx.clearRect(0,0,WORLD.width,WORLD.height);
 ctx.save();
 ctx.translate(0,-S.cameraY);
 drawBackground();
 drawPlatform();
 drawBodies();
 drawCrane();
 drawWindCharacter();
 ctx.restore();
 ctx.restore();
 updateHud();
}

/* ---------------- 루프 ---------------- */
var raf=null,lastT=null,acc=0;
function resizeCanvas(){
 cv.width=WORLD.width*DPR;cv.height=WORLD.height*DPR;
}
function loop(t){
 if(lastT==null)lastT=t;
 var dt=t-lastT;lastT=t;
 if(dt>250)dt=250;
 acc+=dt;
 while(acc>=STEP*1000){tick(STEP);updateCamera();acc-=STEP*1000}
 render();
 raf=requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange',function(){S.paused=document.hidden;if(!document.hidden)lastT=null});

/* ---------------- 시작 ---------------- */
resizeCanvas();
initPhysics();
renderSelect();
raf=requestAnimationFrame(loop);
