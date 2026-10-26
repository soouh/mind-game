// =========================================
// 마음 공방 그림 그리기 (도트 애니메이션)
// 96 x 64 칸짜리 작은 그림을 그린 뒤, CSS로 크게 늘려서 도트처럼 보이게 해요.
// 상태: "idle"(쉬는 중) / "working"(뚝딱뚝딱) / "reveal"(완성품 짠!)
// 완성품 그림은 AI가 직접 그린 16 x 16 도트 그림을 쓰고, 그림이 없거나 망가졌으면 이모지로 대신해요.
// =========================================
const Workshop = (() => {
  const W = 96;
  const H = 64;
  const C = {
    // 따뜻한 원목 공방
    wall: "#e8b98a", wallLine: "#d9a676", wainscot: "#c98f5e", wainLine: "#b67d4f",
    line: "#6b4430",                     // 부드러운 갈색 테두리 (검정 대신)
    wood: "#b9784a", woodTop: "#d99a63", woodDark: "#93593a",
    sky1: "#ffd6a5", sky2: "#ffb4a2", cloud: "#fff4e6", curtain: "#9cc59b", curtainDark: "#7aa679",
    pot: "#e07a5f", leaf: "#7fb069", leafDark: "#5e8f4e",
    jar1: "#a8dadc", jar2: "#f4a988", jar3: "#cdb4db", lid: "#8a5a3b", yarn: "#f28482", yarnLine: "#d96b6b",
    bulb: ["#ffd166", "#f4a988", "#a8dadc", "#cdb4db"],
    clock: "#fff4e6",
    // 너구리 장인
    fur: "#b08b6e", furLight: "#f6ecdf", mask: "#6e5546", earIn: "#f2a7a0", cheek: "#f7a1a1",
    eye: "#2a1e18", shine: "#ffffff", nose: "#3b2a22", scarf: "#f08a5d", apron: "#fff3df", pocket: "#f2c9a0",
    hat: "#f08a5d",
    // 작업 도구
    mallet: "#c98f5e", malletTop: "#e2b07e", handle: "#8a5a3b", block: "#a86b42", blockTop: "#c98f5e", ring: "#d9a676",
    star: "#ffd166", heart: "#f28482", white: "#fffaf2",
  };

  let ctx = null;
  let state = "idle";
  let frame = 0;
  let item = null;
  let puffs = [];      // 망치질할 때 튀는 별·하트

  // 너구리 장인 그림 (images/raccoon.png, 62 x 43 칸)
  // 공방 그림보다 2배 촘촘한 도트라서, 캔버스를 2배 크기로 만들고 너구리만 원래 크기로 그려요.
  const SCALE = 2;
  const RACCOON_X = 102;    // 캔버스(2배 크기) 안에서 너구리 위치
  const RACCOON_Y = 49;
  // 망치와 주먹: 그림에서 x 0~17, y 0~24 영역(귀 테두리 제외). 손목(15, 25)을 중심으로 휘둘러요.
  const ARM = { pivotX: 15, pivotY: 25 };
  const isArm = (x, y) => x <= 17 && y <= 24 && !(x >= 16 && y < 13);
  // 눈 위치 (왼눈, 오른눈) - 눈웃음/깜빡임 표정에 사용
  const EYES = [{ x: 22, y: 16 }, { x: 36, y: 16 }];   // 각각 5 x 5 칸
  const EYE_FILL = "#9d6249";   // 눈 주변 마스크 색
  const EYE_LINE = "#4a2a1e";   // 웃는 눈 선 색

  const raccoon = new Image();
  let parts = null;   // { body, bodyHappy, bodyBlink, arm }
  raccoon.onload = () => { parts = buildRaccoonParts(raccoon); };
  raccoon.src = "images/raccoon.png";

  // 너구리 그림을 "몸통"과 "망치 든 팔"로 나누고, 표정 바꾼 몸통도 미리 만들어 둬요.
  function buildRaccoonParts(img) {
    const w = img.width, h = img.height;
    const make = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return { c, g };
    };
    // 한 칸씩 보면서 "망치와 주먹"은 arm에, 나머지는 body에 나눠 담기
    const body = make();
    const arm = make();
    const bodyData = body.g.getImageData(0, 0, w, h);
    const armData = arm.g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;      // 투명도 칸
        if (isArm(x, y)) bodyData.data[i] = 0;
        else armData.data[i] = 0;
      }
    }
    body.g.putImageData(bodyData, 0, 0);
    arm.g.putImageData(armData, 0, 0);

    const face = (draw) => {
      const v = document.createElement("canvas");
      v.width = w; v.height = h;
      const g = v.getContext("2d");
      g.drawImage(body.c, 0, 0);
      EYES.forEach((e) => {
        g.fillStyle = EYE_FILL;
        g.fillRect(e.x, e.y, 5, 5);
        g.fillStyle = EYE_LINE;
        draw(g, e.x, e.y);
      });
      return v;
    };
    // 눈웃음 ^^
    const bodyHappy = face((g, x, y) => {
      g.fillRect(x, y + 3, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x + 2, y + 1, 1, 1);
      g.fillRect(x + 3, y + 2, 1, 1); g.fillRect(x + 4, y + 3, 1, 1);
      g.fillRect(x, y + 4, 1, 1); g.fillRect(x + 4, y + 4, 1, 1);
    });
    // 눈 깜빡 —
    const bodyBlink = face((g, x, y) => { g.fillRect(x, y + 3, 5, 1); });

    return { body: body.c, bodyHappy, bodyBlink, arm: arm.c, armData: arm.g.getImageData(0, 0, w, h), armFrames: {} };
  }

  // 팔을 돌린 그림을 미리 만들어 두기 (칸이 빠지지 않게 한 칸씩 계산해서 또렷하게)
  const ARM_BOX = 72;   // 돌린 팔을 담을 정사각형 크기, 어깨는 가운데
  function rotatedArm(angle) {
    const key = angle.toFixed(2);
    if (parts.armFrames[key]) return parts.armFrames[key];
    const src = parts.armData;
    const c = document.createElement("canvas");
    c.width = ARM_BOX; c.height = ARM_BOX;
    const g = c.getContext("2d");
    const out = g.createImageData(ARM_BOX, ARM_BOX);
    const cos = Math.cos(angle), sin = Math.sin(angle), half = ARM_BOX / 2;
    for (let y = 0; y < ARM_BOX; y++) {
      for (let x = 0; x < ARM_BOX; x++) {
        const dx = x + 0.5 - half, dy = y + 0.5 - half;
        const sx = Math.floor(cos * dx + sin * dy + ARM.pivotX);     // 거꾸로 돌려서 원래 칸 찾기
        const sy = Math.floor(-sin * dx + cos * dy + ARM.pivotY);
        if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
        const si = (sy * src.width + sx) * 4, di = (y * ARM_BOX + x) * 4;
        for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
      }
    }
    g.putImageData(out, 0, 0);
    parts.armFrames[key] = c;
    return c;
  }

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
    for (let x = 5; x < W; x += 10) px(x, 0, 1, 36, C.wallLine);
    px(0, 36, W, 10, C.wainscot);                      // 아래쪽 벽 판넬
    for (let x = 0; x < W; x += 12) px(x, 37, 1, 9, C.wainLine);
    px(0, 36, W, 1, C.wainLine);

    // 창문 (노을 하늘 + 구름 + 커튼)
    px(6, 7, 22, 18, C.line);
    px(7, 8, 20, 8, C.sky1);
    px(7, 16, 20, 8, C.sky2);
    const cx = 8 + (Math.floor(frame / 12) % 18);
    px(cx, 11, 5, 2, C.cloud); px(cx + 1, 10, 3, 1, C.cloud);
    px(16, 8, 1, 16, C.line); px(7, 15, 20, 1, C.line);
    px(5, 6, 5, 21, C.curtain); px(6, 7, 1, 19, C.curtainDark);
    px(24, 6, 5, 21, C.curtain); px(27, 7, 1, 19, C.curtainDark);
    px(4, 5, 26, 2, C.handle);                         // 커튼봉
    // 창틀 화분
    px(6, 25, 22, 2, C.woodTop);
    px(10, 21, 5, 4, C.pot); px(10, 21, 5, 1, "#c4634a");
    px(11, 17, 1, 4, C.leaf); px(13, 16, 1, 5, C.leafDark); px(9, 18, 2, 2, C.leaf); px(14, 17, 2, 2, C.leaf);

    // 꼬마전구 줄 (번갈아 반짝)
    for (let x = 2; x < W; x += 2) {
      const y = 2 + Math.round(Math.sin(x / 7) * 1);
      px(x, y, 1, 1, C.line);
    }
    for (let i = 0, x = 4; x < W; x += 9, i++) {
      const y = 3 + Math.round(Math.sin(x / 7) * 1);
      const on = (i + Math.floor(frame / 4)) % 3 !== 0;
      px(x, y, 2, 2, on ? C.bulb[i % 4] : "#c7a184");
    }

    // 벽시계 (바늘이 째깍째깍)
    px(41, 9, 9, 9, C.line); px(42, 10, 7, 7, C.clock);
    px(45, 11, 1, 3, C.line);
    const t = Math.floor(frame / 5) % 4;
    const hand = [[1, 0], [1, 1], [0, 1], [-1, 1]][t];
    px(45 + hand[0], 13 + hand[1], 1, 1, C.hat);
    px(45 + hand[0] * 2, 13 + hand[1] * 2, 1, 1, C.hat);

    // 선반: 병, 털실, 화분
    px(62, 22, 30, 2, C.woodDark); px(62, 21, 30, 1, C.woodTop);
    px(64, 14, 5, 7, C.jar1); px(64, 13, 5, 1, C.lid); px(65, 16, 1, 3, C.white);
    px(71, 16, 5, 5, C.jar2); px(71, 15, 5, 1, C.lid); px(72, 17, 1, 2, C.white);
    px(78, 16, 5, 5, C.yarn); px(79, 15, 3, 1, C.yarn); px(78, 18, 5, 1, C.yarnLine); px(80, 16, 1, 5, C.yarnLine);
    px(85, 17, 5, 4, C.pot); px(86, 13, 1, 4, C.leaf); px(88, 12, 1, 5, C.leafDark); px(84, 14, 2, 2, C.leaf); px(89, 14, 2, 2, C.leaf);
    // 위 선반
    px(66, 10, 22, 1, C.woodDark);
    px(68, 6, 4, 4, C.jar3); px(68, 5, 4, 1, C.lid);
    px(75, 7, 6, 3, C.heart); px(76, 6, 4, 1, C.heart);  // 천 뭉치
    px(83, 6, 3, 4, C.jar1); px(83, 5, 3, 1, C.lid);
  }

  // ---------- 너구리 장인 ----------
  const CRAFTER = [
    "...oo......oo...",
    "..ofpo....opfo..",
    "..ofpfooooofpfo.",
    ".offffffffffffo.",
    "offffffffffffffo",
    "offmmffffffmmffo",
    "ofmmwemFFmwemmfo",
    "ofmmeemFFmeemmfo",
    "offmmFFnnFFmmffo",
    "ofcFFFFooFFFFcfo",
    ".ofFFFFFFFFFFfo.",
    "..ooffffffffoo..",
    "..ohhhhhhhhhho..",
    ".ofaaaaaaaaaafo.",
    ".ofaaaakkaaaafo.",
    "ofFaaaakkaaaaFfo",
    ".ofaaaaaaaaaafo.",
  ];

  // 줄무늬 꼬리 (살랑살랑)
  function drawTail(x, y, wag) {
    const dy = wag ? -1 : 0;
    const stripes = [C.fur, C.mask, C.fur, C.mask, C.fur];
    stripes.forEach((color, i) => {
      px(x + i, y + dy - i, 3, 3, C.line);
      px(x + i, y + dy - i + 1, 2, 1, color);
    });
    px(x + 5, y + dy - 5, 2, 2, C.line);
  }

  function drawCrafter(x, y, blink, happy) {
    drawTail(x + 14, y + 14, frame % 10 < 5);
    sprite(CRAFTER, x, y, {
      o: C.line, f: C.fur, F: C.furLight, m: C.mask, p: C.earIn, c: C.cheek,
      e: C.eye, w: C.shine, n: C.nose, h: C.scarf, a: C.apron, k: C.pocket,
    });
    if (blink || happy) {
      // 눈 지우기
      [[4, 6], [5, 6], [4, 7], [5, 7], [10, 6], [11, 6], [10, 7], [11, 7]].forEach(([dx, dy]) => px(x + dx, y + dy, 1, 1, C.mask));
      if (happy) {
        // 웃는 눈 ^^
        px(x + 3, y + 7, 1, 1, C.eye); px(x + 4, y + 6, 2, 1, C.eye); px(x + 6, y + 7, 1, 1, C.eye);
        px(x + 9, y + 7, 1, 1, C.eye); px(x + 10, y + 6, 2, 1, C.eye); px(x + 12, y + 7, 1, 1, C.eye);
      } else {
        px(x + 4, y + 7, 2, 1, C.eye); px(x + 10, y + 7, 2, 1, C.eye);
      }
    }
  }

  // 나무 망치: 들었을 때 / 내리쳤을 때
  function drawMallet(up, x0) {
    if (up) {
      px(x0, 31, 1, 8, C.handle);
      px(x0 - 2, 28, 5, 4, C.mallet); px(x0 - 2, 28, 5, 1, C.malletTop);
      px(x0 - 3, 28, 1, 4, C.line); px(x0 + 3, 28, 1, 4, C.line);
    } else {
      px(x0 - 6, 41, 7, 1, C.handle);
      px(x0 - 10, 38, 4, 5, C.mallet); px(x0 - 10, 38, 4, 1, C.malletTop);
    }
  }

  // ---------- 작업대 ----------
  function drawBench() {
    px(0, 46, W, 2, C.woodTop);
    px(0, 48, W, 16, C.wood);
    px(0, 48, W, 1, C.woodDark);
    for (let x = 0; x < W; x += 16) px(x, 48, 1, 16, C.woodDark);
    // 작업대 위 소품: 실패, 가위
    px(6, 42, 6, 4, C.jar2); px(6, 43, 6, 1, "#e08e6d"); px(7, 41, 4, 1, C.handle); px(7, 46, 4, 0, C.handle);
    px(16, 44, 4, 2, C.line); px(18, 42, 1, 2, "#9aa5b1"); px(20, 41, 1, 3, "#9aa5b1");
  }

  // 그루터기 작업 받침
  function drawBlock() {
    px(32, 40, 18, 6, C.block);
    px(32, 39, 18, 2, C.blockTop);
    px(36, 39, 10, 1, C.ring); px(39, 40, 4, 1, C.ring);
    px(31, 39, 1, 7, C.line); px(50, 39, 1, 7, C.line);
  }

  // 작은 하트
  function heart(x, y, color) {
    px(x, y, 1, 1, color); px(x + 2, y, 1, 1, color);
    px(x, y + 1, 3, 1, color); px(x + 1, y + 2, 1, 1, color);
  }

  // 반짝이 별
  function star(x, y, size) {
    px(x, y - size, 1, size * 2 + 1, C.star);
    px(x - size, y, size * 2 + 1, 1, C.star);
  }

  function updatePuffs(spawn) {
    if (spawn) {
      for (let i = 0; i < 2; i++) {
        puffs.push({ x: 34 + Math.random() * 14, y: 37, life: 6, kind: Math.random() > 0.5 ? "heart" : "star" });
      }
    }
    puffs.forEach((p) => {
      p.y -= 1.5;
      p.life--;
      if (p.kind === "heart") heart(Math.round(p.x), Math.round(p.y), C.heart);
      else star(Math.round(p.x), Math.round(p.y), 1);
    });
    puffs = puffs.filter((p) => p.life > 0);
  }

  // "뚝딱" 말풍선 (도트 글자 대신 작은 느낌표 말풍선)
  function bubble(x, y) {
    px(x, y, 9, 6, C.white); px(x - 1, y + 1, 1, 4, C.white); px(x + 9, y + 1, 1, 4, C.white);
    px(x + 2, y + 6, 2, 1, C.white); px(x + 2, y + 7, 1, 1, C.white);
    px(x + 2, y + 2, 1, 1, C.line); px(x + 4, y + 2, 1, 1, C.line); px(x + 6, y + 2, 1, 1, C.line); // ...
  }

  // ---------- 완성품 ----------
  // 18 x 18 칸 그림을 2배로 키워서 작업대 위에 띄워요.
  function drawItem() {
    if (!item) return;
    const bob = frame % 8 < 4 ? 0 : 1;
    px(28, 38, 26, 1, "rgba(107, 68, 48, 0.25)");
    ctx.drawImage(item, 23, 2 + bob, 36, 36);
    const s = frame % 6;
    if (s < 3) { star(21, 10, 2); heart(57, 22, C.heart); }
    else { star(58, 6, 2); heart(19, 26, C.heart); }
  }

  // AI가 그린 16 x 16 도트 그림을 캔버스로 바꾸기
  function makeAiItem(pixels, palette) {
    const c = document.createElement("canvas");
    c.width = 18;
    c.height = 18;
    const g = c.getContext("2d");
    pixels.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (palette[ch]) {
          g.fillStyle = palette[ch];
          g.fillRect(x + 1, y + 1, 1, 1);
        }
      });
    });
    return c;
  }

  // 이모지를 작은 도트 그림으로 바꾸기 (AI 그림이 없을 때 대신 사용)
  function makeEmojiItem(emoji) {
    const size = 18;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${size - 3}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.fillText(emoji, size / 2, size / 2 + 1);

    // 반투명한 가장자리를 없애서 또렷한 도트로 + 부드러운 갈색 테두리
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    const solid = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      if (d[i * 4 + 3] > 110) { d[i * 4 + 3] = 255; solid[i] = 1; }
      else d[i * 4 + 3] = 0;
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (solid[i]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < size && ny < size && solid[ny * size + nx];
        });
        if (near) { d[i * 4] = 107; d[i * 4 + 1] = 68; d[i * 4 + 2] = 48; d[i * 4 + 3] = 255; }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function makeItem(data) {
    if (data && Array.isArray(data.pixels) && data.palette) return makeAiItem(data.pixels, data.palette);
    return makeEmojiItem((data && data.emoji) || "🎁");
  }

  // 너구리 그리기
  // lift: 위로 들썩이는 칸 수 / swing: 망치 휘두른 각도(라디안) / face: "normal" | "happy" | "blink"
  function drawRaccoon(lift, swing, face) {
    if (!parts) {   // 그림 파일을 못 불러왔으면 기존 도트 너구리로 대신
      drawCrafter(58, 27 - Math.round(lift / 2), face === "blink", face === "happy");
      drawMallet(swing === 0, 56);
      return;
    }
    const x = RACCOON_X, y = RACCOON_Y - lift;
    const body = face === "happy" ? parts.bodyHappy : face === "blink" ? parts.bodyBlink : parts.body;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);     // 너구리는 촘촘한 도트 그대로
    ctx.drawImage(body, x, y);
    // 망치 든 팔: 어깨를 중심으로 돌린 그림
    const arm = swing === 0 ? null : rotatedArm(swing);
    if (arm) ctx.drawImage(arm, x + ARM.pivotX - ARM_BOX / 2, y + ARM.pivotY - ARM_BOX / 2);
    else ctx.drawImage(parts.arm, x, y);
    ctx.restore();
  }

  // ---------- 한 장면 그리기 ----------
  function draw() {
    frame++;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    drawRoom();

    let lift = 0, swing = 0, face = frame % 28 === 0 ? "blink" : "normal";
    if (state === "working") {
      // 뚝딱뚝딱: 망치를 크게 내리치고(앞으로 기울임) 다시 들어올리기
      const step = frame % 4;
      swing = [0, -0.3, -0.55, -0.3][step];
      lift = step === 2 ? 0 : 2;
    } else if (state === "reveal") {
      lift = frame % 8 < 4 ? 1 : 0;          // 완성품 보여주며 두근두근
      swing = -0.2;
    } else if (state === "happy") {
      lift = frame % 4 < 2 ? 4 : 0;          // 마음에 든대! 신나서 콩콩
      swing = frame % 4 < 2 ? 0.2 : -0.1;    // 망치 흔들흔들
      face = "happy";
    } else {
      lift = frame % 16 < 8 ? 1 : 0;         // 숨쉬듯 살짝
    }

    drawRaccoon(lift, swing, face);
    drawBench();
    drawBlock();

    if (state === "working") {
      updatePuffs(frame % 4 === 2);          // 내리칠 때 하트·별이 퐁
      if (Math.floor(frame / 6) % 2 === 0) bubble(83, 13);
    } else if (state === "reveal" || state === "happy") {
      drawItem();
      if (state === "happy") {
        updatePuffs(frame % 3 === 0);
        if (frame % 6 < 3) { heart(80, 14, C.heart); heart(86, 20, C.heart); }
        else { heart(84, 12, C.heart); star(90, 17, 1); }
      }
    } else {
      puffs = [];
    }
  }

  return {
    init(canvas) {
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      draw();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) setInterval(draw, 140);
    },
    // data: AI가 보낸 완성품 정보 { pixels, palette, emoji }
    // happy: 손님이 마음에 든다고 했을 때 (눈웃음 ^^)
    setState(next, data) {
      state = next;
      if (next === "reveal") item = makeItem(data);
      else if (next !== "happy") item = null;      // happy일 땐 완성품을 그대로 둬요
      if (ctx) draw();
    },
  };
})();
