/* ============================================================
   영등할망의 바람배달 — 탐라문화제 앱(index.html) 안의 미니게임 코드
   canvas(#gcv) + 시작/튜토리얼 화면용 DOM(#wind)을 함께 쓴다.
   이 파일만 떼서 쓰려면 아래 "의존 요소"를 먼저 준비해야 합니다.

   ── 의존 요소 (index.html 다른 곳에 있음) ──
   · <canvas id="gcv"></canvas>, <div id="wind"></div>   게임 캔버스 · 시작/튜토리얼 DOM
   · var cv=$('#gcv'), ctx=cv.getContext('2d'), raf=null;
   · openStage(title) / stopGame()          게임 화면 열기/닫기(#wind 정리 포함)
   · sfx(name,vol) / beep(freq,dur,type,vol)
   · reward(rawPoint,label)                 화면 하단 토스트 · 보상 시트
   · S.best.wind                            오늘 기록 저장소
   · $(sel)                                 document.querySelector 단축 함수

   ── 이미지 에셋 (assets/wind-game/*.png, 12장) ──
   원본 스프라이트시트(탐라문화제/file_00000000ecb48206a46fff4dcb1a2c07.png,
   3행×4열)를 균등 그리드로 잘라 만들었다. 파일이 없거나 로드 실패해도
   게임은 죽지 않고 도형/텍스트로 자동 대체된다(wimg() 참고).
   영등할망 원본 사진은 gods/final/GOD4.jpg(기존 6신 사진)를 그대로 쓴다.
   ============================================================ */

/* --- ② 영등할망의 바람배달 --- */
/* 이미지 에셋 슬롯 — PNG만 교체하면 자동 적용. 로드 실패/미완료면 도형 폴백으로 그린다. */
var WIND_DIR='assets/wind-game/';
var WIND_IMG={};
['orange_basket','gift_basket','harbor_target','village_target','orchard_target',
 'wind_gust','wind_trail','combo_star','water_splash','golden_orange','dokkaebi','seagull'
].forEach(function(n){var im=new Image();im.src=WIND_DIR+n+'.png';WIND_IMG[n]=im});
function wimg(n){var im=WIND_IMG[n];return(im&&im.complete&&im.naturalWidth>0)?im:null}
function drawWImgC(im,x,y,w,rot,alpha){
  var h=w*im.naturalHeight/im.naturalWidth;
  ctx.save();ctx.translate(x,y);if(rot)ctx.rotate(rot);if(alpha!=null)ctx.globalAlpha=alpha;
  ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();
}
var WIND_HERO=new Image();WIND_HERO.src='gods/final/GOD4.jpg';
function windHeroOk(){return WIND_HERO.complete&&WIND_HERO.naturalWidth>0}

/* 조작감 수치 — 전부 여기서 조정한다(현장 시연 후 수정 지점) */
var WIND_CONFIG={
  duration:30000, fallMs:4000, startYPct:0.17, judgeYPct:0.74,
  windMax:2, minSwipe:18, maxSwipe:220,
  vxPerGust:0.55, vyMul:0.5, tau:0.25,
  bigWindStart:20000, bigWindDur:700,
  dokAt:15000, dokDur:1300,
  seagullTimes:[7000,22000], seagullDur:1600,
  fxDur:450
};
var WIND_DESTS=[
  {key:'harbor', label:'항구', img:'harbor_target'},
  {key:'village',label:'마을', img:'village_target'},
  {key:'orchard',label:'귤밭', img:'orchard_target'}
];
function windRank(n){
  if(n>=14)return '바람길 장인!';
  if(n>=10)return '갈매기보다 빠른 배송!';
  if(n>=6)return '영등할망도 감탄!';
  if(n>=1)return '귤 하나만 더!';
  return '다음엔 더 잘할 수 있어요';
}

