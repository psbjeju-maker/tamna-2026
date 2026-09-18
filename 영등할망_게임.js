/* ============================================================
   영등할망의 바람 — 탐라문화제 앱(index.html) 안의 미니게임 코드
   canvas(#gcv)에 그리는 방식이라 순수 HTML 마크업은 거의 없고
   대부분 JS입니다. 이 파일만 떼서 쓰려면 아래 "의존 요소"를
   먼저 준비해야 합니다.

   ── 의존 요소 (index.html 다른 곳에 있음) ──
   · <canvas id="gcv"></canvas>            게임을 그리는 캔버스
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
  rockPool:  [loadAsset('rock1.png'), loadAsset('rock2.png'), loadAsset('rock3.png'), loadAsset('rock4.png')],
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
var tiltX = 0;
function tiltH(e){ if(e.gamma != null) tiltX = Math.max(-1, Math.min(1, e.gamma/25)); }

/* 배 진화 4단계 — need는 "그 단계까지 오는데 필요한 진화 게이지" 증분값.
   2단계부터 자동으로 미사일을 쏴서 앞을 가로막는 바위를 직접 파괴할 수 있다. */
var SHIP_TIERS=[
  {name:'조각배',   need:0, fireEvery:0,    missiles:0, spread:0,    aura:false},
  {name:'풍선(風船)',need:2, fireEvery:1.2,  missiles:1, spread:0,    aura:false},
  {name:'범선',     need:3, fireEvery:0.85, missiles:2, spread:12,   aura:true },
  {name:'용선(龍船)',need:3, fireEvery:0.22, missiles:3, spread:18,   aura:true }
];

