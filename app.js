const UNICODE = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

const game = new Chess();
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const promoEl = document.getElementById("promo");
const promoBox = document.getElementById("promo-box");

let selected = null;
let flipped = false;
let pendingPromo = null;
let busy = false;
let lastMove = null;

function squaresOrder() {
  const order = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) order.push(rank * 8 + file);
  }
  return flipped ? order.reverse() : order;
}

function render() {
  const moves = selected != null ? game.movesFrom(selected) : [];
  const dests = new Set(moves.map((m) => m.to));
  const king = game.inCheck() ? game.kingSquare(game.turn) : -1;
  boardEl.innerHTML = "";
  for (const sq of squaresOrder()) {
    const cell = document.createElement("button");
    cell.type = "button";
    const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
    cell.className = `sq ${light ? "light" : "dark"}`;
    cell.dataset.sq = String(sq);
    const occupant = game.board[sq];
    cell.setAttribute(
      "aria-label",
      algebraic(sq) + (occupant ? ` ${occupant.color === "w" ? "white" : "black"} ${NAMES[occupant.type]}` : "")
    );
    if (selected === sq) cell.classList.add("selected");
    if (lastMove && (lastMove.from === sq || lastMove.to === sq)) cell.classList.add("last");
    if (sq === king) cell.classList.add("check");
    if (dests.has(sq)) {
      const mark = document.createElement("span");
      mark.className = game.board[sq] ? "ring" : "dot";
      cell.appendChild(mark);
    }
    const piece = game.board[sq];
    if (piece) {
      const glyph = document.createElement("span");
      glyph.className = `piece ${piece.color}`;
      glyph.textContent = UNICODE[piece.color][piece.type];
      glyph.draggable = true;
      glyph.dataset.sq = String(sq);
      glyph.addEventListener("dragstart", (e) => {
        selected = sq;
        e.dataTransfer.setData("text/plain", String(sq));
        render();
      });
      cell.appendChild(glyph);
    }
    if (rankOf(sq) === (flipped ? 7 : 0)) {
      const label = document.createElement("span");
      label.className = "coord file";
      label.textContent = FILES[fileOf(sq)];
      cell.appendChild(label);
    }
    if (fileOf(sq) === (flipped ? 7 : 0)) {
      const label = document.createElement("span");
      label.className = "coord rank";
      label.textContent = String(rankOf(sq) + 1);
      cell.appendChild(label);
    }
    cell.addEventListener("click", () => onSquare(sq));
    cell.addEventListener("dragover", (e) => e.preventDefault());
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("text/plain"));
      tryMove(from, sq);
    });
    boardEl.appendChild(cell);
  }
  updateSidebar();
}

function updateSidebar() {
  const state = game.status();
  statusEl.className = "status";
  if (state === "checkmate") {
    statusEl.classList.add("over");
    statusEl.textContent = `${game.turn === "w" ? "Black" : "White"} wins by checkmate`;
  } else if (state === "stalemate") {
    statusEl.classList.add("over");
    statusEl.textContent = "Draw by stalemate";
  } else if (state === "fifty") {
    statusEl.classList.add("over");
    statusEl.textContent = "Draw by 50-move rule";
  } else if (state === "material") {
    statusEl.classList.add("over");
    statusEl.textContent = "Draw by insufficient material";
  } else if (state === "threefold") {
    statusEl.classList.add("over");
    statusEl.textContent = "Draw by threefold repetition";
  } else if (state === "check") {
    statusEl.classList.add("check");
    statusEl.textContent = `${game.turn === "w" ? "White" : "Black"} is in check`;
  } else {
    statusEl.textContent = `${game.turn === "w" ? "White" : "Black"} to move`;
  }

  const captured = { w: [], b: [] };
  for (const { move } of game.history) {
    if (move.captured) captured[move.capturedColor].push(move.captured);
  }
  document.getElementById("captured-white").textContent =
    "White took: " + (captured.b.map((t) => UNICODE.b[t]).join(" ") || "—");
  document.getElementById("captured-black").textContent =
    "Black took: " + (captured.w.map((t) => UNICODE.w[t]).join(" ") || "—");

  const pairs = [];
  for (let i = 0; i < game.history.length; i += 2) {
    const w = game.history[i];
    const b = game.history[i + 1];
    const temp = new Chess();
    for (let j = 0; j < i; j++) temp.applyMove(game.history[j].move);
    const whiteSan = san(temp, w.move);
    let blackSan = "";
    if (b) {
      temp.applyMove(w.move);
      blackSan = san(temp, b.move);
    }
    pairs.push(`${i / 2 + 1}. ${whiteSan} ${blackSan}`);
  }
  historyEl.innerHTML = pairs.length
    ? `<ol>${pairs.map((p) => `<li>${p.replace(/^\d+\.\s/, "")}</li>`).join("")}</ol>`
    : "Moves will appear here.";
}

