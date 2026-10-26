# =========================================
# 내 마음이 들리니 - 백엔드 (Vercel Serverless Function, Python)
# 주소: /api/game
# 역할: 질문은 Groq AI가 빠르게 만들고, 완성품 도트 그림은 Google Gemini가 그려요.
# API 키는 코드에 쓰지 않고 Vercel 환경 변수 GROQ_API_KEY, GEMINI_API_KEY 에서 꺼내 써요.
# (둘 다 무료 등급: 카드 등록 없이 사용량 한도 안에서 무료)
# Gemini 키가 없거나 그림 그리기에 실패하면, 화면에서 이모지 그림으로 대신 보여줘요.
# =========================================
from http.server import BaseHTTPRequestHandler
import json
import os
import re
import time

import requests

# 사용할 모델. Vercel 환경 변수 GROQ_MODEL 로 바꿀 수 있어요. (없으면 기본값 사용)
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
# 무료 사용량은 모델마다 따로 있어서, 기본 모델이 한도(429)에 걸리면 이 모델로 바꿔서 한 번 더 시도해요.
BACKUP_MODEL = os.environ.get("GROQ_BACKUP_MODEL", "openai/gpt-oss-20b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# 도트 그림을 그릴 Gemini 모델. 그림 실력이 더 좋은 Flash를 먼저 쓰고,
# 실패하면(사용량 초과 등) 가벼운 Flash-Lite로 한 번 더 시도해요.
ART_MODEL = os.environ.get("GEMINI_ART_MODEL", "gemini-3.5-flash")
ART_BACKUP_MODEL = os.environ.get("GEMINI_ART_BACKUP_MODEL", "gemini-3.1-flash-lite")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_QUESTIONS = 20
CATEGORIES = {"동물", "음식", "물건", "아무거나"}
ANSWERS = {"응", "아니", "모르겠어"}

SYSTEM_PROMPT = """너는 "마음 공방"의 너구리 장인이야. 손님이 마음속으로 필요한 것(동물, 음식, 물건 등) 하나를 떠올렸어.
너는 주문을 받는 것처럼 질문해서, 손님이 떠올린 것을 맞혀 "만들어 줘야" 해. (사실상 스무고개야)

말투와 규칙:
- 친근한 반말로, 짧게 한 문장만 말해. 예: "동물이야?", "집에서 같이 살고 싶어?", "어항이 필요해?", "털이 있어?"
- 손님은 "응", "아니", "모르겠어" 중 하나로만 답할 수 있어. 그렇게 답할 수 있는 질문만 해.
- 처음엔 범위를 크게 나누고, 점점 좁혀가.
- 이미 한 질문은 다시 하지 마.
- 기록에 "완성품: OO → 아니"가 있으면 그건 틀린 거야. 같은 걸 다시 만들지 마.
- 후보가 하나로 좁혀졌다고 확신하면 완성품을 내놔.
- 남은 기회가 1번이면 반드시 완성품을 내놔.

출력 형식: 아래 둘 중 하나의 JSON만 출력해. 설명이나 마크다운은 절대 붙이지 마.
질문할 때: {"type": "question", "text": "털이 있어?"}
완성품을 내놓을 때: {"type": "guess", "item": "단호박 수프", "emoji": "🍲", "exact": false}
- item은 최대한 구체적인 짧은 한국어 이름 (예: "수프"보다 "단호박 수프").
- emoji는 그 물건과 가장 비슷한 이모지 1개.
- exact는 그 이모지가 바로 그 물건 자체를 그린 이모지면 true, 비슷한 것일 뿐이면 false.
  예: 감자튀김 🍟 true, 고양이 🐱 true, 단호박 수프 🍲 false, 붕어빵 🐟 false."""


def build_prompt(category, history):
    """대화 기록을 AI가 읽을 수 있는 글로 바꿔요."""
    if history:
        lines = [f"{i + 1}. {h['q']} → {h['a']}" for i, h in enumerate(history)]
        record = "\n".join(lines)
    else:
        record = "(아직 없음, 첫 주문 질문을 해줘)"
    remaining = MAX_QUESTIONS - len(history)
    return (
        f"카테고리: {category}\n"
        f"지금까지의 질문과 답:\n{record}\n\n"
        f"남은 기회: {remaining}번\n"
        "다음 차례를 JSON으로만 출력해."
    )


def parse_ai_reply(text):
    """AI 답에서 JSON 부분만 꺼내고, 형식이 맞는지 확인해요."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("JSON 없음")
    data = json.loads(text[start:end + 1])

    if data.get("type") == "question":
        question = str(data.get("text", "")).strip()
        if not question:
            raise ValueError("질문이 비어 있음")
        return {"type": "question", "text": question[:120]}

    if data.get("type") == "guess":
        item = str(data.get("item", "")).strip()
        if not item:
            raise ValueError("완성품 이름이 비어 있음")
        emoji = str(data.get("emoji", "")).strip()[:8] or "🎁"
        exact = data.get("exact") is True
        return {"type": "guess", "item": item[:20], "emoji": emoji, "exact": exact}

    raise ValueError("type 오류")


HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
ART_SIZE = 16


def clean_pixel_art(palette, pixels):
    """AI가 그린 도트 그림을 검사하고, 크기가 조금 틀렸으면 16 x 16으로 맞춰요. 많이 망가졌으면 None."""
    if not isinstance(palette, dict) or not isinstance(pixels, list) or len(pixels) < 8:
        return None

    colors = {}
    for key, value in list(palette.items())[:10]:
        if isinstance(key, str) and len(key) == 1 and key != "." and isinstance(value, str) and HEX_COLOR.match(value):
            colors[key] = value
    if len(colors) < 2:
        return None

    rows = []
    for row in pixels[:ART_SIZE]:
        row = str(row)
        row = "".join(ch if ch in colors else "." for ch in row)   # 모르는 글자는 빈칸으로
        rows.append(row[:ART_SIZE].ljust(ART_SIZE, "."))
    while len(rows) < ART_SIZE:
        rows.append("." * ART_SIZE)

    filled = sum(ch != "." for row in rows for ch in row)
    if filled < 30:   # 칠한 칸이 너무 적으면 그림이라고 보기 어려워요
        return None

    # "네모 하나를 한 색으로 칠한 그림" 걸러내기:
    # 칠한 모양이 거의 꽉 찬 직사각형이고(85% 이상), 테두리를 뺀 안쪽의 85% 이상이 한 색이면 거절
    def brightness(hex_color):
        r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
        return 0.3 * r + 0.59 * g + 0.11 * b
    cells = [(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch != "."]
    xs, ys = [c[0] for c in cells], [c[1] for c in cells]
    box_area = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
    outline = min(colors, key=lambda k: brightness(colors[k]))
    counts = {}
    for row in rows:
        for ch in row:
            if ch != "." and ch != outline:
                counts[ch] = counts.get(ch, 0) + 1
    inner = sum(counts.values())
    if not inner:
        return None
    if filled / box_area > 0.85 and max(counts.values()) / inner > 0.85:
        return None
    return {"palette": colors, "pixels": rows}


ART_PROMPT = """너는 귀여운 도트 그림을 그리는 화가야. 요청받은 것을 16 x 16 도트 그림으로 그려.

규칙:
- pixels: 정확히 16줄, 각 줄은 정확히 16글자.
- "."은 투명(빈칸), 나머지 글자는 palette에 있는 색이야.
- palette: 소문자 한 글자 → "#RRGGBB" 색. 3~8가지 색. 진한 갈색 테두리 색을 꼭 넣어.
- 가운데에 꽉 차게 그리고, 테두리를 두르고 안은 색으로 채워.
- 그것만의 특징(색, 모양, 내용물)이 한눈에 보이게. 예: 단호박 수프면 그릇 안에 주황색 수프가 보여야 해.
- 네모 하나를 한 색으로 채우지 마. 실제 실루엣(윤곽 모양)으로 그려.
  예: 감자튀김이면 빨간 종이 상자 위로 노란 막대 여러 개가 삐죽삐죽 솟아 있게.
- 한 가지 색이 그림의 대부분을 차지하지 않게, 밝은 부분과 어두운 부분을 넣어 입체감을 줘.
- 따뜻하고 귀여운 색감으로.

JSON만 출력해. 설명이나 마크다운은 절대 붙이지 마.
사과 예시 (형식 참고용, 그대로 따라 그리지 마):
{"palette": {"o": "#5a3a2a", "r": "#e5534b", "l": "#f28b82", "g": "#6fae5a", "b": "#8a5a3b"},
 "pixels": [
 "................",
 "........bg......",
 ".......bggg.....",
 "....ooobooo.....",
 "...orrrrrrrro...",
 "..orlrrrrrrrro..",
 "..orlrrrrrrrro..",
 ".orrrrrrrrrrrro.",
 ".orrrrrrrrrrrro.",
 ".orrrrrrrrrrrro.",
 ".orrrrrrrrrrrro.",
 "..orrrrrrrrrro..",
 "..orrrrrrrrrro..",
 "...orrrooorro...",
 "....ooo...oo....",
 "................"]}"""


def ask_gemini_art(api_key, model, item, thinking, timeout):
    """Gemini 모델 하나에게 그림을 부탁해요. 성공하면 그림, 실패하면 None."""
    config = {
        "responseMimeType": "application/json",
        "maxOutputTokens": 4096,
        "temperature": 0.6,
        "thinkingConfig": {"thinkingLevel": thinking},
    }
    payload = {
        "system_instruction": {"parts": [{"text": ART_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": f"그릴 것: {item}"}]}],
        "generationConfig": config,
    }
    url = GEMINI_URL.format(model=model)
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    started = time.time()
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=timeout)
        # 모델이 생각 단계 설정을 지원하지 않으면(400) 그 설정을 빼고 한 번 더
        if res.status_code == 400 and "thinking" in res.text.lower():
            config.pop("thinkingConfig")
            res = requests.post(url, headers=headers, json=payload, timeout=timeout)
    except requests.RequestException as e:
        print(f"Art failed after {time.time() - started:.1f}s (model={model}):", repr(e))
        return None

    print(f"Art responded {res.status_code} in {time.time() - started:.1f}s (model={model})")
    if res.status_code != 200:
        print("Art API error:", res.status_code, res.text[:300])
        return None
    try:
        parts = res.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start:end + 1])
        art = clean_pixel_art(data.get("palette"), data.get("pixels"))
    except (KeyError, IndexError, ValueError, TypeError, json.JSONDecodeError):
        print("Art unexpected reply:", res.text[:300])
        return None
    if not art:
        print(f"Art rejected (model={model}): 형식이 틀렸거나 한 가지 색으로만 칠한 그림")
    return art


def draw_pixel_art(item):
    """완성품 도트 그림을 받아와요. 둘 다 실패하면 None (화면에서 이모지로 대신)."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Art skipped: GEMINI_API_KEY 없음")
        return None
    art = ask_gemini_art(api_key, ART_MODEL, item, "low", 13)
    if not art and ART_BACKUP_MODEL and ART_BACKUP_MODEL != ART_MODEL:
        art = ask_gemini_art(api_key, ART_BACKUP_MODEL, item, "minimal", 9)
    return art


