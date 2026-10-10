/* ============================================================
   탐라문화제 연계 홍보 —「탐라, 여섯 신을 만나다」 설정 파일
   ------------------------------------------------------------
   여기 값만 고치면 앱 내용이 바뀐다. 코드는 건드릴 필요 없음.

   2026-09-13 개편: "선원 수배령(WANTED)" 콘셉트는 탐라문화제와 어울리지
   않는다는 판단으로 폐기. 코스어 6인은 실제로 탐라(제주) 신화 속 여섯
   신이므로, "체포"가 아니라 "인사"드리고 "도장"을 받는 방식으로 바꿨다.
   2026-09-30 개편: 복 포인트·응모권·최종추첨 구조를 없애고 "무료 맛보기"로 전환.
   미션 → mh머니 → 디지털 쿠지 맛보기 → 과수원피스 초대.
   mh머니 수량·쿠지 비용·맛보기 횟수·시연 여부는 전부 행사 서버(evCfg/tamna)가
   정한다. 이 파일에 숫자를 적지 않는다(미정 값을 코드에 박지 않기 위해).
   ============================================================ */

window.TAMNA = {

  /* ---------- 기본 ---------- */
  title: "탐라, 여섯 신을 만나다",
  subtitle: "탐라문화제 × 과수원피스",
  festivalName: "탐라문화제",
  festivalDates: "2026.10.17(토) ~ 10.21(수)",
  boothName: "메이커앤하비 · 박서방 부스",
  /* 부스 프로그램 타임테이블 — 하루 1회씩. 2026-10-10 확정(윷놀이 30분·동작퀴즈 20분 확정) */
  boothSchedule: [
    {day:"2026-10-17", items:[
      {s:"14:00", e:"14:20", t:"가위바위보 도전"},
      {s:"14:20", e:"15:00", t:"애니송퀴즈&노래방"},
      {s:"15:00", e:"15:30", t:"윷놀이"},
      {s:"16:00", e:"16:20", t:"랜덤 플레이댄스"}]},
    {day:"2026-10-18", items:[
      {s:"14:00", e:"14:20", t:"오타쿠 퀴즈"},
      {s:"14:20", e:"15:00", t:"애니송퀴즈&노래방"},
      {s:"15:00", e:"15:20", t:"오타쿠 애니메이션 동작 퀴즈"},
      {s:"16:00", e:"16:20", t:"랜덤 플레이댄스"}]}
  ],

  boothWhere: "(부스 위치 확정되면 여기 적기)",

  /* 행사 서버(쿠지시스템 Cloud Functions) 행사 구분 */
  eventId: "tamna",
  /* 서버 설정(coinName)이 아직 null 일 때만 쓰는 임시 표기. 확정 이름 아님. */
  coinNameFallback: "mh머니",

  /* 본편 행사 — 사실만 적는다 */
  mainEventName: "과수원피스 STAMPEDE",
  mainEventDate: "2026-10-31T10:30:00+09:00",
  mainEventPlace: "한림 금능석물원",
  mainEventHours: "10:30 ~ 16:00",
  mainEventPass: "항해 패스 6,000원",
  guideUrl: "https://psbjeju-maker.github.io/gwasuwonpiece-2026/guide.html",

  /* ---------- 탐라 신화 여섯 신 ----------
     2026-09-13 확정: `주간 캐릭터 배정표` 기준 실제 배정 캐스팅 반영.
     photo : 이미지 경로 (없으면 실루엣 + 이름 이니셜로 자동 표시)
     code  : 도장 QR / 스태프 코드. 대소문자 구분 안 함.
     missionId: 행사 서버 미션 ID (evCfg/tamna.missions 의 키)
     jeju  : {word, mean} — 인사 순간 신이 건네는 제주어 한마디 + 뜻.
     activeDays: 이 신이 실제로 강림(출연)하는 날짜(YYYY-MM-DD) 배열.
                 이 날짜가 아니면 앱 안에서 "오늘은 만나기 어렵다"고 안내한다.
  */
  crew: [
    { id: "GOD1", code: "GOD1", missionId: "god1",
      name: "설문대할망",
      desc: "치마폭에 흙을 날라 제주 섬을 만들었다는 창조의 여신.",
      photo: "gods/final/GOD1.jpg",
      jeju: { word: "혼저옵서예", mean: "어서 오세요" },
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] },
    { id: "GOD2", code: "GOD2", missionId: "god2",
      name: "도채비",
      desc: "장난기 많지만 정이 많은 제주의 도채비.",
      photo: "gods/final/GOD2.jpg",
      jeju: { word: "놀멍쉬멍", mean: "놀면서 쉬면서" },
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] },
    { id: "GOD3", code: "GOD3", missionId: "god3",
      name: "소별왕",
      desc: "이승을 다스리게 되었다는 신화 속 형제 신.",
      photo: "gods/final/GOD3.jpg",
      jeju: { word: "폭삭 속았수다", mean: "고생 많으셨습니다" },
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] },
    { id: "GOD4", code: "GOD4", missionId: "god4",
      name: "영등할망",
      desc: "봄바람과 함께 찾아와 풍요를 주는 바람의 여신.",
      photo: "gods/final/GOD4.jpg",
      jeju: { word: "재기재기", mean: "빨리빨리" },
      /* 2026-09-13 기준 캐스팅 배정표엔 일요일(디우)만 채워져 있었으나,
         사장님 확인: 나머지 요일도 곧 전부 캐스팅 완료 예정 → 5일 전체 강림.
         실제로 공석이 남으면 이 배열만 해당 날짜로 좁히면 된다. */
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] },
    { id: "GOD5", code: "GOD5", missionId: "god5",
      name: "자청비",
      desc: "농경의 씨앗을 이 땅에 가져온 사랑과 지혜의 여신.",
      photo: "gods/final/GOD5.jpg",
      jeju: { word: "하영 먹읍서", mean: "많이 드세요" },
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] },
    { id: "GOD6", code: "GOD6", missionId: "god6",
      name: "가문장아기",
      desc: "가는 곳마다 복을 몰고 다닌다는 전상 이야기의 주인공.",
      photo: "gods/final/GOD6.jpg",
      jeju: { word: "고맙수다", mean: "고맙습니다" },
      activeDays: ["2026-10-17","2026-10-18","2026-10-19","2026-10-20","2026-10-21"] }
  ],

  /* ---------- 프로토타입 모드 ----------
     true 면 QR 없이 화면에서 바로 코드 입력·데모 버튼으로 테스트할 수 있다.
     실제 행사 때는 false 로 바꿀 것. */
  demoMode: false,

  /* ---------- 신의 실시간 위치 (2026-09-13 추가) ----------
     코스어(신 6명)가 game/tamna/staff/ 페이지에서 "근무 시작"을 누르면
     ±fuzzMeters 로 흐려진 위치가 tamna_gods_live 컬렉션에 올라간다.
     - 위치 이력은 절대 쌓지 않는다 — 문서 하나당 "최신 값"만 덮어쓴다.
     - 참가자 화면엔 정확한 좌표·지도 핀이 아니라 "남서쪽 · 약 120m" 식
       나침반 힌트로만 보여준다.
     - 근무 종료 / 관리자 페이지의 "전체 초기화"를 누르면 즉시 null로 덮어써서 지운다.
     - 관리자 PIN 은 공개 JS 에 두지 않는다(2026-09-30). admin.html 은 행사 서버
       PIN 로그인(EV.pinLogin)을 쓴다. */
  liveLocation: {
    enabled: true,
    collection: "tamna_gods_live",
    fuzzMeters: 25,          // 실제 위치를 이 반경 안에서 무작위로 흐려서 전송
    updateMs: 8000,          // 스태프 폰이 위치를 올리는 주기
    playerRefreshMs: 25000,  // 참가자 화면이 힌트를 갱신하는 주기
    staleMs: 90000           // 이보다 오래된 위치는 "자리 비움"으로 취급
  },

  /* store.js와 동일한 Firebase 프로젝트(psbjeju-kuji)를 재사용한다.
     컬렉션만 분리(tamna_gods_live)해서 쿠지·본편 데이터와 안 섞인다. */
  firebase: {
    apiKey: "AIzaSyBqmT2UBPpbSixiyju8CCpONoNnov959Ts",
    authDomain: "psbjeju-kuji.firebaseapp.com",
    projectId: "psbjeju-kuji",
    storageBucket: "psbjeju-kuji.firebasestorage.app",
    messagingSenderId: "627012765686",
    appId: "1:627012765686:web:41178983d00eb37fd029d7"
  }
};
