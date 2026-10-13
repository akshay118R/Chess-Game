const FILES = "abcdefgh";
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const KNIGHT_OFFSETS = [17, 15, 10, 6, -6, -10, -15, -17];
const KING_OFFSETS = [1, -1, 8, -8, 9, 7, -9, -7];
const BISHOP_RAYS = [9, 7, -9, -7];
const ROOK_RAYS = [1, -1, 8, -8];

function fileOf(sq) {
  return sq & 7;
}

function rankOf(sq) {
  return sq >> 3;
}

function onBoard(from, to, offset) {
  if (to < 0 || to > 63) return false;
  const fileDelta = Math.abs(fileOf(to) - fileOf(from));
  const rankDelta = Math.abs(rankOf(to) - rankOf(from));
  if (offset === 1 || offset === -1) return rankDelta === 0 && fileDelta === 1;
  if (offset === 8 || offset === -8) return fileDelta === 0 && rankDelta === 1;
  if (Math.abs(offset) === 7 || Math.abs(offset) === 9) {
    return fileDelta === 1 && rankDelta === 1;
  }
  if (Math.abs(offset) === 6 || Math.abs(offset) === 10) {
    return fileDelta === 2 && rankDelta === 1;
  }
  if (Math.abs(offset) === 15 || Math.abs(offset) === 17) {
    return fileDelta === 1 && rankDelta === 2;
  }
  return true;
}

function algebraic(sq) {
  return FILES[fileOf(sq)] + (rankOf(sq) + 1);
}

function parseSquare(name) {
  const file = FILES.indexOf(name[0]);
  const rank = Number(name[1]) - 1;
  return rank * 8 + file;
}

class Chess {
  constructor(fen) {
    this.reset(fen);
  }

  reset(fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
    this.board = new Array(64).fill(null);
    this.history = [];
    this.positionCounts = Object.create(null);
    this.loadFen(fen);
    this.recordPosition();
  }

  loadFen(fen) {
    const [placement, turn, castle, ep, half, full] = fen.split(" ");
    let i = 56;
    for (const ch of placement) {
      if (ch === "/") {
        i -= 16;
        continue;
      }
      if (/\d/.test(ch)) {
        i += Number(ch);
        continue;
      }
      this.board[i] = {
        type: ch.toLowerCase(),
        color: ch === ch.toUpperCase() ? "w" : "b",
      };
      i += 1;
    }
    this.turn = turn;
    this.castling = {
      wK: castle.includes("K"),
      wQ: castle.includes("Q"),
      bK: castle.includes("k"),
      bQ: castle.includes("q"),
    };
    this.epSquare = ep === "-" ? null : parseSquare(ep);
    this.halfmove = Number(half || 0);
    this.fullmove = Number(full || 1);
  }

  clonePiece(piece) {
    return piece ? { type: piece.type, color: piece.color } : null;
  }

  snapshot() {
    return {
      board: this.board.map((p) => this.clonePiece(p)),
      turn: this.turn,
      castling: { ...this.castling },
      epSquare: this.epSquare,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
    };
  }

  restore(state) {
    this.board = state.board.map((p) => this.clonePiece(p));
    this.turn = state.turn;
    this.castling = { ...state.castling };
    this.epSquare = state.epSquare;
    this.halfmove = state.halfmove;
    this.fullmove = state.fullmove;
  }

  pieceAt(sq) {
    return this.board[sq];
  }