function playerToMoveIsHuman() {
  const mode = document.getElementById("mode").value;
  if (mode === "human") return true;
  if (mode === "white") return game.turn === "w";
  return game.turn === "b";
}

function onSquare(sq) {
  if (busy || !playerToMoveIsHuman() || game.status() !== "playing" && game.status() !== "check") return;
  const piece = game.board[sq];
  if (selected == null) {
    if (piece && piece.color === game.turn) {
      selected = sq;
      render();
    }
    return;
  }
  if (piece && piece.color === game.turn) {
    selected = sq;
    render();
    return;
  }
  tryMove(selected, sq);
}

function tryMove(from, to) {
  const options = game.legalMoves().filter((m) => m.from === from && m.to === to);
  if (!options.length) {
    selected = null;
    render();
    return;
  }
  if (options.some((m) => m.promotion)) {
    pendingPromo = { from, to };
    openPromo(game.turn);
    return;
  }
  commitMove(from, to);
}

function commitMove(from, to, promotion = "q") {
  const move = game.move(from, to, promotion);
  if (!move) return;
  lastMove = move;
  selected = null;
  render();
  maybeComputer();
}

function openPromo(color) {
  promoBox.innerHTML = "";
  for (const type of ["q", "r", "b", "n"]) {
    const btn = document.createElement("button");
    btn.innerHTML = UNICODE[color][type];
    btn.addEventListener("click", () => {
      promoEl.classList.remove("open");
      const { from, to } = pendingPromo;
      pendingPromo = null;
      commitMove(from, to, type);
    });
    promoBox.appendChild(btn);
  }
  promoEl.classList.add("open");
}

function search(depth, alpha, beta) {
  const state = game.status();
  if (state === "checkmate") return -20000 - depth;
  if (state === "stalemate" || state === "fifty" || state === "material" || state === "threefold") {
    return 0;
  }
  if (depth === 0) return game.evaluate();
  const moves = orderMoves(game.legalMoves());
  let best = -Infinity;
  for (const move of moves) {
    const snap = game.snapshot();
    game.applyMove(move);
    const score = -search(depth - 1, -beta, -alpha);
    game.restore(snap);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function orderMoves(moves) {
  return moves.sort((a, b) => {
    const cap = (m) => (m.captured ? PIECE_VALUES[m.captured] - PIECE_VALUES[m.piece] / 10 : 0);
    return cap(b) - cap(a);
  });
}

function chooseComputerMove() {
  const depth = Number(document.getElementById("depth").value);
  const moves = orderMoves(game.legalMoves());
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const snap = game.snapshot();
    game.applyMove(move);
    const score = -search(depth - 1, -Infinity, Infinity);
    game.restore(snap);
    const jitter = Math.random() * 8;
    if (score + jitter > bestScore) {
      bestScore = score + jitter;
      best = move;
    }
  }
  return best;
}

function maybeComputer() {
  const state = game.status();
  if (state !== "playing" && state !== "check") return;
  if (playerToMoveIsHuman()) return;
  busy = true;
  statusEl.textContent = "Computer is thinking…";
  setTimeout(() => {
    const move = chooseComputerMove();
    if (move) {
      game.move(move.from, move.to, move.promotion || "q");
      lastMove = move;
    }
    busy = false;
    render();
    maybeComputer();
  }, 80);
}

document.getElementById("new").addEventListener("click", () => {
  game.reset();
  selected = null;
  lastMove = null;
  const mode = document.getElementById("mode").value;
  flipped = mode === "black";
  render();
  maybeComputer();
});

document.getElementById("undo").addEventListener("click", () => {
  game.undo();
  if (!playerToMoveIsHuman()) game.undo();
  lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  selected = null;
  render();
});

document.getElementById("flip").addEventListener("click", () => {
  flipped = !flipped;
  render();
});

document.getElementById("mode").addEventListener("change", () => {
  document.getElementById("new").click();
});

render();
