# 발표 시현용 실제 앱 캡처

발표 사이트(`site/index.html`)의 시현 슬라이드는 `site/media/app/`에 아래 이름의 PNG가 있으면 **실제 앱 화면**을, 없으면 목업(`design/haru-mockup.html`)을 보여 준다. 일부만 넣어도 된다. 없는 단계는 목업이 그대로 나온다.

## 찍는 법

- 시뮬레이터: **iPhone 14 또는 15** (화면 비율 390×844 기준. 다른 기종이면 위쪽 기준으로 잘림)
- 앱: `app/mobile`, 샘플 데이터 상태
- 캡처: 시뮬레이터에서 `⌘S`, 또는 터미널에서 `xcrun simctl io booted screenshot <파일이름>.png`

## 파일 목록

| 파일 | 시현 단계 | 화면 |
|---|---|---|
| `01-today.png` | 1 오늘 · 하루 | 오늘 탭 첫 화면 (24시간 도넛) |
| `02-today-slice.png` | 2 조각 누르기 | 도넛 조각 하나를 누른 상태 (예: 커피) |
| `03-today-tags.png` | 3 태그별 시간 | 오늘 탭을 아래로 내려 태그별 시간 · 태그 없는 장소가 보이는 상태 |
| `04-today-year.png` | 4 1년 | 가장 긴 기간(1년 또는 한 달) 탭 |
| `05-timeline.png` | 5 타임라인 | 타임라인 탭 (장소마다 사진 · 영상) |
| `06-timeline-media.png` | 6 영상 | 사진 또는 영상을 크게 본 상태 |
| `07-timeline-trip.png` | 7 여행 | 여행 묶음 또는 지도 재생 화면 |
| `08-ask.png` | 8 물어보기 | 질문과 답이 나온 물어보기 화면 |
| `09-ask-cards.png` | 9 근거 카드 | 근거 카드가 보이는 상태 |

넣은 뒤에는 `site/media/app/`의 PNG를 배포 저장소 `haru-demo`의 `media/app/`에도 복사해 push하면 배포 사이트에 반영된다.