  kingSquare(color) {
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (p && p.type === "k" && p.color === color) return sq;
    }
    return -1;
  }

  isAttacked(sq, byColor) {
    const pawnDir = byColor === "w" ? -8 : 8;
    for (const df of [-1, 1]) {
      const from = sq + pawnDir + df;
      if (from >= 0 && from < 64 && Math.abs(fileOf(from) - fileOf(sq)) === 1) {
        const p = this.board[from];
        if (p && p.color === byColor && p.type === "p") return true;
      }
    }
    for (const off of KNIGHT_OFFSETS) {
      const from = sq + off;
      if (!onBoard(sq, from, off)) continue;
      const p = this.board[from];
      if (p && p.color === byColor && p.type === "n") return true;
    }
    for (const off of KING_OFFSETS) {
      const from = sq + off;
      if (!onBoard(sq, from, off)) continue;
      const p = this.board[from];
      if (p && p.color === byColor && p.type === "k") return true;
    }
    if (this.rayAttack(sq, byColor, BISHOP_RAYS, "b")) return true;
    if (this.rayAttack(sq, byColor, ROOK_RAYS, "r")) return true;
    return false;
  }

  rayAttack(sq, byColor, rays, slider) {
    for (const ray of rays) {
      let from = sq + ray;
      let prev = sq;
      while (onBoard(prev, from, ray)) {
        const p = this.board[from];
        if (p) {
          if (p.color === byColor && (p.type === slider || p.type === "q")) {
            return true;
          }
          break;
        }
        prev = from;
        from += ray;
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    const king = this.kingSquare(color);
    if (king < 0) return true;
    return this.isAttacked(king, color === "w" ? "b" : "w");
  }

  generatePseudoMoves() {
    const moves = [];
    const color = this.turn;
    for (let from = 0; from < 64; from++) {
      const piece = this.board[from];
      if (!piece || piece.color !== color) continue;
      if (piece.type === "p") this.addPawnMoves(moves, from, piece);
      else if (piece.type === "n") this.addLeapMoves(moves, from, piece, KNIGHT_OFFSETS);
      else if (piece.type === "k") this.addKingMoves(moves, from, piece);
      else if (piece.type === "b") this.addSlideMoves(moves, from, piece, BISHOP_RAYS);
      else if (piece.type === "r") this.addSlideMoves(moves, from, piece, ROOK_RAYS);
      else if (piece.type === "q") {
        this.addSlideMoves(moves, from, piece, BISHOP_RAYS);
        this.addSlideMoves(moves, from, piece, ROOK_RAYS);
      }
    }
    return moves;
  }

  addMove(moves, from, to, extra = {}) {
    const piece = this.board[from];
    const captured = extra.captured ?? this.board[to];
    moves.push({
      from,
      to,
      piece: piece.type,
      color: piece.color,
      captured: captured ? captured.type : null,
      capturedColor: captured ? captured.color : null,
      promotion: extra.promotion || null,
      flags: extra.flags || "",
      epSquare: extra.epCapture ?? null,
    });
  }

  addPawnMoves(moves, from, piece) {
    const dir = piece.color === "w" ? 8 : -8;
    const startRank = piece.color === "w" ? 1 : 6;
    const promoRank = piece.color === "w" ? 7 : 0;
    const one = from + dir;
    if (one >= 0 && one < 64 && !this.board[one]) {
      if (rankOf(one) === promoRank) {
        for (const promo of ["q", "r", "b", "n"]) {
          this.addMove(moves, from, one, { flags: "p", promotion: promo });
        }
      } else {
        this.addMove(moves, from, one);
        const two = from + dir * 2;
        if (rankOf(from) === startRank && !this.board[two]) {
          this.addMove(moves, from, two, { flags: "b" });
        }
      }
    }
    for (const df of [-1, 1]) {
      const to = from + dir + df;
      if (to < 0 || to > 63 || Math.abs(fileOf(to) - fileOf(from)) !== 1) continue;
      const target = this.board[to];
      if (target && target.color !== piece.color) {
        if (rankOf(to) === promoRank) {
          for (const promo of ["q", "r", "b", "n"]) {
            this.addMove(moves, from, to, { flags: "cp", promotion: promo });
          }
        } else {
          this.addMove(moves, from, to, { flags: "c" });
        }
      } else if (this.epSquare === to) {
        const capSq = to - dir;
        const cap = this.board[capSq];
        if (cap && cap.type === "p" && cap.color !== piece.color) {
          this.addMove(moves, from, to, {
            flags: "e",
            captured: cap,
            epCapture: capSq,
          });
        }
      }
    }
  }

  addLeapMoves(moves, from, piece, offsets) {
    for (const off of offsets) {
      const to = from + off;
      if (!onBoard(from, to, off)) continue;
      const target = this.board[to];
      if (!target) this.addMove(moves, from, to);
      else if (target.color !== piece.color) this.addMove(moves, from, to, { flags: "c" });
    }
  }

  addSlideMoves(moves, from, piece, rays) {
    for (const ray of rays) {
      let to = from + ray;
      let prev = from;
      while (onBoard(prev, to, ray)) {
        const target = this.board[to];
        if (!target) {
          this.addMove(moves, from, to);
        } else {
          if (target.color !== piece.color) this.addMove(moves, from, to, { flags: "c" });
          break;
        }
        prev = to;
        to += ray;
      }
    }
  }

  addKingMoves(moves, from, piece) {
    this.addLeapMoves(moves, from, piece, KING_OFFSETS);
    if (this.inCheck(piece.color)) return;
    const enemy = piece.color === "w" ? "b" : "w";
    if (piece.color === "w") {
      if (this.castling.wK) this.tryCastle(moves, from, 6, [5, 6], enemy, "K");
      if (this.castling.wQ) this.tryCastle(moves, from, 2, [1, 2, 3], enemy, "Q");
    } else {
      if (this.castling.bK) this.tryCastle(moves, from, 62, [61, 62], enemy, "k");
      if (this.castling.bQ) this.tryCastle(moves, from, 58, [57, 58, 59], enemy, "q");
    }
  }

  tryCastle(moves, from, to, path, enemy, flag) {
    for (const sq of path) {
      if (this.board[sq]) return;
    }
    const through = to > from ? from + 1 : from - 1;
    if (this.isAttacked(through, enemy) || this.isAttacked(to, enemy)) return;
    this.addMove(moves, from, to, { flags: flag });
  }

  legalMoves() {
    const legal = [];
    for (const move of this.generatePseudoMoves()) {
      const snap = this.snapshot();
      this.applyMove(move);
      const ok = !this.inCheck(move.color);
      this.restore(snap);
      if (ok) legal.push(move);
    }
    return legal;
  }

  movesFrom(sq) {
    return this.legalMoves().filter((m) => m.from === sq);
  }

  applyMove(move) {
    const piece = this.board[move.from];
    this.board[move.from] = null;
    if (move.flags.includes("e")) {
      this.board[move.epSquare] = null;
    }
    this.board[move.to] = move.promotion
      ? { type: move.promotion, color: piece.color }
      : piece;

    if (move.flags === "K") {
      this.board[5] = this.board[7];
      this.board[7] = null;
    } else if (move.flags === "Q") {
      this.board[3] = this.board[0];
      this.board[0] = null;
    } else if (move.flags === "k") {
      this.board[61] = this.board[63];
      this.board[63] = null;
    } else if (move.flags === "q") {
      this.board[59] = this.board[56];
      this.board[56] = null;
    }

    this.updateCastling(move, piece);
    this.epSquare = move.flags.includes("b") ? (move.from + move.to) >> 1 : null;

    if (piece.type === "p" || move.captured) this.halfmove = 0;
    else this.halfmove += 1;
    if (piece.color === "b") this.fullmove += 1;
    this.turn = piece.color === "w" ? "b" : "w";
  }

  updateCastling(move, piece) {
    if (piece.type === "k") {
      if (piece.color === "w") {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
    }
    if (piece.type === "r") {
      if (move.from === 0) this.castling.wQ = false;
      if (move.from === 7) this.castling.wK = false;
      if (move.from === 56) this.castling.bQ = false;
      if (move.from === 63) this.castling.bK = false;
    }
    if (move.to === 0) this.castling.wQ = false;
    if (move.to === 7) this.castling.wK = false;
    if (move.to === 56) this.castling.bQ = false;
    if (move.to === 63) this.castling.bK = false;
  }

  positionKey() {
    let board = "";
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      board += p ? p.color + p.type : ".";
    }
    const c =
      (this.castling.wK ? "K" : "") +
      (this.castling.wQ ? "Q" : "") +
      (this.castling.bK ? "k" : "") +
      (this.castling.bQ ? "q" : "");
    return `${board} ${this.turn} ${c || "-"} ${this.epSquare ?? "-"}`;
  }

  recordPosition() {
    const key = this.positionKey();
    this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
  }

  move(from, to, promotion = "q") {
    const legal = this.legalMoves().filter((m) => {
      if (m.from !== from || m.to !== to) return false;
      if (m.promotion) return m.promotion === promotion;
      return true;
    });
    if (!legal.length) return null;
    const move = legal[0];
    const before = this.snapshot();
    this.applyMove(move);
    this.history.push({ move, before });
    this.recordPosition();
    return move;
  }

  undo() {
    const last = this.history.pop();
    if (!last) return null;
    const key = this.positionKey();
    this.positionCounts[key] = Math.max(0, (this.positionCounts[key] || 1) - 1);
    this.restore(last.before);
    return last.move;
  }

  insufficientMaterial() {
    const pieces = this.board.filter(Boolean);
    const nonKing = pieces.filter((p) => p.type !== "k");
    if (nonKing.length === 0) return true;
    if (nonKing.length === 1 && (nonKing[0].type === "n" || nonKing[0].type === "b")) {
      return true;
    }
    if (nonKing.length === 2 && nonKing.every((p) => p.type === "n" || p.type === "b")) {
      const bishops = nonKing.filter((p) => p.type === "b");
      if (bishops.length === 2) {
        const squares = [];
        this.board.forEach((p, sq) => {
          if (p && p.type === "b") squares.push((fileOf(sq) + rankOf(sq)) % 2);
        });
        return squares[0] === squares[1];
      }
    }
    return false;
  }

  status() {
    const moves = this.legalMoves();
    const check = this.inCheck();
    if (!moves.length) {
      return check ? "checkmate" : "stalemate";
    }
    if (this.halfmove >= 100) return "fifty";
    if (this.insufficientMaterial()) return "material";
    if ((this.positionCounts[this.positionKey()] || 0) >= 3) return "threefold";
    if (check) return "check";
    return "playing";
  }

  evaluate() {
    let score = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = this.board[sq];
      if (!p) continue;
      const val = PIECE_VALUES[p.type];
      const center =
        3.5 - Math.abs(fileOf(sq) - 3.5) + (3.5 - Math.abs(rankOf(sq) - 3.5));
      const bonus = p.type === "k" ? 0 : center * 4;
      score += p.color === "w" ? val + bonus : -(val + bonus);
    }
    return this.turn === "w" ? score : -score;
  }
}

function san(game, move) {
  const piece = move.piece === "p" ? "" : move.piece.toUpperCase();
  const capture = move.captured || move.flags.includes("e") ? "x" : "";
  const dest = algebraic(move.to);
  let text;
  if (move.flags === "K" || move.flags === "k") text = "O-O";
  else if (move.flags === "Q" || move.flags === "q") text = "O-O-O";
  else if (move.piece === "p" && capture) text = FILES[fileOf(move.from)] + "x" + dest;
  else text = piece + (capture && piece ? "x" : capture) + dest;
  if (move.promotion) text += "=" + move.promotion.toUpperCase();
  const snapshot = game.snapshot();
  game.applyMove(move);
  if (game.status() === "checkmate") text += "#";
  else if (game.inCheck()) text += "+";
  game.restore(snapshot);
  return text;
}
