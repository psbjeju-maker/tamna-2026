'use strict';
/* 영등할망의 바람탑 — 1~3단계, 단계마다 판을 새로 시작해 왕복 크레인 탭 낙하로 Matter.js 강체 쌓기.
   1단계는 평평한 물건 위주, 2단계는 섞어서, 3단계는 다 섞어서. 실패하면 그 단계만 다시 도전.
   3단계까지 전부 클리어했을 때만 onGameComplete(result)로 부모 앱(탐라 index.html)에 결과를 한 번 넘긴다. */

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
 {id:'lifering',name:'구명환',description:'둥근 몸체가 데굴데굴',image:'assets/items/lifering.png',sourceRect:{x:107,y:113,width:1044,height:1026},renderSize:{width:78,height:76.66},grip:[0.5,0.03],mass:0.55,friction:0.42,restitution:0.16,windResponse:1.6,difficultyBonus:80,material:'soft',collision:{type:'circle',center:[0.5,0.5],radius:0.48}},
 /* --- 20종 추가팩(2026-09-28) --- */
 {id:'dol_hareubang',name:'돌하르방',description:'무겁고 키가 커요',image:'assets/items/dol_hareubang.png',sourceRect:{x:343,y:54,width:690,height:1041},renderSize:{width:63,height:95.05},grip:[0.5,0.03],mass:3.5,friction:0.8,restitution:0.02,windResponse:0.35,difficultyBonus:40,material:'stone',collision:{type:'convexPolygon',vertices:[[0.00435,0.9097],[0.01884,0.70605],[0.07101,0.2757],[0.09275,0.22959],[0.25797,0.09126],[0.33478,0.04515],[0.42464,0.01441],[0.54348,0.00288],[0.66087,0.02978],[0.77536,0.10279],[0.9087,0.22959],[0.92899,0.2757],[0.94928,0.41787],[0.9942,0.90586],[0.96957,0.96734],[0.87536,0.98655],[0.68841,0.99424],[0.24493,0.99424],[0.05652,0.97887],[0.01014,0.95197]]}},
 {id:'surfboard',name:'서핑보드',description:'길고 얇은 균형 도전',image:'assets/items/surfboard.png',sourceRect:{x:53,y:201,width:1668,height:495},renderSize:{width:155,height:46},grip:[0.5,0.03],mass:1.2,friction:0.5,restitution:0.05,windResponse:1.4,difficultyBonus:80,material:'wood',collision:{type:'convexPolygon',vertices:[[0.52998,0.00606],[0.60612,0.02222],[0.72842,0.08687],[0.82614,0.17576],[0.94365,0.34545],[0.9976,0.49091],[0.95683,0.6202],[0.88669,0.74141],[0.72482,0.91111],[0.57074,0.98384],[0.47422,0.99192],[0.39089,0.97576],[0.27098,0.91111],[0.15647,0.80606],[0.03717,0.6202],[0.0024,0.48283],[0.03837,0.3697],[0.1283,0.23232],[0.28777,0.08687],[0.40647,0.02222]]}},
 {id:'conch',name:'소라껍데기',description:'울퉁불퉁한 바닥',image:'assets/items/conch.png',sourceRect:{x:138,y:101,width:1501,height:690},renderSize:{width:95,height:43.67},grip:[0.5,0.03],mass:1.4,friction:0.55,restitution:0.05,windResponse:0.9,difficultyBonus:80,material:'ceramic',collision:{type:'convexPolygon',vertices:[[0.55363,0.98986],[0.44304,0.98986],[0.37975,0.96087],[0.14457,0.78116],[0.06729,0.7058],[0.01865,0.64783],[0.002,0.60145],[0.01066,0.56667],[0.06196,0.4913],[0.12525,0.41594],[0.4457,0.05652],[0.51233,0.01014],[0.56296,0.00435],[0.62292,0.02754],[0.66356,0.06812],[0.98135,0.52609],[0.99134,0.54348],[0.99667,0.60145],[0.96602,0.92029],[0.94204,0.97246]]}},
 {id:'starfish',name:'불가사리',description:'다섯 갈래 사이로 쏙',image:'assets/items/starfish.png',sourceRect:{x:26,y:29,width:1225,height:1131},renderSize:{width:88,height:81.25},grip:[0.5,0.03],mass:0.8,friction:0.6,restitution:0.03,windResponse:1.3,difficultyBonus:80,material:'soft',collision:{type:'convexPolygon',vertices:[[0.20082,0.99293],[0.16163,0.97524],[0.13388,0.93634],[0.00653,0.43059],[0.00327,0.38815],[0.01306,0.35632],[0.04327,0.32095],[0.44653,0.02034],[0.46449,0.00973],[0.49469,0.00265],[0.52571,0.00619],[0.55347,0.02034],[0.96408,0.32803],[0.98776,0.35986],[0.99592,0.38815],[0.99265,0.43059],[0.86367,0.93634],[0.84735,0.96463],[0.81959,0.98585],[0.78367,0.99646]]}},
 {id:'kettle',name:'주전자',description:'손잡이와 주둥이를 조심',image:'assets/items/kettle.png',sourceRect:{x:253,y:41,width:1196,height:939},renderSize:{width:93,height:73.02},grip:[0.5,0.03],mass:1.6,friction:0.55,restitution:0.04,windResponse:0.8,difficultyBonus:80,material:'metal',collision:{type:'convexPolygon',vertices:[[0.0092,0.71459],[0.09281,0.25453],[0.11873,0.17359],[0.18645,0.07987],[0.26003,0.03301],[0.3495,0.00745],[0.42475,0.00319],[0.51421,0.01597],[0.60033,0.05431],[0.64298,0.09265],[0.9607,0.459],[0.99415,0.53994],[0.77508,0.92758],[0.69147,0.9787],[0.58278,0.99148],[0.37124,0.99574],[0.22324,0.99148],[0.07525,0.96592],[0.03595,0.93184],[0.00251,0.82961]]}},
 {id:'bucket',name:'양동이',description:'넓은 입구, 좁은 바닥',image:'assets/items/bucket.png',sourceRect:{x:86,y:166,width:1205,height:874},renderSize:{width:75,height:54.4},grip:[0.5,0.03],mass:1.1,friction:0.55,restitution:0.04,windResponse:1.2,difficultyBonus:40,material:'metal',collision:{type:'convexPolygon',vertices:[[0.65975,0.99199],[0.3444,0.99199],[0.23983,0.97368],[0.2166,0.94165],[0.0083,0.31922],[0.00664,0.23684],[0.03734,0.09954],[0.06805,0.05378],[0.10622,0.03547],[0.18755,0.01716],[0.40747,0.00343],[0.5917,0.00343],[0.70954,0.00801],[0.839,0.02174],[0.93361,0.05378],[0.96266,0.09497],[0.99253,0.23684],[0.98921,0.3238],[0.78257,0.94622],[0.73278,0.98284]]}},
 {id:'watering_can',name:'물뿌리개',description:'한쪽으로 긴 주둥이',image:'assets/items/watering_can.png',sourceRect:{x:66,y:194,width:1442,height:676},renderSize:{width:110,height:51.57},grip:[0.5,0.03],mass:1.2,friction:0.5,restitution:0.04,windResponse:1.3,difficultyBonus:80,material:'metal',collision:{type:'convexPolygon',vertices:[[0.40153,0.01627],[0.87101,0.00444],[0.9258,0.04586],[0.98266,0.20562],[0.99723,0.35947],[0.98197,0.43047],[0.7018,0.91568],[0.64771,0.96302],[0.55548,0.98669],[0.38072,0.9926],[0.27393,0.97485],[0.20042,0.92751],[0.05895,0.67899],[0.02913,0.60799],[0.00485,0.48373],[0.00208,0.38314],[0.02635,0.22337],[0.06449,0.14053],[0.11165,0.09911],[0.32386,0.02811]]}},
 {id:'rain_boot',name:'장화',description:'발끝이 길쭉해요',image:'assets/items/rain_boot.png',sourceRect:{x:312,y:119,width:963,height:784},renderSize:{width:81,height:65.94},grip:[0.5,0.03],mass:1.2,friction:0.82,restitution:0.04,windResponse:0.85,difficultyBonus:40,material:'soft',collision:{type:'convexPolygon',vertices:[[0.65213,0.99362],[0.16511,0.97832],[0.08411,0.96301],[0.04881,0.9426],[0.02908,0.87117],[0.00312,0.09056],[0.01142,0.03954],[0.05088,0.01913],[0.11942,0.00893],[0.23572,0.00383],[0.37487,0.00383],[0.58671,0.01403],[0.63448,0.02423],[0.6594,0.04464],[0.98546,0.75893],[0.99585,0.84056],[0.99065,0.88138],[0.93562,0.9375],[0.8785,0.96301],[0.77259,0.98852]]}},
 {id:'book_stack',name:'책 묶음',description:'납작하고 든든해요',image:'assets/items/book_stack.png',sourceRect:{x:181,y:148,width:1412,height:645},renderSize:{width:116,height:52.99},grip:[0.5,0.03],mass:2,friction:0.7,restitution:0.02,windResponse:0.6,difficultyBonus:0,material:'soft',collision:{type:'convexPolygon',vertices:[[0.35552,0.01085],[0.37819,0.00465],[0.6466,0.01085],[0.97875,0.2093],[0.98796,0.22171],[0.99221,0.24651],[0.99717,0.50698],[0.99717,0.92868],[0.983,0.95349],[0.9136,0.97829],[0.49929,0.9907],[0.47734,0.9907],[0.0347,0.97829],[0.01346,0.95349],[0.00283,0.89767],[0.00212,0.84806],[0.00354,0.6062],[0.01771,0.35194],[0.02691,0.30233],[0.04674,0.27132]]}},
 {id:'bread_loaf',name:'식빵',description:'둥근 지붕을 조심',image:'assets/items/bread_loaf.png',sourceRect:{x:146,y:158,width:1482,height:571},renderSize:{width:95,height:36.6},grip:[0.5,0.03],mass:0.65,friction:0.65,restitution:0.07,windResponse:1.1,difficultyBonus:40,material:'soft',collision:{type:'convexPolygon',vertices:[[0.74899,0.99299],[0.2166,0.99299],[0.09852,0.96497],[0.03171,0.8669],[0.01215,0.78984],[0.0054,0.58669],[0.02969,0.44658],[0.11134,0.26445],[0.22672,0.13135],[0.31174,0.0683],[0.46559,0.01226],[0.5641,0.01226],[0.72132,0.07531],[0.77868,0.11033],[0.88192,0.23643],[0.96694,0.43257],[0.9973,0.63573],[0.99055,0.76883],[0.95209,0.90193],[0.90621,0.95797]]}},
 {id:'cactus_pot',name:'선인장 화분',description:'높은 곳에서 휘청',image:'assets/items/cactus_pot.png',sourceRect:{x:307,y:92,width:760,height:959},renderSize:{width:61,height:76.97},grip:[0.5,0.03],mass:1.5,friction:0.63,restitution:0.02,windResponse:1.1,difficultyBonus:80,material:'ceramic',collision:{type:'convexPolygon',vertices:[[0.20526,0.12409],[0.28421,0.05735],[0.42763,0.0073],[0.52368,0.00313],[0.64211,0.02398],[0.75921,0.09072],[0.83553,0.18248],[0.86711,0.24922],[0.98816,0.5829],[0.98553,0.67049],[0.88421,0.87904],[0.825,0.96246],[0.67105,0.99166],[0.46447,0.99583],[0.21447,0.97914],[0.16842,0.95829],[0.11579,0.88321],[0.01316,0.67049],[0.01053,0.5829],[0.13289,0.24505]]}},
 {id:'camera',name:'필름 카메라',description:'넓고 반듯한 몸체',image:'assets/items/camera.png',sourceRect:{x:170,y:129,width:1219,height:767},renderSize:{width:94,height:59.15},grip:[0.5,0.03],mass:1.6,friction:0.57,restitution:0.03,windResponse:0.7,difficultyBonus:0,material:'metal',collision:{type:'convexPolygon',vertices:[[0.63495,0.99478],[0.0886,0.99478],[0.05578,0.98957],[0.01887,0.95306],[0.00246,0.86962],[0.00328,0.31682],[0.01477,0.25424],[0.08121,0.09257],[0.13126,0.06128],[0.45857,0.00391],[0.59065,0.00391],[0.61526,0.00913],[0.90156,0.09257],[0.9114,0.103],[0.98523,0.24902],[0.99672,0.33768],[0.99672,0.86441],[0.99262,0.91134],[0.97211,0.96349],[0.93929,0.98957]]}},
 {id:'suitcase',name:'여행 가방',description:'묵직하고 반듯해요',image:'assets/items/suitcase.png',sourceRect:{x:211,y:90,width:1115,height:796},renderSize:{width:109,height:77.82},grip:[0.5,0.03],mass:2.2,friction:0.68,restitution:0.03,windResponse:0.75,difficultyBonus:0,material:'soft',collision:{type:'convexPolygon',vertices:[[0.00538,0.34045],[0.03049,0.24497],[0.07982,0.19975],[0.37848,0.02387],[0.43049,0.00879],[0.51121,0.00377],[0.62152,0.02387],[0.91121,0.19472],[0.95336,0.22487],[0.98565,0.28015],[0.99462,0.35553],[0.99641,0.83794],[0.98744,0.90327],[0.9704,0.94347],[0.92735,0.98367],[0.88251,0.99372],[0.10942,0.99372],[0.04843,0.96859],[0.01166,0.90327],[0.00269,0.83794]]}},
 {id:'hand_drum',name:'작은 북',description:'넓은 윗면이 든든',image:'assets/items/hand_drum.png',sourceRect:{x:155,y:144,width:1226,height:744},renderSize:{width:90,height:54.62},grip:[0.5,0.03],mass:1.2,friction:0.63,restitution:0.07,windResponse:0.9,difficultyBonus:0,material:'wood',collision:{type:'convexPolygon',vertices:[[0.99592,0.25672],[0.94535,0.86425],[0.92659,0.90726],[0.83361,0.95565],[0.56933,0.99328],[0.41436,0.99328],[0.25449,0.97715],[0.13214,0.94489],[0.06444,0.89651],[0.05302,0.85349],[0.00245,0.24597],[0.00816,0.18683],[0.06444,0.07392],[0.09706,0.04704],[0.26101,0.01478],[0.53181,0.00403],[0.71044,0.01478],[0.89396,0.04704],[0.93801,0.0793],[0.98695,0.17608]]}},
 {id:'anchor',name:'닻 장식',description:'걸리는 모양을 활용',image:'assets/items/anchor.png',sourceRect:{x:63,y:48,width:1248,height:1058},renderSize:{width:79,height:66.97},grip:[0.5,0.03],mass:2.5,friction:0.58,restitution:0.02,windResponse:0.65,difficultyBonus:80,material:'wood',collision:{type:'convexPolygon',vertices:[[0.03446,0.4603],[0.40465,0.04442],[0.4391,0.01796],[0.50561,0.00284],[0.55929,0.01796],[0.59375,0.04442],[0.96394,0.4603],[0.99519,0.5775],[0.99519,0.66068],[0.97276,0.73629],[0.82131,0.84972],[0.77244,0.87996],[0.51122,0.99338],[0.48718,0.99338],[0.23397,0.88374],[0.18189,0.8535],[0.02564,0.73629],[0.00721,0.69093],[0.0024,0.60019],[0.01522,0.50567]]}},
 {id:'wood_duck',name:'나무 오리',description:'둥근 등과 튀어나온 부리',image:'assets/items/wood_duck.png',sourceRect:{x:158,y:84,width:1238,height:865},renderSize:{width:91,height:63.58},grip:[0.5,0.03],mass:1.1,friction:0.58,restitution:0.05,windResponse:1,difficultyBonus:80,material:'wood',collision:{type:'convexPolygon',vertices:[[0.65913,0.99306],[0.34976,0.99306],[0.27948,0.96994],[0.16721,0.86358],[0.10824,0.7711],[0.0622,0.66012],[0.01858,0.48439],[0.00242,0.36879],[0.00808,0.31329],[0.03877,0.27168],[0.59532,0.02197],[0.69144,0.00347],[0.74313,0.01734],[0.80856,0.06821],[0.99111,0.28555],[0.99435,0.32717],[0.86753,0.7896],[0.82956,0.87746],[0.78514,0.93295],[0.73506,0.96994]]}},
 {id:'pillow',name:'쿠션',description:'가벼워 바람에 흔들려요',image:'assets/items/pillow.png',sourceRect:{x:136,y:84,width:1504,height:723},renderSize:{width:111,height:53.36},grip:[0.5,0.03],mass:0.4,friction:0.77,restitution:0.08,windResponse:1.8,difficultyBonus:40,material:'soft',collision:{type:'convexPolygon',vertices:[[0.99136,0.12586],[0.99734,0.82296],[0.99335,0.89488],[0.98138,0.93914],[0.96077,0.97234],[0.93684,0.98893],[0.08777,0.99447],[0.06117,0.98893],[0.0379,0.97234],[0.01995,0.94467],[0.00798,0.90595],[0.00199,0.82296],[0.00731,0.1314],[0.0113,0.08714],[0.02394,0.04288],[0.05053,0.00968],[0.06449,0.00415],[0.93285,0.00415],[0.96875,0.03181],[0.9867,0.0816]]}},
 {id:'ceramic_mug',name:'머그컵',description:'손잡이 쪽 균형을 조심',image:'assets/items/ceramic_mug.png',sourceRect:{x:187,y:140,width:1287,height:776},renderSize:{width:74,height:44.62},grip:[0.5,0.03],mass:1.3,friction:0.58,restitution:0.03,windResponse:0.85,difficultyBonus:40,material:'ceramic',collision:{type:'convexPolygon',vertices:[[0.108,0.02964],[0.23543,0.00902],[0.47708,0.00387],[0.66822,0.02448],[0.88578,0.12242],[0.95882,0.19974],[0.98135,0.26675],[0.99689,0.39562],[0.99301,0.49871],[0.96193,0.64304],[0.89355,0.7616],[0.64802,0.96778],[0.48407,0.99356],[0.28749,0.99356],[0.13287,0.96778],[0.06838,0.91108],[0.03419,0.83892],[0.00777,0.71521],[0.00544,0.4884],[0.04895,0.09665]]}},
 {id:'wood_stool',name:'나무 의자',description:'두 다리로 버텨요',image:'assets/items/wood_stool.png',sourceRect:{x:160,y:192,width:1217,height:684},renderSize:{width:102,height:57.33},grip:[0.5,0.03],mass:1.3,friction:0.68,restitution:0.03,windResponse:1.2,difficultyBonus:80,material:'wood',collision:{type:'convexPolygon',vertices:[[0.13476,0.00439],[0.86689,0.00439],[0.89154,0.01023],[0.91619,0.02778],[0.93098,0.05117],[0.94659,0.09211],[0.98603,0.24415],[0.99343,0.30263],[0.99671,0.93421],[0.99178,0.9693],[0.96878,0.99269],[0.02958,0.99269],[0.00493,0.96345],[0.00247,0.92836],[0.00493,0.30263],[0.01397,0.2383],[0.0304,0.16813],[0.05998,0.06871],[0.07395,0.03947],[0.09614,0.01608]]}},
 {id:'picnic_basket',name:'소풍 바구니',description:'넓고 가벼운 받침',image:'assets/items/picnic_basket.png',sourceRect:{x:66,y:139,width:1640,height:661},renderSize:{width:118,height:47.56},grip:[0.5,0.03],mass:0.9,friction:0.7,restitution:0.03,windResponse:1.3,difficultyBonus:0,material:'wood',collision:{type:'convexPolygon',vertices:[[0.62805,0.99092],[0.36707,0.99092],[0.2,0.96672],[0.08415,0.90015],[0.04878,0.81543],[0.00915,0.57943],[0.00183,0.40998],[0.02195,0.22844],[0.10183,0.10741],[0.24207,0.05295],[0.46159,0.00454],[0.5378,0.00454],[0.77988,0.059],[0.90671,0.11346],[0.97866,0.23449],[0.99756,0.40393],[0.98902,0.58548],[0.95183,0.80938],[0.91585,0.90015],[0.83537,0.95461]]}}
];
var ITEMS_BY_ID={};ITEMS.forEach(function(it){ITEMS_BY_ID[it.id]=it});

