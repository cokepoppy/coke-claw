const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = {
  I: "#06b6d4",
  J: "#3b82f6",
  L: "#f59e0b",
  O: "#eab308",
  S: "#22c55e",
  T: "#a855f7",
  Z: "#ef4444"
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [
    [1, 0, 0],
    [1, 1, 1]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1]
  ]
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");

let board = createBoard();
let current = null;
let score = 0;
let lines = 0;
let dropMs = 500;
let dropCounter = 0;
let lastTime = 0;
let running = false;
let gameOver = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const keys = Object.keys(SHAPES);
  const type = keys[Math.floor(Math.random() * keys.length)];
  const shape = SHAPES[type].map((row) => [...row]);
  return {
    type,
    color: COLORS[type],
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0
  };
}

function collide(piece, dx = 0, dy = 0, nextShape = piece.shape) {
  for (let y = 0; y < nextShape.length; y += 1) {
    for (let x = 0; x < nextShape[y].length; x += 1) {
      if (!nextShape[y][x]) continue;
      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function mergePiece(piece) {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;
      if (piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.color;
      }
    }
  }
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared];
    linesEl.textContent = String(lines);
    scoreEl.textContent = String(score);
  }
}

function rotate(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      rotated[x][rows - 1 - y] = matrix[y][x];
    }
  }
  return rotated;
}

function spawnPiece() {
  current = randomPiece();
  if (collide(current)) {
    running = false;
    gameOver = true;
    statusEl.textContent = "游戏结束";
    toggleBtn.textContent = "重新开始";
  }
}

function resetGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  scoreEl.textContent = "0";
  linesEl.textContent = "0";
  gameOver = false;
  dropCounter = 0;
  lastTime = 0;
  spawnPiece();
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  ctx.strokeStyle = "#0b1220";
  ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (board[y][x]) {
        drawCell(x, y, board[y][x]);
      } else {
        ctx.strokeStyle = "#111827";
        ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      }
    }
  }

  if (current) {
    for (let y = 0; y < current.shape.length; y += 1) {
      for (let x = 0; x < current.shape[y].length; x += 1) {
        if (!current.shape[y][x]) continue;
        drawCell(current.x + x, current.y + y, current.color);
      }
    }
  }
}

function dropOne() {
  if (!current) return;

  if (!collide(current, 0, 1)) {
    current.y += 1;
    return;
  }

  mergePiece(current);
  clearLines();
  spawnPiece();
}

function update(time = 0) {
  if (!running) {
    draw();
    requestAnimationFrame(update);
    return;
  }

  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;

  if (dropCounter >= dropMs) {
    dropCounter = 0;
    dropOne();
  }

  draw();
  requestAnimationFrame(update);
}

function toggleGame() {
  if (gameOver || !current) {
    resetGame();
    running = true;
    statusEl.textContent = "进行中";
    toggleBtn.textContent = "暂停";
    return;
  }

  running = !running;
  statusEl.textContent = running ? "进行中" : "已暂停";
  toggleBtn.textContent = running ? "暂停" : "继续";
  if (running) lastTime = performance.now();
}

toggleBtn.addEventListener("click", toggleGame);

document.addEventListener("keydown", (event) => {
  if (!running || !current) return;

  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp"
  ) {
    return;
  }

  event.preventDefault();

  if (event.key === "ArrowLeft") {
    if (!collide(current, -1, 0)) current.x -= 1;
  } else if (event.key === "ArrowRight") {
    if (!collide(current, 1, 0)) current.x += 1;
  } else if (event.key === "ArrowDown") {
    if (!collide(current, 0, 1)) {
      current.y += 1;
      score += 1;
      scoreEl.textContent = String(score);
    }
  } else if (event.key === "ArrowUp") {
    const rotated = rotate(current.shape);
    if (!collide(current, 0, 0, rotated)) {
      current.shape = rotated;
    }
  }

  draw();
});

resetGame();
running = false;
statusEl.textContent = "未开始";
toggleBtn.textContent = "开始";
draw();
requestAnimationFrame(update);
