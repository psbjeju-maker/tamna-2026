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
  rockPool:  [loadAsset('rock1.png'), loadAsset('rock2.png'), loadAsset('rock3.png'), loadAsset('rock4.png'),
              loadAsset('barrel.png'), loadAsset('crate.png'), loadAsset('branch.png')],
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

function drawShip(ctx,lvl,glowPulse,haloSpin){
  var T=SHIP_TIERS[lvl];
  var hullW=40+lvl*10, hullH=14+lvl*2, mastH=54+lvl*14;
  if(T.aura){
    var ag=ctx.createRadialGradient(0,-mastH*0.3,4,0,-mastH*0.3,hullW*1.6);
    ag.addColorStop(0,'rgba(79,195,161,'+(0.28+glowPulse*0.14)+')');ag.addColorStop(1,'rgba(79,195,161,0)');
    ctx.fillStyle=ag;ctx.beginPath();ctx.arc(0,-mastH*0.25,hullW*1.6,0,7);ctx.fill();
  }
  if(lvl>=3 && imgOk(ASSETS.awakenHalo)){
    ctx.save();ctx.rotate(haloSpin||0);
    ctx.globalAlpha=0.55+glowPulse*0.25;
    drawImgFit(ASSETS.awakenHalo,0,-mastH*0.25,hullW*4.4,hullW*4.4,0);
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
  var lvl=0,evoProgress=0,evoFlashUntil=0,haloSpin=0,fireTimer=0,kills=0;
  var flashes=[],fx=[],bgParticles=[];
  var hearts=2,invulnUntil=0;
  var justCount=0;
  var justCooldownUntil=0,justComboN=0,justComboLast=-99;
  var breakComboN=0,breakComboLast=-99;
  var cam=makeCam();
  var cutin=makeCutin();
  var bigText=null; /* {a,b,until,from,kind} 화면 중앙 큰 텍스트/배너 연출 */
  var slowmoUntil=0,pauseUntil=0;

  /* 조작: 탭/드래그 둘 다 "그 지점으로 배를 이동"으로 통일 — 반응이 즉각적이어야 하므로 */
  var dragging=false, dragX=px;
  function setDragFromEvent(e){
    var r=cv.getBoundingClientRect();
    var x=(e.clientX-r.left)*(W/r.width);
    dragX=Math.max(50,Math.min(W-50,x));
  }
  cv.onpointerdown=function(e){dragging=true;setDragFromEvent(e)};
  cv.onpointermove=function(e){if(dragging)setDragFromEvent(e)};
  cv.onpointerup=function(){dragging=false};
  cv.onpointercancel=function(){dragging=false};

  /* ---- 페이즈 트리거(한 번만) ---- */
  var tutorialDone=false;
  var windEvt={state:'idle',chooseUntil:0,resolveUntil:0,lane:-1}; /* idle→cutin→choose→resolve→done */
  var gustEvt={state:'idle',until:0,dir:1,cutinUntil:0};
  var stopSpawning=false;
  var finaleUntil=0,inFinale=false,finaleKills=0;
  var awakened=false;
  var ending=false,endingT0=0;
  var forcedCatchupDone=false;

  function showCutin(text,dur){ cutin.text=text; cutin.from=performance.now(); cutin.until=cutin.from+dur; }
  function showBig(a,b,dur,kind){ bigText={a:a,b:b,from:performance.now(),until:performance.now()+dur,kind:kind}; }
  function shake(v){ cam.shake=Math.max(cam.shake,v); }
  function zoomTo(v){ cam.zoomTo=v; }

  function explodeRock(x,y,r,big){
    flashes.push({x:x,y:y,t:0,r0:r*0.3,r1:r*(big?2.3:1.8)});
    var n=big?18:12;
    for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,sp=2+Math.random()*5;
      fx.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:1,c:i%2?'#4FC3A1':'#F2F0EA',sz:3+Math.random()*3});}
  }

  /* 진화 게이지 증가 + 단계 상승 처리 — 먹거리/JUST/바람길/돌풍 등 여러 곳에서 호출 */
  function gainEvo(n,el){
    if(lvl>=SHIP_TIERS.length-1) return;
    evoProgress+=n;
    var need=SHIP_TIERS[lvl+1].need;
    if(evoProgress>=need){
      evoProgress=0;
      evolveTo(lvl+1,el);
    }
  }
  function evolveTo(newLvl,el){
    /* 바람길 통로가 떠 있는 도중 진화가 겹치면 화면이 지저분해지므로 즉시 정리 */
    if(windEvt.state==='choose'||windEvt.state==='resolve') windEvt.state='done';
    lvl=newLvl;
    var T=SHIP_TIERS[lvl];
    evoFlashUntil=el+1.4;
    sfx('evolve',0.8);
    if(lvl<SHIP_TIERS.length-1){
      slowmoUntil=el+0.38; zoomTo(1.16); shake(6);
      showBig('바람이 모인다...', T.name+'(으)로 진화!', 1300, 'evo'+lvl);
      toast('⚓ '+T.name+'(으)로 진화! '+(T.missiles>0?'자동 포격 시작':''));
      setTimeout(function(){zoomTo(1)},420);
    } else {
      /* 최종 각성 — 용선(龍船) */
      awakened=true;
      pauseUntil=el+0.5; zoomTo(1.3); shake(14);
      sfx('fanfare',0.85);
      showBig('영등의 바람이 깃들었다','용선(龍船) 각성',2200,'awaken');
      toast('🐉 용선 각성! 무쌍이 시작됩니다');
      finaleUntil=el+0.5+5.0; inFinale=true; stopSpawning=false;
      setTimeout(function(){zoomTo(1.08)},700);
    }
  }

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

    /* ---- 조작 입력 ---- */
    if(dragging) px += (dragX-px)*Math.min(1,0.30*frameK);
    else if(Math.abs(tiltX)>0.02) px += tiltX*9*frameK;
    /* 돌풍 이벤트: 한쪽으로 지속적인 힘 */
    if(gustEvt.state==='blow' && el<gustEvt.until){ px += gustEvt.dir*3.1*frameK; }
    px=Math.max(50,Math.min(W-50,px));

    var T=SHIP_TIERS[lvl];

    /* ================= 페이즈 트리거 ================= */
    if(!tutorialDone && (el>=5 || rocks.some(function(r){return r.passed}))) tutorialDone=true;

    if(windEvt.state==='idle' && el>=11.5 && el<30){
      windEvt.state='cutin';
      showCutin('요망진 것, 요 보름도 혼번 버텨보라이!',1500);
      sfx('bonus',0.4);
      setTimeout(function(){ if(windEvt.state==='cutin'){ windEvt.state='choose'; windEvt.chooseUntil=el+1.15; } },1500);
    }
    if(windEvt.state==='choose' && el>=windEvt.chooseUntil){
      var lane = px < W/3 ? 0 : (px < W*2/3 ? 1 : 2);
      windEvt.lane=lane; windEvt.state='resolve'; windEvt.resolveUntil=el+2.2; windEvt.hitDuringResolve=false;
      if(lane===0){ toast('← 순풍! 장애물이 느려집니다'); }
      else if(lane===1){ toast('✨ 황금바람! 배가 질주합니다'); sfx('bonus',0.6); }
      else { toast('🌪 거센바람! 위험하지만 바람이 크게 모입니다'); sfx('bonus',0.6); }
    }
    if(windEvt.state==='resolve' && el>=windEvt.resolveUntil){
      windEvt.state='done';
      if(!windEvt.hitDuringResolve){
        if(windEvt.lane===1){ giveBok(2); toast('✨ 황금바람 성공! 복 +2'); }
        else if(windEvt.lane===2){ gainEvo(3,el); toast('🌪 거센바람 성공! 바람이 크게 모였다'); }
      }
    }

    if(gustEvt.state==='idle' && el>=19 && el<32 && windEvt.state!=='cutin' && windEvt.state!=='choose'){
      gustEvt.state='cutin';
      showCutin('이짝저짝 요망지게 댕기멍 보름 탐져이!',1400);
      gustEvt.dir=Math.random()<0.5?-1:1;
      setTimeout(function(){
        if(gustEvt.state==='cutin'){
          gustEvt.state='blow'; gustEvt.until=el+3.0; gustEvt.hitDuringBlow=false;
          toast(gustEvt.dir>0?'🌪 동풍!':'🌪 서풍!');
          sfx('evolve',0.5);
        }
      },1400);
    }
    if(gustEvt.state==='blow' && el>=gustEvt.until){
      gustEvt.state='done';
      if(!gustEvt.hitDuringBlow){ gainEvo(2,el); }
    }

    /* 너무 늦어지면(불운/저조한 플레이) 강제로 각성까지 끌어올려 절정을 반드시 보여준다 */
    if(!forcedCatchupDone && el>=33 && lvl<SHIP_TIERS.length-1){
      forcedCatchupDone=true;
      evoProgress=0;
      evolveTo(SHIP_TIERS.length-1,el);
    }

    if(inFinale && el>=finaleUntil){
      inFinale=false; ending=true; endingT0=el; stopSpawning=true;
      showCutin('제라하게 보름 탈 줄 알암쪄이',1800);
    }
    if(ending && el-endingT0>3.6 && alive){
      alive=false; finishSail(el,kills,justCount); return;
    }

    var suspendSpawn = (windEvt.state==='cutin'||windEvt.state==='choose') || (gustEvt.state==='cutin');

    var laneMul = (windEvt.state==='resolve')
      ? (windEvt.lane===0?0.62:(windEvt.lane===2?1.55:1.12))
      : 1;
    var gustMul = (gustEvt.state==='blow') ? 1.12 : 1;
    var mul = laneMul*gustMul;

    if(!suspendSpawn && !stopSpawning && !inFinale){
      var spawnRate = tutorialDone ? 1 : 0.45;
      spawn-=sdt;
      if(spawn<=0){
        spawn=Math.max(150,(620-el*22)/(mul*spawnRate));
        var rk=Math.floor(Math.random()*ASSETS.rockPool.length);
        rocks.push({x:60+Math.random()*(W-120),y:-60,r:32+Math.random()*26,v:(3.6+el*0.11)*mul,asset:ASSETS.rockPool[rk],passed:false,dead:false,justOk:true});
      }
      foodSpawn-=sdt;
      if(foodSpawn<=0){
        foodSpawn=(el<12?3200:4800)+Math.random()*2200;
        var roll=Math.random(),kind='rice',asset=ASSETS.foodRice;
        if(roll<0.12){kind='bag';asset=ASSETS.foodBag;}
        else if(roll<0.42){kind='tangerine';asset=ASSETS.foodTangerine;}
        foods.push({x:60+Math.random()*(W-120),y:-40,r:26,v:2.4+el*0.04,kind:kind,asset:asset});
      }
      /* 시간에 따라 아주 조금씩 저절로 차오르는 진화 게이지 — 못해도 절정을 볼 수 있게 하는 안전장치 */
      evoTimer=(evoTimer==null?7000:evoTimer)-sdt;
      if(evoTimer<=0){ evoTimer=7000; gainEvo(1,el); }

      if(T.missiles>0){
        fireTimer-=sdt;
        if(fireTimer<=0){
          fireTimer=T.fireEvery*1000;
          beep(880,0.06,'sawtooth',0.09);
          for(var mi=0;mi<T.missiles;mi++){
            var ang=(mi-(T.missiles-1)/2)*(T.spread*Math.PI/180);
            missiles.push({x:px,y:shipY-30,vx:Math.sin(ang)*3,vy:-9-lvl});
          }
        }
      }
    }
    if(inFinale){
      /* 무쌍 타임 — 사격 속도를 극단적으로 올려 화면을 정리한다 */
      fireTimer-=sdt;
      if(fireTimer<=0){
        fireTimer=Math.max(70,T.fireEvery*1000*0.22);
        beep(920,0.05,'sawtooth',0.08);
        for(var mf=0;mf<T.missiles+1;mf++){
          var angf=(mf-(T.missiles)/2)*((T.spread+10)*Math.PI/180);
          missiles.push({x:px,y:shipY-30,vx:Math.sin(angf)*3.4,vy:-12});
        }
      }
      spawn-=sdt;
      if(spawn<=0 && !stopSpawning){
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
    ctx.translate(W/2,H/2);
    ctx.scale(cam.zoom,cam.zoom);
    ctx.translate(-W/2+shx,-H/2+shy);

    ctx.clearRect(-40,-40,W+80,H+80);
    var g=ctx.createLinearGradient(0,0,0,H);
    if(windEvt.state==='resolve'&&windEvt.lane===2){g.addColorStop(0,'#3A1A1A');g.addColorStop(1,'#1A0E0E');}
    else if(windEvt.state==='resolve'&&windEvt.lane===0){g.addColorStop(0,'#15332C');g.addColorStop(1,'#0A2226');}
    else if(windEvt.state==='resolve'&&windEvt.lane===1){g.addColorStop(0,'#3A2E10');g.addColorStop(1,'#1A1206');}
    else if(inFinale){g.addColorStop(0,'#152040');g.addColorStop(1,'#050814');}
    else {g.addColorStop(0,'#181B2E');g.addColorStop(1,'#0F1120');}
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

    /* 먼 바다 안개 */
    ctx.fillStyle='rgba(150,190,210,0.05)';
    ctx.fillRect(0,0,W,H*0.35);

    /* 파도 레이어(속도 다른 3겹) + 배 진행감 */
    var speedFeel=1+ (inFinale?0.9:0) + (windEvt.state==='resolve'&&windEvt.lane===1?0.6:0) + (gustEvt.state==='blow'?0.2:0);
    wave+=.035*frameK*speedFeel;
    [ [0.12,7,24,9], [0.08,5,34,13], [0.05,4,46,19] ].forEach(function(cfg,li){
      ctx.strokeStyle='rgba(79,195,161,'+cfg[0]+')';ctx.lineWidth=2.4;
      var rows=cfg[1];
      for(var i=0;i<rows;i++){ctx.beginPath();
        for(var x=0;x<=W;x+=26)ctx.lineTo(x,i*H/rows+Math.sin(x/cfg[2]+wave*(1+li*0.3)+i)*cfg[3]);ctx.stroke();}
    });

    /* 배경 파티클 — 물보라/바람 방향 미세 입자, 최대 개수 제한 */
    if(bgParticles.length<46 && Math.random()<0.55*frameK){
      bgParticles.push({x:Math.random()*W,y:H+10,vy:-(1.2+Math.random()*1.6)*speedFeel,vx:(Math.random()*0.6-0.3)+ (gustEvt.state==='blow'?gustEvt.dir*1.4:0),l:1,sz:2+Math.random()*3});
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

    /* 돌풍 방향 스트릭 */
    if(gustEvt.state==='blow'){
      for(var gi=0;gi<2;gi++){
        var gy=(el*260*gustEvt.dir*0+ (el*220)%H + gi*H/2)%H;
        var gx=W/2+ Math.sin(el*3+gi)*W*0.3;
        ctx.globalAlpha=0.5;
        if(!drawImgFit(ASSETS.windStreak,gx,gy,140,40,gustEvt.dir>0?0:Math.PI)){
          ctx.strokeStyle='rgba(190,240,255,.4)';ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(gx-40*gustEvt.dir,gy);ctx.lineTo(gx+40*gustEvt.dir,gy);ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
    }

    /* ================= 바람길(윈드 이벤트) 통로 ================= */
    if(windEvt.state==='choose' || windEvt.state==='resolve'){
      var laneW=W/3;
      var laneInfo=[
        {label:'← 순풍',color:'rgba(79,195,161,.22)',asset:ASSETS.windSwirlBlue},
        {label:'✨ 황금바람',color:'rgba(245,179,49,.22)',asset:null},
        {label:'🌪 거센바람 →',color:'rgba(180,90,220,.24)',asset:ASSETS.windSwirlPurple}
      ];
      for(var lI=0;lI<3;lI++){
        var lx=lI*laneW;
        var active = windEvt.state==='choose' ? (px>=lx&&px<lx+laneW) : (windEvt.lane===lI);
        ctx.fillStyle=laneInfo[lI].color;
        ctx.fillRect(lx,0,laneW,H);
        if(active){ ctx.fillStyle='rgba(255,255,255,.10)'; ctx.fillRect(lx,0,laneW,H); }
        if(imgOk(ASSETS.windFeather)){
          ctx.globalAlpha=0.35;
          drawImgFit(ASSETS.windFeather,lx+laneW/2,H*0.4,60,H*0.7,0);
          ctx.globalAlpha=1;
        }
        ctx.textAlign='center';ctx.font='800 20px SCDream, sans-serif';
        ctx.fillStyle=active?'#F2F0EA':'rgba(242,240,234,.55)';
        ctx.fillText(laneInfo[lI].label,lx+laneW/2,86);
      }
    }

    var hit=false;

    if(!suspendSpawn){
      /* 미사일 이동 + 명중 판정 */
      missiles.forEach(function(m){m.x+=m.vx*frameK;m.y+=m.vy*frameK*2.6});
      missiles=missiles.filter(function(m){return m.y>-40});
      rocks.forEach(function(r){
        r.y+=r.v*frameK*2.6;
        for(var mi2=missiles.length-1;mi2>=0;mi2--){
          var m=missiles[mi2];
          if(!r.dead&&Math.hypot(m.x-r.x,m.y-r.y)<r.r+10){
            r.dead=true;missiles.splice(mi2,1);explodeRock(r.x,r.y,r.r,inFinale);sfx('pop',0.45);kills++;
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
        var nearBand=26, hitBand=r.r+30;
        if(dx<hitBand && dy<r.r+34){
          if(!r.noHit) hit=true;
          if(windEvt.state==='resolve') windEvt.hitDuringResolve=true;
          if(gustEvt.state==='blow') gustEvt.hitDuringBlow=true;
        } else if(r.justOk && !r.dead && dy<r.r+34+nearBand && dx<hitBand+nearBand && dy>=r.r+34-6){
          /* 회피 성공 라인을 스치듯 지나가는 순간 = JUST */
          if(el>=justCooldownUntil){
            r.justOk=false; justCount++; justCooldownUntil=el+0.35;
            if(el-justComboLast<1.4) justComboN++; else justComboN=1;
            justComboLast=el;
            var justMsg = Math.random()<0.5?'간 떨어질 뻔 했져!':'지꺼지다!';
            showBig(justMsg, justComboN>=2?('JUST ×'+justComboN):'', 550,'just');
            sfx('bonus',0.35); shake(1.6); slowmoUntil=Math.max(slowmoUntil,el+0.12);
            gainEvo(1,el);
            if(justComboN===3){ showBig('잘도 요망이 아이어게!','',900,'combo'); gainEvo(1,el); giveBok(3); }
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

    /* 먹거리 */
    foods.forEach(function(f){
      if(!suspendSpawn)f.y+=f.v*2.4*frameK;
      if(!drawImgFit(f.asset,f.x,f.y,f.r*2.1,f.r*2.1,0)){
        ctx.save();ctx.translate(f.x,f.y);
        var fg2=ctx.createRadialGradient(-f.r*.3,-f.r*.3,2,0,0,f.r);
        fg2.addColorStop(0,'#E4F7EF');fg2.addColorStop(1,'#4FC3A1');
        ctx.fillStyle=fg2;ctx.beginPath();ctx.arc(0,0,f.r,0,7);ctx.fill();
        ctx.restore();
      }
      var dx=Math.abs(f.x-px), dy=Math.abs(f.y-shipY);
      if(!f.eaten && dx<f.r+30 && dy<f.r+34){
        f.eaten=true;
        var val = f.kind==='bag'?5:(f.kind==='tangerine'?2:1);
        var evoVal = f.kind==='bag'?2:1;
        giveBok(val);
        gainEvo(evoVal,el);
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
    if(!drawImgFit(ASSETS.windTrail,0,70+ (dragX-px)*0,26,90*speedFeel,0)){
      ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(0,60,14,40*speedFeel,0,0,7);ctx.fill();
    }
    ctx.globalAlpha = invuln && Math.floor(el*10)%2===0 ? 0.4 : 1;
    drawShip(ctx,lvl,pulse,haloSpin);
    ctx.restore();

    /* ---- HUD ---- */
    ctx.textAlign='left';ctx.font='800 15px SCDream, sans-serif';ctx.fillStyle='rgba(234,244,255,.7)';
    ctx.fillText('생존',22,36);
    ctx.font='800 30px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
    ctx.fillText(el.toFixed(1)+'s',22,66);
    ctx.textAlign='right';ctx.font='800 14px SCDream, sans-serif';ctx.fillStyle='rgba(79,195,161,.85)';
    ctx.fillText('⚓ '+T.name,W-22,36);
    if(lvl<SHIP_TIERS.length-1){
      var need=SHIP_TIERS[lvl+1].need, pct=Math.min(1,evoProgress/need);
      ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(W-122,44,100,6);
      ctx.fillStyle='#4FC3A1';ctx.fillRect(W-122,44,100*pct,6);
    } else {
      ctx.font='700 12px SCDream, sans-serif';ctx.fillStyle='rgba(245,179,49,.85)';ctx.fillText('MAX',W-22,54);
    }
    /* 하트 */
    ctx.textAlign='left';ctx.font='22px sans-serif';
    for(var hi=0;hi<2;hi++){ ctx.fillText(hi<hearts?'❤️':'🖤', 22+hi*30, 96); }

    /* ---- 각성 시 커다란 용 파도 백드롭(장식) ---- */
    if(awakened && imgOk(ASSETS.dragonWave)){
      ctx.globalAlpha=0.22;
      drawImgFit(ASSETS.dragonWave, W/2, H*0.32, W*0.9, W*0.9*(ASSETS.dragonWave.naturalHeight/ASSETS.dragonWave.naturalWidth), 0);
      ctx.globalAlpha=1;
    }

    /* ---- 튜토리얼 안내 ---- */
    if(!tutorialDone){
      ctx.textAlign='center';ctx.font='700 20px SCDream, sans-serif';
      ctx.fillStyle='rgba(242,240,234,.85)';
      ctx.fillText('이레 저레 움직영 보름 타보라이!', W/2, H*0.42);
    }

    /* ---- 컷인(영등할망 대사) ---- */
    if(cutin.until>performance.now()){
      var cp=1-(cutin.until-performance.now())/(cutin.until-cutin.from);
      var cAlpha=cp<0.15?cp/0.15:(cp>0.85?(1-cp)/0.15:1);
      ctx.globalAlpha=cAlpha;
      var cbY=108; /* HUD(생존/하트) 아래로 내려서 겹치지 않게 */
      ctx.fillStyle='rgba(10,14,26,.62)';ctx.fillRect(0,cbY,W,54);
      var avImg=ASSETS.yeongdeung, avOk=imgOk(avImg);
      var avX=54,avY=cbY+27;
      if(avOk){ drawImgFit(avImg,avX,avY,44,44,0); }
      else {
        if(!drawImgFit(ASSETS.windSwirlBlue,avX,avY,46,46,el*1.4)){
          ctx.fillStyle='#1c2e4a';ctx.beginPath();ctx.arc(avX,avY,20,0,7);ctx.fill();
          ctx.strokeStyle='#4FC3A1';ctx.lineWidth=2;ctx.stroke();
        }
      }
      ctx.textAlign='left';ctx.font='800 13px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText('영등할망',86,cbY+20);
      ctx.font='700 17px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
      ctx.fillText(cutin.text,86,cbY+40);
      ctx.globalAlpha=1;
    }

    /* ---- 중앙 큰 텍스트/진화 배너 ---- */
    if(bigText && bigText.until>performance.now()){
      var bp=(performance.now()-bigText.from)/(bigText.until-bigText.from);
      var bAlpha=bp<0.12?bp/0.12:(bp>0.8?(1-bp)/0.2:1);
      ctx.globalAlpha=Math.max(0,bAlpha);
      if(bigText.kind==='evo1'||bigText.kind==='evo2'){
        var bannerImg=ASSETS.evoBanner[lvl];
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
      } else if(bigText.kind==='just'){
        ctx.textAlign='center';ctx.font='800 22px SCDream, sans-serif';ctx.fillStyle='#F2F0EA';
        ctx.fillText(bigText.a, px, shipY-70);
        if(bigText.b){ ctx.font='700 15px SCDream, sans-serif';ctx.fillStyle='#4FC3A1'; ctx.fillText(bigText.b, px, shipY-46); }
        if(!drawImgFit(ASSETS.justBurst,px,shipY,90,90,0)){}
      } else if(bigText.kind==='combo'){
        ctx.textAlign='center';ctx.font='800 24px SCDream, sans-serif';ctx.fillStyle='#F5B331';
        ctx.fillText(bigText.a, W/2, H*0.3);
      } else if(bigText.kind==='break'){
        ctx.textAlign='center';ctx.font='800 26px SCDream, sans-serif';ctx.fillStyle='#F58C87';
        ctx.fillText(bigText.a, W/2, H*0.22);
      } else if(bigText.kind==='bok'){
        ctx.textAlign='center';ctx.font='800 18px SCDream, sans-serif';ctx.fillStyle='#F5B331';
        ctx.fillText(bigText.a, px, shipY-56);
      }
      ctx.globalAlpha=1;
    } else if(bigText){ bigText=null; }

    /* ---- 엔딩: 결과 요약(2~3초 안에 파악 가능한 4줄만) ---- */
    if(ending && el-endingT0>1.5){
      var pnAlpha=Math.min(1,(el-endingT0-1.5)/0.3);
      ctx.globalAlpha=pnAlpha;
      ctx.fillStyle='rgba(6,10,20,.72)';ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';ctx.font='800 24px SCDream, sans-serif';ctx.fillStyle='#F5B331';
      ctx.fillText('영등할망의 바람을 이겨냈다!',W/2,H*0.32);
      var resultRows=[['생존 시간',Math.floor(el)+'초'],['JUST 회피',justCount+'회'],['파괴한 바위',kills+'개'],['획득한 복',bokEarned+'복']];
      ctx.font='700 18px SCDream, sans-serif';
      resultRows.forEach(function(row,ri2){
        var ry=H*0.32+52+ri2*38;
        ctx.textAlign='left';ctx.fillStyle='rgba(242,240,234,.75)';ctx.fillText(row[0],W*0.26,ry);
        ctx.textAlign='right';ctx.fillStyle='#F2F0EA';ctx.fillText(row[1],W*0.74,ry);
      });
      ctx.globalAlpha=1;
    }

    ctx.restore(); /* 카메라 변환 종료 */

    $('#stScore').textContent='';

    if(hit && !invuln && !inFinale && !ending){
      hearts--;
      invulnUntil=el+1.3; shake(9);
      sfx('boom',0.6); beep(120,0.3,'square',0.2);
      if(hearts>0){
        showCutin('아이고게, 정신 촐리라게!',1300);
        toast('쾅! 정신 차리고 다시!');
      } else {
        alive=false; finishSail(el,kills,justCount); return;
      }
    }

    raf=requestAnimationFrame(loop);
  }

  var evoTimer=null;
  function giveBok(n){
    /* 화면에 즉시 보이는 작은 보상 피드백 — 실제 지급은 finishSail에서 합산 */
    bokEarned+=n;
  }
  var bokEarned=0;

  raf=requestAnimationFrame(loop);

  function finishSail(sec,kills,justN){
    var s=Math.floor(sec);stopGame();
    var isBest=s>(S.best.sail||0);
    if(isBest)S.best.sail=s;
    sfx(isBest?'fanfare':'bonus',0.7);
    var bonus=(kills||0)*3+(justN||0)*2+bokEarned;
    reward(s*2+bonus,'영등할망의 바람 · '+s+'초 생존'+(bonus?' · 보너스 +'+bonus:''));
  }
}
