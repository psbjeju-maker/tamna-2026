/* ============================================================
   영등할망의 귤 튕기기 (큰바람 모험 v2) — 탐라문화제 앱(index.html) 안의 미니게임 코드
   #wind 컨테이너 안에 자체 캔버스(#wgCanvas)를 새로 그려 넣는다(공용 #gcv 안 씀).
   이 파일만 떼서 쓰려면 아래 "의존 요소"를 먼저 준비해야 합니다.

   ── 의존 요소 (index.html 다른 곳에 있음) ──
   · <div id="wind"></div>                  게임 마운트 지점(시작 시 innerHTML로 채움)
   · openStage(title) / stopGame()          게임 화면 열기/닫기(windTeardown 호출 포함)
   · sfx(name,vol) / beep(freq,dur,type,vol)
   · sfxAmbient(name,vol) / sfxStopAmbient() / var ambientEl   배경음악
   · reward(rawPoint,label)                 화면 하단 토스트 · 보상 시트
   · S.best.wind                            오늘 기록 저장소
   · $(sel)                                 document.querySelector 단축 함수

   ── 이미지 에셋 (assets/wind-game/*.png, 5장) ──
   orange_basket / gift_basket / golden_orange / combo_star / storm_boss(신규, 먹구름 보스).
   공/받침은 Canvas로 직접 그린다. 이미지가 없거나 로드 실패해도 게임은 죽지 않는다.
   영등할망 원본 사진은 gods/final/GOD4.jpg(기존 6신 사진)를 그대로 쓴다.

   ── 배경음악 ──
   sfx/wind_bgm.mp3. 게임 시작(연습 포함) 시 sfxAmbient로 재생, 소리 토글로 음소거,
   stopGame()이 windTeardown을 거쳐 결국 sfxStopAmbient()로 정지한다.

   ── v2 변경점(사장님이 준 "큰바람 모험 v2" 재제작팩 기준) ──
   v1(가운데 3연속 맞히면 큰바람, 단순 15개 바구니)을 폐기하고: 12초 강화 선택(든든한 바람/
   뚫고 가는 귤/쌍둥이 귤), 폭탄 바구니 연쇄폭발, 정확 반사 축적식 큰바람(에너지 100%),
   보호막 아이템, 26초 먹구름 보스전, 결과 S/A/B/C 등급으로 전면 교체.
   ============================================================ */

/* --- ② 영등할망의 귤 튕기기 (큰바람 모험 v2) --- */
/* 이미지 에셋 슬롯 — PNG만 교체하면 자동 적용. */
var WIND_DIR='assets/wind-game/';
var WIND_IMG={};
['orange_basket','gift_basket','golden_orange','combo_star','storm_boss'].forEach(function(n){
  var im=new Image();im.src=WIND_DIR+n+'.png';WIND_IMG[n]=im;
});
function wimg(n){var im=WIND_IMG[n];return(im&&im.complete&&im.naturalWidth>0)?im:null}

/* 조작감 수치 — 전부 여기서 조정한다(현장 시연 후 수정 지점) */
var WIND_CONFIG={
  width:390, height:580, duration:40, upgradeAt:12, bossAt:26, step:1/120,
  paddleY:463, paddleWidth:98, ballRadius:12, ballSpeed:320,
  speedStep:5, speedCap:30, feverDuration:6, bossHealth:6
};

/* ---- 진입 ---- */
var windTeardown=null;
function gWind(){
  openStage('영등할망의 귤 튕기기');
  cv.style.display='none';
  $('#canvasWrap').style.display='none';
  var p=$('#wind');p.style.display='flex';
  windMount();
}
function windMount(){
  var p=$('#wind');
  p.innerHTML=
    '<div class="wg-app">'+
      '<div class="wg-hud">'+
        '<div><small>남은 시간</small><b id="wgTime">40<span>초</span></b></div>'+
        '<div class="wg-hud-score"><small>모은 점수</small><b id="wgScore">0</b></div>'+
        '<div><small id="wgChainLabel">최고 연쇄</small><b id="wgChain">0<span>개</span></b></div>'+
      '</div>'+
      '<div class="wg-energy-row" id="wgEnergyRow"><span id="wgEnergyLabel">큰바람 충전</span><div class="wg-energy-track"><i id="wgEnergyBar"></i></div><span id="wgEnergyValue">0%</span></div>'+
      '<div class="wg-stage">'+
        '<canvas id="wgCanvas" width="780" height="1160" aria-label="귤 튕기기 게임. 화면 아래를 좌우로 움직여 받침을 조작하세요."></canvas>'+
        '<div id="wgAnnouncement"></div>'+
        '<div id="wgOverlay"><div class="wg-panel" id="wgPanel"></div></div>'+
      '</div>'+
      '<div class="wg-footer"><span id="wgPhase">01 · 보물 깨기</span><span id="wgBuild">가운데에 맞히면 강풍!</span></div>'+
      '<div class="wg-toolbar">'+
        '<button class="btn btn--secondary btn--sm" id="wgSoundBtn">소리 켬</button>'+
        '<button class="btn btn--secondary btn--sm" id="wgPauseBtn">Ⅱ 일시정지</button>'+
      '</div>'+
    '</div>';
  windInit();
}

