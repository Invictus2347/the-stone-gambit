import { Chess } from 'chess.js';

// Legal midgame replay; retain the armies so viewers can read the actual board.
export const FILM_FEN = 'r1bqkb1r/ppp2ppp/2n2n2/3pp3/2B1P3/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 6';
export const FILM_MOVES = ['exd5', 'Nxd5', 'Bxd5', 'Qxd5', 'Qxd5'];
const value = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };

function evaluate(chess) {
  if (chess.isCheckmate()) return -100000;
  if (chess.isDraw()) return 0;
  let result = 0;
  for (const row of chess.board())
    for (const p of row)
      if (p) {
        const f = p.square.charCodeAt(0) - 97,
          r = Number(p.square[1]) - 1;
        const center = 3.5 - Math.abs(3.5 - f) + 3.5 - Math.abs(3.5 - r);
        const advance = p.color === 'w' ? r : 7 - r;
        const score =
          value[p.type] + center * (p.type === 'n' ? 12 : 4) + (p.type === 'p' ? advance * 8 : 0);
        result += p.color === chess.turn() ? score : -score;
      }
  return result;
}

function ordered(chess) {
  return chess
    .moves({ verbose: true })
    .sort(
      (a, b) =>
        (value[b.captured] || 0) * 10 -
        (value[b.piece] || 0) +
        (b.san.includes('+') ? 50 : 0) -
        ((value[a.captured] || 0) * 10 - (value[a.piece] || 0) + (a.san.includes('+') ? 50 : 0)),
    );
}

export function chooseMove(fen, depth = 2, { variety = 0, random = Math.random, pgn } = {}) {
  const chess = new Chess(fen);
  if (pgn) {
    chess.loadPgn(pgn);
    if (chess.fen() !== fen) throw new Error('Search history does not match the position');
  }
  if (chess.isGameOver()) return null;
  function search(d, alpha, beta) {
    if (d === 0 || chess.isGameOver()) return evaluate(chess);
    let best = -Infinity;
    for (const move of ordered(chess)) {
      chess.move(move);
      const score = -search(d - 1, -beta, -alpha);
      chess.undo();
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = -Infinity,
    selected = null;
  const candidates = [];
  for (const m of ordered(chess)) {
    chess.move(m);
    const score = -search(depth - 1, -Infinity, Infinity);
    chess.undo();
    candidates.push({ move: { from: m.from, to: m.to, promotion: m.promotion }, score });
    if (score > best) {
      best = score;
      selected = { from: m.from, to: m.to, promotion: m.promotion };
    }
  }
  if (variety > 0 && selected) {
    // Never trade a forced mate for variety. Noise is limited to root choices,
    // not injected into the search, so tactical evaluations remain consistent.
    const tolerance = Math.abs(best) > 90000 ? 0 : Math.min(24, variety);
    const choices = candidates.filter((candidate) => candidate.score >= best - tolerance);
    return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]
      .move;
  }
  return selected;
}

export function captureSquare(move) {
  return move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
}

export function statusText(chess) {
  if (chess.isCheckmate()) return `${chess.turn() === 'w' ? 'Sapphire' : 'Ivory'} wins · Checkmate`;
  if (chess.isStalemate()) return 'Draw · Stalemate';
  if (chess.isThreefoldRepetition()) return 'Draw · Threefold repetition';
  if (chess.isInsufficientMaterial()) return 'Draw · Insufficient material';
  if (chess.isDraw()) return 'Draw';
  return `${chess.turn() === 'w' ? 'Ivory' : 'Sapphire'} to move${chess.isCheck() ? ' · Check' : ''}`;
}