/* 물리에 영향 주는 '바람 불기'는 없앰 — 영등할망이 잠깐 나와 화면을 가리기만 하는 방해 연출로 변경(사장님 지시).
   물건의 낙하·쌓기는 이 이벤트 동안에도 평소와 똑같이 진행된다. */
var WIND_TIMING={enter:0.1,cover:1.1,exit:0.3}; // enter를 짧게 해서 "확" 튀어나오는 느낌
var WIND_TOTAL=WIND_TIMING.enter+WIND_TIMING.cover+WIND_TIMING.exit;
var WIND_LINES=['짠! 잠깐 안 보이게 할게!','후훗, 눈 감고 있어 볼까?','또 나왔지롱!'];
/* 단계별 화면가림은 '그 단계 안에서 몇 번째 물건을 잡을 때'로 정한다(단계마다 물건 수가 같아서 절대 슬롯 번호로 충분).
   3단계(가장 어려움)만 한 번 더 넣는다. */
var WIND_SLOTS_BY_STAGE={1:[3],2:[3],3:[2,4]};
var STAGE_ITEM_COUNTS=[8,9,10]; // 1/2/3단계 각각 몇 개를 쌓는지

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
function windSound(){beep(520,0.12,'sine',0.15);setTimeout(function(){beep(660,0.14,'sine',0.13)},110)}
function collapseSound(){beep(120,0.5,'sawtooth',0.22);setTimeout(function(){beep(90,0.4,'sawtooth',0.18)},90)}
function clearSound(){[520,660,780,980].forEach(function(f,i){setTimeout(function(){beep(f,0.28,'sine',0.16)},i*90)})}
var bgmEl=null;
function startBgm(){
 if(bgmEl)return;
 try{
  bgmEl=new Audio('assets/wind_bgm.mp3');
  bgmEl.loop=true;bgmEl.volume=0.32;bgmEl.muted=!soundOn;
  bgmEl.play()['catch'](function(){});
 }catch(e){}
}
$('#sound').onclick=function(){
 soundOn=!soundOn;$('#sound').classList.toggle('active',soundOn);$('#sound').textContent=soundOn?'♪':'✕';
 if(bgmEl)bgmEl.muted=!soundOn;
};

