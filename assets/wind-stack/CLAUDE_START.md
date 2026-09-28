# Claude에게 — 영등할망의 바람탑 구현

이 패키지의 개별 이미지와 데이터로 새 미니게임을 구현해주세요. 사용자가 정한 게임은 **12종 후보에서 물건 10개 선택 → 좌우 자동 왕복 크레인에서 클릭/탭으로 낙하 → 물건 쌓기 → 영등할망이 미소와 바람으로 방해/도움**입니다. 12종 후보/상세 수치는 초기 제안입니다. 기존 공 튕기기 게임은 재활용하지 마세요.

먼저 README와 docs/01~04, data/*.json을 읽고 기존 앱의 게임 진입/종료/보상 훅을 확인하세요. 다른 게임과 행사 앱 기능은 유지하세요.

## 제공된 것
- 개별 투명 PNG 물건 12개와 영등할망 표정 2개, 배경 PNG 1개.
- 크레인·바람·착지·아이콘 SVG.
- 선택/순서 변경/바람 연출을 볼 수 있는 디자인 시안.
- 물건 규격과 충돌 윤곽 초안, 상태 관리 시작 코드.

## 아직 없는 것
완성된 물리 게임, 실제 모바일 플레이 검증, 실제 효과음 파일, 공용 순위 서버. preview의 가짜 낙하 위치 보정과 예시 점수는 제품 코드에 가져가지 마세요.

## 작업 순서
1. 회전과 접촉 마찰을 지원하는 2D 강체 엔진을 선택하고 공식 API를 확인해 프로젝트에 설치/고정.
2. 상자·판자·귤 세 개로 실제 크레인 드롭과 물리 쌓기 구현. 그림에 충돌 윤곽을 겹쳐 판정 먼저 확인.
3. 모든 물건과 10개 선택/재정렬 연결. data 값을 코드 곳곳에 복사하지 말고 로드해서 사용.
4. 예고 → 표정 전환 → 실제 바람 힘 → 효과 퇴장의 시간선을 연결. 도움도 물리적 감쇠로 처리.
5. 실패·최종 안정·결과·점수·다시하기 구현. 결과를 부모 reward가 즉시 닫지 않게 분리.
6. 실제 기기에서 물리 오차와 프레임 속도를 확인. 그런 뒤 강도/속도 조정.

## 절대 금지
- 공/바 반사, 자동 생명 회복, 보이지 않는 보호막.
- 착지했다고 물건을 static으로 바꿔 탑이 절대 안 무너지게 만드는 처리.
- PNG의 투명 바깥 사각형을 충돌체로 쓰는 처리.
- 물건이 아래로 떨어졌는데 근처 물건으로 순간이동시키거나 위로 튕겨 구조하는 처리.
- 갑작스러운 보스전, 기존 게임의 스킬/진화 테크 재도입.
- 10번째를 놓자마자 성공 처리. 실제 안정화 또는 실패를 기다릴 것.
- 사용자에게 ‘완성 게임’이라며 디자인 시안을 납품하거나, 자동 테스트만으로 재미 검증 완료라고 쓰는 것.

## 코드 구조 제안 — 다음 모듈은 구현할 파일명
src/game/create-game.mjs: lifecycle, start, pause, destroy
src/game/physics-world.mjs: 엔진, 강체, 접촉, 안정화, 실패
src/game/crane-controller.mjs: 왕복, 잡기, 1회 놓기
src/game/wind-director.mjs: 예고/힘/캐릭터/FX 공통 타임라인
src/game/camera.mjs: 탑 높이 추적, HUD와 분리
src/game/scoring.mjs: 안정 연결 높이, 중복 없는 점수
src/render/world-renderer.mjs: sourceRect와 무게중심 보정
src/render/effects.mjs: 바람, 착지, 먼지, 붕괴
src/ui/selection.mjs, hud.mjs, result.mjs
src/audio/audio-manager.mjs
src/integration/host-bridge.mjs: 기존 탐라 앱과 완료/보상 연결

위 목록은 생성 예정 구조다. 빈 파일만 만들고 구현됐다고 하지 말 것. 현재 src에는 상태/이미지 도우미만 들어 있다.

## 부모 앱 연동
createGame({container, seed, onResultReady, onExit}) 형태를 권장. 결과 준비와 화면 닫기를 분리. onResultReady에서는 데이터 저장만 하고, onExit에서 부모 화면 전환. game.destroy()는 RAF, 이벤트, 오디오, 물리 월드, 타이머 전부 정리. attemptId를 결과에 넣고 같은 판 보상이 두 번 적립되지 않게 한다.
완료 데이터: gameId, ruleVersion, attemptId, seed, selectedIds(순서 포함), placedCount, stableHeight, score, outcome(clear/fall/unstable), durationMs.

## 완료 보고
구현한 것, 미구현, 실제 기기 검증 여부를 나눠 보고. 충돌 윤곽 디버그 화면과 10개 완주/중간 붕괴/바람 개입 영상을 확인할 수 있게 준비. 게임의 재미는 사용자 플레이 피드백으로 판단한다.