/* ---- 진입: 시작 화면(DOM) ---- */
function gWind(){
  openStage('영등할망의 바람배달');
  cv.style.display='none';
  $('#canvasWrap').style.display='none';
  var p=$('#wind');p.style.display='flex';
  windScreenStart();
}
function windScreenStart(){
  var p=$('#wind');
  p.innerHTML=
    (windHeroOk()?'<img class="windHero" src="gods/final/GOD4.jpg" alt="영등할망">':
      '<div style="font-size:44px">🌬️</div>')+
    '<h2 style="font-family:var(--font-display);font-size:23px;margin:6px 0 0">영등할망의 바람배달</h2>'+
    '<p style="color:var(--color-text-secondary);font-size:15px;margin:2px 0 0;max-width:320px">바람을 그려 바구니를 반짝이는 곳으로!</p>'+
    '<label class="windCard" style="display:flex;align-items:center;gap:10px;text-align:left;font-size:13px;color:var(--color-text-secondary);cursor:pointer">'+
      '<input type="checkbox" id="windAssistChk" style="width:20px;height:20px;flex:none">'+
      '스와이프가 어려우면 화면 아래 ◀ / ▶ 버튼으로 바람을 보낼 수 있어요'+
    '</label>'+
    '<button class="btn btn--primary btn--block btn--lg" id="windStartBtn" style="max-width:360px">시작하기</button>';
  $('#windStartBtn').onclick=function(){
    var assist=$('#windAssistChk').checked;
    windScreenTutorial(assist);
  };
}
function windScreenTutorial(assist){
  var p=$('#wind');
  p.innerHTML=
    '<h2 style="font-size:19px;margin:8px 0 0">바구니가 내려오면</h2>'+
    '<div class="windCard" style="max-width:340px">'+
      '<svg viewBox="0 0 300 150" style="width:100%;display:block" aria-hidden="true">'+
        '<circle cx="60" cy="36" r="18" fill="var(--color-accent)"/>'+
        '<path d="M60 54 Q150 86 224 112" stroke="var(--color-text-secondary)" stroke-width="3" fill="none" stroke-dasharray="6 8"/>'+
        '<circle cx="224" cy="112" r="15" fill="none" stroke="var(--color-accent)" stroke-width="3"/>'+
        '<circle cx="224" cy="112" r="25" fill="none" stroke="var(--color-accent)" stroke-width="2" opacity=".45"/>'+
      '</svg>'+
      '<p style="font-weight:800;font-size:16px;margin:8px 0 0">슥! 바람을 그려 보내세요</p>'+
      '<p style="color:var(--color-text-secondary);font-size:13px;margin:4px 0 0">손가락으로 방향을 그으면, 그 방향으로 바구니가 바로 밀려요. 반짝이는 배송지에 넣으면 성공!</p>'+
    '</div>'+
    '<div style="display:flex;gap:10px;width:100%;max-width:340px">'+
      '<button class="btn btn--secondary btn--block btn--lg" id="windPracticeBtn">연습하기</button>'+
      '<button class="btn btn--primary btn--block btn--lg" id="windSkipBtn">바로 시작</button>'+
    '</div>';
  $('#windPracticeBtn').onclick=function(){ windRound(true,assist); };
  $('#windSkipBtn').onclick=function(){ windRound(false,assist); };
}