/* ---------------- 이미지 로딩 ---------------- */
var imgCache={};
function loadImg(url){
 if(imgCache[url])return imgCache[url];
 var img=new Image();img.src=url;imgCache[url]=img;return img;
}
ITEMS.forEach(function(it){loadImg(it.image)});
var CHAR_SRC={smile:'assets/characters/yeongdeung_smile.png',blow:'assets/characters/yeongdeung_blow.png',puff:'assets/characters/yeongdeung_wind_puff.png',cheer:'assets/characters/yeongdeung_cheer.png'};
var CHAR_SMILE=loadImg(CHAR_SRC.smile),CHAR_BLOW=loadImg(CHAR_SRC.blow),CHAR_PUFF=loadImg(CHAR_SRC.puff);
loadImg(CHAR_SRC.cheer);
var BG=loadImg('assets/backgrounds/jeju_coast.png');
var UI={};['crane_rail','crane_trolley','crane_claw_open','crane_claw_closed','platform','impact_ring','sparkle'].forEach(function(n){UI[n]=loadImg('assets/ui/'+n+'.svg')});

/* ---------------- 상태 ---------------- */
var S={
 phase:'SELECT', // SELECT, HELD, FALLING, SETTLING, COLLAPSE, RESULT_CLEAR, RESULT_FAIL, RESULT_UNSTABLE
 stage:1, // 1~3
 totalScore:0, totalPlaced:0, // 지금까지 클리어한 단계들의 누적치(현재 진행 중인 단계 점수는 미포함)
 order:[], // 현재 단계에서 쌓을 물건 순서
 released:0, // 이번 단계에서 떨어뜨린 개수
 score:0, itemScore:0, heightPx:0, // 이번 단계 점수
 craneX:CRANE.minX, craneDir:1, heldY:0, cameraTargetY:0, cameraY:0,
 windEvent:null, windTimer:0, windUsedSlots:{},
 settlingElapsed:0, stableTimer:0, shownStuckToast:false,
 bodies:[], currentBody:null,
 attemptId:null, seed:null, startedAt:0, collapseTimer:0,
 best:0, paused:false, toastUntil:0, shakeUntil:0
};