/* ---- 실제 게임(받침으로 귤 튕기기 · 강화 선택 · 보스전) ---- */
function windInit(){
  var C=WIND_CONFIG;
  var cvv=$('#wgCanvas'),gctx=cvv.getContext('2d');
  var overlay=$('#wgOverlay'),panel=$('#wgPanel'),announceEl=$('#wgAnnouncement');
  var soundBtn=$('#wgSoundBtn'),pauseBtn=$('#wgPauseBtn');
  var timeEl=$('#wgTime'),scoreEl=$('#wgScore'),chainEl=$('#wgChain'),chainLabelEl=$('#wgChainLabel');
  var energyRow=$('#wgEnergyRow'),energyLabelEl=$('#wgEnergyLabel'),energyBarEl=$('#wgEnergyBar'),energyValueEl=$('#wgEnergyValue');
  var phaseEl=$('#wgPhase'),buildEl=$('#wgBuild');

  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state='menu',practice=false,elapsed=0,score=0,hits=0,misses=0,wave=0,choice=null,upgraded=false,phase=1;
  var balls=[],targets=[],drops=[],particles=[],rings=[],floaters=[],blastQueue=[];
  var energy=0,fever=0,shield=1,bestChain=0,chain=0,chainClock=0,perfects=0,paddleX=195,paddlePulse=0,respawn=0;
  var boss=null,won=false,completed=false,announceT=0,accumulator=0,lastTime=0,pointer=null,soundOn=true;
  var trailTime=0,pendingBalls=[],lastHud='',shake=0,rafId=0;
  var keys={};

  function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
  function wbeep(kind){
    if(!soundOn)return;
    var f={hit:640,perfect:990,bounce:370,bomb:180,fever:1100,shield:750,boss:230,win:1300}[kind]||500;
    beep(f,kind==='bomb'?0.15:0.075,kind==='bomb'?'triangle':'sine',0.1);
  }
  function notify(txt,dur){announceEl.textContent=txt;announceEl.style.opacity=1;announceT=dur==null?1:dur}
  function show(html){panel.innerHTML=html;overlay.classList.add('on');pointer=null;keys.ArrowLeft=keys.ArrowRight=false}
  function hideOverlay(){overlay.classList.remove('on');pointer=null;accumulator=0;lastTime=performance.now()}

  function paddleWidth(){return choice==='wide'?132:C.paddleWidth}
  function constrainPaddle(){paddleX=clamp(paddleX,paddleWidth()/2+9,381-paddleWidth()/2)}
  function newBall(angle){
    angle=angle==null?0.2:angle;
    var speed=C.ballSpeed+Math.min(wave*C.speedStep,C.speedCap);
    return {x:paddleX,y:C.paddleY-20,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,r:C.ballRadius,power:0,trail:[],squash:0,bossCooldown:0};
  }
  function launch(){
    balls=[newBall(0.22)];
    if(choice==='twin')balls.push(newBall(-0.3));
    respawn=0;
  }
  function makeWave(){
    wave++;targets=[];
    for(var row=0;row<3;row++){
      for(var col=0;col<5;col++){
        var n=row*5+col;
        var bomb=n===(wave%2?6:8)||n===13;
        var gift=!bomb&&(n+wave)%5===0;
        targets.push({id:wave*100+n,x:25+col*69,y:76+row*62,w:64,h:54,type:bomb?'bomb':gift?'gift':'normal',alive:true});
      }
    }
  }

  function title(){
    state='menu';phase=1;balls=[];boss=null;drops=[];particles=[];rings=[];floaters=[];
    fever=0;energy=0;score=0;elapsed=0;bestChain=0;choice=null;practice=false;wave=0;
    announceEl.style.opacity=0;makeWave();
    show(
      '<img class="hero" src="assets/wind-game/golden_orange.png" alt="황금 귤" onerror="this.remove()">'+
      '<h2>귤 하나로<br>보물이 와르르!</h2>'+
      '<p>좌우로 움직여 귤을 튕기세요.<br>보물을 터뜨리고 <b>먹구름을 물리쳐요!</b></p>'+
      '<button class="btn btn--primary btn--block btn--lg" id="wgStart">모험 시작하기</button>'+
      '<button class="btn btn--tertiary btn--block" id="wgPractice">먼저 연습해 볼래요</button>'+
      '<p class="wg-micro">중간에 강화 선택 · 마지막에 보스 등장</p>'
    );
    $('#wgStart').onclick=function(){start(false)};
    $('#wgPractice').onclick=function(){start(true)};
  }

  function start(isPractice){
    practice=isPractice;elapsed=0;score=0;hits=0;misses=0;wave=0;choice=null;upgraded=false;phase=1;
    balls=[];drops=[];particles=[];rings=[];floaters=[];blastQueue=[];energy=0;fever=0;shield=1;
    bestChain=0;chain=0;chainClock=0;perfects=0;paddleX=195;paddlePulse=0;boss=null;won=false;completed=false;
    pendingBalls=[];trailTime=0;shake=0;makeWave();state='playing';respawn=.5;hideOverlay();
    notify('아래에서 좌우로! 가운데에 톡!',1.6);updateHud(true);
    sfxAmbient('wind_bgm',0.45);if(ambientEl)ambientEl.muted=!soundOn;
  }

  function chooseScreen(){
    state='upgrade';
    show(
      '<span class="wg-tag">LEVEL UP · 시간은 멈춰 있어요</span>'+
      '<h2>어떤 바람을 쓸까요?</h2>'+
      '<p>이번 판을 함께할 능력 하나!</p>'+
      '<div class="wg-choices">'+
        '<button class="wg-choice" data-choice="wide"><i>↔</i><div><b>든든한 바람</b><small>받침이 넓어져요 · 보호막 2회</small></div></button>'+
        '<button class="wg-choice" data-choice="pierce"><i>↑</i><div><b>뚫고 가는 귤</b><small>계속 관통해요 · 보스 피해 2배</small></div></button>'+
        '<button class="wg-choice" data-choice="twin"><i>●●</i><div><b>쌍둥이 귤</b><small>매 출발마다 귤 2개 · 점수 20% 추가</small></div></button>'+
      '</div>'
    );
    var els=panel.querySelectorAll('[data-choice]');
    for(var i=0;i<els.length;i++){
      (function(el){el.onclick=function(){applyChoice(el.getAttribute('data-choice'))}})(els[i]);
    }
  }
  function applyChoice(id){
    if(state!=='upgrade'||(id!=='wide'&&id!=='pierce'&&id!=='twin'))return;
    choice=id;upgraded=true;phase=2;
    if(id==='wide')shield=2;
    constrainPaddle();
    if(id==='twin'&&balls.length<2)balls.push(newBall(-0.35));
    state='playing';hideOverlay();
    notify({wide:'받침이 넓어졌어요!',pierce:'관통 귤! 쭉쭉 뚫어요!',twin:'귤 둘이 함께!'}[id]);
    updateHud(true);
  }

  function enterBoss(){
    phase=3;targets=[];blastQueue=[];drops=[];particles=[];rings=[];floaters=[];chain=0;chainClock=0;
    boss={x:195,y:119,w:142,h:84,hp:C.bossHealth,hit:0,cooldown:0};
    balls=[];respawn=.65;pendingBalls=[];
    notify('먹구름 등장! 귤로 맞혀요!',1.4);wbeep('boss');
  }

  function pause(){
    if(state!=='playing')return;state='paused';
    show(
      '<span class="wg-tag">PAUSE</span><h2>잠깐 쉬어가요</h2><p>준비되면 바람을 다시 이어가세요.</p>'+
      '<button class="btn btn--primary btn--block btn--lg" id="wgResume">이어서 하기</button>'+
      '<button class="btn btn--tertiary btn--block" id="wgQuit">처음으로</button>'
    );
    $('#wgResume').onclick=function(){state='playing';hideOverlay()};
    $('#wgQuit').onclick=title;
  }
  pauseBtn.onclick=pause;

  soundBtn.onclick=function(){
    soundOn=!soundOn;soundBtn.textContent=soundOn?'소리 켬':'소리 끔';
    if(ambientEl)ambientEl.muted=!soundOn;
  };

  function finish(){
    if(completed)return;completed=true;state='result';
    if(practice){
      var grade0=score>=12000?'S':score>=7500?'A':score>=3000?'B':'C';
      show(
        '<img class="hero" src="assets/wind-game/'+(won?'golden_orange':'combo_star')+'.png" alt="">'+
        '<span class="wg-grade">연습 완료 · '+(won?'먹구름 격파!':'모험 완료')+'</span>'+
        '<h2>'+(won?'제주에 햇살이 돌아왔어요!':'다음엔 먹구름까지!')+'</h2>'+
        '<div class="wg-result-score">'+score.toLocaleString()+'<span style="font-size:16px;letter-spacing:0"> 점</span></div>'+
        '<div class="wg-stats"><div>보물<b>'+hits+'개</b></div><div>최고 연쇄<b>'+bestChain+'개</b></div><div>정확한 반사<b>'+perfects+'회</b></div></div>'+
        '<button class="btn btn--primary btn--block btn--lg" id="wgAgain">모험 시작하기</button>'+
        '<button class="btn btn--tertiary btn--block" id="wgBack">처음으로</button>'
      );
      $('#wgAgain').onclick=function(){start(false)};
      $('#wgBack').onclick=title;
    } else {
      stopGame();
      var grade=score>=12000?'S':score>=7500?'A':score>=3000?'B':'C';
      var isBest=score>(S.best.wind||0);
      if(isBest)S.best.wind=score;
      sfx(won||isBest?'fanfare':'bonus',0.7);
      reward(Math.round(score/40),'영등할망의 귤 튕기기 · '+grade+'등급 · '+(won?'먹구름 격파! · ':'')+'보물 '+hits+'개 · 최고 연쇄 '+bestChain+'개 · 정확한 반사 '+perfects+'회 · 총점 '+score+'점'+(isBest?' · 신기록!':''));
    }
  }

  function pointerPosition(e){
    var r=cvv.getBoundingClientRect();
    paddleX=(e.clientX-r.left)*390/r.width;constrainPaddle();
  }
  function onDown(e){ if(state!=='playing'||pointer!==null)return; pointer=e.pointerId; try{cvv.setPointerCapture(pointer)}catch(err){} pointerPosition(e); }
  function onMove(e){ if(state==='playing'&&e.pointerId===pointer)pointerPosition(e); }
  function onUp(e){ if(e.pointerId===pointer)pointer=null; }
  cvv.addEventListener('pointerdown',onDown);
  cvv.addEventListener('pointermove',onMove);
  cvv.addEventListener('pointerup',onUp);
  cvv.addEventListener('pointercancel',onUp);
  cvv.addEventListener('lostpointercapture',onUp);

  function onKeydown(e){
    if(['ArrowLeft','ArrowRight',' '].indexOf(e.key)===-1)return;
    if(state!=='playing')return;
    e.preventDefault();keys[e.key]=true;
    if(e.key===' ')pause();
  }
  function onKeyup(e){ keys[e.key]=false; }
  function onBlur(){ keys.ArrowLeft=keys.ArrowRight=false;pointer=null;pause(); }
  function onVisibility(){ if(document.hidden)pause(); }
  window.addEventListener('keydown',onKeydown);
  window.addEventListener('keyup',onKeyup);
  window.addEventListener('blur',onBlur);
  document.addEventListener('visibilitychange',onVisibility);

  function burst(x,y,color,amount){
    amount=amount==null?10:amount;
    for(var i=0;i<(reduced?3:amount);i++){
      var angle=Math.random()*6.283,speed=35+Math.random()*95;
      particles.push({x:x,y:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.35+Math.random()*.2,color:color,size:2+Math.random()*3});
    }
    rings.push({x:x,y:y,life:.28,total:.28,color:color,r:35});
    particles=particles.slice(-90);
  }
  function floating(text,x,y,color){
    floaters.push({text:text,x:x,y:y,life:.65,color:color||'#1d6152'});
    floaters=floaters.slice(-12);
  }
  function addEnergy(value){
    if(fever>0)return;
    energy=Math.min(100,energy+value);
    if(energy>=100){
      energy=0;fever=C.feverDuration;notify('큰바람! 귤 3개 · 점수 2배');wbeep('fever');
      var anchor=null;
      for(var i=0;i<balls.length;i++){if(balls[i].y<C.paddleY){anchor=balls[i];break}}
      if(!anchor)anchor=newBall();
      for(var k=balls.length+pendingBalls.length;k<3;k++){
        var b=newBall((k-1)*.55);b.x=anchor.x;b.y=Math.min(anchor.y,C.paddleY-20);pendingBalls.push(b);
      }
    }
  }
  function destroyTarget(t,byChain){
    if(!t||!t.alive)return;
    t.alive=false;hits++;chain=chainClock>0?chain+1:1;chainClock=1.15;bestChain=Math.max(bestChain,chain);
    var multi=Math.min(3,1+Math.floor((chain-1)/4)*.5);
    var amount=Math.round((t.type==='gift'?150:100)*multi*(fever>0?2:1)*(choice==='twin'?1.2:1));
    score+=amount;
    var x=t.x+t.w/2,y=t.y+t.h/2;
    burst(x,y,t.type==='bomb'?'#ee8954':'#eda743');
    floating('+'+amount,x,y);
    addEnergy(t.type==='gift'?16:8);
    if(t.type==='bomb'){
      rings.push({x:x,y:y,life:.4,total:.4,color:'#f49752',r:100});
      for(var i=0;i<targets.length;i++){
        var neighbor=targets[i];
        if(neighbor.alive&&Math.hypot(neighbor.x-t.x,neighbor.y-t.y)<105){
          blastQueue.push({target:neighbor,delay:.055+Math.hypot(neighbor.x-t.x,neighbor.y-t.y)/1300});
        }
      }
      wbeep('bomb');shake=reduced?0:.10;
    } else if(!byChain)wbeep('hit');
    if(t.type==='gift'&&drops.length<3)drops.push({x:x,y:y,vy:140});
  }

  function update(dt){
    if(state!=='playing')return;
    elapsed+=dt;
    if(!practice&&elapsed>=C.duration){elapsed=C.duration;finish();return}
    if(!upgraded&&elapsed>=C.upgradeAt){chooseScreen();return}
    if(phase!==3&&elapsed>=C.bossAt)enterBoss();
    if(keys.ArrowLeft)paddleX-=410*dt;if(keys.ArrowRight)paddleX+=410*dt;
    constrainPaddle();
    paddlePulse=Math.max(0,paddlePulse-dt);shake=Math.max(0,shake-dt);
    chainClock=Math.max(0,chainClock-dt);if(chainClock===0)chain=0;
    var oldFever=fever;fever=Math.max(0,fever-dt);
    if(oldFever>0&&fever===0){balls=balls.slice(0,choice==='twin'?2:1);pendingBalls=[];notify('재충전해서 한 번 더!')}
    if(boss){
      boss.x=195+Math.sin((elapsed-C.bossAt)*1.55)*70;
      boss.hit=Math.max(0,boss.hit-dt);boss.cooldown=Math.max(0,boss.cooldown-dt);
    }
    if(respawn>0){respawn-=dt;if(respawn<=0)launch()}
    var due=[];
    blastQueue.forEach(function(entry){entry.delay-=dt;if(entry.delay<=0)due.push(entry)});
    blastQueue=blastQueue.filter(function(e){return e.delay>0});
    due.forEach(function(e){destroyTarget(e.target,true)});

    for(var bi=0;bi<balls.length;bi++){
      var b=balls[bi];var ox=b.x,oy=b.y;
      b.x+=b.vx*dt;b.y+=b.vy*dt;
      b.power=Math.max(0,b.power-dt);b.squash=Math.max(0,b.squash-dt);b.bossCooldown=Math.max(0,b.bossCooldown-dt);
      if(b.x<9+b.r){b.x=9+b.r;b.vx=Math.abs(b.vx)}
      if(b.x>381-b.r){b.x=381-b.r;b.vx=-Math.abs(b.vx)}
      if(b.y<34+b.r){b.y=34+b.r;b.vy=Math.abs(b.vy)}
      var half=paddleWidth()/2;
      if(b.vy>0&&oy+b.r<=C.paddleY&&b.y+b.r>=C.paddleY&&Math.abs(b.x-paddleX)<=half+b.r*.35){
        b.y=C.paddleY-b.r-.1;
        var offset=clamp((b.x-paddleX)/half,-1,1),angle=offset*Math.PI/3.1;
        var speed=C.ballSpeed+Math.min(wave*C.speedStep,C.speedCap);
        b.vx=Math.sin(angle)*speed;if(Math.abs(b.vx)<50)b.vx=(offset<0?-1:1)*50;
        b.vy=-Math.sqrt(speed*speed-b.vx*b.vx);b.squash=.13;paddlePulse=.15;
        var perfect=Math.abs(b.x-paddleX)<21;
        if(perfect){b.power=2.4;perfects++;floating('정확해요!',b.x,C.paddleY-37,'#926920');addEnergy(25);wbeep('perfect')}
        else{addEnergy(5);wbeep('bounce')}
        burst(b.x,C.paddleY,perfect?'#e8bd56':'#64baa7',5);
      }
      for(var ti=0;ti<targets.length;ti++){
        var t=targets[ti];if(!t.alive)continue;
        var nx=clamp(b.x,t.x,t.x+t.w),ny=clamp(b.y,t.y,t.y+t.h);
        if(Math.pow(b.x-nx,2)+Math.pow(b.y-ny,2)<b.r*b.r){
          destroyTarget(t);
          if(choice!=='pierce'&&b.power<=0){
            if(oy+b.r<=t.y||oy-b.r>=t.y+t.h){b.vy=-b.vy;b.y=oy}else{b.vx=-b.vx;b.x=ox}
            b.squash=.1;break;
          }
        }
      }
      if(boss&&boss.hp>0&&boss.cooldown===0&&b.bossCooldown===0){
        var bx=boss.x-boss.w/2,by=boss.y-boss.h/2;
        var bnx=clamp(b.x,bx,bx+boss.w),bny=clamp(b.y,by,by+boss.h);
        if(Math.pow(b.x-bnx,2)+Math.pow(b.y-bny,2)<=b.r*b.r){
          var damage=(choice==='pierce'||b.power>0)?2:1;
          boss.hp=Math.max(0,boss.hp-damage);boss.hit=.18;boss.cooldown=.18;b.bossCooldown=.45;
          b.y=boss.y+boss.h/2+b.r+2;b.vy=Math.abs(b.vy);score+=200;
          burst(b.x,boss.y+20,'#ffd37c',14);wbeep('boss');
          floating('-'+damage,boss.x,boss.y-44,'#fff7d4');
          if(boss.hp===0){
            won=true;score+=1200+(practice?0:Math.ceil(C.duration-elapsed)*40);
            burst(boss.x,boss.y,'#ffc45d',26);wbeep('win');finish();return;
          }
        }
      }
      if(b.vy>0&&b.y>C.paddleY+36&&shield>0){
        shield--;b.y=C.paddleY+24;b.vy=-Math.abs(b.vy);
        burst(b.x,b.y,'#6ee0c7',12);notify('보호막이 살려줬어요!');wbeep('shield');
      }
    }
    balls=balls.concat(pendingBalls).filter(function(b){return b.y<C.paddleY+66}).slice(0,3);
    pendingBalls=[];
    if(balls.length===0&&respawn<=0){misses++;energy=Math.max(0,energy-20);fever=0;respawn=.55;notify('다시 출발!')}
    if(phase!==3&&targets.length>0&&targets.every(function(t){return !t.alive})&&blastQueue.length===0){makeWave();notify('보물이 또 왔어요!')}
    drops.forEach(function(d){
      d.y+=d.vy*dt;
      if(d.y>C.paddleY-12&&d.y<C.paddleY+15&&Math.abs(d.x-paddleX)<paddleWidth()/2+10){
        shield=Math.min(2,shield+1);d.y=999;floating('보호막 +1',paddleX,C.paddleY-28);wbeep('shield');
      }
    });
    drops=drops.filter(function(d){return d.y<530});
    particles.forEach(function(p){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt});
    particles=particles.filter(function(p){return p.life>0});
    rings.forEach(function(r){r.life-=dt});rings=rings.filter(function(r){return r.life>0});
    floaters.forEach(function(f){f.life-=dt;f.y-=26*dt});floaters=floaters.filter(function(f){return f.life>0});
    if(announceT>0){announceT-=dt;if(announceT<=0)announceEl.style.opacity=0}
    trailTime+=dt;
    if(trailTime>=.025){
      trailTime=0;
      balls.forEach(function(b){b.trail.push({x:b.x,y:b.y});b.trail=b.trail.slice(-4)});
    }
  }

  function rounded(x,y,w,h,r,fill,stroke){
    gctx.fillStyle=fill;gctx.beginPath();gctx.roundRect(x,y,w,h,r);gctx.fill();
    if(stroke){gctx.strokeStyle=stroke;gctx.lineWidth=1;gctx.stroke()}
  }
  function gtext(t,x,y,size,color,weight){
    size=size||12;color=color||'#27534e';weight=weight||650;
    gctx.fillStyle=color;gctx.font=(Math.round(weight/100)*100)+' '+size+'px SCDream, system-ui';
    gctx.textAlign='center';gctx.fillText(t,x,y);
  }
  function sprite(name,x,y,w,h){
    var im=WIND_IMG[name];if(!im||!im.complete||!im.naturalWidth)return;
    var s=Math.min(w/im.naturalWidth,h/im.naturalHeight);
    gctx.drawImage(im,x+(w-im.naturalWidth*s)/2,y+(h-im.naturalHeight*s)/2,im.naturalWidth*s,im.naturalHeight*s);
  }
  function cloud(x,y,s){
    gctx.fillStyle='#fff9e9';gctx.beginPath();
    gctx.ellipse(x,y,33*s,10*s,0,0,7);gctx.ellipse(x-10*s,y-6*s,14*s,13*s,0,0,7);gctx.ellipse(x+9*s,y-9*s,18*s,15*s,0,0,7);
    gctx.fill();
  }
  function draw(){
    gctx.setTransform(cvv.width/390,0,0,cvv.height/580,0,0);gctx.clearRect(0,0,390,580);
    var sky=gctx.createLinearGradient(0,0,0,580);
    sky.addColorStop(0,phase===3?'#243943':'#0c2b30');sky.addColorStop(.58,phase===3?'#1f4048':'#123a3c');sky.addColorStop(1,'#1c4b45');
    gctx.fillStyle=sky;gctx.fillRect(0,0,390,580);
    gctx.globalAlpha=.18;gctx.fillStyle='#ffd98a';gctx.beginPath();gctx.arc(309,95,47,0,7);gctx.fill();
    cloud(62+Math.sin(elapsed*.08)*10,45,.9);cloud(329,42,.65);gctx.globalAlpha=1;
    gctx.fillStyle='#173f3c';gctx.beginPath();
    gctx.moveTo(0,356);gctx.quadraticCurveTo(54,345,107,306);gctx.quadraticCurveTo(136,271,154,305);gctx.quadraticCurveTo(188,330,263,351);gctx.lineTo(390,377);gctx.lineTo(390,580);gctx.lineTo(0,580);gctx.fill();
    gctx.fillStyle='#1c4b45';gctx.beginPath();
    gctx.moveTo(0,376);gctx.quadraticCurveTo(99,323,196,369);gctx.quadraticCurveTo(300,312,390,344);gctx.lineTo(390,580);gctx.lineTo(0,580);gctx.fill();
    gctx.fillStyle='#123a3c';gctx.fillRect(0,410,390,170);
    gctx.strokeStyle='rgba(217,239,225,.25)';gctx.lineWidth=1.5;
    for(var i=0;i<4;i++){var y=421+i*18;gctx.beginPath();gctx.moveTo(10+i*40,y);gctx.quadraticCurveTo(100+i*20,y+4,220+i*35,y);gctx.stroke()}
    for(var pi=0;pi<3;pi++)rounded(16+pi*122,17,114,4,2,phase>=pi+1?'#F5B331':'rgba(120,157,145,.25)');
    gctx.save();if(shake>0)gctx.translate(Math.sin(elapsed*70)*1.5,0);
    targets.forEach(function(t){
      if(!t.alive)return;
      var bomb=t.type==='bomb';
      rounded(t.x,t.y+3,t.w,t.h,12,'rgba(29,88,69,.16)');
      rounded(t.x,t.y,t.w,t.h,12,bomb?'#f3c285':t.type==='gift'?'#f1d49a':'#2a5450',bomb?'#be8a53':'#3f6b64');
      sprite(t.type==='gift'?'gift_basket':'orange_basket',t.x+5,t.y+1,t.w-10,t.h-5);
      if(bomb){rounded(t.x+44,t.y-4,23,20,7,'#c55e3c');gtext('✦',t.x+55,t.y+11,15,'#fff3d2')}
    });
    gctx.restore();
    if(boss&&boss.hp>0){
      var scale=1+Math.sin(boss.hit/.18*Math.PI)*.035;
      gctx.save();gctx.translate(boss.x,boss.y);gctx.scale(scale,scale);sprite('storm_boss',-96,-58,192,116);gctx.restore();
      gtext('먹구름',195,43,13,'#F2F0EA',850);
      for(var hi=0;hi<C.bossHealth;hi++)rounded(131+hi*22,51,18,5,2,hi<boss.hp?'#df9460':'#3f6b64');
      if(boss.hit>0){
        gctx.globalAlpha=boss.hit/.18;gctx.strokeStyle='#ffe7ac';gctx.lineWidth=2;
        gctx.beginPath();gctx.ellipse(boss.x,boss.y,80,46,0,0,7);gctx.stroke();gctx.globalAlpha=1;
      }
    }
    drops.forEach(function(d){
      gctx.fillStyle='#cff2df';gctx.strokeStyle='#498e83';gctx.lineWidth=2;
      gctx.beginPath();gctx.arc(d.x,d.y,10,0,7);gctx.fill();gctx.stroke();gtext('◇',d.x,d.y+5,15,'#37766f');
    });
    balls.forEach(function(b){
      if(!reduced){
        b.trail.forEach(function(p,i){gctx.globalAlpha=(i+1)*.055;gctx.fillStyle='#ec8f22';gctx.beginPath();gctx.arc(p.x,p.y,b.r*.72,0,7);gctx.fill()});
        gctx.globalAlpha=1;
      }
      gctx.save();gctx.translate(b.x,b.y);
      if(b.squash>0){var f=Math.sin(b.squash/.13*Math.PI);gctx.scale(1+f*.13,1-f*.13)}
      if(b.power>0||choice==='pierce'){gctx.strokeStyle='#fff3c1';gctx.lineWidth=3;gctx.beginPath();gctx.arc(0,0,15,0,7);gctx.stroke()}
      var g=gctx.createRadialGradient(-4,-5,1,0,0,13);
      g.addColorStop(0,'#ffe68b');g.addColorStop(.55,'#ffb138');g.addColorStop(1,'#e88821');
      gctx.fillStyle=g;gctx.beginPath();gctx.arc(0,0,b.r,0,7);gctx.fill();
      gctx.strokeStyle='#9e5e22';gctx.lineWidth=1.2;gctx.stroke();
      gctx.fillStyle='#477c4b';gctx.beginPath();gctx.ellipse(3,-10,5,2.4,-.5,0,7);gctx.fill();
      gctx.restore();
    });
    var pw=paddleWidth(),pulse=Math.sin(paddlePulse/.15*Math.PI)*2;
    rounded(paddleX-pw/2,C.paddleY+5,pw,13,7,'rgba(20,30,36,.4)');
    rounded(paddleX-pw/2,C.paddleY+pulse,pw,12,6,fever>0?'#ffc45e':'#F5B331','#4c8b7a');
    rounded(paddleX-21,C.paddleY+2+pulse,42,6,3,'#fff4d0');
    gctx.strokeStyle='#ffffdb';gctx.lineWidth=1.5;
    gctx.beginPath();gctx.moveTo(paddleX-4,C.paddleY-8);gctx.lineTo(paddleX,C.paddleY-12);gctx.lineTo(paddleX+4,C.paddleY-8);gctx.stroke();
    if(shield>0){
      gctx.strokeStyle='#dcffe6';gctx.lineWidth=2;gctx.globalAlpha=.7;gctx.setLineDash([5,5]);
      gctx.beginPath();gctx.moveTo(15,C.paddleY+34);gctx.lineTo(375,C.paddleY+34);gctx.stroke();
      gctx.setLineDash([]);gctx.globalAlpha=1;gtext('보호막 '+shield,340,C.paddleY+51,9,'#F2F0EA');
    }
    rounded(14,526,362,42,16,'rgba(245,179,49,.10)');gtext('←  손가락은 여기서 좌우로  →',195,551,12,'#F5B331');
    particles.forEach(function(p){gctx.globalAlpha=Math.min(1,p.life*3);rounded(p.x,p.y,p.size,p.size,1,p.color)});gctx.globalAlpha=1;
    rings.forEach(function(r){gctx.globalAlpha=r.life/r.total*.8;gctx.strokeStyle=r.color;gctx.lineWidth=2;gctx.beginPath();gctx.arc(r.x,r.y,(1-r.life/r.total)*r.r+3,0,7);gctx.stroke()});gctx.globalAlpha=1;
    floaters.forEach(function(fl){gctx.globalAlpha=Math.min(1,fl.life*3);gtext(fl.text,fl.x,fl.y,14,fl.color,850)});gctx.globalAlpha=1;
    if(chain>=3&&chainClock>0){rounded(141,276,108,25,12,'rgba(255,251,223,.87)');gtext(chain+' 연쇄!',195,293,14,'#946726',850)}
  }
  function updateHud(force){
    var time=practice?'∞':Math.ceil(Math.max(0,C.duration-elapsed));
    var value=fever>0?Math.ceil(fever)+'초':Math.floor(energy)+'%';
    var key=[time,score,bestChain,value,phase,choice].join(',');
    if(!force&&key===lastHud)return;
    lastHud=key;
    timeEl.innerHTML=time+'<span>초</span>';
    scoreEl.textContent=score.toLocaleString();
    chainEl.innerHTML=bestChain+'<span>개</span>';
    energyLabelEl.textContent=fever>0?'큰바람 · 점수 2배':'큰바람 충전';
    energyValueEl.textContent=value;
    energyBarEl.style.width=(fever>0?fever/C.feverDuration*100:energy)+'%';
    energyRow.classList.toggle('fever',fever>0);
    phaseEl.textContent=['','01 · 보물 깨기','02 · 더 강한 바람','03 · 먹구름 보스전'][phase];
    buildEl.textContent=choice?{wide:'든든한 바람',pierce:'뚫고 가는 귤',twin:'쌍둥이 귤'}[choice]:'가운데에 맞히면 강풍!';
  }
  function loop(now){
    var delta=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
    if(state==='playing'){
      accumulator+=delta;
      while(accumulator>=C.step){update(C.step);accumulator-=C.step;if(state!=='playing'){accumulator=0;break}}
    } else accumulator=0;
    draw();updateHud(false);
    rafId=requestAnimationFrame(loop);
  }

  windTeardown=function(){
    if(rafId)cancelAnimationFrame(rafId);rafId=0;
    cvv.removeEventListener('pointerdown',onDown);
    cvv.removeEventListener('pointermove',onMove);
    cvv.removeEventListener('pointerup',onUp);
    cvv.removeEventListener('pointercancel',onUp);
    cvv.removeEventListener('lostpointercapture',onUp);
    window.removeEventListener('keydown',onKeydown);
    window.removeEventListener('keyup',onKeyup);
    window.removeEventListener('blur',onBlur);
    document.removeEventListener('visibilitychange',onVisibility);
  };

  var namesToLoad=['orange_basket','gift_basket','golden_orange','combo_star','storm_boss'];
  Promise.all(namesToLoad.map(function(name){
    return new Promise(function(resolve){
      var im=WIND_IMG[name];
      if(im&&im.complete){resolve();return}
      if(im){im.addEventListener('load',resolve);im.addEventListener('error',resolve)}else resolve();
    });
  })).then(function(){ title();lastTime=performance.now();rafId=requestAnimationFrame(loop); });
}