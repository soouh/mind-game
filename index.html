// =========================================
// 내 마음이 들리니 - 마음 공방 게임 진행 코드
// 흐름: 버튼 클릭 → fetch('/api/game') 로 AI 장인에게 요청 → 받은 질문/완성품을 화면에 표시
// =========================================

const MAX_QUESTIONS = 20;     // 장인에게 주는 질문 기회
const SLOW_MS = 8000;         // 8초가 넘으면 "조금만 기다려" 안내
const TIMEOUT_MS = 45000;     // 45초가 넘으면 요청을 포기하고 오류 안내

// 게임 상태: AI는 앞의 대화를 기억하지 못하므로, 매번 이 기록을 통째로 보내요.
let category = "";
let history = [];             // [{ q: "동물이야?", a: "응" }, ...]
let current = null;           // 지금 장인이 한 말 { type, text, item, emoji }
let busy = false;

// ---------- 화면 요소 ----------
const $ = (id) => document.getElementById(id);
const lineEl = $("line");
const messageEl = $("message");

Workshop.init($("workshop"));

for (let i = 0; i < MAX_QUESTIONS; i++) {
  $("beads").appendChild(document.createElement("li"));
}

// 장인 대사를 한 글자씩 출력 (RPG 느낌)
let typingTimer = null;
function say(text) {
  clearInterval(typingTimer);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { lineEl.textContent = text; return; }
  let i = 0;
  lineEl.textContent = "";
  typingTimer = setInterval(() => {
    i++;
    lineEl.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typingTimer);
  }, 28);
}

function setButtons(mode) {
  // mode: "question" | "guess" | "retry" | "none"
  $("answers-question").hidden = mode !== "question";
  $("answers-guess").hidden = mode !== "guess";
  $("retry-box").hidden = mode !== "retry";
}

function showMessage(text, slow = false) {
  messageEl.textContent = text;
  messageEl.className = slow ? "message slow" : "message";
}

function updateCounter() {
  const used = history.length;
  $("counter-label").textContent = `남은 질문 ${MAX_QUESTIONS - used}번`;
  document.querySelectorAll("#beads li").forEach((li, i) => li.classList.toggle("used", i < used));
}

// 주문서에 기록 추가
function renderOrder() {
  const list = $("order-list");
  list.innerHTML = "";
  $("order-empty").hidden = history.length > 0;
  history.forEach((item, i) => {
    const li = document.createElement("li");
    const q = document.createElement("span");
    const a = document.createElement("b");
    q.textContent = `${i + 1}. ${item.q}`;   // textContent: AI 답에 이상한 코드가 섞여도 안전
    a.textContent = item.a;
    li.append(q, a);
    list.appendChild(li);
  });
}

// ---------- 1단계: 주문 시작 ----------
$("start-btn").addEventListener("click", () => {
  const checked = document.querySelector('input[name="category"]:checked');

  // 실패 처리 1: 필수값(종류) 누락
  if (!checked) {
    showMessage("떠올린 것의 종류를 먼저 골라 줘!");
    return;
  }

  showMessage("");
  category = checked.value;
  history = [];
  updateCounter();
  renderOrder();
  $("panel-start").hidden = true;
  $("counter").hidden = false;
  askAI();
});

// ---------- 2단계: 장인에게 다음 질문 요청 ----------
async function askAI() {
  if (busy) return;
  busy = true;
  setButtons("none");
  showMessage("");
  Workshop.setState("working");
  $("dialog").classList.add("thinking");
  say("뚝딱뚝딱... 잠깐만!");

  // 실패 처리 3: 응답이 늦을 때 안내, 너무 늦으면 요청 중단
  const controller = new AbortController();
  const slowTimer = setTimeout(() => showMessage("재료를 찾는 중이야. 조금만 기다려 줘!", true), SLOW_MS);
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
    if (!res.ok) throw new Error(data.error || "장인이 대답하지 않아요. 다시 시도해 주세요.");

    current = data;
    $("dialog").classList.remove("thinking");
    showMessage("");

    if (data.type === "guess") {
      Workshop.setState("reveal", data);
      say(`따란! ${data.item} 완성! 어때, 마음에 들어?`);
      setButtons("guess");
    } else {
      Workshop.setState("idle");
      say(data.text);
      setButtons("question");
    }
  } catch (err) {
    Workshop.setState("idle");
    $("dialog").classList.remove("thinking");
    say("앗, 연장이 부러졌어...");
    showMessage(err.name === "AbortError"
      ? "장인이 45초 동안 대답하지 않았어요. 다시 시도해 주세요."
      : err.message);
    setButtons("retry");
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(timeoutTimer);
    busy = false;
  }
}

// 응 / 아니 / 모르겠어
document.querySelectorAll("#answers-question button").forEach((btn) => {
  btn.addEventListener("click", () => {
    history.push({ q: current.text, a: btn.dataset.answer });
    nextTurn();
  });
});

// 완성품이 마음에 들 때
$("guess-yes").addEventListener("click", () => {
  history.push({ q: `완성품: ${current.item}`, a: "응" });
  updateCounter();
  renderOrder();
  showResult(true);
});

// 완성품이 아닐 때
$("guess-no").addEventListener("click", () => {
  history.push({ q: `완성품: ${current.item}`, a: "아니" });
  nextTurn();
});

$("retry-btn").addEventListener("click", askAI);

function nextTurn() {
  updateCounter();
  renderOrder();
  if (history.length >= MAX_QUESTIONS) showResult(false);
  else askAI();
}

// ---------- 3단계: 결과 ----------
function showResult(won) {
  setButtons("none");
  $("panel-result").hidden = false;
  if (won) {
    say("헤헤, 역시 내 솜씨! 또 와!");
    $("result-title").textContent = `${history.length}번 만에 주문 완료!`;
    $("result-text").textContent = `${current.item}, 마음에 쏙 들었다니 다행이야.`;
    $("reveal-form").hidden = true;
  } else {
    Workshop.setState("idle");
    say("재료가 다 떨어졌어... 이번엔 내가 졌다!");
    $("result-title").textContent = "주문 실패";
    $("result-text").textContent = "20번을 다 썼는데도 못 만들었어. 원래 뭘 원했는지 알려줄래?";
    $("reveal-form").hidden = false;
  }
}

$("reveal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const answer = $("reveal-input").value.trim();
  if (!answer) {   // 빈 입력 안내
    $("result-text").textContent = "한 글자 이상 적어 줘!";
    return;
  }
  $("result-text").textContent = `"${answer}"였구나! 다음엔 꼭 만들어 줄게.`;
  $("reveal-form").hidden = true;
});

$("again-btn").addEventListener("click", () => {
  history = [];
  current = null;
  $("reveal-input").value = "";
  document.querySelectorAll('input[name="category"]').forEach((r) => (r.checked = false));
  $("panel-result").hidden = true;
  $("panel-start").hidden = false;
  $("counter").hidden = true;
  renderOrder();
  showMessage("");
  Workshop.setState("idle");
  say("어서 와! 오늘은 뭐가 필요해? 마음속으로 떠올렸으면 종류를 골라 줘.");
});