/* ---------------- 영등할망 캐릭터 연출 관리자 ---------------- */
/* idlePeek(평상시 빼꼼) / windActive(화면가림, 캔버스) / resultCheer(결과 화면 축하)는 서로 겹치지 않는다.
   idlePeek는 게임 시간(tick의 dt)으로만 돌아 백그라운드 복귀 때 옛 연출이 튀어나오지 않고, 물리·점수에는 관여하지 않는다. */
var PEEK={enter:0.25,stay:1.0,exit:0.25,quickExit:0.2,minGap:8,maxPerStage:3,earlyItems:3,widthPx:117,craneClear:95,chance:0.5,
 weights:{left:40,right:40,bottom:30,top:10}};
var DIR={now:0,lastEnd:-99,count:0,lastPose:null,active:null,heldT:0,plan:null};
var peekEls={};
[].forEach.call(document.querySelectorAll('#charLayer .peek'),function(el){
 peekEls[el.getAttribute('data-pose')]=el;
 el.addEventListener('error',function(){if(!el._fb){el._fb=true;el.src=CHAR_SRC.smile}});
});
function peekReset(el){el.classList.add('snap');el.classList.remove('on');void el.offsetWidth;el.classList.remove('snap')}
function directorKill(){
 if(DIR.active){peekReset(DIR.active.el);DIR.active=null;DIR.lastEnd=DIR.now}
 DIR.plan=null;
}
function directorPlanHeld(){
 DIR.heldT=0;DIR.plan=null;
 if(DIR.count>=PEEK.maxPerStage)return;
 if(Math.random()<PEEK.chance)DIR.plan={at:0.9+Math.random()*1.6};
}
function craneClearOf(side,dur){
 var x=S.craneX,d=S.craneDir;
 for(var t=0;t<=dur+0.1;t+=0.1){
  x+=CRANE.speed*d*0.1;
  if(x>CRANE.maxX){x=2*CRANE.maxX-x;d=-1}
  if(x<CRANE.minX){x=2*CRANE.minX-x;d=1}
  var edgeDist=side==='left'?x:WORLD.width-x;
  if(edgeDist<PEEK.widthPx+PEEK.craneClear)return false;
 }
 return true;
}
function canPeek(){
 if(S.phase!=='HELD'||S.windEvent||S.paused||DIR.active)return false;
 if(!S.bodies.some(function(b){return b.plugin&&b.plugin.stableAwarded}))return false;
 if(DIR.count>=PEEK.maxPerStage)return false;
 if(S.released<PEEK.earlyItems&&DIR.count>=1)return false;
 if(DIR.now-DIR.lastEnd<PEEK.minGap)return false;
 return true;
}
function startPeek(){
 if(!canPeek())return;
 var total=PEEK.enter+PEEK.stay+PEEK.exit,topSide=null,pool=[];
 ['left','right','bottom','top'].forEach(function(pose){
  if(pose===DIR.lastPose)return;
  if(pose==='top'){
   topSide=craneClearOf('left',total)?'left':(craneClearOf('right',total)?'right':null);
   if(!topSide)return;
  }
  pool.push(pose);
 });
 if(!pool.length)return;
 var sum=0;pool.forEach(function(k){sum+=PEEK.weights[k]});
 var r=Math.random()*sum,pose=pool[pool.length-1];
 for(var i=0;i<pool.length;i++){r-=PEEK.weights[pool[i]];if(r<=0){pose=pool[i];break}}
 var el=peekEls[pose];if(!el)return;
 peekReset(el);
 if(pose==='top'){el.style.left=topSide==='left'?'-2%':'auto';el.style.right=topSide==='right'?'-2%':'auto'}
 el.style.setProperty('--peek-dur',PEEK.enter+'s');
 void el.offsetWidth;el.classList.add('on');
 DIR.active={pose:pose,el:el,t:0,state:'enter',exitAt:0,exitDur:PEEK.exit};
 DIR.count++;DIR.lastPose=pose;
}
function peekBeginExit(a,dur){
 a.state='exit';a.exitAt=a.t;a.exitDur=dur;
 a.el.style.setProperty('--peek-dur',dur+'s');a.el.classList.remove('on');
}
function directorTick(dt){
 DIR.now+=dt;
 var a=DIR.active;
 if(a){
  a.t+=dt;
  if(S.windEvent){directorKill();return}
  if(a.state!=='exit'&&S.phase!=='HELD')peekBeginExit(a,PEEK.quickExit);
  else if(a.state==='enter'&&a.t>=PEEK.enter)a.state='stay';
  if(a.state==='stay'&&a.t>=PEEK.enter+PEEK.stay)peekBeginExit(a,PEEK.exit);
  if(a.state==='exit'&&a.t>=a.exitAt+a.exitDur){DIR.active=null;DIR.lastEnd=DIR.now}
  return;
 }
 if(S.phase==='HELD'&&DIR.plan){
  DIR.heldT+=dt;
  if(DIR.heldT>=DIR.plan.at){DIR.plan=null;startPeek()}
 }
}
/* 결과 화면 축하: 패널(z-index 1) 뒤에서 고개를 내밀어 점수·버튼을 가리지 않는다 */
var cheerEl=null;
function hideCheer(){if(cheerEl){cheerEl.remove();cheerEl=null}}
function layoutCheer(img){
 var sr=stage.getBoundingClientRect(),pr=panel.getBoundingClientRect();
 var sw=sr.width,panelTop=pr.top-sr.top,asp=640/1246;
 var H=Math.min(Math.max(140,(panelTop-6)*2),sw*0.6/asp);
 img.style.height=H+'px';
 img.style.left=-Math.round(sw*0.05)+'px';
 img.style.top=Math.max(4,Math.round(panelTop-H*0.5))+'px';
}
function showCheer(){
 hideCheer();
 var img=new Image();img.className='cheer';img.alt='';img.decoding='async';
 img.onerror=function(){if(!img._fb){img._fb=true;img.src=CHAR_SRC.smile}};
 img.src=CHAR_SRC.cheer;
 overlay.insertBefore(img,panel);cheerEl=img;
 layoutCheer(img);
 requestAnimationFrame(function(){requestAnimationFrame(function(){img.classList.add('in')})});
}

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

