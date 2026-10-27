(function () {
  "use strict";

  const CELL = 20;
  const TICK_MS = 120;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");
  const restartBtn = document.getElementById("restart");

  const COLS = canvas.width / CELL;
  const ROWS = canvas.height / CELL;

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

  function randCell() {
    return {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  }

  function same(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function spawnFood() {
    let spot;
    do {
      spot = randCell();
    } while (snake.some((s) => same(s, spot)));
    food = spot;
  }

  function reset() {
    const mid = Math.floor(COLS / 2);
    const midY = Math.floor(ROWS / 2);
    snake = [
      { x: mid, y: midY },
      { x: mid - 1, y: midY },
      { x: mid - 2, y: midY },
    ];
    direction = { x: 1, y: 0 };
    nextDirection = null;
    score = 0;
    gameOver = false;
    scoreEl.textContent = "0";
    statusEl.textContent = "Arrow keys or WASD to move";
    statusEl.classList.remove("game-over");
    restartBtn.classList.add("hidden");
    spawnFood();
    draw();
  }

  function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
  }

  function draw() {
    ctx.fillStyle = "#151b24";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawCell(food.x, food.y, "#f07178");

    snake.forEach((seg, i) => {
      drawCell(seg.x, seg.y, i === 0 ? "#7fd962" : "#5cb848");
    });
  }

  function tick() {
    if (gameOver) return;

    if (nextDirection) {
      const opposite =
        nextDirection.x === -direction.x && nextDirection.y === -direction.y;
      if (!opposite) {
        direction = nextDirection;
      }
      nextDirection = null;
    }

    const head = snake[0];
    const newHead = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    if (
      newHead.x < 0 ||
      newHead.x >= COLS ||
      newHead.y < 0 ||
      newHead.y >= ROWS ||
      snake.some((s) => same(s, newHead))
    ) {
      endGame();
      return;
    }

    snake.unshift(newHead);

    if (same(newHead, food)) {
      score += 1;
      scoreEl.textContent = String(score);
      spawnFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function endGame() {
    gameOver = true;
    statusEl.textContent = `Game over — score ${score}. Press R or click Play again.`;
    statusEl.classList.add("game-over");
    restartBtn.classList.remove("hidden");
  }

  function startLoop() {
    if (loopId) clearInterval(loopId);
    loopId = setInterval(tick, TICK_MS);
  }

  function handleKey(e) {
    const key = e.key.toLowerCase();
    /** @type {{ x: number, y: number } | null} */
    let dir = null;

    if (key === "arrowup" || key === "w") dir = { x: 0, y: -1 };
    else if (key === "arrowdown" || key === "s") dir = { x: 0, y: 1 };
    else if (key === "arrowleft" || key === "a") dir = { x: -1, y: 0 };
    else if (key === "arrowright" || key === "d") dir = { x: 1, y: 0 };
    else if (key === "r" && gameOver) {
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