def clean_history(raw):
    """화면에서 온 기록이 올바른지 검사해요. (이상한 값이 들어오는 걸 막기)"""
    if not isinstance(raw, list) or len(raw) >= MAX_QUESTIONS:
        return None
    cleaned = []
    for item in raw:
        if not isinstance(item, dict):
            return None
        q = str(item.get("q", "")).strip()[:200]
        a = item.get("a")
        if not q or a not in ANSWERS:
            return None
        cleaned.append({"q": q, "a": a})
    return cleaned


RETRY_STATUS = {500, 502, 503}   # AI 서버가 바쁘거나 일시적인 오류일 때
RETRY_WAITS = [1, 2]             # 실패하면 1초, 2초 쉬었다가 다시 시도 (최대 2번 더)


def call_ai(api_key, payload):
    """Groq API에 요청을 보내요. 서버가 바쁘다고 하면 잠깐 쉬었다가 다시 시도해요."""
    for attempt in range(len(RETRY_WAITS) + 1):
        res = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if res.status_code not in RETRY_STATUS or attempt == len(RETRY_WAITS):
            return res
        print(f"AI {res.status_code}, retrying in {RETRY_WAITS[attempt]}s (attempt {attempt + 1})")
        time.sleep(RETRY_WAITS[attempt])


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 1) 요청 읽기
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "요청 형식이 올바르지 않아요."})

        category = body.get("category")
        history = clean_history(body.get("history", []))

        # 2) 입력값 검사 (4xx)
        if category not in CATEGORIES:
            return self._send(400, {"error": "카테고리를 먼저 골라주세요."})
        if history is None:
            return self._send(400, {"error": "게임 기록이 올바르지 않아요. 새로 시작해 주세요."})

        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return self._send(500, {"error": "서버에 API 키가 설정되지 않았어요. 관리자에게 알려주세요."})

        # 3) AI 호출
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(category, history)},
            ],
            "temperature": 0.7,
            # 이 모델은 답하기 전에 속으로 생각하는데, 그 분량까지 포함한 최대 길이예요.
            "max_completion_tokens": 500,
            "reasoning_effort": "low",  # 생각은 짧게 → 빠른 응답
            "response_format": {"type": "json_object"},  # JSON으로만 답하게 하기
        }
        started = time.time()
        try:
            res = call_ai(api_key, payload)
            if res.status_code == 429 and BACKUP_MODEL and BACKUP_MODEL != MODEL:
                print(f"AI 429 on {MODEL}, trying {BACKUP_MODEL}")
                payload["model"] = BACKUP_MODEL
                res = call_ai(api_key, payload)
            # 다른 모델로 바꿨는데 "생각 짧게" 설정을 지원하지 않으면(400), 그 설정을 빼고 다시 시도
            if res.status_code == 400 and "reasoning" in res.text.lower():
                payload.pop("reasoning_effort")
                res = call_ai(api_key, payload)
        except requests.Timeout:
            print(f"AI timeout after {time.time() - started:.1f}s (model={payload['model']})")
            return self._send(504, {"error": "AI 응답이 너무 늦어요. 다시 시도해 주세요."})
        except requests.RequestException as e:
            print("Network error:", repr(e))
            return self._send(502, {"error": "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."})

        print(f"AI responded {res.status_code} in {time.time() - started:.1f}s (model={payload['model']})")

        if res.status_code == 429:
            wait = res.headers.get("retry-after", "")
            when = f"{int(float(wait)) + 1}초" if wait.replace(".", "", 1).isdigit() and float(wait) < 120 else "1분쯤"
            print("AI 429 detail:", res.text[:300])
            return self._send(429, {"error": f"장인이 잠깐 쉬는 중이에요(무료 사용량 초과). {when} 뒤에 다시 시도해 주세요."})
        if res.status_code == 503:
            return self._send(503, {"error": "지금 AI가 너무 붐벼요. 잠시 후 다시 시도하기를 눌러주세요."})
        if res.status_code != 200:
            print("AI API error:", res.status_code, res.text[:500])  # Vercel 로그에서 확인 가능
            return self._send(502, {"error": "AI 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요."})

        try:
            text = res.json()["choices"][0]["message"]["content"]
            result = parse_ai_reply(text)
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
            print("Unexpected reply:", res.text[:500])
            return self._send(502, {"error": "AI가 엉뚱한 대답을 했어요. 다시 시도해 주세요."})

        # 4) 완성품 그림
        #    딱 맞는 이모지가 있으면(예: 감자튀김 🍟) 이모지를 도트로 바꿔 쓰는 게 더 예뻐서 그대로 쓰고,
        #    딱 맞는 이모지가 없을 때만 Gemini에게 도트 그림을 부탁해요. (실패해도 게임은 계속돼요)
        if result["type"] == "guess":
            if result.pop("exact"):
                print(f"Art skipped: '{result['item']}'에 딱 맞는 이모지 {result['emoji']} 사용")
            else:
                art = draw_pixel_art(result["item"])
                if art:
                    result.update(art)

        return self._send(200, result)

    def _send(self, status, data):
        """결과를 JSON으로 돌려줘요."""
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
