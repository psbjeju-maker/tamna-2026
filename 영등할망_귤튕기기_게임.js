/* ============================================================
   영등할망의 귤 튕기기 — 탐라문화제 앱(index.html) 안의 미니게임 코드
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
   orange_basket / gift_basket / golden_orange / combo_star / wind_gust.
   공/받침은 Canvas로 직접 그린다. 이미지가 없거나 로드 실패해도 게임은 죽지 않는다.
   영등할망 원본 사진은 gods/final/GOD4.jpg(기존 6신 사진)를 그대로 쓴다.

   ── 배경음악 ──
   sfx/wind_bgm.mp3. 게임 시작(연습 포함) 시 sfxAmbient로 재생, 소리 토글로 음소거,
   stopGame()이 windTeardown을 거쳐 결국 sfxStopAmbient()로 정지한다.
   ============================================================ */

/* --- ② 영등할망의 귤 튕기기 --- */
/* 이미지 에셋 슬롯 — PNG만 교체하면 자동 적용. */
var WIND_DIR='assets/wind-game/';
var WIND_IMG={};
['orange_basket','gift_basket','golden_orange','combo_star','wind_gust'].forEach(function(n){
  var im=new Image();im.src=WIND_DIR+n+'.png';WIND_IMG[n]=im;
});
function wimg(n){var im=WIND_IMG[n];return(im&&im.complete&&im.naturalWidth>0)?im:null}

/* 조작감 수치 — 전부 여기서 조정한다(현장 시연 후 수정 지점) */
var WIND_CONFIG={
  width:390, height:580, duration:40, paddleWidth:94, paddleY:455,
  ballRadius:12, ballSpeed:335, speedStep:9, speedCap:60,
  perfectHalfWidth:17, feverSeconds:6, step:1/120
};
function windRank(score){
  if(score>=1800)return '바람길의 달인!';
  if(score>=900)return '귤이 신나게 날았어요!';
  return '한 번 더 튕겨볼까요?';
}

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
        '<div><small>남은 시간</small><b id="wgTime">40</b><span> 초</span></div>'+
        '<div><small>모은 점수</small><b id="wgScore">0</b><span> 점</span></div>'+
        '<div><small id="wgPowerLabel">정확히 받기</small><b id="wgCombo">0</b><span> / 3</span><div class="wg-dots"><i class="wg-dot"></i><i class="wg-dot"></i><i class="wg-dot"></i></div></div>'+
      '</div>'+
      '<div class="wg-stage">'+
        '<canvas id="wgCanvas" width="780" height="1160" aria-label="귤 튕기기 게임. 화면 아래를 좌우로 움직여 받침을 조작하세요."></canvas>'+
        '<div id="wgToast"></div>'+
        '<div id="wgOverlay"><div class="wg-panel" id="wgPanel"></div></div>'+
      '</div>'+
      '<div class="wg-toolbar">'+
        '<button class="btn btn--secondary btn--sm" id="wgSoundBtn">소리 켬</button>'+
        '<button class="btn btn--secondary btn--sm" id="wgPauseBtn">Ⅱ 일시정지</button>'+
      '</div>'+
    '</div>';
  windInit();
}

