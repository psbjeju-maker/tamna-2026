/* ============================================================
   영등할망의 바람 — 탐라문화제 앱(index.html) 안의 미니게임 코드
   canvas(#gcv)에 그리는 방식이라 순수 HTML 마크업은 거의 없고
   대부분 JS입니다. 이 파일만 떼서 쓰려면 아래 "의존 요소"를
   먼저 준비해야 합니다.

   ── 의존 요소 (index.html 다른 곳에 있음) ──
   · <canvas id="gcv"></canvas>            게임을 그리는 캔버스
   · <div id="lightningFlash"></div>       번개 카드용 CSS 플래시 오버레이(캔버스 위,
     #canvasWrap 안에 position:relative로 겹쳐둠 — app.css의 #lightningFlash 참고)
   · var cv=$('#gcv'), ctx=cv.getContext('2d'), raf=null;
   · openStage(title) / stopGame()          게임 화면 열기/닫기
   · sfx(name,vol) / sfxAmbient(name,vol) / beep(freq,dur,type,vol)
   · toast(msg) / reward(rawPoint,label)    화면 하단 토스트 · 보상 시트
   · $('#stScore')                          canvas 밖 상단 점수 텍스트(지금은 비워둠)
   · d() / S.best.sail                      오늘 기록 저장소

   ── 이미지 에셋 (assets/sail-game/*.png) ──
   탐라문화제 원본 스프라이트시트에서 잘라낸 실제 그림 36장이 이미
   assets/sail-game/ 안에 들어있습니다. 파일이 없거나 로드에 실패해도
   게임은 죽지 않고 기존 Canvas 도형으로 자동 대체됩니다(ASSETS 참고).
   ============================================================ */

/* ---------------- 에셋 ---------------- */
var ASSETS_DIR = 'assets/sail-game/';
function loadAsset(file){ var im = new Image(); im.src = ASSETS_DIR + file; return im; }
function imgOk(im){ return !!im && im.complete && im.naturalWidth > 0; }
function drawImgFit(im, x, y, w, h, rot){
  if(!imgOk(im)) return false;
  ctx.save();
  ctx.translate(x, y);
  if(rot) ctx.rotate(rot);
  ctx.drawImage(im, -w/2, -h/2, w, h);
  ctx.restore();
  return true;
}
var ASSETS = {
  ship:      [loadAsset('ship1.png'), loadAsset('ship2.png'), loadAsset('ship3.png'), loadAsset('ship4.png')],
  rockPool:  [loadAsset('rock1.png'), loadAsset('rock2.png'), loadAsset('rock3.png'), loadAsset('rock4.png'),
              loadAsset('rock5.png'), loadAsset('rock6.png'), loadAsset('rock7.png'), loadAsset('rock8.png')],
  debrisPool:[loadAsset('barrel.png'), loadAsset('crate.png'), loadAsset('branch.png')],
  windOrb:     loadAsset('windOrb.png'),     /* 최종 시련(Lv30) 바람구슬·약점 코어 전용 */
  bossVortex:  loadAsset('bossVortex.png'),  /* 미니보스 전용 */
  enemyShot:   loadAsset('enemyShot.png'),   /* 해양쓰레기 몬스터가 쏘는 파편 전용 */
  foodRice:      loadAsset('bokRiceCake.png'),
  foodTangerine: loadAsset('tangerine.png'),
  foodBag:       loadAsset('bokBag.png'),
  cannonShot:    loadAsset('cannonShot.png'),
  rockExplosion: loadAsset('rockExplosion.png'),
  justBurst:     loadAsset('justBurst.png'),
  evoBurst:      loadAsset('evoBurst.png'),
  evoBanner:     [null, loadAsset('evoBanner2.png'), loadAsset('evoBanner3.png'), loadAsset('evoBanner4.png')],
  awakenHalo:    loadAsset('awakenHalo.png'),
  dragonWave:    loadAsset('dragonWave.png'),
  windFeather:   loadAsset('windFeather.png'),
  windTrail:     loadAsset('windTrailStreak.png'),
  windStreak:    loadAsset('windStreak.png'),
  foamPuff:      loadAsset('foamPuff.png'),
  windParticle:  loadAsset('windParticle.png'),
  windSwirlBlue:   loadAsset('windSwirlBlue.png'),
  windSwirlPurple: loadAsset('windSwirlPurple.png'),
  yeongdeung:    loadAsset('yeongdeung.png') /* 아직 없음 — 실루엣은 자동으로 스웰 아이콘으로 대체됨 */
};

/* ---------------- 기울기(선택 조작) ---------------- */
var tiltX = 0, tiltY = 0, tiltBetaBase = null;
function tiltH(e){
  if(e.gamma != null) tiltX = Math.max(-1, Math.min(1, e.gamma/25));
  if(e.beta != null){
    /* 사람마다 폰을 쥔 각도가 다르므로 첫 값을 "중립 자세"로 삼고 거기서부터의
       변화량만 상하 이동에 쓴다(원시 beta값을 그대로 쓰면 쥔 각도에 따라 한쪽으로 쏠림) */
    if(tiltBetaBase == null) tiltBetaBase = e.beta;
    tiltY = Math.max(-1, Math.min(1, (e.beta - tiltBetaBase)/25));
  }
}

/* 배 진화 4단계 — need는 "그 단계까지 오는데 필요한 진화 게이지" 증분값.
   2단계부터 자동으로 미사일을 쏴서 앞을 가로막는 바위를 직접 파괴할 수 있다. */
/* 단계마다 포탄 수·발사속도·각도가 눈에 띄게 달라져야 "진화했다"는 느낌이 나므로
   이전엔 조각배→풍선 전환이 사실상 총알 1개 그대로라 체감이 없었던 것을 고쳤다 */
var SHIP_TIERS=[
  {name:'조각배',   need:0, fireEvery:0,    missiles:0, spread:0,    aura:false},
  {name:'풍선(風船)',need:2, fireEvery:1.0,  missiles:2, spread:14,   aura:false},
  {name:'범선',     need:3, fireEvery:0.65, missiles:3, spread:16,   aura:true },
  {name:'용선(龍船)',need:3, fireEvery:0.22, missiles:4, spread:20,   aura:true }
];

function drawShip(ctx,lvl,glowPulse){
  var T=SHIP_TIERS[lvl];
  var hullW=40+lvl*10, hullH=14+lvl*2, mastH=54+lvl*14;
  if(T.aura){
    var ag=ctx.createRadialGradient(0,-mastH*0.3,4,0,-mastH*0.3,hullW*1.6);
    ag.addColorStop(0,'rgba(79,195,161,'+(0.28+glowPulse*0.14)+')');ag.addColorStop(1,'rgba(79,195,161,0)');
    ctx.fillStyle=ag;ctx.beginPath();ctx.arc(0,-mastH*0.25,hullW*1.6,0,7);ctx.fill();
  }
  var shipW=(hullW*2.3), shipH=(mastH+hullH+34);
  if(drawImgFit(ASSETS.ship[lvl],0,-shipH*0.32,shipW,shipH,0)) return;
  /* ---- fallback: 이미지가 없을 때만 그리는 기존 벡터 선박 ---- */
  ctx.fillStyle=lvl>=3?'#3a2440':'#2A2F4A';
  ctx.beginPath();ctx.moveTo(-hullW,hullH);ctx.lineTo(hullW,hullH);ctx.lineTo(hullW*.68,hullH+30);ctx.lineTo(-hullW*.68,hullH+30);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(79,195,161,.5)';ctx.lineWidth=2;ctx.stroke();
  var masts=[0].concat(lvl>=2?[-hullW*0.55]:[]).concat(lvl>=3?[hullW*0.55]:[]);
  masts.forEach(function(mx,mi){
    var mh=mastH*(mi===0?1:0.72);
    ctx.fillStyle='#F5B331';ctx.fillRect(mx-2.5,-mh,5,mh+hullH+6);
    ctx.fillStyle=lvl>=3?'#F2F0EA':'#E4F7EF';
    ctx.beginPath();ctx.moveTo(mx,-mh);ctx.lineTo(mx+28,-mh*0.42+10);ctx.lineTo(mx,-mh*0.28+10);ctx.closePath();ctx.fill();
  });
  if(lvl>=3){
    ctx.fillStyle='#F0605A';ctx.beginPath();
    ctx.moveTo(0,-mastH-2);ctx.lineTo(22,-mastH+7);ctx.lineTo(0,-mastH+16);ctx.closePath();ctx.fill();
  }
  if(T.missiles>0){
    for(var pi=0;pi<T.missiles;pi++){
      var pxo=(pi-(T.missiles-1)/2)*16;
      ctx.fillStyle='rgba(79,195,161,'+(0.7+glowPulse*0.3)+')';
      ctx.beginPath();ctx.arc(pxo,hullH-2,3.2,0,7);ctx.fill();
    }
  }
}

/* ---------------- 대사 한 줄 컷인 ---------------- */
/* 영등할망 대사는 항상 한 번에 한 문장만, 화면 위쪽에 짧게 떴다 사라진다. */
function makeCutin(){
  return { text:'', until:0, from:0 };
}

/* ---------------- 카메라(흔들림/줌) ---------------- */
function makeCam(){ return { shake:0, zoom:1, zoomTo:1 }; }