/* ---------------- 시작 화면 (물건은 매판 무작위로 정해짐, 난이도는 1~3단계로 점점 섞임) ---------------- */
/* 후보 30종. starfish/anchor(reserveIds)는 모양이 복잡해 기본 후보에서 제외 — 필요하면 교체용으로만 사용 */
var ACTIVE_CATALOG_IDS=['citrus_crate','basalt_brick','wood_plank','tangerine','buoy','tea_tin','shell','lava_jar','fish_block','straw_hat','gift_box','lifering','dol_hareubang','surfboard','conch','kettle','bucket','watering_can','rain_boot','book_stack','bread_loaf','cactus_pot','camera','suitcase','hand_drum','wood_duck','pillow','ceramic_mug','wood_stool','picnic_basket'];
/* 평평하고 잘 받쳐주는 것 10종(1단계용). 나머지 중 완만한 것 2종은 중간지대(2단계용). 그 외 18종은 둥글거나
   손잡이·다리처럼 오목한 부분이 있어 불안정한 것(3단계용). 세 목록을 합치면 ACTIVE_CATALOG_IDS와 정확히 같다. */
var FLAT_IDS=['citrus_crate','basalt_brick','wood_plank','tea_tin','gift_box','book_stack','camera','suitcase','hand_drum','picnic_basket'];
var MEDIUM_IDS=['bread_loaf','pillow'];
var HARD_IDS=['tangerine','buoy','shell','lava_jar','fish_block','straw_hat','lifering','dol_hareubang','surfboard','conch','kettle','bucket','watering_can','rain_boot','cactus_pot','wood_duck','ceramic_mug','wood_stool'];
function shuffleArr(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}return a}
/* 단계별 후보 풀: 1단계는 FLAT만, 2단계는 FLAT+MEDIUM을 섞어서, 3단계는 30종 전부를 다 섞어서 고른다.
   각 단계는 판이 새로 시작되므로(플랫폼 리셋) 단계 사이에 물건이 겹쳐도 상관없다 — 그 판 안에서만 중복 없으면 된다. */