/* ---- 실제 게임(받침으로 귤 튕기기) ---- */
function windInit(){
  var C=WIND_CONFIG;
  var cvv=$('#wgCanvas'),gctx=cvv.getContext('2d');
  var overlay=$('#wgOverlay'),panel=$('#wgPanel'),toastEl=$('#wgToast');
  var soundBtn=$('#wgSoundBtn'),pauseBtn=$('#wgPauseBtn');
  var timeEl=$('#wgTime'),scoreEl=$('#wgScore'),comboEl=$('#wgCombo'),powerLabelEl=$('#wgPowerLabel');
  function wgDots(){return document.querySelectorAll('#wind .wg-dot')}

  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state='menu',score=0,remaining=C.duration,paddleX=195,balls=[],targets=[],particles=[],rings=[],labels=[];
  var perfect=0,bestPerfect=0,fever=0,charge=0,wave=0,misses=0,hits=0,respawn=0,paddlePulse=0,toastTime=0,elapsed=0;
  var completed=false,accumulator=0,lastTime=0,soundOn=true,pointer=null,practice=false,rafId=0;

  function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
  function wbeep(f,d,ty,v){ if(soundOn) beep(f,d,ty||'sine',v==null?0.14:v); }
  function toast(s){toastEl.textContent=s;toastEl.style.opacity=1;toastTime=.9}
  function show(html){panel.innerHTML=html;overlay.classList.add('on')}
  function hideOverlay(){overlay.classList.remove('on')}

  function title(){
    state='menu';
    show(
      '<img src="gods/final/GOD4.jpg" alt="영등할망" onerror="this.remove()">'+
      '<h2>바람으로 톡!<br>보물이 와르르!</h2>'+
      '<p>손가락을 좌우로 움직여 귤을 받으세요.<br><b>가운데에 정확히 3번!</b> 귤이 3개로 늘어나요.</p>'+
      '<button class="btn btn--primary btn--block btn--lg" id="wgStart">40초 도전하기</button>'+
      '<button class="btn btn--tertiary btn--block" id="wgPractice">시간 제한 없이 연습하기</button>'
    );
    $('#wgStart').onclick=function(){start(false)};
    $('#wgPractice').onclick=function(){start(true)};
  }

  function makeWave(){
    wave++;targets=[];
    var layouts=[[0,1,2,3,4],[0,1,2,3,4],[0,1,2,3,4]];
    layouts.forEach(function(row,r){row.forEach(function(c){
      targets.push({x:27+c*69,y:45+r*65,w:60,h:57,alive:true,gift:(r+c+wave)%4===0,pulse:0});
    })});
  }
  function newBall(angle){
    angle=angle||0;var speed=C.ballSpeed;
    return {x:paddleX,y:C.paddleY-20,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,r:C.ballRadius,strong:0,trail:[]};
  }

  function start(isPractice){
    practice=isPractice;state='playing';score=0;remaining=C.duration;elapsed=0;wave=0;misses=0;hits=0;
    perfect=0;bestPerfect=0;charge=0;fever=0;paddleX=195;balls=[];particles=[];rings=[];labels=[];
    respawn=.45;completed=false;makeWave();hideOverlay();accumulator=0;
    toast('가운데에 맞히면 강풍!');wbeep(650,0.06);updateHud();
    sfxAmbient('wind_bgm',0.45);if(ambientEl)ambientEl.muted=!soundOn;
  }

  function finish(){
    if(completed)return;completed=true;state='result';
    if(practice){
      show(
        '<img src="assets/wind-game/golden_orange.png" alt="">'+
        '<h2>연습 완료</h2>'+
        '<div class="wg-result-score">'+score.toLocaleString()+'<small style="font-size:15px"> 점</small></div>'+
        '<p>보물 '+hits+'개 · 최고 연속 정확히 받기 '+bestPerfect+'회</p>'+
        '<button class="btn btn--primary btn--block btn--lg" id="wgAgain">40초 도전하기</button>'+
        '<button class="btn btn--tertiary btn--block" id="wgBack">처음으로</button>'
      );
      $('#wgAgain').onclick=function(){start(false)};
      $('#wgBack').onclick=title;
    } else {
      stopGame();
      var isBest=score>(S.best.wind||0);
      if(isBest)S.best.wind=score;
      sfx(isBest?'fanfare':'bonus',0.7);
      reward(Math.round(score/3),'영등할망의 귤 튕기기 · 보물 '+hits+'개 · 최고 연속 정확히 받기 '+bestPerfect+'회 · 총점 '+score+'점'+(isBest?' · 신기록!':''));
    }
  }

  function pause(){
    if(state!=='playing')return;state='paused';
    show(
      '<h2>잠깐 쉬어가요</h2><p>준비되면 바람을 다시 이어가세요.</p>'+
      '<button class="btn btn--primary btn--block btn--lg" id="wgResume">이어서 하기</button>'+
      '<button class="btn btn--tertiary btn--block" id="wgQuit">'+(practice?'연습 마치기':'처음으로')+'</button>'
    );
    $('#wgResume').onclick=function(){state='playing';accumulator=0;lastTime=performance.now();hideOverlay()};
    $('#wgQuit').onclick=function(){ practice?finish():title() };
  }
  pauseBtn.onclick=pause;

  soundBtn.onclick=function(){
    soundOn=!soundOn;soundBtn.textContent=soundOn?'소리 켬':'소리 끔';
    if(ambientEl)ambientEl.muted=!soundOn;
  };

  function position(e){
    var rect=cvv.getBoundingClientRect();
    paddleX=clamp((e.clientX-rect.left)/rect.width*390,C.paddleWidth/2+8,382-C.paddleWidth/2);
  }
  function onDown(e){ if(state!=='playing'||pointer!==null)return; pointer=e.pointerId; try{cvv.setPointerCapture(pointer)}catch(err){} position(e); }
  function onMove(e){ if(state==='playing'&&e.pointerId===pointer)position(e); }
  function onUp(e){ if(e.pointerId===pointer)pointer=null; }
  cvv.addEventListener('pointerdown',onDown);
  cvv.addEventListener('pointermove',onMove);
  cvv.addEventListener('pointerup',onUp);
  cvv.addEventListener('pointercancel',onUp);
  cvv.addEventListener('lostpointercapture',onUp);

  var keys={};
  function onKeydown(e){
    if(['ArrowLeft','ArrowRight',' '].indexOf(e.key)===-1)return;
    e.preventDefault();keys[e.key]=true;
    if(e.key===' '&&state==='playing')pause();
  }
  function onKeyup(e){ keys[e.key]=false; }
  function onBlur(){ keys.ArrowLeft=keys.ArrowRight=false;pointer=null;if(state==='playing')pause(); }
  function onVisibility(){ if(document.hidden&&state==='playing')pause(); }
  window.addEventListener('keydown',onKeydown);
  window.addEventListener('keyup',onKeyup);
  window.addEventListener('blur',onBlur);
  document.addEventListener('visibilitychange',onVisibility);

  function burst(x,y,color,count){
    count=count==null?10:count;
    for(var i=0;i<(reduced?3:count);i++){
      var a=Math.random()*Math.PI*2,s=35+Math.random()*110;
      particles.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+Math.random()*.2,color:color});
    }
    rings.push({x:x,y:y,life:.28,color:color});
  }
  function hit(t){
    if(!t.alive)return;t.alive=false;hits++;
    var pts=(t.gift?150:100)*(fever>0?2:1);score+=pts;
    burst(t.x+t.w/2,t.y+t.h/2,t.gift?'#efd68b':'#eea34d');
    labels.push({x:t.x+30,y:t.y+20,text:'+'+pts,life:.65});
    wbeep(t.gift?880:630,.05);
  }

  function update(dt){
    if(state!=='playing')return;
    elapsed+=dt;
    if(!practice){remaining=Math.max(0,C.duration-elapsed);if(remaining<=0){finish();return}}
    if(keys.ArrowLeft)paddleX-=420*dt;if(keys.ArrowRight)paddleX+=420*dt;
    paddleX=clamp(paddleX,55,335);
    paddlePulse=Math.max(0,paddlePulse-dt);fever=Math.max(0,fever-dt);
    if(charge===3&&fever===0){charge=0;balls=balls.slice(0,1);toast('다시 가운데를 노려요!')}
    if(respawn>0){respawn-=dt;if(respawn<=0)balls.push(newBall((wave%2?1:-1)*.22))}
    var pending=[];
    for(var bi=0;bi<balls.length;bi++){
      var b=balls[bi];var oldX=b.x,oldY=b.y;
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.strong=Math.max(0,b.strong-dt);
      if(b.x<b.r+8){b.x=b.r+8;b.vx=Math.abs(b.vx)}
      if(b.x>382-b.r){b.x=382-b.r;b.vx=-Math.abs(b.vx)}
      if(b.y<22+b.r){b.y=22+b.r;b.vy=Math.abs(b.vy)}
      if(b.vy>0&&oldY+b.r<=C.paddleY&&b.y+b.r>=C.paddleY&&b.x>=paddleX-C.paddleWidth/2-b.r*.4&&b.x<=paddleX+C.paddleWidth/2+b.r*.4){
        var offset=(b.x-paddleX)/(C.paddleWidth/2),isPerfect=Math.abs(b.x-paddleX)<=C.perfectHalfWidth;
        var angle=clamp(offset,-1,1)*Math.PI/3;
        var speed=C.ballSpeed+Math.min(wave*C.speedStep,C.speedCap);
        b.vx=Math.sin(angle)*speed;if(Math.abs(b.vx)<45)b.vx=(offset<0?-1:1)*45;
        b.vy=-Math.sqrt(speed*speed-b.vx*b.vx);b.y=C.paddleY-b.r-.1;
        paddlePulse=.18;burst(b.x,C.paddleY,isPerfect?'#f4b33c':'#58bca4',isPerfect?12:5);
        wbeep(isPerfect?940:420,0.06);
        if(isPerfect){
          perfect++;bestPerfect=Math.max(bestPerfect,perfect);b.strong=2.1;
          if(fever===0){
            charge++;toast(charge<3?('정확해요! '+charge+' / 3'):'귤 3개! 큰바람!');
            if(charge>=3){
              fever=C.feverSeconds;
              [-.45,.45].forEach(function(shift){var nb=newBall(shift);nb.x=b.x;nb.y=b.y;pending.push(nb)});
            }
          }
        } else { perfect=0;if(fever===0)charge=0 }
      }
      for(var ti=0;ti<targets.length;ti++){
        var t=targets[ti];if(!t.alive)continue;
        var nx=clamp(b.x,t.x,t.x+t.w),ny=clamp(b.y,t.y,t.y+t.h);
        if(Math.pow(b.x-nx,2)+Math.pow(b.y-ny,2)<=b.r*b.r){
          hit(t);
          if(b.strong<=0){
            if(oldY+b.r<=t.y||oldY-b.r>=t.y+t.h){b.vy=-b.vy;b.y=oldY}else{b.vx=-b.vx;b.x=oldX}
            break;
          }
        }
      }
    }
    balls=balls.concat(pending).filter(function(b){return b.y<C.paddleY+65});
    if(balls.length===0&&respawn<=0){misses++;perfect=0;charge=0;fever=0;respawn=.65;toast('괜찮아요, 바로 다시!')}
    if(targets.every(function(t){return !t.alive})){makeWave();toast('보물 한 판 더!')}
    particles.forEach(function(pp){pp.life-=dt;pp.x+=pp.vx*dt;pp.y+=pp.vy*dt;pp.vy+=120*dt});
    particles=particles.filter(function(pp){return pp.life>0}).slice(-100);
    rings.forEach(function(r){r.life-=dt});rings=rings.filter(function(r){return r.life>0});
    labels.forEach(function(l){l.life-=dt;l.y-=30*dt});labels=labels.filter(function(l){return l.life>0});
    if(toastTime>0){toastTime-=dt;if(toastTime<=0)toastEl.style.opacity=0}
  }

  function rrectFill(x,y,w,h,r,fill){gctx.fillStyle=fill;gctx.beginPath();gctx.roundRect(x,y,w,h,r);gctx.fill()}
  function sprite(name,x,y,w,h){
    var im=WIND_IMG[name];if(!im||!im.complete||!im.naturalWidth)return;
    var scale=Math.min(w/im.naturalWidth,h/im.naturalHeight);
    gctx.drawImage(im,x+(w-im.naturalWidth*scale)/2,y+(h-im.naturalHeight*scale)/2,im.naturalWidth*scale,im.naturalHeight*scale);
  }
  function draw(){
    var ratio=cvv.width/390;gctx.setTransform(ratio,0,0,ratio,0,0);gctx.clearRect(0,0,390,580);
    var bg=gctx.createLinearGradient(0,0,0,580);
    bg.addColorStop(0,'#0c2b30');bg.addColorStop(.72,'#123a3c');bg.addColorStop(1,'#1c4b45');
    gctx.fillStyle=bg;gctx.fillRect(0,0,390,580);
    gctx.fillStyle='#ffd98a';gctx.globalAlpha=.18;gctx.beginPath();gctx.arc(320,57,70,0,Math.PI*2);gctx.fill();gctx.globalAlpha=1;
    gctx.fillStyle='#173f3c';gctx.beginPath();gctx.moveTo(0,427);gctx.quadraticCurveTo(120,364,225,424);gctx.quadraticCurveTo(300,382,390,422);gctx.lineTo(390,510);gctx.lineTo(0,510);gctx.fill();
    rrectFill(12,492,366,76,20,'rgba(245,179,49,.12)');
    gctx.fillStyle='#F5B331';gctx.textAlign='center';gctx.font='600 13px SCDream, system-ui';
    gctx.fillText('←  여기서 손가락을 움직이세요  →',195,535);
    gctx.globalAlpha=.45;rrectFill(163,550,64,3,2,'#F5B331');gctx.globalAlpha=1;
    targets.forEach(function(t){
      if(!t.alive)return;
      rrectFill(t.x,t.y+4,t.w,t.h,13,t.gift?'#f1d49a':'#2a5450');
      gctx.strokeStyle=t.gift?'#c5a359':'#3f6b64';gctx.lineWidth=1;gctx.stroke();
      sprite(t.gift?'gift_basket':'orange_basket',t.x+4,t.y+3,t.w-8,t.h-6);
    });
    balls.forEach(function(b){
      if(!reduced){
        b.trail.push({x:b.x,y:b.y});if(b.trail.length>4)b.trail.shift();
        for(var i=0;i<b.trail.length;i++){
          gctx.globalAlpha=(i+1)*.04;gctx.fillStyle=b.strong>0?'#e49e27':'#ed8b28';
          gctx.beginPath();gctx.arc(b.trail[i].x,b.trail[i].y,b.r*.75,0,Math.PI*2);gctx.fill();
        }
        gctx.globalAlpha=1;
      }
      if(b.strong>0){gctx.strokeStyle='#fff4b2';gctx.lineWidth=4;gctx.beginPath();gctx.arc(b.x,b.y,16,0,Math.PI*2);gctx.stroke()}
      var g=gctx.createRadialGradient(b.x-4,b.y-5,1,b.x,b.y,13);
      g.addColorStop(0,'#ffd46c');g.addColorStop(.6,b.strong>0?'#ffbb34':'#ffa130');g.addColorStop(1,'#d56c17');
      gctx.fillStyle=g;gctx.beginPath();gctx.arc(b.x,b.y,b.r,0,Math.PI*2);gctx.fill();
      gctx.strokeStyle='#a25425';gctx.lineWidth=1.5;gctx.stroke();
      gctx.fillStyle='#548c48';gctx.beginPath();gctx.ellipse(b.x+3,b.y-10,5,2.5,-.5,0,7);gctx.fill();
    });
    var pulse=paddlePulse/.18;
    rrectFill(paddleX-47,C.paddleY+4,94,14,7,'rgba(20,30,36,.4)');
    rrectFill(paddleX-47,C.paddleY+Math.sin(pulse*Math.PI)*3,94,12,6,fever>0?'#ffc45e':'#F5B331');
    rrectFill(paddleX-17,C.paddleY+2,34,7,3,'#fff4d0');
    gctx.fillStyle='#fcf4d6';gctx.beginPath();gctx.moveTo(paddleX,C.paddleY-5);gctx.lineTo(paddleX-4,C.paddleY-10);gctx.lineTo(paddleX+4,C.paddleY-10);gctx.fill();
    particles.forEach(function(pp){gctx.globalAlpha=Math.min(1,pp.life*3);rrectFill(pp.x,pp.y,4,4,1,pp.color)});gctx.globalAlpha=1;
    rings.forEach(function(r){gctx.globalAlpha=r.life/.28;gctx.strokeStyle=r.color;gctx.lineWidth=2;gctx.beginPath();gctx.arc(r.x,r.y,(.28-r.life)*100+5,0,7);gctx.stroke()});gctx.globalAlpha=1;
    gctx.textAlign='center';gctx.font='800 16px SCDream, system-ui';
    labels.forEach(function(l){gctx.globalAlpha=Math.min(1,l.life*3);gctx.fillStyle='#F2F0EA';gctx.fillText(l.text,l.x,l.y)});gctx.globalAlpha=1;
  }
  function updateHud(){
    timeEl.textContent=practice?'∞':Math.ceil(remaining);
    scoreEl.textContent=score.toLocaleString();
    comboEl.textContent=fever>0?Math.ceil(fever):charge;
    powerLabelEl.textContent=fever>0?'큰바람 남은 초':'정확히 받기';
    Array.prototype.forEach.call(wgDots(),function(e,i){e.classList.toggle('on',charge>i)});
  }
  function loop(now){
    var delta=Math.min((now-lastTime)/1000,.1)||0;lastTime=now;
    if(state==='playing'){
      accumulator+=delta;
      while(accumulator>=C.step){update(C.step);accumulator-=C.step;if(state!=='playing'){accumulator=0;break}}
    } else accumulator=0;
    draw();updateHud();
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

  var namesToLoad=['orange_basket','gift_basket','golden_orange','combo_star','wind_gust'];
  Promise.all(namesToLoad.map(function(name){
    return new Promise(function(resolve){
      var im=WIND_IMG[name];
      if(im&&im.complete){resolve();return}
      if(im){im.addEventListener('load',resolve);im.addEventListener('error',resolve)}else resolve();
    });
  })).then(function(){ makeWave();title();lastTime=performance.now();rafId=requestAnimationFrame(loop); });
}
