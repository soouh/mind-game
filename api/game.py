# =========================================
# 내 마음이 들리니 - 백엔드 (Vercel Serverless Function, Python)
# 주소: /api/game
# 역할: 화면에서 받은 대화 기록을 Google Gemini에게 보내고, 다음 질문을 돌려줘요.
# API 키는 코드에 쓰지 않고 Vercel 환경 변수 GEMINI_API_KEY 에서 꺼내 써요.
# (Gemini API 무료 등급 사용: 카드 등록 없이 하루 사용량 한도 안에서 무료)
# =========================================
from http.server import BaseHTTPRequestHandler
import json
import os
import time

import requests

# 사용할 모델. Vercel 환경 변수 GEMINI_MODEL 로 바꿀 수 있어요. (없으면 기본값 사용)
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_QUESTIONS = 20
CATEGORIES = {"동물", "음식", "물건", "아무거나"}
ANSWERS = {"예", "아니요", "모르겠어요"}

SYSTEM_PROMPT = """너는 스무고개 게임의 진행자야. 사용자가 마음속으로 단어 하나를 정했고, 너는 질문을 해서 그 단어를 맞혀야 해.

규칙:
- 한 번에 하나만 말해. 질문 하나, 또는 정답 추측 하나.
- 질문은 "예/아니요"로 답할 수 있게, 짧은 한국어 존댓말로 만들어.
- 초반에는 범위를 크게 나누는 질문을 하고, 점점 좁혀가.
- 이미 한 질문이나 이미 틀린 추측은 반복하지 마.
- 후보가 하나로 좁혀졌다고 확신하면 "혹시 ○○인가요?" 형태로 추측해.
- 남은 기회가 1번이면 반드시 추측해.

출력 형식: 아래 JSON 한 줄만 출력해. 설명, 마크다운, 코드블록은 절대 붙이지 마.
{"type": "question", "text": "살아있는 건가요?"}
{"type": "guess", "text": "혹시 고양이인가요?"}"""


def build_prompt(category, history):
    """대화 기록을 AI가 읽을 수 있는 글로 바꿔요."""
    if history:
        lines = [f"{i + 1}. {h['q']} → {h['a']}" for i, h in enumerate(history)]
        record = "\n".join(lines)
    else:
        record = "(아직 없음, 첫 질문을 해줘)"
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
    if data.get("type") not in ("question", "guess"):
        raise ValueError("type 오류")
    reply = str(data.get("text", "")).strip()
    if not reply:
        raise ValueError("text 비어 있음")
    return {"type": data["type"], "text": reply[:200]}


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


def call_gemini(api_key, payload):
    """Gemini API에 요청을 보내요."""
    return requests.post(
        GEMINI_URL.format(model=MODEL),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )


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

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return self._send(500, {"error": "서버에 API 키가 설정되지 않았어요. 관리자에게 알려주세요."})

        # 3) Gemini 호출
        # 스무고개 질문은 깊이 생각할 필요가 없어서 "생각하기"를 최소로 줄여 속도를 높여요.
        config = {
            "responseMimeType": "application/json",  # JSON으로만 답하게 하기
            "maxOutputTokens": 1024,
            "temperature": 0.7,
            "thinkingConfig": {"thinkingLevel": "minimal"},
        }
        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": build_prompt(category, history)}]}],
            "generationConfig": config,
        }
        started = time.time()
        try:
            res = call_gemini(api_key, payload)
            # 모델이 "minimal" 설정을 지원하지 않으면(400) 그 설정을 빼고 한 번 더 시도
            if res.status_code == 400 and "thinking" in res.text.lower():
                config.pop("thinkingConfig")
                res = call_gemini(api_key, payload)
        except requests.Timeout:
            print(f"Gemini timeout after {time.time() - started:.1f}s (model={MODEL})")
            return self._send(504, {"error": "AI 응답이 너무 늦어요. 다시 시도해 주세요."})
        except requests.RequestException as e:
            print("Network error:", repr(e))
            return self._send(502, {"error": "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."})

        print(f"Gemini responded {res.status_code} in {time.time() - started:.1f}s (model={MODEL})")

        if res.status_code == 429:
            return self._send(429, {"error": "무료 사용량을 잠시 다 썼어요. 1분쯤 뒤에 다시 시도해 주세요."})
        if res.status_code != 200:
            print("Gemini API error:", res.status_code, res.text[:500])  # Vercel 로그에서 확인 가능
            return self._send(502, {"error": "AI 서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요."})

        try:
            parts = res.json()["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
            result = parse_ai_reply(text)
        except (KeyError, IndexError, ValueError, json.JSONDecodeError):
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