function poolForStage(stageNum){
 if(stageNum===1)return FLAT_IDS.slice();
 if(stageNum===2)return FLAT_IDS.concat(MEDIUM_IDS);
 return ACTIVE_CATALOG_IDS.slice();
}
function pickStageItems(stageNum){
 var pool=shuffleArr(poolForStage(stageNum));
 return pool.slice(0,STAGE_ITEM_COUNTS[stageNum-1]);
}
function renderIntro(){
 hideCheer();directorKill();
 overlay.classList.remove('hidden');
 panel.innerHTML='<h2>어디까지 쌓을 수 있을까?</h2>'+
  '<img class="startPortrait" src="assets/characters/yeongdeung_smile.png" alt="영등할망">'+
  '<button class="primary" id="btnStart">1단계 시작</button>';
 var btn=$('#btnStart');
 if(btn)btn.onclick=function(){
  startBgm();
  S.stage=1;S.totalScore=0;S.totalPlaced=0;
  S.attemptId=Date.now()+'-'+Math.random().toString(36).slice(2,8);
  S.seed=Date.now();S.startedAt=performance.now();
  beginStage();
 };
}

/* ---------------- 라운드 진행 ---------------- */
function beginStage(){
 hideCheer();directorKill();DIR.count=0;
 clearPhysics();initPhysics(); // 단계마다 판(플랫폼)을 새로 시작
 S.order=pickStageItems(S.stage);
 S.released=0;S.score=0;S.itemScore=0;S.heightPx=0;
 S.cameraY=0;S.cameraTargetY=0;
 S.craneX=CRANE.minX;S.craneDir=1;
 S.windEvent=null;S.windTimer=0;S.windUsedSlots={};
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
  var slotsForStage=WIND_SLOTS_BY_STAGE[S.stage]||[];
  if(slotsForStage.indexOf(slot)>=0 && !S.windUsedSlots[slot]){
   S.windUsedSlots[slot]=true;
   S.windEvent={slot:slot,line:WIND_LINES[Math.floor(Math.random()*WIND_LINES.length)]};
   S.windTimer=0;
   directorKill();DIR.lastEnd=DIR.now+WIND_TOTAL;
  }
  directorPlanHeld();
  $('#phase').textContent=S.stage+'단계 ('+slot+'/'+S.order.length+') · '+item.name+' · '+item.description;
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
 // 영등할망 화면가림 타이머 — 물리에는 관여하지 않음(순수 시각 연출)
 if(S.windEvent){
  S.windTimer+=dt;
  if(S.windTimer>=WIND_TOTAL){S.windEvent=null}
  else if(S.windTimer>=WIND_TIMING.enter)windSoundOnce(S.windEvent);
 }
}
var _windSoundFired=null;
function windSoundOnce(ev){
 if(_windSoundFired===ev)return;_windSoundFired=ev;windSound();
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
 directorTick(dt);
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
   } else if(S.settlingElapsed>=SETTLE.advanceAfterSeconds && S.released<S.order.length){
    if(!S.shownStuckToast){showToast('아직 흔들려요');S.shownStuckToast=true}
    setPhase('HELD');
   } else if(S.released===S.order.length && S.settlingElapsed>=SETTLE.finalTimeoutSeconds){
    finishStage('unstable');
   }
  }
 } else if(S.phase==='COLLAPSE'){
  Matter.Engine.update(engine,dt*1000);
  S.collapseTimer+=dt;
  if(S.collapseTimer>=0.8)finishStage('fall');
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
 if(S.released===S.order.length){finishStage('clear');return}
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
/* 단계 하나가 끝났을 때. 클리어면 다음 단계로(또는 3단계면 전체 클리어), 실패면 이 단계만 다시 — 게임 전체가
   끝나는 게 아니다. onGameComplete는 전체 게임을 다 클리어했을 때 딱 한 번만 부모 앱에 보낸다. */
function finishStage(outcome){
 var placedCount=S.bodies.filter(function(b){return b.plugin&&b.plugin.stableAwarded}).length;
 if(outcome==='clear'){
  S.score+=SCORE.clearBonus;clearSound();
  S.totalScore+=S.score;S.totalPlaced+=placedCount;
  S.phase='RESULT_CLEAR';
  sendStageReward(placedCount); // 실패는 보상 없음, 클리어한 단계마다 그 자리에서 바로 보상(부모 앱이 미션 요청은 한 판에 한 번만 보낸다)
  if(S.stage<3){
   renderStageClear(placedCount);
  } else {
   renderGameClear();
  }
  showCheer(); // 탑이 안정화된 클리어에서만 — 실패 화면에는 축하 포즈를 쓰지 않는다
 } else {
  S.phase=outcome==='fall'?'RESULT_FAIL':'RESULT_UNSTABLE';
  renderStageFail(outcome,placedCount);
 }
}
function sendStageReward(placedCount){
 var durationMs=Math.round(performance.now()-S.startedAt);
 var result={
  gameId:'wind-stack',ruleVersion:RULE_VERSION,attemptId:S.attemptId+'-s'+S.stage,seed:S.seed,
  stage:S.stage,stagesCleared:S.stage,placedCount:placedCount,
  stableHeight:Math.round(S.heightPx),score:S.score,outcome:'clear',durationMs:durationMs
 };
 try{if(window.onGameComplete)window.onGameComplete(result)}catch(e){}
}
function renderStageClear(placedCount){
 overlay.classList.remove('hidden');
 panel.innerHTML='<h2>'+S.stage+'단계 클리어!</h2>'+
  '<div class="big-score">'+S.score+'<small> 점</small></div>'+
  '<div class="stats"><div><b>'+Math.round(S.heightPx)+'px</b>높이</div><div><b>'+placedCount+'/'+S.order.length+'</b>쌓은 개수</div></div>'+
  '<button class="primary" id="btnNextStage">'+(S.stage+1)+'단계로</button>';
 $('#btnNextStage').onclick=function(){S.stage++;beginStage()};
}
function renderGameClear(){
 overlay.classList.remove('hidden');
 var durationSec=Math.round((performance.now()-S.startedAt)/1000);
 panel.innerHTML='<h2>바람탑 완성!</h2><p>3단계까지 전부 쌓았구나! 제법인데?</p>'+
  '<div class="big-score">'+S.totalScore+'<small> 점</small></div>'+
  '<div class="stats"><div><b>3/3</b>단계</div><div><b>'+S.totalPlaced+'</b>쌓은 개수</div><div><b>'+durationSec+'초</b>걸린 시간</div></div>'+
  '<button class="primary" id="btnRestart">처음부터 다시하기</button>';
 $('#btnRestart').onclick=function(){renderIntro()};
}
function renderStageFail(outcome,placedCount){
 hideCheer();
 overlay.classList.remove('hidden');
 var title=outcome==='fall'?'아이고, 와르르!':'아직 흔들려요';
 var sub=outcome==='fall'?(S.stage+'단계, 이번엔 순서를 바꿔 볼까?'):'시간이 다 되어 여기서 마무리할게요.';
 panel.innerHTML='<h2>'+title+'</h2><p>'+sub+'</p>'+
  '<div class="big-score">'+S.score+'<small> 점</small></div>'+
  '<div class="stats"><div><b>'+Math.round(S.heightPx)+'px</b>높이</div><div><b>'+placedCount+'/'+S.order.length+'</b>쌓은 개수</div><div><b>'+S.stage+'/3</b>단계</div></div>'+
  '<button class="primary" id="btnRetryStage">'+S.stage+'단계 다시하기</button>'+
  '<button class="secondary" id="btnRestartAll">처음부터 다시하기</button>';
 $('#btnRetryStage').onclick=function(){beginStage()};
 $('#btnRestartAll').onclick=function(){renderIntro()};
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
var PUFF_HAND=[0.93,0.365]; // wind_puff.png에서 펼친 손바닥 위치(가로·세로 비율) — 바람이 여기서 시작
function drawPuffWind(hx,hy,t,alpha){
 ctx.save();ctx.lineCap='round';
 for(var i=0;i<4;i++){
  var p=((t*1.7+i*0.27)%1),len=30+i*9,dy=(i-1.5)*15+Math.sin(t*6+i)*3;
  var x0=hx+(WORLD.width-hx+len)*p*0.98,a=Math.sin(Math.PI*p)*0.8*alpha;
  ctx.globalAlpha=a;ctx.strokeStyle='#f2fbf7';ctx.lineWidth=3.2-i*0.3;
  ctx.beginPath();ctx.moveTo(x0-len,hy+dy);ctx.quadraticCurveTo(x0-len*0.4,hy+dy-5,x0,hy+dy);ctx.stroke();
 }
 ctx.restore();
}
/* 화면 좌표계(카메라 이동 영향 없음)에 그린다 — 탑이 아무리 높아져도 항상 화면 전체를 가려야 하므로. */
function drawPeekabooCover(){
 if(!S.windEvent)return;
 var t=S.windTimer,ev=S.windEvent;
 var enterEnd=WIND_TIMING.enter,coverEnd=enterEnd+WIND_TIMING.cover;
 var alpha=1;
 if(t<enterEnd)alpha=Math.min(1,t/enterEnd);
 else if(t>coverEnd)alpha=Math.max(0,1-(t-coverEnd)/WIND_TIMING.exit);
 if(alpha<=0)return;
 // 물건이 '떨어지는 쪽'(탑 꼭대기/착지 지점)을 가린다 — 크레인이 있는 위쪽은 그대로 보이게 둔다.
 var landingWorldY=S.bodies.length?towerTopY():WORLD.platformTop;
 var landingScreenY=landingWorldY-S.cameraY;
 landingScreenY=Math.max(WORLD.height*0.42,Math.min(WORLD.height*0.86,landingScreenY));
 var bandTop=Math.max(WORLD.height*0.22,landingScreenY-160);
 ctx.save();ctx.globalAlpha=alpha*0.94;ctx.fillStyle='#173f45';ctx.fillRect(0,bandTop,WORLD.width,WORLD.height-bandTop);ctx.restore();
 var ok=function(im){return im.complete&&im.naturalWidth>0};
 var img=ok(CHAR_PUFF)?CHAR_PUFF:(ok(CHAR_BLOW)?CHAR_BLOW:CHAR_SMILE);
 if(ok(img)){
  var scale=(WORLD.width*0.82)/img.naturalWidth;
  var w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  var cx=WORLD.width/2-(img===CHAR_PUFF?18:0),cy=Math.min(landingScreenY+30,WORLD.height-h*0.3);
  ctx.save();ctx.globalAlpha=alpha;
  ctx.drawImage(img,cx-w/2,cy-h/2,w,h);
  ctx.restore();
  if(img===CHAR_PUFF)drawPuffWind(cx-w/2+w*PUFF_HAND[0],cy-h/2+h*PUFF_HAND[1],t,alpha);
 }
 // 말풍선(DOM)
 var showBubble=t<coverEnd;
 if(showBubble){
  windBubble.textContent=ev.line;
  windBubble.classList.add('on');
  windBubble.style.left=Math.max(6,stage.clientWidth/2-windBubble.offsetWidth/2)+'px';
  windBubble.style.top=Math.max(6,(bandTop/WORLD.height)*stage.clientHeight-6)+'px';
 } else windBubble.classList.remove('on');
}

function updateCamera(){
 S.cameraY+=(S.cameraTargetY-S.cameraY)*0.08;
 if(S.cameraY>0)S.cameraY=0;
}
function updateHud(){
 $('#hudLeft').innerHTML=(S.order.length-S.released)+'<span>개</span>';
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
 ctx.restore();
 drawPeekabooCover();
 ctx.restore();
 updateHud();
}

/* ---------------- 루프 ---------------- */
var raf=null,lastT=null,acc=0;
function resizeCanvas(){
 cv.width=WORLD.width*DPR;cv.height=WORLD.height*DPR;
}
/* #stage에 aspect-ratio+max-width/max-height만 주면 브라우저가 항상 높이를 100% 채우는 쪽으로
   계산해버려서(실기기 확인됨), 세로가 빠듯하고 가로가 넉넉한 화면에서 게임창이 필요 이상으로
   좁게 나온다. 가용 공간을 직접 재서 폭/높이 중 더 타이트한 쪽에 맞춰 최대 크기로 채운다. */
var boardWrapEl=document.getElementById('board-wrap');
function fitStage(){
 if(!boardWrapEl)return;
 var availW=boardWrapEl.clientWidth,availH=boardWrapEl.clientHeight;
 if(!availW||!availH)return;
 var ratio=WORLD.width/WORLD.height;
 var w=availW,h=w/ratio;
 if(h>availH){h=availH;w=h*ratio;}
 stage.style.width=Math.floor(w)+'px';
 stage.style.height=Math.floor(h)+'px';
}
window.addEventListener('resize',fitStage);
window.addEventListener('orientationchange',function(){setTimeout(fitStage,60)});
function loop(t){
 if(lastT==null)lastT=t;
 var dt=t-lastT;lastT=t;
 if(dt>250)dt=250;
 acc+=dt;
 while(acc>=STEP*1000){tick(STEP);updateCamera();acc-=STEP*1000}
 render();
 raf=requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange',function(){S.paused=document.hidden;if(document.hidden)directorKill();if(!document.hidden)lastT=null});

/* ---------------- 시작 ---------------- */
resizeCanvas();
fitStage();
initPhysics();
renderIntro();
raf=requestAnimationFrame(loop);
