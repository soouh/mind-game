// =========================================
// 내 마음이 들리니 - 게임 진행 코드
// 흐름: 버튼 클릭 → fetch('/api/game') 로 AI에게 요청 → 받은 질문을 화면에 표시
// =========================================

const MAX_QUESTIONS = 20;     // AI에게 주는 질문 기회
const SLOW_MS = 8000;         // 8초가 넘으면 "생각이 길어져요" 안내
const TIMEOUT_MS = 30000;     // 30초가 넘으면 요청을 포기하고 오류 안내

// 게임 상태: AI는 앞의 대화를 기억하지 못하므로, 매번 이 기록을 통째로 보내요.
let category = "";
let history = [];             // [{ q: "살아있나요?", a: "예" }, ...]
let currentText = "";         // 지금 화면에 떠 있는 AI의 질문/추측
let currentType = "";         // "question" 또는 "guess"
let busy = false;

// ---------- 화면 요소 ----------
const $ = (id) => document.getElementById(id);
const panels = { start: $("panel-start"), play: $("panel-play"), result: $("panel-result") };
const questionEl = $("question");
const playMessage = $("play-message");

// 구슬 20개 만들기
for (let i = 0; i < MAX_QUESTIONS; i++) {
  $("beads").appendChild(document.createElement("li"));
}

function showPanel(name) {
  Object.values(panels).forEach((p) => p.classList.remove("active"));
  panels[name].classList.add("active");
}

function updateCounter() {
  const used = history.length;
  $("counter-label").textContent = `남은 질문 ${MAX_QUESTIONS - used}번`;
  document.querySelectorAll("#beads li").forEach((li, i) => {
    li.classList.toggle("used", i < used);
  });
}

function setButtons(mode) {
  // mode: "question" | "guess" | "retry" | "none"
  $("answers-question").hidden = mode !== "question";
  $("answers-guess").hidden = mode !== "guess";
  $("retry-box").hidden = mode !== "retry";
}

// ---------- 1단계: 시작 ----------
$("start-btn").addEventListener("click", () => {
  const checked = document.querySelector('input[name="category"]:checked');

  // 실패 처리 1: 필수값(카테고리) 누락
  if (!checked) {
    $("start-message").textContent = "카테고리를 먼저 골라주세요.";
    return;
  }

  $("start-message").textContent = "";
  category = checked.value;
  history = [];
  updateCounter();
  showPanel("play");
  askAI();
});

// ---------- 2단계: AI에게 다음 질문 요청 ----------
async function askAI() {
  if (busy) return;
  busy = true;
  setButtons("none");
  playMessage.textContent = "";
  playMessage.className = "message";
  questionEl.textContent = "음... 생각 중이에요";
  questionEl.classList.add("thinking");

  // 실패 처리 3: 응답이 늦을 때 안내, 너무 늦으면 요청 중단
  const controller = new AbortController();
  const slowTimer = setTimeout(() => {
    playMessage.textContent = "생각이 길어지고 있어요. 조금만 기다려 주세요.";
    playMessage.className = "message slow";
  }, SLOW_MS);
  const timeoutTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, history }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    // 실패 처리 2: API 오류 (4xx / 5xx)
    if (!res.ok) {
      throw new Error(data.error || "AI가 응답하지 않아요. 다시 시도해 주세요.");
    }

    currentType = data.type;
    currentText = data.text;
    questionEl.classList.remove("thinking");
    questionEl.textContent = currentText;
    playMessage.textContent = "";
    setButtons(currentType === "guess" ? "guess" : "question");
  } catch (err) {
    questionEl.classList.remove("thinking");
    questionEl.textContent = "앗, 연결이 끊겼어요";
    playMessage.className = "message";
    playMessage.textContent =
      err.name === "AbortError"
        ? "AI가 30초 동안 응답하지 않았어요. 다시 시도해 주세요."
        : err.message;
    setButtons("retry");
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(timeoutTimer);
    busy = false;
  }
}

// 사용자가 예/아니요/모르겠어요를 눌렀을 때
document.querySelectorAll("#answers-question button").forEach((btn) => {
  btn.addEventListener("click", () => {
    history.push({ q: currentText, a: btn.dataset.answer });
    nextTurn();
  });
});

// AI의 추측이 맞았을 때
$("guess-yes").addEventListener("click", () => {
  history.push({ q: currentText, a: "예" });
  updateCounter();
  showResult(true);
});

// AI의 추측이 틀렸을 때
$("guess-no").addEventListener("click", () => {
  history.push({ q: currentText, a: "아니요" });
  nextTurn();
});

$("retry-btn").addEventListener("click", askAI);

function nextTurn() {
  updateCounter();
  if (history.length >= MAX_QUESTIONS) {
    showResult(false);
  } else {
    askAI();
  }
}

// ---------- 3단계: 결과 ----------
function showResult(aiWon) {
  const count = history.length;
  if (aiWon) {
    $("result-title").textContent = `${count}번 만에 맞혔어요!`;
    $("result-text").textContent = "마음의 소리가 너무 크게 들렸나 봐요.";
    $("reveal-form").hidden = true;
  } else {
    $("result-title").textContent = "제가 졌어요";
    $("result-text").textContent = "20번을 다 썼는데도 못 맞혔어요. 정답이 뭐였는지 알려줄래요?";
    $("reveal-form").hidden = false;
  }
  renderHistory();
  showPanel("result");
}

$("reveal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const answer = $("reveal-input").value.trim();

  // 빈 입력 안내
  if (!answer) {
    $("result-text").textContent = "정답을 한 글자 이상 적어주세요.";
    return;
  }
  $("result-text").textContent = `정답은 "${answer}"였군요. 다음엔 꼭 맞혀볼게요!`;
  $("reveal-form").hidden = true;
});

function renderHistory() {
  const list = $("history");
  list.innerHTML = "";
  history.forEach((item, i) => {
    const li = document.createElement("li");
    const q = document.createElement("span");
    const a = document.createElement("b");
    q.textContent = `${i + 1}. ${item.q}`;   // textContent 사용: AI 답에 이상한 코드가 섞여도 안전
    a.textContent = item.a;
    li.append(q, a);
    list.appendChild(li);
  });
}

$("again-btn").addEventListener("click", () => {
  history = [];
  $("reveal-input").value = "";
  document.querySelectorAll('input[name="category"]').forEach((r) => (r.checked = false));
  showPanel("start");
});
