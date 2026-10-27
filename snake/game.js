import {
  createInitialSnake,
  spawnFood,
  tick,
  keyToDirection,
} from "./logic.mjs";

(function () {
  "use strict";

  const CELL = 20;
  const TICK_MS = 120;
  const PAD = 2;
  const SEG = CELL - PAD;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const restartBtn = document.getElementById("restart");
  const overlayEl = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("final-score");

  const COLS = canvas.width / CELL;
  const ROWS = canvas.height / CELL;

  const snakeGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  snakeGrad.addColorStop(0, "#6ee7b7");
  snakeGrad.addColorStop(1, "#34d399");

  const headGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  headGrad.addColorStop(0, "#a7f3d0");
  headGrad.addColorStop(1, "#5eead4");

  /** @type {{ x: number, y: number }[]} */
  let snake;
  /** @type {{ x: number, y: number }} */
  let food;
  /** @type {{ x: number, y: number }} */
  let direction;
  /** @type {{ x: number, y: number } | null} */
  let nextDirection;
  let score;
  let loopId;
  let gameOver;
  let pulsePhase = 0;

  function roundRect(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function cellPx(c) {
    return c * CELL + PAD / 2;
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(canvas.width, y * CELL);
      ctx.stroke();
    }
  }

  function drawFood() {
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const pulse = 0.85 + Math.sin(pulsePhase) * 0.15;
    const r = (CELL / 2 - 3) * pulse;

    ctx.save();
    ctx.shadowColor = "rgba(251, 113, 133, 0.8)";
    ctx.shadowBlur = 12 + Math.sin(pulsePhase) * 4;

    const foodGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    foodGrad.addColorStop(0, "#fecdd3");
    foodGrad.addColorStop(0.6, "#fb7185");
    foodGrad.addColorStop(1, "#e11d48");
    ctx.fillStyle = foodGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeadEyes() {
    const hx = snake[0].x * CELL + CELL / 2;
    const hy = snake[0].y * CELL + CELL / 2;
    let ex = 0;
    let ey = 0;
    if (direction.x === 1) ex = 4;
    else if (direction.x === -1) ex = -4;
    else if (direction.y === 1) ey = 4;
    else if (direction.y === -1) ey = -4;

    const perpX = direction.y !== 0 ? 3 : 0;
    const perpY = direction.x !== 0 ? 3 : 0;

    ctx.fillStyle = "#0a0e17";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + ex + perpX * side, hy + ey + perpY * side, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSnake() {
    snake.forEach((seg, i) => {
      const x = cellPx(seg.x);
      const y = cellPx(seg.y);
      const isHead = i === 0;
      const radius = isHead ? 7 : 5;

      ctx.fillStyle = isHead ? headGrad : snakeGrad;
      if (isHead) {
        ctx.shadowColor = "rgba(94, 234, 212, 0.5)";
        ctx.shadowBlur = 8;
      } else {
        ctx.shadowBlur = 0;
      }

      roundRect(x, y, SEG, SEG, radius);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    drawHeadEyes();
  }

  function draw() {
    pulsePhase += 0.12;
    ctx.fillStyle = "#0d121c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawFood();
    drawSnake();
  }

  function bumpScore() {
    scoreEl.classList.remove("bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
  }

  function reset() {
    snake = createInitialSnake(COLS, ROWS);
    direction = { x: 1, y: 0 };
    nextDirection = null;
    score = 0;
    gameOver = false;
    scoreEl.textContent = "0";
    statusEl.innerHTML =
      "<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move";
    statusEl.classList.remove("game-over");
    restartBtn.classList.add("hidden");
    overlayEl.classList.add("hidden");
    overlayEl.setAttribute("aria-hidden", "true");
    food = spawnFood(COLS, ROWS, snake);
    draw();
  }

  function runTick() {
    if (gameOver) {
      draw();
      return;
    }

    const queued = nextDirection;
    nextDirection = null;
    const before = { snake, direction, food, score, gameOver };
    const after = tick(before, COLS, ROWS, queued);

    snake = after.snake;
    direction = after.direction;
    food = after.food;
    score = after.score;
    gameOver = after.gameOver;

    if (gameOver) {
      endGame();
      return;
    }

    if (after.score > before.score) {
      scoreEl.textContent = String(score);
      bumpScore();
    }

    draw();
  }

  function endGame() {
    gameOver = true;
    finalScoreEl.textContent = String(score);
    overlayEl.classList.remove("hidden");
    overlayEl.setAttribute("aria-hidden", "false");
    statusEl.textContent = "Press R or tap Play again to restart";
    statusEl.classList.add("game-over");
    restartBtn.classList.remove("hidden");
    draw();
  }

  function startLoop() {
    if (loopId) clearInterval(loopId);
    loopId = setInterval(runTick, TICK_MS);
  }

  function handleKey(e) {
    const key = e.key.toLowerCase();
    const dir = keyToDirection(e.key);

    if (key === "r" && gameOver) {
      reset();
      return;
    }

    if (dir) {
      e.preventDefault();
      if (gameOver) return;
      nextDirection = dir;
    }
  }

  restartBtn.addEventListener("click", () => {
    reset();
  });

  window.addEventListener("keydown", handleKey);

  reset();
  startLoop();
})();
