/** @typedef {{ x: number, y: number }} Cell */

/**
 * @param {Cell} a
 * @param {Cell} b
 */
export function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * @param {Cell} direction
 * @param {Cell | null | undefined} nextDirection
 */
export function applyQueuedDirection(direction, nextDirection) {
  if (!nextDirection) {
    return { direction, consumed: null };
  }
  const opposite =
    nextDirection.x === -direction.x && nextDirection.y === -direction.y;
  if (opposite) {
    return { direction, consumed: null };
  }
  return { direction: nextDirection, consumed: nextDirection };
}

/**
 * @param {number} cols
 * @param {number} rows
 */
export function createInitialSnake(cols, rows) {
  const mid = Math.floor(cols / 2);
  const midY = Math.floor(rows / 2);
  return [
    { x: mid, y: midY },
    { x: mid - 1, y: midY },
    { x: mid - 2, y: midY },
  ];
}

/**
 * @param {number} cols
 * @param {number} rows
 * @param {Cell[]} snake
 * @param {() => number} [random]
 */
export function spawnFood(cols, rows, snake, random = Math.random) {
  /** @type {Cell} */
  let spot;
  let attempts = 0;
  const maxAttempts = cols * rows + 1;
  do {
    spot = {
      x: Math.floor(random() * cols),
      y: Math.floor(random() * rows),
    };
    attempts += 1;
    if (attempts >= maxAttempts) {
      throw new Error("No free cell to spawn food");
    }
  } while (snake.some((s) => same(s, spot)));
  return spot;
}

/**
 * @param {Cell} newHead
 * @param {Cell[]} snake
 * @param {Cell} food
 */
export function hitsSelf(newHead, snake, food) {
  const willEat = same(newHead, food);
  const body = willEat ? snake : snake.slice(0, -1);
  return body.some((s) => same(s, newHead));
}

/**
 * @param {Cell} newHead
 * @param {number} cols
 * @param {number} rows
 */
export function hitsWall(newHead, cols, rows) {
  return (
    newHead.x < 0 ||
    newHead.x >= cols ||
    newHead.y < 0 ||
    newHead.y >= rows
  );
}

/**
 * @typedef {{
 *   snake: Cell[];
 *   direction: Cell;
 *   food: Cell;
 *   score: number;
 *   gameOver: boolean;
 * }} GameState
 */

/**
 * Advance one tick. Returns a new state (does not mutate input).
 * @param {GameState} state
 * @param {number} cols
 * @param {number} rows
 * @param {Cell | null | undefined} nextDirection
 * @param {() => number} [random]
 * @returns {GameState}
 */
export function tick(state, cols, rows, nextDirection, random = Math.random) {
  if (state.gameOver) {
    return state;
  }

  const { direction } = applyQueuedDirection(state.direction, nextDirection);
  const head = state.snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  if (hitsWall(newHead, cols, rows) || hitsSelf(newHead, state.snake, state.food)) {
    return { ...state, direction, gameOver: true };
  }

  const snake = [newHead, ...state.snake];
  let score = state.score;
  let food = state.food;

  if (same(newHead, food)) {
    score += 1;
    food = spawnFood(cols, rows, snake, random);
  } else {
    snake.pop();
  }

  return {
    snake,
    direction,
    food,
    score,
    gameOver: false,
  };
}

/**
 * @param {string} key
 * @returns {Cell | null}
 */
export function keyToDirection(key) {
  const normalized = key.toLowerCase();
  if (normalized === "arrowup" || normalized === "w") return { x: 0, y: -1 };
  if (normalized === "arrowdown" || normalized === "s") return { x: 0, y: 1 };
  if (normalized === "arrowleft" || normalized === "a") return { x: -1, y: 0 };
  if (normalized === "arrowright" || normalized === "d") return { x: 1, y: 0 };
  return null;
}
