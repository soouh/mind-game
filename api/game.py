# =========================================
# 내 마음이 들리니 - 백엔드 (Vercel Serverless Function, Python)
# 주소: /api/game
# 역할: 화면에서 받은 대화 기록을 Groq AI에게 보내고, 다음 질문을 돌려줘요.
# API 키는 코드에 쓰지 않고 Vercel 환경 변수 GROQ_API_KEY 에서 꺼내 써요.
# (Groq 무료 등급 사용: 카드 등록 없이 사용량 한도 안에서 무료, 응답이 매우 빠름)
# =========================================
from http.server import BaseHTTPRequestHandler
import json
import os
import time

import requests

# 사용할 모델. Vercel 환경 변수 GROQ_MODEL 로 바꿀 수 있어요. (없으면 기본값 사용)
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_QUESTIONS = 20
CATEGORIES = {"동물", "음식", "물건", "아무거나"}
ANSWERS = {"응", "아니", "모르겠어"}

SYSTEM_PROMPT = """너는 "마음 공방"의 장인이야. 손님이 마음속으로 필요한 것(동물, 음식, 물건 등) 하나를 떠올렸어.
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
완성품을 내놓을 때: {"type": "guess", "item": "고양이", "emoji": "🐱"}
- item은 짧은 한국어 이름, emoji는 그 물건을 가장 잘 나타내는 이모지 1개."""


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
        return {"type": "guess", "item": item[:20], "emoji": emoji}

    raise ValueError("type 오류")


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
            "max_completion_tokens": 1000,
            "reasoning_effort": "low",  # 생각은 짧게 → 빠른 응답
            "response_format": {"type": "json_object"},  # JSON으로만 답하게 하기
        }
        started = time.time()
        try:
            res = call_ai(api_key, payload)
            # 다른 모델로 바꿨는데 "생각 짧게" 설정을 지원하지 않으면(400), 그 설정을 빼고 다시 시도
            if res.status_code == 400 and "reasoning" in res.text.lower():
                payload.pop("reasoning_effort")
                res = call_ai(api_key, payload)
        except requests.Timeout:
            print(f"AI timeout after {time.time() - started:.1f}s (model={MODEL})")
            return self._send(504, {"error": "AI 응답이 너무 늦어요. 다시 시도해 주세요."})
        except requests.RequestException as e:
            print("Network error:", repr(e))
            return self._send(502, {"error": "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."})

        print(f"AI responded {res.status_code} in {time.time() - started:.1f}s (model={MODEL})")

        if res.status_code == 429:
            return self._send(429, {"error": "무료 사용량을 잠시 다 썼어요. 1분쯤 뒤에 다시 시도해 주세요."})
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

        return self._send(200, result)

    def _send(self, status, data):
        """결과를 JSON으로 돌려줘요."""
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
