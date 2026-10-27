import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQueuedDirection,
  createInitialSnake,
  hitsSelf,
  hitsWall,
  keyToDirection,
  same,
  spawnFood,
  tick,
} from "../snake/logic.mjs";

test("same compares grid cells", () => {
  assert.equal(same({ x: 1, y: 2 }, { x: 1, y: 2 }), true);
  assert.equal(same({ x: 1, y: 2 }, { x: 1, y: 3 }), false);
});

test("applyQueuedDirection rejects 180-degree reversals", () => {
  const dir = { x: 1, y: 0 };
  assert.deepEqual(applyQueuedDirection(dir, { x: -1, y: 0 }), {
    direction: dir,
    consumed: null,
  });
  assert.deepEqual(applyQueuedDirection(dir, { x: 0, y: 1 }), {
    direction: { x: 0, y: 1 },
    consumed: { x: 0, y: 1 },
  });
});

test("createInitialSnake centers a length-3 horizontal snake", () => {
  const snake = createInitialSnake(20, 20);
  assert.equal(snake.length, 3);
  assert.deepEqual(snake[0], { x: 10, y: 10 });
  assert.deepEqual(snake[1], { x: 9, y: 10 });
  assert.deepEqual(snake[2], { x: 8, y: 10 });
});

test("spawnFood avoids occupied cells", () => {
  const snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const draws = [0, 0, 0.99, 0.99];
  let i = 0;
  const food = spawnFood(2, 2, snake, () => draws[i++] ?? 0.99);
  assert.deepEqual(food, { x: 1, y: 1 });
});

test("hitsWall detects out-of-bounds head", () => {
  assert.equal(hitsWall({ x: -1, y: 0 }, 20, 20), true);
  assert.equal(hitsWall({ x: 20, y: 0 }, 20, 20), true);
  assert.equal(hitsWall({ x: 0, y: 20 }, 20, 20), true);
  assert.equal(hitsWall({ x: 0, y: 0 }, 20, 20), false);
});

test("moving into vacating tail is not self-collision", () => {
  const snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ];
  const food = { x: 0, y: 0 };
  const newHead = { x: 3, y: 5 };
  assert.equal(hitsSelf(newHead, snake, food), false);
});

test("moving into body segment is self-collision", () => {
  const snake = [
    { x: 5, y: 5 },
    { x: 5, y: 4 },
    { x: 5, y: 3 },
    { x: 4, y: 3 },
  ];
  const food = { x: 0, y: 0 };
  assert.equal(hitsSelf({ x: 5, y: 4 }, snake, food), true);
});

test("tick moves snake forward without eating", () => {
  const state = {
    snake: createInitialSnake(20, 20),
    direction: { x: 1, y: 0 },
    food: { x: 0, y: 0 },
    score: 0,
    gameOver: false,
  };
  const next = tick(state, 20, 20, null);
  assert.equal(next.gameOver, false);
  assert.deepEqual(next.snake[0], { x: 11, y: 10 });
  assert.equal(next.snake.length, 3);
  assert.equal(next.score, 0);
});

test("tick increases score and grows when eating food", () => {
  const state = {
    snake: [{ x: 1, y: 0 }],
    direction: { x: 1, y: 0 },
    food: { x: 2, y: 0 },
    score: 0,
    gameOver: false,
  };
  let n = 0;
  const next = tick(state, 5, 5, null, () => {
    n += 1;
    return 0.8;
  });
  assert.equal(next.score, 1);
  assert.equal(next.snake.length, 2);
  assert.notDeepEqual(next.food, { x: 2, y: 0 });
});

test("tick ends game on wall collision", () => {
  const state = {
    snake: [{ x: 19, y: 10 }],
    direction: { x: 1, y: 0 },
    food: { x: 0, y: 0 },
    score: 0,
    gameOver: false,
  };
  const next = tick(state, 20, 20, null);
  assert.equal(next.gameOver, true);
});

test("keyToDirection maps arrows and WASD", () => {
  assert.deepEqual(keyToDirection("ArrowUp"), { x: 0, y: -1 });
  assert.deepEqual(keyToDirection("s"), { x: 0, y: 1 });
  assert.deepEqual(keyToDirection("A"), { x: -1, y: 0 });
  assert.deepEqual(keyToDirection("D"), { x: 1, y: 0 });
  assert.equal(keyToDirection("r"), null);
});