function gSail(){
  openStage('영등할망의 바람');
  sfxAmbient('ocean',0.22);
  tiltX=0; tiltY=0; tiltBetaBase=null; /* 이번 판을 쥔 자세를 새 중립값으로 다시 잡는다 */
  if(window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){
    DeviceOrientationEvent.requestPermission().then(function(r){
      if(r==='granted')window.addEventListener('deviceorientation',tiltH)}).catch(function(){});
  } else window.addEventListener('deviceorientation',tiltH);

  var W=cv.width,H=cv.height,px=W/2,rocks=[],foods=[],missiles=[],debris=[],enemyShots=[],t0=performance.now(),lastNow=t0;
  /* 상하좌우 자유 이동(자이로+드래그) — 아래쪽 바닥에 붙어있지 않고 화면 중하단
     영역을 오가며 장애물을 직접 피해다닐 수 있게 세로 이동 범위를 둔다 */
  var shipYMin=H*0.38, shipYMax=H-140;
  var shipY=shipYMax, dragY=shipY;
  var spawn=900,foodSpawn=2600,debrisSpawn=6000,alive=true;
  var evoFlashUntil=0,haloSpin=0,fireTimer=0,kills=0,bossKillCount=0;
  var flashes=[],fx=[],bgParticles=[];
  var maxHearts=2,hearts=2,invulnUntil=0;
  var breakComboN=0,breakComboLast=-99;
  var ROCK_XP=3; /* 바위 하나 파괴할 때 주는 경험치 — 자동공격/폭발탄으로 죽여도 동일 적용 */
  var cam=makeCam();
  var cutin=makeCutin();
  var bigText=null; /* {a,b,until,from,kind} 화면 중앙 큰 텍스트/배너 연출 */
  var slowmoUntil=0,pauseUntil=0;

  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  var HIT_LINES=['아이고게, 정신 촐리라게!','아이고 놀란 것 좀 보라!'];
  var LV10_LINE='이제 보롬 쎄게 불거난 정신 촐리라이~';
  var END_LINES=['제라하게 보름 탈 줄 알암쪄이','오늘은 여기까지 하게마씨'];
  var BOSS_LINES=['큰 게 온다, 정신 차리라이!','저건 요망진 놈이여!'];
  var FINALBOSS_LINES=['이제 마지막 시련이여, 날 도와 이겨내라!','이 폭풍만 넘기면 진짜배기여'];
  var WIN_LINES=['허허, 여기까지 왔구나','제법이여, 잘 버텼저'];

  /* ================= Lv/EXP 시스템 ================= *
     드래곤플라이트처럼 레벨이 항상 눈에 보이고, 레벨업마다(뱀서라이크처럼)
     업그레이드 카드 3장이 뜬다. 복(보상 재화)과는 완전히 분리된 경험치다.
     초반 레벨업이 너무 느리다는 피드백으로 요구량을 한 번 더 낮췄다
     (목표: Lv10까지 대략 30초~1분). */
  var lv=1, xp=0, xpNeed=4+lv*2;
  var xpTrickle=0;
  var shipTier=0, prestige=0;
  function tierForLevel(l){ if(l>=20) return 3; if(l>=10) return 2; if(l>=5) return 1; return 0; }

  /* ---- 업그레이드 카드 — JUST(회피의 감) 삭제, 신규 5종 추가, 전부 MAX 상한 ----
     "카드가 무한히 쌓여서 절대 안 죽는다"는 문제를 해결하기 위해 레벨마다
     상한(MAX)을 두고, MAX에 도달하면 카드 풀에서 빠진다. 특정 두 카드가
     둘 다 MAX면 더 강한 특수 무기로 합쳐진다(진화 조합). */
  var upgLevel={fire:0,spread:0,heart:0,bok:0,speed:0,bomb:0,pierce:0,lightning:0,windpush:0,focus:0,shield:0};
  var UPG_MAX ={fire:5,spread:4,heart:5,bok:5,speed:5,bomb:3,pierce:3,lightning:3,windpush:3,focus:3,shield:3};
  var UPGRADES={
    fire:     {emoji:'💥', title:'포격 강화',   desc:'연사 속도가 빨라진다'},
    spread:   {emoji:'🎯', title:'다연장 확장', desc:'포탄이 더 나간다'},
    heart:    {emoji:'❤️', title:'바람의 가호', desc:'최대 체력이 늘고 즉시 회복'},
    bok:      {emoji:'🍊', title:'복바람',      desc:'복을 더 많이 받는다'},
    speed:    {emoji:'🌀', title:'급류 조타',   desc:'조작이 더 즉각적으로 반응한다'},
    bomb:     {emoji:'💣', title:'폭발탄',      desc:'바위 파괴 시 주변에도 피해'},
    pierce:   {emoji:'🌊', title:'관통탄',      desc:'포탄이 바위를 뚫고 지나간다'},
    lightning:{emoji:'⚡', title:'벼락',        desc:'주기적으로 바위를 자동 공격'},
    windpush: {emoji:'🌪', title:'영등바람',    desc:'주기적으로 주변 바위를 밀어낸다'},
    focus:    {emoji:'🔥', title:'화력 집중',   desc:'큰 상대에게 강한 한 방'},
    shield:   {emoji:'🛡', title:'바람막이',    desc:'가끔 피격을 한 번 막아준다'}
  };
  var UPG_KEYS=Object.keys(UPGRADES);
  var RARITY=[
    {key:'common',   label:'일반', p:0.70, discrete:1, color:'#8FA3B8'},
    {key:'rare',     label:'희귀', p:0.25, discrete:2, color:'#4FC3A1'},
    {key:'legendary',label:'전설', p:0.05, discrete:3, color:'#F5B331'}
  ];
  function rollRarity(){
    var r=Math.random(), acc=0;
    for(var i=0;i<RARITY.length;i++){ acc+=RARITY[i].p; if(r<acc) return RARITY[i]; }
    return RARITY[0];
  }
  /* 두 카드가 모두 MAX면 특수 무기로 진화한다 */
  var FUSION=[
    {a:'fire',b:'spread',key:'typhoon',name:'태풍포',emoji:'🌀',desc:'포탄이 관통하며 터진다'},
    {a:'bomb',b:'pierce',key:'tsunami',name:'해일포',emoji:'🌊',desc:'폭발 범위와 관통력이 크게 강화된다'}
  ];
  var fusion={};
  function checkFusions(){
    FUSION.forEach(function(f){
      if(!fusion[f.key] && upgLevel[f.a]>=UPG_MAX[f.a] && upgLevel[f.b]>=UPG_MAX[f.b]){
        fusion[f.key]=true;
        showBig('무기 진화!', f.emoji+' '+f.name+' 완성!', 1800,'fusion');
        toast('💫 '+f.name+' 완성! '+f.desc);
        sfx('fanfare',0.8);
      }
    });
  }
  function applyUpgrade(key,rarity){
    var before=upgLevel[key];
    upgLevel[key]=Math.min(UPG_MAX[key], upgLevel[key]+rarity.discrete);
    var after=upgLevel[key];
    if(key==='heart'){ var d=after-before; maxHearts+=d; hearts=Math.min(maxHearts,hearts+d); }
    toast(UPGRADES[key].emoji+' '+UPGRADES[key].title+' Lv.'+after+(after>=UPG_MAX[key]?' MAX!':'')+' ('+rarity.label+')');
    sfx('bonus',0.6);
    checkFusions();
  }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }

  var pick={open:false,options:[],until:0}; /* options: [{key,rarity}] */
  var PICK_TITLES=['바람이 하나를 골라달라 한다','요망진 걸로 골라보라이','무사 하나만 고르라!'];
  var pickTitle='';
  var upgHistory={}; /* 결과화면에 보여줄 획득 카드 집계 */
  function openPick(el){
    var pool=UPG_KEYS.filter(function(k){ return upgLevel[k]<UPG_MAX[k]; });
    if(pool.length===0) return; /* 전부 MAX면 더 뽑을 카드가 없다 */
    var keys=shuffle(pool.slice()).slice(0,Math.min(3,pool.length));
    pick.options=keys.map(function(k){ return {key:k, rarity:rollRarity()}; });
    pick.open=true; pick.until=el+8;
    pickTitle=pickRandom(PICK_TITLES);
  }
  function closePick(opt,el){
    pick.open=false;
    applyUpgrade(opt.key,opt.rarity);
    upgHistory[opt.key]=(upgHistory[opt.key]||0)+1;
  }

  /* 경험치 획득 + 레벨업 처리 — 바위 파괴/생존시간/먹거리에서 들어온다
     (근접 회피 보너스는 삭제 — 의미가 없다는 피드백 반영) */
  function gainXp(n,el){
    xp+=n;
    while(xp>=xpNeed){
      xp-=xpNeed; lv++; xpNeed=4+lv*2;
      onLevelUp(el);
    }
  }
  function onLevelUp(el){
    var newTier=tierForLevel(lv);
    if(newTier>shipTier){ evolveTo(newTier,el); }
    else if(lv===30 && finalBoss.state==='idle' && !transcended){ startFinalBoss(el); return; }
    else if(lv>30 && transcended && lv%10===0){ prestigeFlash(el); }
    openPick(el);
  }
  function prestigeFlash(el){
    prestige++;
    shake(10); zoomTo(1.15); setTimeout(function(){zoomTo(1)},480);
    sfx('fanfare',0.6);
    toast('🐉 용선 초월 Lv.'+lv+'! 위력이 더 강해졌다');
  }

  /* 조작: 탭/드래그 둘 다 "그 지점으로 배를 이동"으로 통일 — 반응이 즉각적이어야 하므로.
     단, 선택 카드가 떠 있을 때는 탭 좌표로 카드를 고르는 용도로 쓴다. */
  var dragging=false, dragX=px;
  function evX(e){ var r=cv.getBoundingClientRect(); return (e.clientX-r.left)*(W/r.width); }
  function evY(e){ var r=cv.getBoundingClientRect(); return (e.clientY-r.top)*(H/r.height); }
  cv.onpointerdown=function(e){
    var x=evX(e);
    if(ending && endingWon){
      var elNow=(performance.now()-t0)/1000;
      if(elNow-endingT0>1.5){
        var y=evY(e);
        var ebY=H*0.28+48+5*36+30, ebW=W*0.42, ebH=52, ebGap=14;
        var eb1X=W/2-ebW-ebGap/2, eb2X=W/2+ebGap/2;
        if(y>=ebY && y<=ebY+ebH){
          if(x>=eb1X && x<=eb1X+ebW){ alive=false; finishSail(elNow,kills); return; }
          if(x>=eb2X && x<=eb2X+ebW){
            transcended=true; ending=false; finalBoss.state='idle'; finalBoss.cycle=0;
            hearts=Math.max(hearts,1); invulnUntil=elNow+1.2;
            toast('🌊 초월 항해 시작 — 기록에 도전하라!'); sfx('fanfare',0.7);
            return;
          }
        }
      }
      return; /* 승리 결과 화면이 떠 있는 동안엔 탭해도 배가 움직이지 않는다 */
    }
    if(pick.open){
      var cwp=W/pick.options.length;
      var idx=Math.min(pick.options.length-1,Math.max(0,Math.floor(x/cwp)));
      closePick(pick.options[idx], (performance.now()-t0)/1000);
      return;
    }
    dragging=true; dragX=Math.max(50,Math.min(W-50,x)); dragY=Math.max(shipYMin,Math.min(shipYMax,evY(e)));
  };
  cv.onpointermove=function(e){ if(dragging){ dragX=Math.max(50,Math.min(W-50,evX(e))); dragY=Math.max(shipYMin,Math.min(shipYMax,evY(e))); } };
  cv.onpointerup=function(){dragging=false};
  cv.onpointercancel=function(){dragging=false};

  /* ---- 페이즈 트리거 ---- */
  var tutorialDone=false;
  var boss={state:'idle',announceUntil:0,hp:0,maxHp:5,x:0,y:0,r:92,v:1.15,asset:null,nextAt:34,flashUntil:0};
  var finaleUntil=0,inFinale=false,finaleKills=0;
  var awakened=false;
  var ending=false,endingT0=0,endingWon=false;
  var finalBoss={state:'idle',announceUntil:0,stormUntil:0,breakUntil:0,assaultUntil:0,cycle:0,cycles:3,orbs:[],hp:0};
  var transcended=false;
  var lightningTimer=2000, windpushTimer=4000, shieldTimer=8000, shieldCharge=0;

  function showCutin(text,dur,freeze){ cutin.text=text; cutin.from=performance.now(); cutin.until=cutin.from+dur; cutin.freeze=!!freeze; }
  function showBig(a,b,dur,kind){ bigText={a:a,b:b,from:performance.now(),until:performance.now()+dur,kind:kind}; }
  function shake(v){ cam.shake=Math.max(cam.shake,v); }
  function zoomTo(v){ cam.zoomTo=v; }
  function triggerEnding(el,won){
    if(ending) return;
    ending=true; endingT0=el; endingWon=!!won;
    showCutin(pickRandom(won?WIN_LINES:END_LINES),2000);
  }
  function startFinalBoss(el){
    /* Lv30 — 영등할망이 내는 마지막 시련. 적대적인 존재가 아니라 통과해야 할
       거대한 폭풍이라는 설정이라, 이겨내면 영등할망이 인정해주는 흐름으로 이어진다 */
    finalBoss.state='announce'; finalBoss.announceUntil=el+2.2; finalBoss.cycle=0;
    showCutin(pickRandom(FINALBOSS_LINES),2200,true);
  }

  var lightningFlashEl=$('#lightningFlash');
  function flashLightning(){
    if(!lightningFlashEl) return;
    lightningFlashEl.classList.remove('on');
    void lightningFlashEl.offsetWidth; /* 리플로우를 강제해서 연속으로 쳐도 애니메이션이 다시 재생되게 */
    lightningFlashEl.classList.add('on');
  }
  function explodeRock(x,y,r,big){
    flashes.push({x:x,y:y,t:0,r0:r*0.3,r1:r*(big?2.3:1.8)});
    var n=big?18:12;
    for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      fx.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:1,c:i%2?'#4FC3A1':'#F2F0EA',sz:3+Math.random()*3});}
  }

  function playEvoBanner(el){
    var T=SHIP_TIERS[shipTier];
    evoFlashUntil=el+1.4;
    sfx('evolve',0.8);
    slowmoUntil=el+0.38; zoomTo(1.16); shake(6);
    showBig('바람이 모인다...', T.name+'(으)로 진화!', 1300, 'evo'+shipTier);
    toast('⚓ Lv.'+lv+' — '+T.name+'(으)로 진화! '+(T.missiles>0?'자동 포격 시작':''));
    setTimeout(function(){zoomTo(1)},420);
  }
  function evolveTo(newTier,el){
    shipTier=newTier;
    var T=SHIP_TIERS[shipTier];
    if(shipTier===2){
      /* Lv10 — "2막 시작": 대사가 먼저 뜨고(그동안 완전 정지), 끝나야 진화 배너가 이어진다.
         이 순간부터 미니보스가 등장할 수 있고 호밍 바위도 섞이기 시작한다 */
      showCutin(LV10_LINE,1900,true);
      setTimeout(function(){ playEvoBanner((performance.now()-t0)/1000); },1900);
    } else if(shipTier<SHIP_TIERS.length-1){
      playEvoBanner(el);
    } else {
      /* 최종 각성 — 용선(龍船). 각성 후에도 게임은 끝나지 않고 무쌍 구간만 지나면
         그대로 용선으로 계속 플레이한다(죽어야 끝나게 해달라는 요청 반영) */
      awakened=true;
      pauseUntil=el+0.5; zoomTo(1.3); shake(14);
      sfx('fanfare',0.85);
      showBig('영등의 바람이 깃들었다','용선(龍船) 각성',2200,'awaken');
      toast('🐉 Lv.'+lv+' — 용선 각성! 무쌍이 시작됩니다');
      finaleUntil=el+0.5+5.0; inFinale=true;
      setTimeout(function(){zoomTo(1.08)},700);
    }
  }

  /* 시작하자마자 영등할망이 큰 글씨로 한 마디 — 이 동안은 게임이 완전히 멈춰 있다 */
  showCutin('이레 저레 움직영 보름 타보라이!',2200,true);

  var wave=0;
  function loop(now){
    if(!alive)return;
    var dt=Math.min(48,now-lastNow); lastNow=now;
    var el=(now-t0)/1000;
    /* 슬로모/완전정지 연출 구간에서는 dt를 줄여 시간 자체를 늘어뜨린다 */
    var dtScale=1;
    if(el<pauseUntil) dtScale=0.02;
    else if(el<slowmoUntil) dtScale=0.22;
    var sdt=dt*dtScale;
    var frameK=sdt/16.67;

    /* 카드 선택/이벤트 알림/대사가 떠 있는 동안은 게임이 완전히 멈춰야 한다는
       요청 반영 — 배 이동부터 바위·먹거리·포격까지 전부 이 플래그로 묶는다 */
    var frozen = pick.open || boss.state==='announce' || (cutin.freeze && cutin.until>performance.now());

    /* ---- 조작 입력 ---- (얼어있는 동안엔 배가 움직이지 않는다)
       배를 조심조심 몰아가는 느낌을 위해 반응 속도를 전체적으로 낮췄고,
       좌우뿐 아니라 상하로도 움직여서 장애물을 직접 피해다닐 수 있다 */
    if(!frozen){
      if(dragging){
        var followK=Math.min(1,(0.14+upgLevel.speed*0.025)*frameK);
        px += (dragX-px)*followK;
        shipY += (dragY-shipY)*followK;
      } else {
        var tiltPow=(5+upgLevel.speed*0.8)*frameK;
        if(Math.abs(tiltX)>0.02) px += tiltX*tiltPow;
        if(Math.abs(tiltY)>0.02) shipY -= tiltY*tiltPow;
      }
    }
    /* 배 이미지 폭이 진화할수록 커지므로(특히 용선) 화면 가장자리에서 잘리지 않게 여백도 같이 늘린다 */
    var shipMargin=Math.max(50,(40+shipTier*10)*1.15+8);
    px=Math.max(shipMargin,Math.min(W-shipMargin,px));
    shipY=Math.max(shipYMin,Math.min(shipYMax,shipY));

    var T=SHIP_TIERS[shipTier];

    /* ================= 페이즈 트리거 ================= */
    if(!tutorialDone && (el>=5 || rocks.some(function(r){return r.passed}))) tutorialDone=true;

    if(pick.open && el>=pick.until){
      /* 방치 시 자동으로 하나 골라준다(행사장에서 멈춰있지 않게) */
      closePick(pickRandom(pick.options), el);
    }

    /* 미니보스 — 알림 문구가 뜨는 동안 완전히 멈춘 뒤 등장한다. 레벨이 오를수록 더 자주 나온다 */
    if(boss.state==='idle' && el>=boss.nextAt && !frozen && lv>=10 && finalBoss.state==='idle'){
      boss.state='announce'; boss.announceUntil=el+1.5;
      showCutin(pickRandom(BOSS_LINES),1500,true);
    }
    if(boss.state==='announce' && el>=boss.announceUntil){
      boss.state='alive'; boss.hp=5; boss.maxHp=5;
      boss.x=Math.max(shipMargin,Math.min(W-shipMargin,W/2)); boss.y=-140; boss.r=92;
      boss.v=1.0+Math.min(1.2,lv*0.03);
      boss.asset=ASSETS.bossVortex;
      toast('👹 거대 바위 출현! 대포로 부숴라');
      sfx('boom',0.5);
    }

    /* 각성 무쌍 구간이 끝나면 게임을 끝내지 않고 그대로 용선으로 계속 진행한다 */
    if(inFinale && el>=finaleUntil){ inFinale=false; }

    /* 죽어야만 끝난다 — 시간 강제종료 안전장치 없음(개인용 앱이라 대기열 문제 없음).
       단, 완주(승리) 시에는 "항해 완료" 또는 "초월 항해"를 직접 탭해서 골라야 하므로
       자동 종료하지 않고, 방치될 때만을 위한 넉넉한 대기열 타임아웃만 둔다 */
    if(ending && !endingWon && el-endingT0>3.6 && alive){
      alive=false; finishSail(el,kills); return;
    }
    if(ending && endingWon && el-endingT0>20 && alive){
      alive=false; finishSail(el,kills); return;
    }

    var suspendSpawn = frozen;

    if(!suspendSpawn && !inFinale && !ending){
      /* 10레벨까지는 튜토리얼 수준으로 계속 쉬워야 한다는 요청 — 스폰 간격도
         튜토리얼과 같은 배율을 유지하고, 시간/레벨에 따른 상승폭은 거의 없앤다 */
      var diffEase = lv<10 ? 0.1 : 1;
      var spawnRate = (tutorialDone && lv>=10) ? 1 : 0.45;
      spawn-=sdt;
      if(spawn<=0){
        /* "피하기 게임인데 못 피한다"는 피드백 반영 — 스폰 간격 최저치와 낙하속도 상한을
           크게 올려서 레벨/시간이 아무리 쌓여도 실제로 빠져나갈 틈이 남게 한다 */
        spawn=Math.max(420,(620-el*10*diffEase-lv*2*diffEase)/spawnRate);
        var rk=Math.floor(Math.random()*ASSETS.rockPool.length);
        /* 호밍 바위 — Lv10부터 등장, 지그재그 바위와는 겹치지 않게 서로 배타적으로 뽑는다 */
        var homing = lv>=10 && Math.random()<0.3;
        var zz = !homing && lv>=10 && Math.random()<0.35;
        rocks.push({x:60+Math.random()*(W-120),y:-60,r:32+Math.random()*26,v:Math.min(lv<10?4.2:7.5, 3.2+el*0.05*diffEase+lv*0.08*diffEase),asset:ASSETS.rockPool[rk],passed:false,dead:false,zigzag:zz,zzPhase:Math.random()*Math.PI*2,homing:homing});
      }
      foodSpawn-=sdt;
      if(foodSpawn<=0){
        foodSpawn=(el<12?3200:4800)+Math.random()*2200;
        var roll=Math.random(),kind='rice',asset=ASSETS.foodRice;
        if(roll<0.12){kind='bag';asset=ASSETS.foodBag;}
        else if(roll<0.42){kind='tangerine';asset=ASSETS.foodTangerine;}
        foods.push({x:60+Math.random()*(W-120),y:-40,r:26,v:2.4+el*0.04,kind:kind,asset:asset});
      }
      /* 생존 시간에 따른 아주 조금씩의 경험치 — 드래곤플라이트처럼 가만히 있어도 조금은 큰다 */
      xpTrickle+=sdt;
      if(xpTrickle>=650){ xpTrickle-=650; gainXp(1,el); }

      /* 🗑 해양쓰레기 몬스터 — Lv21부터 등장하는 첫 공격형 몬스터. 좌우로 흔들리며
         내려오다 주기적으로 배를 향해 파편을 쏜다 */
      if(lv>=21){
        debrisSpawn-=sdt;
        if(debrisSpawn<=0){
          debrisSpawn=Math.max(3200,7000-lv*60);
          var dk=Math.floor(Math.random()*ASSETS.debrisPool.length);
          debris.push({x:60+Math.random()*(W-120),y:-70,r:36,v:1.6+Math.min(1.4,(lv-21)*0.05),swayPhase:Math.random()*Math.PI*2,asset:ASSETS.debrisPool[dk],hp:3,shotTimer:1800+Math.random()*800,dead:false});
        }
      }

      /* 조각배(1단계)는 원래 포격이 없지만 Lv2부터는 자동으로 포탄 1개가 나가고,
         다연장 확장 카드를 고르면 그 즉시 1개씩 더 늘어난다(1→2→3개) */
      var baseShot = (shipTier===0 && lv>=2) ? 1 : 0;
      var mc=T.missiles+baseShot+upgLevel.spread;
      if(mc>0){
        fireTimer-=sdt;
        if(fireTimer<=0){
          var baseFireEvery = T.fireEvery>0 ? T.fireEvery : 1.4;
          fireTimer=baseFireEvery*1000*Math.pow(0.85,upgLevel.fire);
          beep(880,0.06,'sawtooth',0.09);
          var pierceHp=1+upgLevel.pierce+(fusion.typhoon?3:0)+(fusion.tsunami?3:0);
          for(var mi=0;mi<mc;mi++){
            /* 포탄이 2발 이상인데 spread각이 0이면 전부 같은 궤적에 겹쳐 보여서
               "늘어나도 안 늘어난 것처럼" 보이는 문제가 있었다 — 최소 각도를 보장 */
            var ang=(mi-(mc-1)/2)*(Math.max(T.spread,10)*Math.PI/180);
            missiles.push({x:px,y:shipY-30,vx:Math.sin(ang)*3,vy:-9-shipTier,hp:pierceHp});
          }
        }
      }

      /* ⚡ 벼락 — 조준 없이 주기적으로 화면의 바위 하나를 자동으로 파괴한다.
         번쩍이는 연출은 캔버스에 직접 그리지 않고 캔버스 위 오버레이 div를
         CSS 애니메이션으로 잠깐 켰다 끄는 방식으로 가볍게 처리한다 */
      if(upgLevel.lightning>0){
        lightningTimer-=sdt;
        if(lightningTimer<=0){
          lightningTimer=Math.max(800,3000-upgLevel.lightning*700);
          var aliveRocks=rocks.filter(function(r){return !r.dead;});
          if(aliveRocks.length>0){
            var target=pickRandom(aliveRocks);
            target.dead=true; explodeRock(target.x,target.y,target.r);
            sfx('pop',0.4); kills++; gainXp(ROCK_XP,el);
            flashLightning();
          }
        }
      }
      /* 🌪 영등바람 — 주기적으로 배 주변 바위를 한번에 밀어낸다(파괴) */
      if(upgLevel.windpush>0){
        windpushTimer-=sdt;
        if(windpushTimer<=0){
          windpushTimer=Math.max(2500,6000-upgLevel.windpush*1200);
          var radius=80+upgLevel.windpush*40, pushed=0;
          rocks.forEach(function(r){
            if(!r.dead && Math.hypot(r.x-px,r.y-shipY)<radius){ r.dead=true; explodeRock(r.x,r.y,r.r); pushed++; }
          });
          if(pushed>0){ kills+=pushed; gainXp(pushed*ROCK_XP,el); sfx('evolve',0.3); shake(3); toast('🌪 영등바람이 불었다!'); }
        }
      }
      /* 🛡 바람막이 — 주기적으로 보호막 1회분을 충전한다 */
      if(upgLevel.shield>0 && shieldCharge<1){
        shieldTimer-=sdt;
        if(shieldTimer<=0){
          shieldTimer=Math.max(10000,25000-upgLevel.shield*5000);
          shieldCharge=1;
          toast('🛡 바람막이 준비됨');
        }
      }
    }
    if(inFinale){
      /* 무쌍 타임 — 사격 속도를 극단적으로 올려 화면을 정리한다 */
      fireTimer-=sdt;
      if(fireTimer<=0){
        fireTimer=Math.max(70,T.fireEvery*1000*0.22*Math.pow(0.85,upgLevel.fire));
        beep(920,0.05,'sawtooth',0.08);
        var mcf=T.missiles+upgLevel.spread+1;
        var pierceHpF=1+upgLevel.pierce+(fusion.typhoon?3:0)+(fusion.tsunami?3:0);
        for(var mf=0;mf<mcf;mf++){
          var angf=(mf-(mcf-1)/2)*((T.spread+10)*Math.PI/180);
          missiles.push({x:px,y:shipY-30,vx:Math.sin(angf)*3.4,vy:-12,hp:pierceHpF});
        }
      }
      spawn-=sdt;
      if(spawn<=0){
        spawn=170;
        var rk2=Math.floor(Math.random()*ASSETS.rockPool.length);
        rocks.push({x:60+Math.random()*(W-120),y:-60,r:28+Math.random()*22,v:6.2,asset:ASSETS.rockPool[rk2],passed:false,dead:false,noHit:true});
      }
    }

    /* ================= 배경 ================= */
    ctx.save();
    /* 카메라 흔들림/줌 */
    cam.zoom += (cam.zoomTo-cam.zoom)*0.16;
    cam.shake *= 0.90; if(cam.shake<0.05) cam.shake=0;
    var shx=(Math.random()*2-1)*cam.shake, shy=(Math.random()*2-1)*cam.shake;
    /* 화면 중앙이 아니라 배 위치를 기준으로 확대해야 한다 — 배가 화면 아래쪽에
       있는 상태로 중앙 기준 줌을 걸면 확대할수록 배가 화면 밖으로 밀려나 잘려 보였다 */
    ctx.translate(px,shipY);
    ctx.scale(cam.zoom,cam.zoom);
    ctx.translate(-px+shx,-shipY+shy);

    ctx.clearRect(-40,-40,W+80,H+80);
    var g=ctx.createLinearGradient(0,0,0,H);
    if(inFinale){g.addColorStop(0,'#152040');g.addColorStop(1,'#050814');}
    else {g.addColorStop(0,'#181B2E');g.addColorStop(1,'#0F1120');}
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

    /* 먼 바다 안개 */
    ctx.fillStyle='rgba(150,190,210,0.05)';
    ctx.fillRect(0,0,W,H*0.35);

    /* 파도 레이어(속도 다른 3겹) + 배 진행감 */
    var speedFeel=1+ (inFinale?0.9:0);
    wave+=.035*frameK*speedFeel;
    [ [0.12,7,24,9], [0.08,5,34,13], [0.05,4,46,19] ].forEach(function(cfg,li){
      ctx.strokeStyle='rgba(79,195,161,'+cfg[0]+')';ctx.lineWidth=2.4;
      var rows=cfg[1];
      for(var i=0;i<rows;i++){ctx.beginPath();
        for(var x=0;x<=W;x+=26)ctx.lineTo(x,i*H/rows+Math.sin(x/cfg[2]+wave*(1+li*0.3)+i)*cfg[3]);ctx.stroke();}
    });

    /* 배경 파티클 — 물보라/바람 방향 미세 입자, 최대 개수 제한 */
    if(bgParticles.length<46 && Math.random()<0.55*frameK){
      bgParticles.push({x:Math.random()*W,y:H+10,vy:-(1.2+Math.random()*1.6)*speedFeel,vx:(Math.random()*0.6-0.3),l:1,sz:2+Math.random()*3});
    }
    bgParticles.forEach(function(p){p.x+=p.vx*frameK;p.y+=p.vy*frameK;p.l-=0.006*frameK;});
    bgParticles=bgParticles.filter(function(p){return p.l>0 && p.y>-20});
    bgParticles.forEach(function(p){
      ctx.globalAlpha=Math.max(0,p.l)*0.5;
      if(!drawImgFit(ASSETS.windParticle,p.x,p.y,p.sz*3,p.sz*3,0)){
        ctx.fillStyle='#BFEEDC';ctx.beginPath();ctx.arc(p.x,p.y,p.sz,0,7);ctx.fill();
      }
      ctx.globalAlpha=1;
    });

    var hit=false;

    /* ---- 미니보스 ---- */
    if(boss.state==='alive'){
      if(!frozen) boss.y+=boss.v*frameK*2.6;
      if(!drawImgFit(boss.asset,boss.x,boss.y,boss.r*2.3,boss.r*2.4,0)){
        ctx.fillStyle='#2A2F4A';ctx.beginPath();
        ctx.moveTo(boss.x-boss.r,boss.y+boss.r);ctx.lineTo(boss.x,boss.y-boss.r);ctx.lineTo(boss.x+boss.r,boss.y+boss.r);ctx.closePath();ctx.fill();
      }
      /* 체력바 */
      var bbw=140;
      ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(boss.x-bbw/2,boss.y-boss.r-26,bbw,10);
      ctx.fillStyle='#F0605A';ctx.fillRect(boss.x-bbw/2+2,boss.y-boss.r-24,(bbw-4)*Math.max(0,boss.hp/boss.maxHp),6);
      if(el<boss.flashUntil){ ctx.globalAlpha=0.5; ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(boss.x,boss.y,boss.r*1.1,0,7); ctx.fill(); ctx.globalAlpha=1; }
      for(var bmi=missiles.length-1;bmi>=0;bmi--){
        var bm=missiles[bmi];
        if(Math.hypot(bm.x-boss.x,bm.y-boss.y)<boss.r+8){
          /* 🔥 화력 집중 — 보스에게는 한 발당 데미지가 더 크다 */
          boss.hp-=(1+upgLevel.focus);
          missiles.splice(bmi,1); boss.flashUntil=el+0.08; shake(3);
          sfx('pop',0.4);
          if(boss.hp<=0){
            explodeRock(boss.x,boss.y,boss.r,true); sfx('boom',0.7); shake(12);
            kills+=3; bossKillCount++; gainXp(30,el); giveBok(20);
            showBig('BREAK ×보스!','',1000,'break');
            toast('👹 거대 바위 격파! 큰 보상 획득');
            boss.state='idle'; boss.nextAt=el+Math.max(20,45-lv*0.6);
            break;
          }
        }
      }
      if(boss.state==='alive'){
        var bdx=Math.abs(boss.x-px), bdy=Math.abs(boss.y-shipY);
        if(bdx<boss.r+30 && bdy<boss.r+34){ hit=true; }
        if(boss.y>H+160){ boss.state='idle'; boss.nextAt=el+Math.max(20,45-lv*0.6); }
      }
    }

    /* ---- 최종 시련 (Lv30) — 폭풍 회피 → 바람구슬 파괴 → 약점 노출 → 총공격,
       이 네 단계를 finalBoss.cycles번 반복하면 완주. 적이 아니라 마지막으로
       통과해야 할 거대한 시련이라는 설정이라 이겨내면 영등할망이 인정해준다 */
    if(finalBoss.state==='announce' && el>=finalBoss.announceUntil){
      finalBoss.state='storm'; finalBoss.stormUntil=el+(finalBoss.cycle===0?15:11);
      toast('폭풍 속을 버텨내라!');
    }
    if(finalBoss.state==='storm' && el>=finalBoss.stormUntil){
      finalBoss.state='orbs';
      var ow=W*0.24;
      finalBoss.orbs=[
        {x:Math.max(shipMargin,W*0.5-ow),y:170,r:44,hp:4,maxHp:4,dead:false},
        {x:W*0.5,                         y:130,r:44,hp:4,maxHp:4,dead:false},
        {x:Math.min(W-shipMargin,W*0.5+ow),y:170,r:44,hp:4,maxHp:4,dead:false}
      ];
      showBig('바람구슬을 전부 파괴하라!','',1400,'break');
      sfx('boom',0.5); shake(6);
    }
    if(finalBoss.state==='orbs'){
      finalBoss.orbs.forEach(function(o){
        if(o.dead) return;
        if(!drawImgFit(ASSETS.windOrb,o.x,o.y,o.r*2.1,o.r*2.1,el*1.4)){
          ctx.fillStyle='rgba(150,210,255,.9)';ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,7);ctx.fill();
        }
        var obw=o.r*1.6;
        ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(o.x-obw/2,o.y-o.r-18,obw,7);
        ctx.fillStyle='#4FC3A1';ctx.fillRect(o.x-obw/2+2,o.y-o.r-16,(obw-4)*Math.max(0,o.hp/o.maxHp),3);
        for(var omi=missiles.length-1;omi>=0;omi--){
          var om=missiles[omi];
          if(Math.hypot(om.x-o.x,om.y-o.y)<o.r+8){
            o.hp-=(1+upgLevel.focus); missiles.splice(omi,1); sfx('pop',0.4); shake(2);
            if(o.hp<=0){ o.dead=true; explodeRock(o.x,o.y,o.r,true); sfx('boom',0.5); kills++; gainXp(ROCK_XP*3,el); }
            break;
          }
        }
        var oddx=Math.abs(o.x-px), oddy=Math.abs(o.y-shipY);
        if(oddx<o.r+30 && oddy<o.r+34){ hit=true; }
      });
      if(finalBoss.orbs.every(function(o){return o.dead;})){
        finalBoss.state='break'; finalBoss.breakUntil=el+1.0;
        showBig('약점 노출!','',1000,'break'); shake(8); sfx('evolve',0.4);
      }
    }
    if(finalBoss.state==='break' && el>=finalBoss.breakUntil){
      finalBoss.state='assault'; finalBoss.assaultUntil=el+3.0; finalBoss.hp=6;
      toast('지금이다! 총공격!'); sfx('fanfare',0.5);
    }
    if(finalBoss.state==='assault'){
      var coreY=150;
      if(!drawImgFit(ASSETS.windOrb,W/2,coreY,150,150,el*2)){
        ctx.fillStyle='rgba(255,140,135,.9)';ctx.beginPath();ctx.arc(W/2,coreY,74,0,7);ctx.fill();
      }
      for(var fmi=missiles.length-1;fmi>=0;fmi--){
        var fm=missiles[fmi];
        if(Math.hypot(fm.x-W/2,fm.y-coreY)<82){
          finalBoss.hp-=(1+upgLevel.focus); missiles.splice(fmi,1); sfx('pop',0.4); shake(3);
        }
      }
      var cddx=Math.abs(W/2-px), cddy=Math.abs(coreY-shipY);
      if(cddx<100 && cddy<80){ hit=true; }
      if(el>=finalBoss.assaultUntil){
        finalBoss.cycle++;
        if(finalBoss.cycle>=finalBoss.cycles){
          finalBoss.state='idle';
          explodeRock(W/2,coreY,120,true); sfx('boom',0.8); shake(16);
          triggerEnding(el,true);
        } else {
          finalBoss.state='storm'; finalBoss.stormUntil=el+11;
          toast('다시 폭풍이 온다!');
        }
      }
    }

    /* ---- 해양쓰레기 몬스터 (Lv21+) ---- */
    debris.forEach(function(dm){
      if(!frozen){
        dm.y+=dm.v*frameK*2.6;
        dm.x=Math.max(50,Math.min(W-50, dm.x+Math.sin(el*2+dm.swayPhase)*1.1*frameK));
      }
      if(!drawImgFit(dm.asset,dm.x,dm.y,dm.r*2.2,dm.r*2.2,0)){
        ctx.fillStyle='#5A4A32';ctx.beginPath();ctx.arc(dm.x,dm.y,dm.r,0,7);ctx.fill();
      }
      if(!frozen && !dm.dead){
        for(var dmi=missiles.length-1;dmi>=0;dmi--){
          var dmm=missiles[dmi];
          if(Math.hypot(dmm.x-dm.x,dmm.y-dm.y)<dm.r+10){
            /* 🔥 화력 집중 — 보스와 동일하게 한 발당 데미지가 더 크다 */
            dm.hp-=(1+upgLevel.focus);
            dmm.hp--; if(dmm.hp<=0) missiles.splice(dmi,1);
            sfx('pop',0.4); shake(1.6);
            if(dm.hp<=0){
              dm.dead=true;
              explodeRock(dm.x,dm.y,dm.r,false); sfx('boom',0.45);
              kills++; gainXp(ROCK_XP*2,el); giveBok(3);
              break;
            }
          }
        }
      }
      if(!frozen && !dm.dead){
        dm.shotTimer-=sdt;
        if(dm.shotTimer<=0){
          dm.shotTimer=2200+Math.random()*1000;
          var sang=Math.atan2(shipY-dm.y,px-dm.x);
          enemyShots.push({x:dm.x,y:dm.y,vx:Math.cos(sang)*3.4,vy:Math.sin(sang)*3.4,dead:false});
          sfx('pop',0.3);
        }
        var ddx=Math.abs(dm.x-px), ddy=Math.abs(dm.y-shipY);
        if(ddx<dm.r+30 && ddy<dm.r+34){ hit=true; }
      }
    });
    debris=debris.filter(function(dm){ return !dm.dead && dm.y<H+100; });

    /* 해양쓰레기가 쏘는 파편 — 배의 청록색 포탄과 구분되도록 보라색 계열로 그린다 */
    enemyShots.forEach(function(es){
      if(!frozen){ es.x+=es.vx*frameK; es.y+=es.vy*frameK; }
      if(!drawImgFit(ASSETS.enemyShot,es.x,es.y,32,58,Math.atan2(es.vy,es.vx)+Math.PI/2)){
        ctx.save();ctx.translate(es.x,es.y);ctx.rotate(Math.atan2(es.vy,es.vx));
        var eg=ctx.createLinearGradient(-10,0,10,0);
        eg.addColorStop(0,'#3A1410');eg.addColorStop(1,'#E0645A');
        ctx.fillStyle=eg;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,5);ctx.lineTo(-6,-5);ctx.closePath();ctx.fill();
        ctx.restore();
      }
      if(!frozen){
        var edx=Math.abs(es.x-px), edy=Math.abs(es.y-shipY);
        if(edx<28 && edy<32){ hit=true; es.dead=true; }
      }
    });
    enemyShots=enemyShots.filter(function(es){ return !es.dead && es.x>-40 && es.x<W+40 && es.y>-40 && es.y<H+40; });

    if(!suspendSpawn){
      /* 미사일 이동 + 명중 판정 */
      missiles.forEach(function(m){m.x+=m.vx*frameK;m.y+=m.vy*frameK*2.6});
      missiles=missiles.filter(function(m){return m.y>-40});
      rocks.forEach(function(r){
        r.y+=r.v*frameK*2.6;
        if(r.zigzag) r.x+=Math.sin(el*3+r.zzPhase)*1.4*frameK;
        /* 호밍 바위 — 별도 투사체 없이 기존 바위 이동에 배 쪽으로 살짝 쏠리는 유도만 더한다 */
        if(r.homing) r.x=Math.max(30,Math.min(W-30, r.x+(px-r.x)*0.018*frameK));
        for(var mi2=missiles.length-1;mi2>=0;mi2--){
          var m=missiles[mi2];
          if(!r.dead&&Math.hypot(m.x-r.x,m.y-r.y)<r.r+10){
            r.dead=true;
            m.hp--; if(m.hp<=0) missiles.splice(mi2,1); /* 🌊 관통탄 — hp가 남아있으면 계속 날아간다 */
            explodeRock(r.x,r.y,r.r,inFinale);sfx('pop',0.45);kills++;
            gainXp(ROCK_XP,el);
            /* 💣 폭발탄 — 주변 바위도 같이 파괴 */
            var bombRadius=(upgLevel.bomb>0?40+upgLevel.bomb*30:0)+(fusion.typhoon?50:0)+(fusion.tsunami?80:0);
            if(bombRadius>0){
              rocks.forEach(function(r2){
                if(r2!==r && !r2.dead && Math.hypot(r2.x-r.x,r2.y-r.y)<bombRadius){
                  r2.dead=true; explodeRock(r2.x,r2.y,r2.r); kills++; gainXp(ROCK_XP,el);
                }
              });
            }
            if(inFinale){
              finaleKills++;
              if(finaleKills===7||finaleKills===12||finaleKills===18||finaleKills%25===0) showBig('BREAK ×'+finaleKills,'',700,'break');
            } else {
              if(el-breakComboLast<0.7) breakComboN++; else breakComboN=1;
              breakComboLast=el;
              if(breakComboN>=2) showBig('BREAK ×'+breakComboN,'',600,'break');
              shake(2.2);
            }
          }
        }
      });
      rocks=rocks.filter(function(r){
        if(r.dead)return false;
        if(!drawImgFit(r.asset,r.x,r.y,r.r*2.2,r.r*2.3,0)){
          ctx.fillStyle='#2A2F4A';ctx.beginPath();
          ctx.moveTo(r.x-r.r,r.y+r.r);ctx.lineTo(r.x,r.y-r.r);ctx.lineTo(r.x+r.r,r.y+r.r);ctx.closePath();ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.14)';ctx.beginPath();
          ctx.moveTo(r.x,r.y-r.r);ctx.lineTo(r.x+r.r*.5,r.y+r.r*.2);ctx.lineTo(r.x,r.y+r.r*.4);ctx.closePath();ctx.fill();
        }
        var dx=Math.abs(r.x-px), dy=Math.abs(r.y-shipY);
        if(dx<r.r+30 && dy<r.r+34){ if(!r.noHit) hit=true; }
        if(!r.passed && r.y>shipY+40){ r.passed=true; }
        return r.y<H+90;
      });
      missiles.forEach(function(m){
        var ang=Math.atan2(m.vy,m.vx);
        if(!drawImgFit(ASSETS.cannonShot,m.x,m.y,34,16,ang)){
          ctx.save();ctx.translate(m.x,m.y);
          var mg=ctx.createLinearGradient(0,-14,0,10);
          mg.addColorStop(0,'#F2F0EA');mg.addColorStop(1,'#4FC3A1');
          ctx.fillStyle=mg;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(4,6);ctx.lineTo(-4,6);ctx.closePath();ctx.fill();
          ctx.restore();
        }
      });
    } else {
      rocks.forEach(function(r){
        if(!drawImgFit(r.asset,r.x,r.y,r.r*2.2,r.r*2.3,0)){
          ctx.fillStyle='#2A2F4A';ctx.beginPath();
          ctx.moveTo(r.x-r.r,r.y+r.r);ctx.lineTo(r.x,r.y-r.r);ctx.lineTo(r.x+r.r,r.y+r.r);ctx.closePath();ctx.fill();
        }
      });
    }

    /* 파괴 이펙트 */
    flashes.forEach(function(fl){fl.t+=frameK;var p=Math.min(1,fl.t/14);var rad=fl.r0+(fl.r1-fl.r0)*p;
      ctx.globalAlpha=1-p;
      if(!drawImgFit(ASSETS.rockExplosion,fl.x,fl.y,rad*2.4,rad*2.4,0)){
        var fg=ctx.createRadialGradient(fl.x,fl.y,0,fl.x,fl.y,rad);
        fg.addColorStop(0,'rgba(220,250,255,.9)');fg.addColorStop(.5,'rgba(79,195,161,.5)');fg.addColorStop(1,'rgba(79,195,161,0)');
        ctx.fillStyle=fg;ctx.beginPath();ctx.arc(fl.x,fl.y,rad,0,7);ctx.fill();
      }
      ctx.globalAlpha=1});
    flashes=flashes.filter(function(fl){return fl.t/14<1});
    if(fx.length>90) fx.splice(0,fx.length-90);
    fx.forEach(function(p){p.x+=p.vx*2*frameK;p.y+=p.vy*2*frameK;p.vy+=.1*frameK;p.l-=.05*frameK;
      ctx.globalAlpha=Math.max(0,p.l);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.sz||5,0,7);ctx.fill();ctx.globalAlpha=1});
    fx=fx.filter(function(p){return p.l>0});

    /* 먹거리 — 얼어있는 동안엔 떨어지지도, 먹히지도 않는다 */
    foods.forEach(function(f){
      if(!frozen) f.y+=f.v*2.4*frameK;
      if(!drawImgFit(f.asset,f.x,f.y,f.r*2.1,f.r*2.1,0)){
        ctx.save();ctx.translate(f.x,f.y);
        var fg2=ctx.createRadialGradient(-f.r*.3,-f.r*.3,2,0,0,f.r);
        fg2.addColorStop(0,'#E4F7EF');fg2.addColorStop(1,'#4FC3A1');
        ctx.fillStyle=fg2;ctx.beginPath();ctx.arc(0,0,f.r,0,7);ctx.fill();
        ctx.restore();
      }
      var dx=Math.abs(f.x-px), dy=Math.abs(f.y-shipY);
      if(!frozen && !f.eaten && dx<f.r+30 && dy<f.r+34){
        f.eaten=true;
        var val = f.kind==='bag'?5:(f.kind==='tangerine'?2:1);
        var xpVal = f.kind==='bag'?10:(f.kind==='tangerine'?5:3);
        giveBok(val);
        gainXp(xpVal,el);
        sfx('bonus',0.5); shake(1.2);
        zoomTo(1.05); setTimeout(function(){zoomTo(el<pauseUntil?cam.zoomTo:1)},160);
        showBig('복 +'+val,'',500,'bok');
      }
    });
    foods=foods.filter(function(f){return f.y<H+80&&!f.eaten});

    /* 배 그리기 */
    haloSpin+=0.012*frameK;
    var pulse=(Math.sin(el*4)+1)/2;
    var invuln = el<invulnUntil;
    ctx.save();ctx.translate(px,shipY);ctx.rotate(tiltX*.12+(dragX-px)*0.0025);
    if(el<evoFlashUntil){var sc=1+Math.sin((evoFlashUntil-el)*30)*0.06;ctx.scale(sc,sc)}
    if(invuln && Math.floor(el*10)%2===0) ctx.globalAlpha=0.4;
    /* 배 뒤쪽 wake */
    ctx.globalAlpha*=0.8;
    if(!drawImgFit(ASSETS.windTrail,0,70,26,90*speedFeel,0)){
      ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(0,60,14,40*speedFeel,0,0,7);ctx.fill();
    }
    ctx.globalAlpha = invuln && Math.floor(el*10)%2===0 ? 0.4 : 1;
    drawShip(ctx,shipTier,pulse);
    if(shieldCharge>0){
      ctx.globalAlpha=0.6+Math.sin(el*6)*0.15;
      ctx.strokeStyle='#4FC3A1';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,-20,60,0,7);ctx.stroke();
      ctx.globalAlpha=1;
    }
    ctx.restore();

    /* ---- HUD ---- */
    ctx.textAlign='left';ctx.font='800 15px SCDream, sans-serif';ctx.fillStyle='rgba(234,244,255,.7)';
    ctx.fillText('생존',22,36);
    ctx.font='800 30px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
    ctx.fillText(el.toFixed(1)+'s',22,66);
    ctx.textAlign='right';ctx.font='800 20px SCDream, sans-serif';ctx.fillStyle='#F5B331';
    ctx.fillText('Lv.'+lv,W-22,36);
    ctx.font='800 12px SCDream, sans-serif';ctx.fillStyle='rgba(79,195,161,.85)';
    ctx.fillText(T.name,W-22,52);
    var xpPct=Math.min(1,xp/xpNeed);
    ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(W-122,58,100,6);
    ctx.fillStyle='#F5B331';ctx.fillRect(W-122,58,100*xpPct,6);
    /* 하트 — 업그레이드로 늘어날 수 있어 maxHearts만큼 그린다 */
    ctx.textAlign='left';ctx.font='22px sans-serif';
    for(var hi=0;hi<maxHearts;hi++){ ctx.fillText(hi<hearts?'❤️':'🖤', 22+hi*30, 96); }

    /* ---- 각성 시 커다란 용 파도 백드롭(장식) ---- */
    if(awakened && imgOk(ASSETS.dragonWave)){
      ctx.globalAlpha=0.22;
      drawImgFit(ASSETS.dragonWave, W/2, H*0.32, W*0.9, W*0.9*(ASSETS.dragonWave.naturalHeight/ASSETS.dragonWave.naturalWidth), 0);
      ctx.globalAlpha=1;
    }

    /* ---- 컷인(영등할망 대사) ---- */
    if(cutin.until>performance.now()){
      var cp=1-(cutin.until-performance.now())/(cutin.until-cutin.from);
      var cAlpha=cp<0.15?cp/0.15:(cp>0.85?(1-cp)/0.15:1);
      ctx.globalAlpha=cAlpha;
      /* 원형 아바타 대신 얼굴이 크게 보이는 세로 카드 — 왼쪽에 크게, 오른쪽에 이름+대사 */
      var pad=16, pW=132, pH=pW*(580/420);
      var cbY=100, cbH=pH+pad*2;
      ctx.fillStyle='rgba(8,12,24,.82)';ctx.fillRect(0,cbY,W,cbH);
      var avImg=ASSETS.yeongdeung, avOk=imgOk(avImg);
      var pX=pad, pY=cbY+pad;
      if(avOk){ ctx.drawImage(avImg,pX,pY,pW,pH); }
      else if(!drawImgFit(ASSETS.windSwirlBlue,pX+pW/2,pY+pH/2,pW*0.9,pW*0.9,el*1.4)){
        ctx.fillStyle='#1c2e4a';ctx.fillRect(pX,pY,pW,pH);
      }
      ctx.strokeStyle='#F5B331';ctx.lineWidth=3;
      if(ctx.roundRect){ ctx.beginPath();ctx.roundRect(pX,pY,pW,pH,14);ctx.stroke(); }
      else ctx.strokeRect(pX,pY,pW,pH);
      var txX0=pX+pW+pad, txAreaW=W-txX0-pad, txCX=txX0+txAreaW/2;
      ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText('영등할망', txCX, cbY+pad+30);
      var tSize=36;
      ctx.font='800 '+tSize+'px SCDream, sans-serif';
      while(ctx.measureText(cutin.text).width>txAreaW-8 && tSize>18){ tSize-=2; ctx.font='800 '+tSize+'px SCDream, sans-serif'; }
      ctx.fillStyle='#F2F0EA';
      ctx.fillText(cutin.text, txCX, cbY+pH/2+34);
      ctx.textAlign='left';
      ctx.globalAlpha=1;
    }

    /* ---- 중앙 큰 텍스트/진화 배너 ---- */
    if(bigText && bigText.until>performance.now()){
      var bp=(performance.now()-bigText.from)/(bigText.until-bigText.from);
      var bAlpha=bp<0.12?bp/0.12:(bp>0.8?(1-bp)/0.2:1);
      ctx.globalAlpha=Math.max(0,bAlpha);
      if(bigText.kind==='evo1'||bigText.kind==='evo2'){
        var bannerImg=ASSETS.evoBanner[shipTier];
        var pop=bp<0.2? (bp/0.2) : 1;
        if(imgOk(bannerImg)){
          var bw=Math.min(W*0.82, bannerImg.naturalWidth*1.6);
          var bh=bw*bannerImg.naturalHeight/bannerImg.naturalWidth;
          drawImgFit(bannerImg, W/2, H*0.4, bw*(0.7+0.3*pop), bh*(0.7+0.3*pop), 0);
        } else {
          ctx.textAlign='center';ctx.font='800 26px SCDream, sans-serif';ctx.fillStyle='#F5B331';
          ctx.fillText(bigText.b, W/2, H*0.4);
        }
        if(bp<0.35){
          ctx.textAlign='center';ctx.font='700 18px SCDream, sans-serif';ctx.fillStyle='rgba(242,240,234,.9)';
          ctx.fillText(bigText.a, W/2, H*0.4-70);
        }
      } else if(bigText.kind==='awaken'){
        ctx.fillStyle='rgba(4,6,14,'+(0.55*bAlpha)+')';ctx.fillRect(0,0,W,H);
        var bannerImg4=ASSETS.evoBanner[3];
        if(bp<0.45){
          ctx.textAlign='center';ctx.font='800 24px SCDream, sans-serif';ctx.fillStyle='#BFEEDC';
          ctx.fillText(bigText.a, W/2, H/2);
        } else if(imgOk(bannerImg4)){
          var bw4=Math.min(W*0.86, bannerImg4.naturalWidth*1.7);
          var bh4=bw4*bannerImg4.naturalHeight/bannerImg4.naturalWidth;
          drawImgFit(bannerImg4, W/2, H/2, bw4, bh4, 0);
        } else {
          ctx.textAlign='center';ctx.font='800 30px SCDream, sans-serif';ctx.fillStyle='#F5B331';
          ctx.fillText(bigText.b, W/2, H/2);
        }
      } else if(bigText.kind==='fusion'){
        ctx.fillStyle='rgba(4,6,14,'+(0.5*bAlpha)+')';ctx.fillRect(0,0,W,H);
        ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';ctx.fillStyle='#F5B331';
        ctx.fillText(bigText.a, W/2, H*0.42);
        ctx.font='800 30px SCDream, sans-serif';ctx.fillStyle='#4FC3A1';
        ctx.fillText(bigText.b, W/2, H*0.42+44);
      } else if(bigText.kind==='break'){
        ctx.textAlign='center';ctx.font='800 26px SCDream, sans-serif';ctx.fillStyle='#F58C87';
        ctx.fillText(bigText.a, W/2, H*0.22);
      } else if(bigText.kind==='bok'){
        ctx.textAlign='center';ctx.font='800 18px SCDream, sans-serif';ctx.fillStyle='#F5B331';
        ctx.fillText(bigText.a, px, shipY-56);
      }
      ctx.globalAlpha=1;
    } else if(bigText){ bigText=null; }

    /* ---- 업그레이드 선택 카드(최대 3장, 탭해서 선택 — 희귀도에 따라 테두리색이 다르다) ---- */
    if(pick.open){
      ctx.fillStyle='rgba(6,10,20,.6)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText(pickTitle, W/2, H*0.2);
      ctx.font='700 14px SCDream, sans-serif';ctx.fillStyle='rgba(242,240,234,.65)';
      ctx.fillText('카드를 탭해서 하나만 고른다', W/2, H*0.2+26);
      var cw=W/pick.options.length, cardW=cw-22, cardH=H*0.34, cardY=H*0.28;
      pick.options.forEach(function(opt,i){
        var key=opt.key, rarity=opt.rarity;
        var cx=i*cw+cw/2, cx0=cx-cardW/2, cy0=cardY;
        var pctLeft=Math.max(0,(pick.until-el)/8);
        ctx.fillStyle='rgba(20,28,46,.95)';
        if(ctx.roundRect){ ctx.beginPath();ctx.roundRect(cx0,cy0,cardW,cardH,18);ctx.fill(); }
        else ctx.fillRect(cx0,cy0,cardW,cardH);
        ctx.strokeStyle=rarity.color;ctx.lineWidth=rarity.key==='legendary'?4:2.5;
        if(ctx.roundRect){ ctx.beginPath();ctx.roundRect(cx0,cy0,cardW,cardH,18);ctx.stroke(); }
        else ctx.strokeRect(cx0,cy0,cardW,cardH);
        ctx.textAlign='center';ctx.font='700 12px SCDream, sans-serif';ctx.fillStyle=rarity.color;
        ctx.fillText(rarity.label,cx,cy0+20);
        ctx.font='40px sans-serif';ctx.fillStyle='#F2F0EA';
        ctx.fillText(UPGRADES[key].emoji, cx, cy0+64);
        ctx.font='800 17px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
        ctx.fillText(UPGRADES[key].title, cx, cy0+98);
        var dSize=13, dtxt=UPGRADES[key].desc;
        ctx.font='700 '+dSize+'px SCDream, sans-serif';
        while(ctx.measureText(dtxt).width>cardW-20 && dSize>9){ dSize-=1; ctx.font='700 '+dSize+'px SCDream, sans-serif'; }
        ctx.fillStyle='rgba(242,240,234,.72)';
        ctx.fillText(dtxt, cx, cy0+122);
        var curLv=upgLevel[key], newLv=Math.min(UPG_MAX[key],curLv+rarity.discrete);
        ctx.font='700 12px SCDream, sans-serif';ctx.fillStyle='rgba(242,240,234,.5)';
        ctx.fillText('Lv.'+curLv+' → '+newLv+' / '+UPG_MAX[key], cx, cy0+cardH-24);
        ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(cx0+12,cy0+cardH-14,cardW-24,5);
        ctx.fillStyle=rarity.color;ctx.fillRect(cx0+12,cy0+cardH-14,(cardW-24)*pctLeft,5);
      });
    }

    /* ---- 엔딩: 결과 요약(2~3초 안에 파악 가능하게) — 사망과 완주(승리)를 다르게 취급한다 */
    if(ending && el-endingT0>1.5){
      var pnAlpha=Math.min(1,(el-endingT0-1.5)/0.3);
      ctx.globalAlpha=pnAlpha;
      ctx.fillStyle='rgba(6,10,20,.72)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.font='800 24px SCDream, sans-serif';ctx.fillStyle=endingWon?'#F5B331':'#BFC6D8';
      ctx.fillText(endingWon?'항해 성공! 마지막 시련을 이겨냈다':'항해 종료',W/2,H*0.28);
      var upgLine=UPG_KEYS.filter(function(k){return upgHistory[k]}).map(function(k){return UPGRADES[k].emoji+'×'+upgHistory[k];}).join('  ') || '-';
      var resultRows=[['도달 레벨','Lv.'+lv],['생존 시간',Math.floor(el)+'초'],['파괴한 바위',kills+'개'],['획득한 복',bokEarned+'복'],['획득 카드',upgLine]];
      ctx.font='700 17px SCDream, sans-serif';
      resultRows.forEach(function(row,ri2){
        var ry=H*0.28+48+ri2*36;
        ctx.textAlign='left';ctx.fillStyle='rgba(242,240,234,.75)';ctx.fillText(row[0],W*0.24,ry);
        ctx.textAlign='right';ctx.font='700 '+(row[0]==='획득 카드'?14:17)+'px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';ctx.fillText(row[1],W*0.76,ry);
        ctx.font='700 17px SCDream, sans-serif';
      });
      if(endingWon){
        /* 완주 후에는 자동 종료 대신 "항해 완료"/"초월 항해"를 직접 탭해서 고르게 한다 */
        var ebY=H*0.28+48+resultRows.length*36+30, ebW=W*0.42, ebH=52, ebGap=14;
        var eb1X=W/2-ebW-ebGap/2, eb2X=W/2+ebGap/2;
        ctx.textAlign='center';ctx.font='700 13px SCDream, sans-serif';ctx.fillStyle='rgba(242,240,234,.6)';
        ctx.fillText('탭해서 선택',W/2,ebY-14);
        [['항해 완료',eb1X,'#4FC3A1'],['초월 항해',eb2X,'#F5B331']].forEach(function(b){
          ctx.fillStyle=b[2];
          if(ctx.roundRect){ ctx.beginPath();ctx.roundRect(b[1],ebY,ebW,ebH,14);ctx.fill(); }
          else ctx.fillRect(b[1],ebY,ebW,ebH);
          ctx.textAlign='center';ctx.font='800 16px SCDream, sans-serif';ctx.fillStyle='#0B1220';
          ctx.fillText(b[0],b[1]+ebW/2,ebY+ebH/2+6);
        });
      }
      ctx.globalAlpha=1;
    }

    ctx.restore(); /* 카메라 변환 종료 */

    $('#stScore').textContent='';

    if(hit && !invuln && !inFinale && !ending && !frozen){
      if(shieldCharge>0){
        /* 🛡 바람막이 — 하트 대신 보호막을 소모한다 */
        shieldCharge=0; invulnUntil=el+1.0; shake(6); sfx('bonus',0.5);
        toast('🛡 바람막이가 막아냈다!');
      } else {
        hearts--;
        invulnUntil=el+1.5; shake(9);
        sfx('boom',0.6); beep(120,0.3,'square',0.2);
        if(hearts>0){
          showCutin(pickRandom(HIT_LINES),1500);
          toast('쾅! 정신 차리고 다시!');
        } else {
          triggerEnding(el);
        }
      }
    }

    raf=requestAnimationFrame(loop);
  }

  function giveBok(n){
    /* 화면에 즉시 보이는 작은 보상 피드백 — 실제 지급은 finishSail에서 합산 */
    bokEarned+=Math.round(n*(1+upgLevel.bok*0.25));
  }
  var bokEarned=0;

  raf=requestAnimationFrame(loop);

  function finishSail(sec,kills){
    var s=Math.floor(sec);stopGame();
    var isBest=s>(S.best.sail||0);
    if(isBest)S.best.sail=s;
    sfx(isBest?'fanfare':'bonus',0.7);
    var winBonus=endingWon?100:0;
    var bonus=(kills||0)*3+bossKillCount*15+bokEarned+lv*5+winBonus;
    var label=endingWon
      ? '항해 성공 · 영등할망의 마지막 시련 완료 · Lv.'+lv+(bonus?' · 완주 보너스 포함 +'+bonus:'')
      : '영등할망의 바람 · '+s+'초 생존 · Lv.'+lv+(bonus?' · 보너스 +'+bonus:'');
    reward(s*2+bonus,label);
  }
}
