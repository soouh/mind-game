# 내 마음이 들리니 (AI 스무고개)

도트 그래픽 공방에서 너구리 장인(AI)이 손님의 주문을 받는 콘셉트의 스무고개 게임입니다. 손님이 마음속으로 필요한 것(동물·음식·물건)을 떠올리면, 장인이 "동물이야?", "어항이 필요해?" 같은 주문 질문을 던지며 20번 안에 그것을 맞혀 "만들어" 줍니다.

- 배포 URL: https://mind-game-pink.vercel.app

## 주요 기능
- 종류 선택(동물 / 음식 / 물건 / 아무거나) 후 주문 시작
- AI 장인의 질문에 [응] [아니] [모르겠어] 버튼으로 답변, 답변 내용은 주문서에 기록
- AI가 답을 생각하는 동안 도트 공방이 "뚝딱뚝딱" 움직이는 애니메이션
- AI가 정답을 추측하면 완성품이 도트 그림으로 "따란!" 등장 → [응, 마음에 들어!] / [아니, 이게 아니야]로 확인
- 완성품 그림: AI가 16 x 16 도트 그림을 직접 그려서 보내고(색 팔레트 + 픽셀 배열), 서버에서 크기·색 형식을 검사. 그림이 망가졌으면 AI가 고른 이모지를 도트로 변환해 대신 표시
- 실패 처리: 종류 미선택 안내, API 오류(4xx/5xx) 안내, 8초 이상 지연 시 안내 및 30초 타임아웃, 다시 시도 버튼, 서버 혼잡 시 자동 재시도

## 기술 스택
- 프론트엔드: HTML, CSS, JavaScript (프레임워크 없음), Canvas 도트 애니메이션, Galmuri 도트 폰트
- 백엔드: Vercel Serverless Functions (Python)
- AI: Groq API (무료 등급, openai/gpt-oss-120b 모델)
- 배포: GitHub + Vercel

## 폴더 구조
```
index.html        공방 입구(메인)
how.html          이용 방법 + 주문 예시 + 자주 묻는 질문
play.html         주문하기(게임) + 결과
css/style.css     전체 스타일 (도트 테마, 반응형 포함)
js/workshop.js    도트 공방 애니메이션 (canvas)
js/game.js        게임 진행, fetch('/api/game') 호출
api/game.py       Groq API를 호출하는 Python 함수
requirements.txt  Python 패키지 목록
images/           파비콘
```

## 동작 흐름
1. 사용자가 버튼을 누르면 `js/game.js`가 카테고리와 지금까지의 질문·답 기록을 `fetch('/api/game')`로 보냅니다.
2. `api/game.py`가 기록을 검사한 뒤 Groq API에 다음 질문을 요청합니다.
3. AI는 질문이면 `{"type": "question", "text": "..."}`, 정답 추측이면 `{"type": "guess", "item": "단호박 수프", "emoji": "🍲", "palette": {...}, "pixels": [16줄]}` 형식의 JSON으로 답하고, 화면에 표시됩니다.
4. AI는 이전 대화를 기억하지 못하므로, 매 요청마다 전체 기록을 함께 보냅니다.

## 환경 변수 설정
API 키는 코드에 절대 넣지 않고 Vercel 환경 변수로 관리합니다.

| 이름 | 값 |
|---|---|
| `GROQ_API_KEY` | Groq Console에서 발급받은 API 키 (필수) |
| `GROQ_MODEL` | 사용할 모델 이름 (선택, 기본값 `openai/gpt-oss-120b`) |

설정 방법: Vercel 프로젝트 → Settings → Environment Variables → 위 이름과 값을 추가 → 재배포(Redeploy)

무료 등급은 분당·하루 호출 횟수에 한도가 있어서, 한도를 넘으면 "무료 사용량을 잠시 다 썼어요" 안내가 표시됩니다. AI 서버가 일시적으로 바쁘면(500/503) 1초, 2초 간격으로 자동 재시도합니다.

## 개발 과정에서 해결한 문제
- 처음에는 Google Gemini API를 사용했으나, 사용하려던 모델이 서비스 종료되어 404 오류 → 최신 모델로 변경
- 이후 응답 지연(504)과 서버 혼잡(503)이 반복되어, 응답 속도가 빠른 Groq API로 교체
- Groq의 Llama 3.3 모델도 2026년 8월에 서비스 종료되어 502 오류 → Groq 공식 지원 종료 목록을 확인하고 권장 대체 모델(gpt-oss-120b)로 변경

키가 노출된 것 같으면 Groq Console에서 즉시 폐기하고 새로 발급한 뒤, Vercel 환경 변수를 새 키로 바꿔주세요.

## 배포 방법
1. 이 저장소를 GitHub에 올립니다.
2. Vercel → Add New → Project → 이 저장소를 Import 합니다.
3. 환경 변수 `GROQ_API_KEY`를 추가하고 Deploy 합니다.
4. 코드를 수정해서 GitHub에 올리면 Vercel이 자동으로 다시 배포합니다.

## 로컬 실행 (선택)
Node.js와 Vercel CLI가 필요합니다.
```
npm i -g vercel
vercel dev
```
프로젝트 폴더에 `.env` 파일을 만들고 `GROQ_API_KEY=키값`을 넣으면 됩니다. `.env`는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.