/* ---- 실제 플레이(캔버스) ---- */
function windRound(isPractice,assist){
  var p=$('#wind');p.style.display='none';
  $('#canvasWrap').style.display='';
  cv.style.display='block';
  var W=cv.width,H=cv.height;
  var U=Math.max(0.8,Math.min(1.7,W/750));
  var C=WIND_CONFIG;
  var pxScale=W/Math.max(1,$('#canvasWrap').clientWidth); /* CSS px → 캔버스 px(대개 2) */
  var judgeY=H*C.judgeYPct, destY=H*0.865, destW=W/3;
  var dests=WIND_DESTS.map(function(d,i){return {key:d.key,label:d.label,img:d.img,x:destW*(i+0.5),w:destW}});

  var soundOn=true;
  function wsfx(n,v){ if(soundOn) sfx(n,v); }
  function wbeep(f,d,t,v){ if(soundOn) beep(f,d,t,v); }
  function vib(ms){ if(soundOn && navigator.vibrate) try{navigator.vibrate(ms)}catch(e){} }

  var score=0,deliveries=0,combo=0,bestCombo=0;
  var elapsed=0,last=null,noMoreSpawn=false,phase='play';
  var basketCount=0,targetHistory=[];
  var basket=null,nextSpawnAt=0;
  var dokShown=false,seagullSpawned=[false,false],seagulls=[];
  var fxList=[],popups=[];
  var resultT=0,resultReady=false;
  var activePointerId=null,dragStart=null,dragCur=null;

  /* ---- 배경(그라데이션·구름) ---- */
  var bg=makeBg();
  function makeBg(){
    var c=document.createElement('canvas');c.width=W;c.height=H;var g=c.getContext('2d');
    var sky=g.createLinearGradient(0,0,0,H*0.78);
    sky.addColorStop(0,'#DFF5ED');sky.addColorStop(1,'#BFE6DA');
    g.fillStyle=sky;g.fillRect(0,0,W,H*0.78);
    var sea=g.createLinearGradient(0,H*0.78,0,H);
    sea.addColorStop(0,'#22485A');sea.addColorStop(1,'#163344');
    g.fillStyle=sea;g.fillRect(0,H*0.78,W,H*0.22);
    g.fillStyle='rgba(255,255,255,.55)';
    [[0.16,0.14,0.16],[0.62,0.09,0.13],[0.85,0.2,0.11]].forEach(function(cl){
      var cx=W*cl[0],cy=H*cl[1],r=W*cl[2];
      g.beginPath();g.ellipse(cx,cy,r,r*0.55,0,0,7);g.fill();
      g.beginPath();g.ellipse(cx-r*0.5,cy+r*0.12,r*0.6,r*0.4,0,0,7);g.fill();
      g.beginPath();g.ellipse(cx+r*0.5,cy+r*0.12,r*0.6,r*0.4,0,0,7);g.fill();
    });
    return c;
  }

  function pt(e){var r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*(W/r.width),y:(e.clientY-r.top)*(H/r.height)}}

  function drawText(txt,x,y,size,color,stroke,weight){
    size=Math.round(size*U);
    ctx.font=(weight||800)+' '+size+'px SCDream, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    if(stroke){ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.lineWidth=size*0.14;ctx.strokeText(txt,x,y)}
    ctx.fillStyle=color;ctx.fillText(txt,x,y);
  }
  function rrect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}

  /* ---- 목표 배송지 선택: 처음 3개는 왼쪽→오른쪽→가운데, 이후 무작위(3연속 금지) ---- */
  function pickTargetIdx(n){
    if(!isPractice && n<3) return [0,2,1][n];
    var idx;
    do{ idx=Math.floor(Math.random()*3); }
    while(targetHistory.length>=2 && idx===targetHistory[targetHistory.length-1] && idx===targetHistory[targetHistory.length-2]);
    return idx;
  }

  /* ---- 바구니 생성 ---- */
  function spawnBasket(){
    var tIdx=pickTargetIdx(basketCount++);
    targetHistory.push(tIdx);if(targetHistory.length>3)targetHistory.shift();
    var vy0=(judgeY-H*C.startYPct)/(C.fallMs/1000); /* px/초 */
    basket={
      kind:Math.random()<0.5?'orange_basket':'gift_basket',
      tIdx:tIdx,
      x:W*0.5+(Math.random()*0.3-0.15)*W,
      y:H*C.startYPct,
      vx:0,vy:0,vy0:vy0,
      windLeft:C.windMax,
      resolved:false,rot:0
    };
  }

  /* ---- 바람 넣기: 궤적 길이는 힘에 영향 없음, 방향만 반영 ---- */
  function applyGust(dirX,dirY){
    var b=basket;if(!b||b.resolved||b.windLeft<=0)return;
    b.windLeft--;
    var force=W*C.vxPerGust; /* px/초 */
    b.vx+=dirX*force;
    b.vy+=dirY*force*C.vyMul;
    b.vy=Math.max(b.vy,-b.vy0*1.2); /* 위로 지나치게 역주행 방지 */
    fxList.push({type:'gust',x:b.x,y:b.y,t:0,rot:Math.atan2(dirY,dirX)});
    wbeep(520,0.09,'sine',0.14);
  }

  /* ---- 판정 ---- */
  function resolveBasket(){
    var b=basket,d=dests[b.tIdx];
    var hit=Math.abs(b.x-d.x)<=d.w/2;
    var bigWindOn=elapsed>=C.bigWindStart&&elapsed<C.bigWindStart+C.bigWindDur;
    if(hit){
      if(!isPractice){
        combo++;if(combo>bestCombo)bestCombo=combo;
        var base=100+(combo>1?20*Math.min(combo-1,5):0);
        var add=bigWindOn?base*2:base;
        deliveries++;score+=add;
        popups.push({txt:'+'+add,x:b.x,y:destY-40*U,vy:-0.35,life:1});
      }
      wsfx('pop',0.55);vib(30);
    } else {
      if(!isPractice)combo=0;
      wbeep(220,0.16,'sine',0.1);
    }
    fxList.push({type:hit?'combo_star':'water_splash',x:b.x,y:destY,t:0});
    b.resolved=true;
    nextSpawnAt=elapsed+C.fxDur;
  }

  /* ---- 결과 ---- */
  function enterResult(){ phase='result';resultT=0;resultReady=false; }
  function finishWind(){
    stopGame();
    var isBest=score>(S.best.wind||0);
    if(isBest)S.best.wind=score;
    sfx(isBest?'fanfare':'bonus',0.7);
    reward(Math.round(score/3),'영등할망의 바람배달 · 배달 '+deliveries+'개 · 최고 콤보 '+bestCombo+' · 총점 '+score+'점'+(isBest?' · 신기록!':''));
  }

  /* ---- 입력 ---- */
  cv.onpointerdown=function(e){
    if(phase==='result')return;
    if(activePointerId!=null)return;
    activePointerId=e.pointerId;
    var q=pt(e);dragStart={x:q.x,y:q.y};dragCur=q;
  };
  cv.onpointermove=function(e){
    if(phase!=='play'||e.pointerId!==activePointerId||!dragStart)return;
    dragCur=pt(e);
  };
  cv.onpointerup=function(e){
    if(phase==='result'){ if(resultReady)finishWind(); return; }
    if(e.pointerId!==activePointerId||!dragStart){activePointerId=null;return}
    var q=pt(e);var dx=q.x-dragStart.x,dy=q.y-dragStart.y,dist=Math.hypot(dx,dy);
    activePointerId=null;dragStart=null;dragCur=null;
    var minPx=C.minSwipe*pxScale,maxPx=C.maxSwipe*pxScale;
    if(dist<minPx||dist>maxPx)return; /* 짧은 탭·과도한 드래그는 무시, 바람 소모 없음 */
    applyGust(dx/dist,dy/dist);
  };
  cv.onpointercancel=function(){activePointerId=null;dragStart=null;dragCur=null};

  /* ---- 보조 조작 ◀ / ▶ ---- */
  var assistWrap=null;
  if(assist){
    assistWrap=document.createElement('div');assistWrap.id='windAssistBtns';
    assistWrap.innerHTML='<button id="windL" aria-label="왼쪽으로 바람">◀</button><button id="windR" aria-label="오른쪽으로 바람">▶</button>';
    $('#canvasWrap').appendChild(assistWrap);
    assistWrap.querySelector('#windL').onclick=function(){applyGust(-1,0)};
    assistWrap.querySelector('#windR').onclick=function(){applyGust(1,0)};
  }

  /* ---- 연습 중 실전 시작 버튼 ---- */
  var practiceCta=null;
  if(isPractice){
    practiceCta=document.createElement('button');
    practiceCta.id='windPracticeCta';practiceCta.className='btn btn--primary';
    practiceCta.textContent='실전 시작 →';
    practiceCta.style.cssText='position:absolute;left:50%;bottom:calc(var(--space-5) + var(--safe-b));transform:translateX(-50%);min-height:48px;z-index:6;box-shadow:var(--shadow-md)';
    $('#canvasWrap').appendChild(practiceCta);
    practiceCta.onclick=function(){ windCleanup(); windRound(false,assist); };
  }

  /* ---- 소리 켬/끔 ---- */
  var soundBtn=document.createElement('button');
  soundBtn.id='windSoundBtn';soundBtn.className='btn btn--secondary btn--sm';
  soundBtn.textContent='소리 켬';
  soundBtn.style.cssText='position:absolute;right:var(--space-3);top:50%;transform:translateY(-50%);z-index:6;opacity:.85';
  $('#canvasWrap').appendChild(soundBtn);
  soundBtn.onclick=function(){soundOn=!soundOn;soundBtn.textContent=soundOn?'소리 켬':'소리 끔'};

  function windCleanup(){
    if(assistWrap){assistWrap.remove();assistWrap=null}
    if(practiceCta){practiceCta.remove();practiceCta=null}
    if(soundBtn){soundBtn.remove()}
  }

  /* ---- 메인 루프 ---- */
  spawnBasket();
  function loop(now){
    if(last==null)last=now;
    var dt=Math.min(33,now-last);last=now;

    if(phase==='play'){
      elapsed+=dt;
      if(!isPractice && elapsed>=C.duration) noMoreSpawn=true;
      var bigWindOn=!isPractice&&elapsed>=C.bigWindStart&&elapsed<C.bigWindStart+C.bigWindDur;
      if(bigWindOn && !fxList.some(function(f){return f.type==='bigwind'})){
        fxList.push({type:'bigwind',t:0});wsfx('evolve',0.5);
      }
      if(!isPractice && !dokShown && elapsed>=C.dokAt){dokShown=true;fxList.push({type:'dok',t:0})}
      if(!isPractice){
        C.seagullTimes.forEach(function(t,i){
          if(!seagullSpawned[i] && elapsed>=t){seagullSpawned[i]=true;seagulls.push({x:-80,y:H*(0.2+i*0.08),t:0})}
        });
      }

      if(basket){
        var b=basket;
        if(!b.resolved){
          var decay=Math.exp(-dt/1000/C.tau);
          b.vx*=decay;b.vy*=decay;
          b.x+=b.vx*dt/1000;
          b.y+=(b.vy0+b.vy)*dt/1000;
          b.x=Math.max(W*0.06,Math.min(W*0.94,b.x));
          b.rot=Math.max(-0.3,Math.min(0.3,b.vx/(W*0.6)));
          if(b.y>=judgeY) resolveBasket();
        } else if(elapsed>=nextSpawnAt){
          if(noMoreSpawn){ basket=null; enterResult(); }
          else spawnBasket();
        }
      }
    } else if(phase==='result'){
      resultT+=dt;if(resultT>900)resultReady=true;
    }

    fxList.forEach(function(f){f.t+=dt});
    fxList=fxList.filter(function(f){
      if(f.type==='gust')return f.t<260;
      if(f.type==='combo_star'||f.type==='water_splash')return f.t<420;
      if(f.type==='bigwind')return f.t<C.bigWindDur+300;
      if(f.type==='dok')return f.t<C.dokDur;
      return false;
    });
    seagulls.forEach(function(s){s.t+=dt;s.x=(-80)+(W+160)*Math.min(1,s.t/C.seagullDur)});
    seagulls=seagulls.filter(function(s){return s.t<C.seagullDur});
    popups.forEach(function(p){p.y+=p.vy*dt*0.06;p.life-=dt/700});
    popups=popups.filter(function(p){return p.life>0});

    /* ---- 렌더 ---- */
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(bg,0,0);

    /* 목적지 */
    dests.forEach(function(d,i){
      var im=wimg(d.img);
      var active=basket && !basket.resolved && phase==='play' && basket.tIdx===i;
      if(active){
        ctx.save();
        var glow=ctx.createRadialGradient(d.x,destY,10*U,d.x,destY,d.w*0.55);
        glow.addColorStop(0,'rgba(245,179,49,.45)');glow.addColorStop(1,'rgba(245,179,49,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(d.x,destY,d.w*0.55,0,7);ctx.fill();
        ctx.restore();
      }
      if(im)drawWImgC(im,d.x,destY,d.w*0.66);
      else{ctx.fillStyle='#5C4A34';ctx.beginPath();ctx.arc(d.x,destY,60*U,0,7);ctx.fill()}
      drawText(d.label,d.x,destY+d.w*0.30,17,'#F2F0EA','rgba(20,20,20,.6)');
      if(active){
        ctx.save();ctx.globalAlpha=0.85+Math.sin(elapsed/160)*0.15;
        drawText('여기로!',d.x,destY-d.w*0.42,18,'#1A1204','rgba(255,255,255,.85)');
        ctx.restore();
      }
    });

    /* 갈매기 */
    seagulls.forEach(function(s){var im=wimg('seagull');if(im)drawWImgC(im,s.x,s.y,70*U,0,0.9)});

    /* 손가락 궤적 보조 */
    if(dragStart&&dragCur&&phase==='play'){
      var ddx=dragCur.x-dragStart.x,ddy=dragCur.y-dragStart.y,ddist=Math.hypot(ddx,ddy);
      if(ddist>10){
        var tim=wimg('wind_trail');
        if(tim)drawWImgC(tim,(dragStart.x+dragCur.x)/2,(dragStart.y+dragCur.y)/2,Math.min(220*U,60*U+ddist*0.55),Math.atan2(ddy,ddx),0.55);
      }
    }

    /* 바구니 */
    if(basket && phase==='play'){
      var bb=basket,im=wimg(bb.kind);
      if(im)drawWImgC(im,bb.x,bb.y,86*U,bb.rot,bb.resolved?0.4:1);
      else{ctx.fillStyle='#C97A2E';ctx.beginPath();ctx.arc(bb.x,bb.y,40*U,0,7);ctx.fill()}
      if(!bb.resolved)drawText('바람 '+bb.windLeft+'/'+C.windMax,bb.x,bb.y-64*U,14,'#22485A','rgba(255,255,255,.85)');
    }

    /* 이펙트 */
    fxList.forEach(function(f){
      if(f.type==='gust'){
        var im=wimg('wind_gust'),k=1-f.t/260;
        if(im)drawWImgC(im,f.x,f.y,120*U,f.rot,Math.max(0,k));
      } else if(f.type==='combo_star'){
        var im=wimg('combo_star'),k=1-f.t/420;
        if(im)drawWImgC(im,f.x,destY-10*U,90*U*(1+(1-k)*0.3),0,Math.max(0,k));
      } else if(f.type==='water_splash'){
        var im=wimg('water_splash'),k=1-f.t/420;
        if(im)drawWImgC(im,f.x,destY+10*U,100*U,0,Math.max(0,k));
      } else if(f.type==='bigwind'){
        var k=1-f.t/(C.bigWindDur+300);
        ctx.save();ctx.globalAlpha=Math.max(0,k)*0.5;
        var gg=ctx.createLinearGradient(0,0,W,0);
        gg.addColorStop(0,'rgba(255,220,120,0)');gg.addColorStop(0.5,'rgba(255,220,120,.6)');gg.addColorStop(1,'rgba(255,220,120,0)');
        ctx.fillStyle=gg;ctx.fillRect(0,0,W,H);ctx.restore();
        if(f.t<500)drawText('영등할망의 큰바람!',W/2,H*0.32,30,'#FFDC78','rgba(34,72,90,.8)');
        var gim=wimg('golden_orange');
        if(gim&&f.t<600){
          var bob=Math.sin(f.t/90)*6*U;
          drawWImgC(gim,W*0.16,H*0.22+bob,54*U,0,Math.max(0,k));
          drawWImgC(gim,W*0.84,H*0.24-bob,54*U,0,Math.max(0,k));
        }
      } else if(f.type==='dok'){
        var im=wimg('dokkaebi');
        var kIn=Math.min(1,f.t/200),kOut=Math.min(1,(C.dokDur-f.t)/200);
        var k=Math.max(0,Math.min(kIn,kOut));
        var dx=W*0.16-(1-Math.min(1,f.t/300))*40*U;
        if(im)drawWImgC(im,dx,H*0.34,110*U,0,k);
        if(k>0.3)drawText('저쪽이야~',dx,H*0.34-70*U,15,'#3A2A18','rgba(255,255,255,.85)');
      }
    });
    popups.forEach(function(p){ctx.save();ctx.globalAlpha=Math.max(0,p.life);drawText(p.txt,p.x,p.y,24,'#FFDC78','rgba(60,20,0,.6)');ctx.restore()});

    /* HUD */
    if(phase==='play'){
      ctx.save();var m=24*U;ctx.textBaseline='alphabetic';
      if(!isPractice){
        var left=Math.max(0,C.duration-elapsed),secs=Math.ceil(left/1000);
        ctx.textAlign='left';ctx.font='800 '+Math.round(15*U)+'px SCDream, sans-serif';ctx.fillStyle='rgba(34,72,90,.7)';ctx.fillText('TIME',m,40*U);
        ctx.font='800 '+Math.round(40*U)+'px SCDream, sans-serif';ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=6*U;ctx.strokeText(String(secs),m,80*U);
        ctx.fillStyle=secs<=5?'#F0605A':'#22485A';ctx.fillText(String(secs),m,80*U);

        ctx.textAlign='right';ctx.font='800 '+Math.round(15*U)+'px SCDream, sans-serif';ctx.fillStyle='rgba(34,72,90,.7)';ctx.fillText('SCORE',W-m,40*U);
        ctx.font='800 '+Math.round(40*U)+'px SCDream, sans-serif';var sTxt=String(score);
        ctx.strokeText(sTxt,W-m,80*U);ctx.fillStyle='#F7A348';ctx.fillText(sTxt,W-m,80*U);

        if(combo>=2){ctx.textAlign='center';drawText(combo+' 콤보'+(combo>=5?'!':''),W/2,100*U,26,combo>=5?'#F7A348':'#22485A','rgba(255,255,255,.85)')}
      } else {
        ctx.textAlign='left';drawText('연습 중 · 무제한',m,36*U,16,'#22485A','rgba(255,255,255,.8)',600);
      }
      ctx.restore();
    }

    if(phase==='result') drawResult();
    raf=requestAnimationFrame(loop);
  }
  function drawResult(){
    var p=Math.min(1,resultT/420),ease=1-Math.pow(1-p,3);
    ctx.save();ctx.fillStyle='rgba(20,30,36,'+(0.55*ease)+')';ctx.fillRect(0,0,W,H);
    var cw=Math.min(W-80*U,600*U),ch=Math.min(H-160*U,600*U),cx=W/2,cy=H/2+(1-ease)*60;
    ctx.globalAlpha=ease;ctx.translate(cx,cy);
    ctx.fillStyle='#FFF8EC';ctx.strokeStyle='#F7A348';ctx.lineWidth=6*U;
    rrect(-cw/2,-ch/2,cw,ch,28*U);ctx.fill();ctx.stroke();
    var gimg=wimg('golden_orange');if(gimg)drawWImgC(gimg,0,-ch/2+10,cw*0.32);
    var y=-ch/2+cw*0.20+50*U;
    var isBest=score>(S.best.wind||0);
    drawText('배달 완료!',0,y,32,'#22485A');y+=54*U;
    var rows=[['배달 성공',deliveries+'개'],['최고 콤보',bestCombo+' COMBO']];
    ctx.textBaseline='middle';
    rows.forEach(function(r){
      ctx.textAlign='left';ctx.font='600 '+Math.round(22*U)+'px SCDream, sans-serif';ctx.fillStyle='#5C6A6E';ctx.fillText(r[0],-cw/2+40*U,y);
      ctx.textAlign='right';ctx.font='800 '+Math.round(26*U)+'px SCDream, sans-serif';ctx.fillStyle='#22485A';ctx.fillText(r[1],cw/2-40*U,y);
      ctx.fillStyle='rgba(34,72,90,.15)';ctx.fillRect(-cw/2+40*U,y+22*U,cw-80*U,2);y+=48*U;
    });
    y+=14*U;drawText('총점',0,y,18,'#5C6A6E',null,600);y+=46*U;
    drawText(String(score),0,y,52,'#F7A348','rgba(34,72,90,.35)');y+=50*U;
    drawText(windRank(deliveries),0,y,21,'#22485A',null,600);y+=38*U;
    if(isBest){ctx.save();ctx.translate(0,y);var sc=1+Math.sin(resultT/120)*0.04;ctx.scale(sc,sc);drawText('NEW RECORD!',0,0,26,'#F0605A','rgba(255,255,255,.9)');ctx.restore();y+=34*U}
    if(resultReady){ctx.globalAlpha=ease*(0.6+Math.sin(resultT/200)*0.4);drawText('화면을 눌러 복 받기',0,ch/2-34*U,17,'#5C6A6E',null,600)}
    ctx.restore();
  }
  raf=requestAnimationFrame(loop);
}