function drawShip(ctx,lvl,glowPulse,haloSpin,prestige){
  var T=SHIP_TIERS[lvl];
  prestige=prestige||0;
  var hullW=40+lvl*10, hullH=14+lvl*2, mastH=54+lvl*14;
  if(T.aura){
    var ag=ctx.createRadialGradient(0,-mastH*0.3,4,0,-mastH*0.3,hullW*1.6);
    ag.addColorStop(0,'rgba(79,195,161,'+(0.28+glowPulse*0.14)+')');ag.addColorStop(1,'rgba(79,195,161,0)');
    ctx.fillStyle=ag;ctx.beginPath();ctx.arc(0,-mastH*0.25,hullW*1.6,0,7);ctx.fill();
  }
  if(lvl>=3 && imgOk(ASSETS.awakenHalo)){
    /* 4단계(용선) 이후로는 새 그림 없이 아우라만 10레벨마다 한 단계씩 더 화려해진다("초월") */
    ctx.save();ctx.rotate(haloSpin||0);
    ctx.globalAlpha=Math.min(1,0.55+glowPulse*0.25+prestige*0.06);
    var haloSize=hullW*(4.4+prestige*0.55);
    drawImgFit(ASSETS.awakenHalo,0,-mastH*0.25,haloSize,haloSize,0);
    if(prestige>0){
      ctx.globalAlpha=Math.min(0.5,0.12+prestige*0.05);
      drawImgFit(ASSETS.awakenHalo,0,-mastH*0.25,haloSize*0.7,haloSize*0.7,-haloSpin*1.6);
    }
    ctx.globalAlpha=1;ctx.restore();
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
  if(window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){
    DeviceOrientationEvent.requestPermission().then(function(r){
      if(r==='granted')window.addEventListener('deviceorientation',tiltH)}).catch(function(){});
  } else window.addEventListener('deviceorientation',tiltH);

  var W=cv.width,H=cv.height,px=W/2,rocks=[],foods=[],missiles=[],t0=performance.now(),lastNow=t0;
  var shipY=H-160;
  var spawn=900,foodSpawn=2600,alive=true;
  var evoFlashUntil=0,haloSpin=0,fireTimer=0,kills=0;
  var flashes=[],fx=[],bgParticles=[];
  var maxHearts=2,hearts=2,invulnUntil=0;
  var justCount=0,justCooldownUntil=0;
  var breakComboN=0,breakComboLast=-99;
  var cam=makeCam();
  var cutin=makeCutin();
  var bigText=null; /* {a,b,until,from,kind} 화면 중앙 큰 텍스트/배너 연출 */
  var slowmoUntil=0,pauseUntil=0;

  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  var HIT_LINES=['아이고게, 정신 촐리라게!','아이고 놀란 것 좀 보라!'];
  var END_LINES=['제라하게 보름 탈 줄 알암쪄이','오늘은 여기까지 하게마씨'];
  var RUSH_LINES=['바당에서 복이 쏟아진다!'];
  var BOSS_LINES=['큰 게 온다, 정신 차리라이!','저건 요망진 놈이여!'];

  /* ================= Lv/EXP 시스템 ================= *
     드래곤플라이트처럼 레벨이 항상 눈에 보이고, 레벨업마다(뱀서라이크처럼)
     업그레이드 카드 3장이 뜬다. 복(보상 재화)과는 완전히 분리된 경험치다. */
  var lv=1, xp=0, xpNeed=6+lv*3;
  var xpTrickle=0;
  var shipTier=0, prestige=0;
  function tierForLevel(l){ if(l>=20) return 3; if(l>=10) return 2; if(l>=5) return 1; return 0; }

  /* ---- 업그레이드 카드 — 희귀도 포함 ---- */
  var upg={fire:0,spread:0,heart:0,just:0,bok:0,speed:0};
  var UPGRADES={
    fire:  {emoji:'💥', title:'포격 강화', desc:'연사 속도가 빨라진다'},
    spread:{emoji:'🎯', title:'다연장 확장', desc:'포탄이 더 나간다'},
    heart: {emoji:'❤️', title:'바람의 가호', desc:'최대 체력이 늘고 즉시 회복'},
    just:  {emoji:'✨', title:'회피의 감', desc:'회피 판정이 후해진다'},
    bok:   {emoji:'🍊', title:'복바람', desc:'복을 더 많이 받는다'},
    speed: {emoji:'🌀', title:'급류 조타', desc:'조작이 더 즉각적으로 반응한다'}
  };
  var UPG_KEYS=Object.keys(UPGRADES);
  var RARITY=[
    {key:'common',   label:'일반', p:0.70, mult:1,   discrete:1, color:'#8FA3B8'},
    {key:'rare',     label:'희귀', p:0.25, mult:1.6, discrete:2, color:'#4FC3A1'},
    {key:'legendary',label:'전설', p:0.05, mult:2.5, discrete:3, color:'#F5B331'}
  ];
  function rollRarity(){
    var r=Math.random(), acc=0;
    for(var i=0;i<RARITY.length;i++){ acc+=RARITY[i].p; if(r<acc) return RARITY[i]; }
    return RARITY[0];
  }
  var DISCRETE_KEYS={spread:1,heart:1}; /* 정수 단위라 희귀도만큼 덩어리로 오른다 */
  function applyUpgrade(key,rarity){
    var step = DISCRETE_KEYS[key] ? rarity.discrete : rarity.mult;
    upg[key]+=step;
    if(key==='heart'){ maxHearts+=rarity.discrete; hearts=Math.min(maxHearts,hearts+rarity.discrete); }
    toast(UPGRADES[key].emoji+' '+UPGRADES[key].title+' ('+rarity.label+')!');
    sfx('bonus',0.6);
  }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }

  var pick={open:false,options:[],until:0}; /* options: [{key,rarity}] */
  var PICK_TITLES=['바람이 하나를 골라달라 한다','요망진 걸로 골라보라이','무사 하나만 고르라!'];
  var pickTitle='';
  var upgHistory={}; /* 결과화면에 보여줄 획득 카드 집계 */
  function openPick(el){
    var keys=shuffle(UPG_KEYS.slice()).slice(0,3);
    pick.options=keys.map(function(k){ return {key:k, rarity:rollRarity()}; });
    pick.open=true; pick.until=el+8;
    pickTitle=pickRandom(PICK_TITLES);
  }
  function closePick(opt,el){
    pick.open=false;
    applyUpgrade(opt.key,opt.rarity);
    upgHistory[opt.key]=(upgHistory[opt.key]||0)+1;
  }

  /* 경험치 획득 + 레벨업 처리 — 바위 파괴/생존시간/먹거리/은근한 회피에서 들어온다 */
  function gainXp(n,el){
    xp+=n;
    while(xp>=xpNeed){
      xp-=xpNeed; lv++; xpNeed=6+lv*3;
      onLevelUp(el);
    }
  }
  function onLevelUp(el){
    var newTier=tierForLevel(lv);
    if(newTier>shipTier){ evolveTo(newTier,el); }
    else if(lv>=30 && lv%10===0){ prestigeFlash(el); }
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
  cv.onpointerdown=function(e){
    var x=evX(e);
    if(pick.open){
      var idx=Math.min(2,Math.max(0,Math.floor(x/(W/3))));
      closePick(pick.options[idx], (performance.now()-t0)/1000);
      return;
    }
    dragging=true; dragX=Math.max(50,Math.min(W-50,x));
  };
  cv.onpointermove=function(e){ if(dragging) dragX=Math.max(50,Math.min(W-50,evX(e))); };
  cv.onpointerup=function(){dragging=false};
  cv.onpointercancel=function(){dragging=false};

  /* ---- 페이즈 트리거 ---- */
  var tutorialDone=false;
  var rush={state:'idle',announceUntil:0,until:0,nextAt:26,spawnTimer:0};
  var boss={state:'idle',announceUntil:0,hp:0,maxHp:5,x:0,y:0,r:92,v:1.15,asset:null,nextAt:34,flashUntil:0};
  var finaleUntil=0,inFinale=false,finaleKills=0;
  var awakened=false;
  var ending=false,endingT0=0;

  function showCutin(text,dur,freeze){ cutin.text=text; cutin.from=performance.now(); cutin.until=cutin.from+dur; cutin.freeze=!!freeze; }
  function showBig(a,b,dur,kind){ bigText={a:a,b:b,from:performance.now(),until:performance.now()+dur,kind:kind}; }
  function shake(v){ cam.shake=Math.max(cam.shake,v); }
  function zoomTo(v){ cam.zoomTo=v; }
  function triggerEnding(el){
    if(ending) return;
    ending=true; endingT0=el;
    showCutin(pickRandom(END_LINES),2000);
  }

  function explodeRock(x,y,r,big){
    flashes.push({x:x,y:y,t:0,r0:r*0.3,r1:r*(big?2.3:1.8)});
    var n=big?18:12;
    for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      fx.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:1,c:i%2?'#4FC3A1':'#F2F0EA',sz:3+Math.random()*3});}
  }

  function evolveTo(newTier,el){
    shipTier=newTier;
    var T=SHIP_TIERS[shipTier];
    evoFlashUntil=el+1.4;
    sfx('evolve',0.8);
    if(shipTier<SHIP_TIERS.length-1){
      slowmoUntil=el+0.38; zoomTo(1.16); shake(6);
      showBig('바람이 모인다...', T.name+'(으)로 진화!', 1300, 'evo'+shipTier);
      toast('⚓ Lv.'+lv+' — '+T.name+'(으)로 진화! '+(T.missiles>0?'자동 포격 시작':''));
      setTimeout(function(){zoomTo(1)},420);
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
    var frozen = pick.open || rush.state==='announce' || boss.state==='announce' || (cutin.freeze && cutin.until>performance.now());

    /* ---- 조작 입력 ---- (얼어있는 동안엔 배가 움직이지 않는다) */
    if(!frozen){
      if(dragging) px += (dragX-px)*Math.min(1,(0.30+upg.speed*0.05)*frameK);
      else if(Math.abs(tiltX)>0.02) px += tiltX*(9+upg.speed*1.5)*frameK;
    }
    /* 배 이미지 폭이 진화할수록 커지므로(특히 용선) 화면 가장자리에서 잘리지 않게 여백도 같이 늘린다 */
    var shipMargin=Math.max(50,(40+shipTier*10)*1.15+8);
    px=Math.max(shipMargin,Math.min(W-shipMargin,px));

    var T=SHIP_TIERS[shipTier];

    /* ================= 페이즈 트리거 ================= */
    if(!tutorialDone && (el>=5 || rocks.some(function(r){return r.passed}))) tutorialDone=true;

    if(pick.open && el>=pick.until){
      /* 방치 시 자동으로 하나 골라준다(행사장에서 멈춰있지 않게) */
      closePick(pickRandom(pick.options), el);
    }

    /* 골든 러시 — 알림 문구가 뜨는 동안은 완전히 멈추고, 문구가 끝나야 실제로 시작된다 */
    if(rush.state==='idle' && el>=rush.nextAt && !frozen && boss.state==='idle'){
      rush.state='announce'; rush.announceUntil=el+1.4;
      showCutin(pickRandom(RUSH_LINES),1400,true);
    }
    if(rush.state==='announce' && el>=rush.announceUntil){
      rush.state='active'; rush.until=el+5; rush.spawnTimer=0;
      toast('✨ 골든 러시! 마음껏 쓸어담으라!');
      sfx('bonus',0.7);
    }
    if(rush.state==='active' && el>=rush.until){
      rush.state='idle'; rush.nextAt=el+32+Math.random()*14;
    }

    /* 미니보스 — 알림 문구가 뜨는 동안 완전히 멈춘 뒤 등장한다. 레벨이 오를수록 더 자주 나온다 */
    if(boss.state==='idle' && el>=boss.nextAt && !frozen && rush.state==='idle'){
      boss.state='announce'; boss.announceUntil=el+1.5;
      showCutin(pickRandom(BOSS_LINES),1500,true);
    }
    if(boss.state==='announce' && el>=boss.announceUntil){
      boss.state='alive'; boss.hp=5; boss.maxHp=5;
      boss.x=Math.max(shipMargin,Math.min(W-shipMargin,W/2)); boss.y=-140; boss.r=92;
      boss.v=1.0+Math.min(1.2,lv*0.03);
      boss.asset=ASSETS.rockPool[ASSETS.rockPool.length-1];
      toast('👹 거대 바위 출현! 대포로 부숴라');
      sfx('boom',0.5);
    }

    /* 각성 무쌍 구간이 끝나면 게임을 끝내지 않고 그대로 용선으로 계속 진행한다 */
    if(inFinale && el>=finaleUntil){ inFinale=false; }

    /* 죽어야만 끝난다 — 시간 강제종료 안전장치 없음(개인용 앱이라 대기열 문제 없음) */
    if(ending && el-endingT0>3.6 && alive){
      alive=false; finishSail(el,kills,justCount); return;
    }

    var suspendSpawn = frozen || rush.state==='active';

    if(!suspendSpawn && !inFinale && !ending){
      /* 10레벨까지는 튜토리얼 수준으로 계속 쉬워야 한다는 요청 — 스폰 간격도
         튜토리얼과 같은 배율을 유지하고, 시간/레벨에 따른 상승폭은 거의 없앤다 */
      var diffEase = lv<10 ? 0.1 : 1;
      var spawnRate = (tutorialDone && lv>=10) ? 1 : 0.45;
      spawn-=sdt;
      if(spawn<=0){
        spawn=Math.max(160,(620-el*22*diffEase-lv*4*diffEase)/spawnRate);
        var rk=Math.floor(Math.random()*ASSETS.rockPool.length);
        var zz = lv>=10 && Math.random()<0.35;
        rocks.push({x:60+Math.random()*(W-120),y:-60,r:32+Math.random()*26,v:Math.min(lv<10?4.2:99, 3.2+el*0.11*diffEase+lv*0.15*diffEase),asset:ASSETS.rockPool[rk],passed:false,dead:false,justOk:true,zigzag:zz,zzPhase:Math.random()*Math.PI*2});
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
      if(xpTrickle>=800){ xpTrickle-=800; gainXp(1,el); }

      /* 조각배(1단계)는 원래 포격이 없지만 Lv2부터는 자동으로 포탄 1개가 나가고,
         다연장 확장 카드를 고르면 그 즉시 1개씩 더 늘어난다(1→2→3개) */
      var baseShot = (shipTier===0 && lv>=2) ? 1 : 0;
      var mc=T.missiles+baseShot+upg.spread;
      if(mc>0){
        fireTimer-=sdt;
        if(fireTimer<=0){
          var baseFireEvery = T.fireEvery>0 ? T.fireEvery : 1.4;
          fireTimer=baseFireEvery*1000*Math.pow(0.85,upg.fire);
          beep(880,0.06,'sawtooth',0.09);
          for(var mi=0;mi<mc;mi++){
            var ang=(mi-(mc-1)/2)*(T.spread*Math.PI/180);
            missiles.push({x:px,y:shipY-30,vx:Math.sin(ang)*3,vy:-9-shipTier});
          }
        }
      }
    }
    if(rush.state==='active'){
      rush.spawnTimer-=sdt;
      if(rush.spawnTimer<=0){
        rush.spawnTimer=200;
        var rroll=Math.random(),rkind='rice',rasset=ASSETS.foodRice;
        if(rroll<0.25){rkind='bag';rasset=ASSETS.foodBag;} else if(rroll<0.6){rkind='tangerine';rasset=ASSETS.foodTangerine;}
        foods.push({x:40+Math.random()*(W-80),y:-30,r:24,v:3.2,kind:rkind,asset:rasset});
      }
    }
    if(inFinale){
      /* 무쌍 타임 — 사격 속도를 극단적으로 올려 화면을 정리한다 */
      fireTimer-=sdt;
      if(fireTimer<=0){
        fireTimer=Math.max(70,T.fireEvery*1000*0.22*Math.pow(0.85,upg.fire));
        beep(920,0.05,'sawtooth',0.08);
        var mcf=T.missiles+upg.spread+1;
        for(var mf=0;mf<mcf;mf++){
          var angf=(mf-(mcf-1)/2)*((T.spread+10)*Math.PI/180);
          missiles.push({x:px,y:shipY-30,vx:Math.sin(angf)*3.4,vy:-12});
        }
      }
      spawn-=sdt;
      if(spawn<=0){
        spawn=170;
        var rk2=Math.floor(Math.random()*ASSETS.rockPool.length);
        rocks.push({x:60+Math.random()*(W-120),y:-60,r:28+Math.random()*22,v:6.2,asset:ASSETS.rockPool[rk2],passed:false,dead:false,justOk:false,noHit:true});
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
    if(rush.state==='active'){g.addColorStop(0,'#3A2E10');g.addColorStop(1,'#1A1206');}
    else if(inFinale){g.addColorStop(0,'#152040');g.addColorStop(1,'#050814');}
    else {g.addColorStop(0,'#181B2E');g.addColorStop(1,'#0F1120');}
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

    /* 먼 바다 안개 */
    ctx.fillStyle='rgba(150,190,210,0.05)';
    ctx.fillRect(0,0,W,H*0.35);

    /* 파도 레이어(속도 다른 3겹) + 배 진행감 */
    var speedFeel=1+ (inFinale?0.9:0) + (rush.state==='active'?0.3:0);
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
          missiles.splice(bmi,1); boss.hp--; boss.flashUntil=el+0.08; shake(3);
          sfx('pop',0.4);
          if(boss.hp<=0){
            explodeRock(boss.x,boss.y,boss.r,true); sfx('boom',0.7); shake(12);
            kills+=3; gainXp(30,el); giveBok(20);
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

    if(!suspendSpawn){
      /* 미사일 이동 + 명중 판정 */
      missiles.forEach(function(m){m.x+=m.vx*frameK;m.y+=m.vy*frameK*2.6});
      missiles=missiles.filter(function(m){return m.y>-40});
      rocks.forEach(function(r){
        r.y+=r.v*frameK*2.6;
        if(r.zigzag) r.x+=Math.sin(el*3+r.zzPhase)*1.4*frameK;
        for(var mi2=missiles.length-1;mi2>=0;mi2--){
          var m=missiles[mi2];
          if(!r.dead&&Math.hypot(m.x-r.x,m.y-r.y)<r.r+10){
            r.dead=true;missiles.splice(mi2,1);explodeRock(r.x,r.y,r.r,inFinale);sfx('pop',0.45);kills++;
            gainXp(2,el);
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
        var nearBand=26+upg.just*6, hitBand=r.r+30;
        if(dx<hitBand && dy<r.r+34){
          if(!r.noHit) hit=true;
        } else if(r.justOk && !r.dead && dy<r.r+34+nearBand && dx<hitBand+nearBand && dy>=r.r+34-6){
          /* 회피 성공 라인을 스치듯 지나가는 순간 = JUST — 요청대로 조용히 경험치만 준다 */
          if(el>=justCooldownUntil){
            r.justOk=false; justCount++; justCooldownUntil=el+0.35;
            gainXp(1,el);
            sfx('bonus',0.15);
          }
        }
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
    drawShip(ctx,shipTier,pulse,haloSpin,prestige);
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
      } else if(bigText.kind==='break'){
        ctx.textAlign='center';ctx.font='800 26px SCDream, sans-serif';ctx.fillStyle='#F58C87';
        ctx.fillText(bigText.a, W/2, H*0.22);
      } else if(bigText.kind==='bok'){
        ctx.textAlign='center';ctx.font='800 18px SCDream, sans-serif';ctx.fillStyle='#F5B331';
        ctx.fillText(bigText.a, px, shipY-56);
      }
      ctx.globalAlpha=1;
    } else if(bigText){ bigText=null; }

    /* ---- 업그레이드 선택 카드(3장, 탭해서 선택 — 희귀도에 따라 테두리색이 다르다) ---- */
    if(pick.open){
      ctx.fillStyle='rgba(6,10,20,.6)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText(pickTitle, W/2, H*0.2);
      ctx.font='700 14px SCDream, sans-serif';ctx.fillStyle='rgba(242,240,234,.65)';
      ctx.fillText('카드를 탭해서 하나만 고른다', W/2, H*0.2+26);
      var cw=W/3, cardW=cw-22, cardH=H*0.32, cardY=H*0.28;
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
        ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(cx0+12,cy0+cardH-14,cardW-24,5);
        ctx.fillStyle=rarity.color;ctx.fillRect(cx0+12,cy0+cardH-14,(cardW-24)*pctLeft,5);
      });
    }

    /* ---- 엔딩: 결과 요약(2~3초 안에 파악 가능하게) ---- */
    if(ending && el-endingT0>1.5){
      var pnAlpha=Math.min(1,(el-endingT0-1.5)/0.3);
      ctx.globalAlpha=pnAlpha;
      ctx.fillStyle='rgba(6,10,20,.72)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.font='800 24px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText('영등할망의 바람을 이겨냈다!',W/2,H*0.28);
      var upgLine=UPG_KEYS.filter(function(k){return upgHistory[k]}).map(function(k){return UPGRADES[k].emoji+'×'+upgHistory[k];}).join('  ') || '-';
      var resultRows=[['도달 레벨','Lv.'+lv],['생존 시간',Math.floor(el)+'초'],['파괴한 바위',kills+'개'],['획득한 복',bokEarned+'복'],['획득 카드',upgLine]];
      ctx.font='700 17px SCDream, sans-serif';
      resultRows.forEach(function(row,ri2){
        var ry=H*0.28+48+ri2*36;
        ctx.textAlign='left';ctx.fillStyle='rgba(242,240,234,.75)';ctx.fillText(row[0],W*0.24,ry);
        ctx.textAlign='right';ctx.font='700 '+(row[0]==='획득 카드'?14:17)+'px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';ctx.fillText(row[1],W*0.76,ry);
        ctx.font='700 17px SCDream, sans-serif';
      });
      ctx.globalAlpha=1;
    }

    ctx.restore(); /* 카메라 변환 종료 */

    $('#stScore').textContent='';

    if(hit && !invuln && !inFinale && !ending && !frozen){
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

    raf=requestAnimationFrame(loop);
  }

  function giveBok(n){
    /* 화면에 즉시 보이는 작은 보상 피드백 — 실제 지급은 finishSail에서 합산 */
    bokEarned+=Math.round(n*(1+upg.bok*0.25));
  }
  var bokEarned=0;

  raf=requestAnimationFrame(loop);

  function finishSail(sec,kills,justN){
    var s=Math.floor(sec);stopGame();
    var isBest=s>(S.best.sail||0);
    if(isBest)S.best.sail=s;
    sfx(isBest?'fanfare':'bonus',0.7);
    var bonus=(kills||0)*3+(justN||0)*2+bokEarned+lv*5;
    reward(s*2+bonus,'영등할망의 바람 · '+s+'초 생존 · Lv.'+lv+(bonus?' · 보너스 +'+bonus:''));
  }
}
