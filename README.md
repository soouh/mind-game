# 내 마음이 들리니 (AI 스무고개)

사용자가 마음속으로 단어 하나를 정하면, AI가 예/아니요 질문을 던지면서 20번 안에 그 단어를 맞히는 웹 게임입니다.

- 배포 URL: (배포 후 여기에 Vercel 주소를 적어주세요)

## 주요 기능
- 카테고리 선택(동물 / 음식 / 물건 / 아무거나) 후 게임 시작
- AI가 질문 → 사용자가 [예] [아니요] [모르겠어요] 버튼으로 답변
- AI가 정답을 추측하면 [맞아요] [아니에요]로 확인
- 남은 질문 수를 구슬 20개로 표시, 결과 화면에서 전체 질문 기록 확인
- 실패 처리: 카테고리 미선택 안내, API 오류(4xx/5xx) 안내, 8초 이상 지연 시 안내 및 30초 타임아웃, 다시 시도 버튼

## 기술 스택
- 프론트엔드: HTML, CSS, JavaScript (프레임워크 없음)
- 백엔드: Vercel Serverless Functions (Python)
- AI: Google Gemini API (무료 등급)
- 배포: GitHub + Vercel

## 폴더 구조
```
index.html        메인 페이지
how.html          게임 방법 + 자주 묻는 질문
play.html         게임하기 + 결과
css/style.css     전체 스타일 (반응형 포함)
js/game.js        게임 진행, fetch('/api/game') 호출
api/game.py       Gemini API를 호출하는 Python 함수
requirements.txt  Python 패키지 목록
images/           파비콘
```

## 동작 흐름
1. 사용자가 버튼을 누르면 `js/game.js`가 카테고리와 지금까지의 질문·답 기록을 `fetch('/api/game')`로 보냅니다.
2. `api/game.py`가 기록을 검사한 뒤 Gemini API에 다음 질문을 요청합니다.
3. Gemini는 `{"type": "question" 또는 "guess", "text": "..."}` 형식의 JSON으로 답하고, 화면에 표시됩니다.
4. AI는 이전 대화를 기억하지 못하므로, 매 요청마다 전체 기록을 함께 보냅니다.

## 환경 변수 설정
API 키는 코드에 절대 넣지 않고 Vercel 환경 변수로 관리합니다.

| 이름 | 값 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio에서 발급받은 API 키 (필수) |
| `GEMINI_MODEL` | 사용할 모델 이름 (선택, 기본값 `gemini-3.1-flash-lite`) |

설정 방법: Vercel 프로젝트 → Settings → Environment Variables → 위 이름과 값을 추가 → 재배포(Redeploy)

무료 등급은 분당·하루 호출 횟수에 한도가 있어서, 한도를 넘으면 "무료 사용량을 잠시 다 썼어요" 안내가 표시됩니다. 또한 무료 등급에서는 입력 내용이 Google의 모델 개선에 쓰일 수 있으므로 개인정보를 입력하지 않도록 안내합니다.

키가 노출된 것 같으면 Google AI Studio에서 즉시 폐기하고 새로 발급한 뒤, Vercel 환경 변수를 새 키로 바꿔주세요.

## 배포 방법
1. 이 저장소를 GitHub에 올립니다.
2. Vercel → Add New → Project → 이 저장소를 Import 합니다.
3. 환경 변수 `GEMINI_API_KEY`를 추가하고 Deploy 합니다.
4. 코드를 수정해서 GitHub에 올리면 Vercel이 자동으로 다시 배포합니다.

## 로컬 실행 (선택)
Node.js와 Vercel CLI가 필요합니다.
```
npm i -g vercel
vercel dev
```
프로젝트 폴더에 `.env` 파일을 만들고 `GEMINI_API_KEY=키값`을 넣으면 됩니다. `.env`는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.
