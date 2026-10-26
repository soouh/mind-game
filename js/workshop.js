// =========================================
// 마음 공방 그림 그리기 (도트 애니메이션)
// 96 x 64 칸짜리 작은 그림을 그린 뒤, CSS로 크게 늘려서 도트처럼 보이게 해요.
// 상태: "idle"(쉬는 중) / "working"(뚝딱뚝딱) / "reveal"(완성품 짠!)
// =========================================
const Workshop = (() => {
  const W = 96;
  const H = 64;
  const C = {
    wall: "#3b2819", wallLine: "#2b1d14", shelf: "#6b4226",
    wood: "#7a4a2a", woodTop: "#a0683c", woodDark: "#4e2f1a",
    lamp: "#ffcf6b", lampDark: "#c98f2e",
    metal: "#8d99a6", metalDark: "#4a5560", metalLight: "#c5ced6",
    skin: "#f1c27d", band: "#c8553d", shirt: "#4f6d7a", apron: "#e9d8a6",
    ink: "#2a1a10", spark: "#fff3b0", jar1: "#7fb3a8", jar2: "#d98c5f", jar3: "#b9a0d6",
  };

  let ctx = null;
  let state = "idle";
  let frame = 0;
  let item = null;          // 완성품 도트 그림 (작은 캔버스)
  let timer = null;

  // 한 칸 칠하기
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // 글자 지도로 그림 그리기 ("." 은 빈칸)
  function sprite(rows, x, y, map) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (map[ch]) px(x + i, y + j, 1, 1, map[ch]);
      });
    });
  }

  // ---------- 배경 ----------
  function drawRoom() {
    px(0, 0, W, H, C.wall);
    for (let x = 7; x < W; x += 12) px(x, 0, 1, 46, C.wallLine);   // 벽 판자 줄

    // 오른쪽 선반과 병들
    px(66, 18, 26, 2, C.shelf);
    px(68, 11, 4, 7, C.jar1); px(68, 10, 4, 1, C.ink);
    px(75, 13, 5, 5, C.jar2); px(76, 12, 3, 1, C.ink);
    px(83, 10, 4, 8, C.jar3); px(83, 9, 4, 1, C.ink);

    // 걸어둔 도구들 (왼쪽 벽)
    px(26, 8, 1, 10, C.woodTop); px(24, 6, 5, 3, C.metal);       // 망치
    px(31, 8, 1, 9, C.woodTop); px(30, 16, 3, 3, C.metalDark);   // 드라이버

    // 천장 램프 (불빛이 살짝 깜빡여요)
    px(47, 0, 1, 5, C.ink);
    px(44, 5, 7, 3, C.lampDark);
    const glow = frame % 20 < 18 ? "rgba(255, 207, 107, 0.10)" : "rgba(255, 207, 107, 0.06)";
    px(38, 8, 19, 4, glow); px(34, 12, 27, 6, glow); px(30, 18, 35, 10, glow);
    px(46, 8, 3, 1, C.lamp);
  }

  // 돌아가는 톱니바퀴
  function drawGear(cx, cy, step) {
    px(cx - 4, cy - 4, 9, 9, C.metalDark);
    px(cx - 3, cy - 3, 7, 7, C.metal);
    px(cx - 1, cy - 1, 3, 3, C.wall);
    const teeth = step % 2 === 0
      ? [[0, -6], [0, 5], [-6, 0], [5, 0]]
      : [[-5, -5], [4, -5], [-5, 4], [4, 4]];
    teeth.forEach(([dx, dy]) => px(cx + dx, cy + dy, 2, 2, C.metalDark));
  }

  // ---------- 장인 ----------
  const CRAFTER = [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..kssssssk..",
    "..sskssks...",
    "..ssssssss..",
    "...ssmmss...",
    "...kssssk...",
    "..bbbbbbbb..",
    ".bbaaaaaabb.",
    ".bbaaaaaabb.",
    ".bbaaaaaabb.",
    ".sbaaaaaabs.",
  ];

  function drawCrafter(x, y, blink) {
    sprite(CRAFTER, x, y, {
      h: C.band, k: C.ink, s: C.skin, m: "#a0522d", b: C.shirt, a: C.apron,
    });
    px(x + 3, y + 3, 1, 1, blink ? C.skin : C.ink);  // 눈 깜빡
    px(x + 4, y + 3, 1, 1, C.skin);
    px(x + 6, y + 3, 1, 1, blink ? C.skin : C.ink);
  }

  // 망치: 들었을 때 / 내리쳤을 때
  function drawHammer(up) {
    if (up) {
      px(54, 30, 1, 9, C.woodTop);      // 손잡이
      px(52, 27, 5, 3, C.metal);        // 망치 머리
      px(52, 27, 5, 1, C.metalLight);
    } else {
      px(51, 39, 6, 1, C.woodTop);
      px(47, 37, 4, 4, C.metal);
      px(47, 37, 4, 1, C.metalLight);
    }
  }

  // ---------- 작업대와 모루 ----------
  function drawBench() {
    px(0, 46, W, 2, C.woodTop);
    px(0, 48, W, 16, C.wood);
    for (let x = 0; x < W; x += 16) px(x, 48, 1, 16, C.woodDark);
    px(0, 48, W, 1, C.woodDark);
  }

  function drawAnvil() {
    px(36, 40, 16, 2, C.metalLight);
    px(36, 42, 16, 1, C.metal);
    px(40, 43, 8, 2, C.metalDark);
    px(38, 45, 12, 1, C.metalDark);
    px(32, 40, 4, 1, C.metal);          // 모루 뿔
  }

  function drawSparks() {
    for (let i = 0; i < 6; i++) {
      const x = 40 + Math.floor(Math.random() * 14);
      const y = 32 + Math.floor(Math.random() * 8);
      px(x, y, 1, 1, Math.random() > 0.5 ? C.spark : C.lamp);
    }
  }

  // 반짝이 별
  function star(x, y, size) {
    px(x, y - size, 1, size * 2 + 1, C.spark);
    px(x - size, y, size * 2 + 1, 1, C.spark);
  }

  // ---------- 완성품 ----------
  function drawItem() {
    if (!item) return;
    const bob = frame % 8 < 4 ? 0 : 1;            // 살짝 둥실둥실
    px(31, 39, 26, 1, "rgba(0, 0, 0, 0.3)");       // 그림자
    ctx.drawImage(item, 32, 13 + bob);
    const s = frame % 6;
    if (s < 3) { star(28, 16, 2); star(62, 28, 1); }
    else { star(62, 14, 2); star(27, 32, 1); }
  }

  // 이모지를 작은 도트 그림으로 바꾸기
  function makePixelItem(emoji) {
    const size = 24;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${size - 3}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(emoji, size / 2, size / 2 + 1);

    // 반투명한 가장자리를 없애서 또렷한 도트로 만들기 + 테두리 추가
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    const solid = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      if (d[i * 4 + 3] > 110) {
        d[i * 4 + 3] = 255;
        solid[i] = 1;
      } else {
        d[i * 4 + 3] = 0;
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (solid[i]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < size && ny < size && solid[ny * size + nx];
        });
        if (near) { d[i * 4] = 42; d[i * 4 + 1] = 26; d[i * 4 + 2] = 16; d[i * 4 + 3] = 255; }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- 한 장면 그리기 ----------
  function draw() {
    frame++;
    drawRoom();
    drawGear(14, 14, state === "working" ? frame : Math.floor(frame / 6));
    drawCrafter(56, 34, frame % 30 === 0);
    drawBench();
    drawAnvil();

    if (state === "working") {
      const up = frame % 4 < 2;
      drawHammer(up);
      if (!up) drawSparks();
    } else if (state === "reveal") {
      drawHammer(true);
      drawItem();
    } else {
      drawHammer(true);
    }
  }

  return {
    init(canvas) {
      canvas.width = W;
      canvas.height = H;
      ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      draw();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) timer = setInterval(draw, 140);
    },
    setState(next, emoji) {
      state = next;
      item = next === "reveal" ? makePixelItem(emoji || "🎁") : null;
      if (ctx) draw();
    },
    // 결과 화면에서 완성품만 크게 보여줄 때 사용
    renderItemTo(canvas, emoji) {
      const pic = makePixelItem(emoji || "🎁");
      canvas.width = 32;
      canvas.height = 32;
      const g = canvas.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 32, 32);
      g.drawImage(pic, 4, 4);
    },
  };
})();
