import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  FILM_FEN,
  FILM_MOVES,
  chooseMove,
  captureSquare,
  statusText,
} from '../src/chess-engine.js';

test('film consists of five legal captures including pawn, knight and queen attacks', () => {
  const game = new Chess(FILM_FEN);
  let captures = 0;
  for (const san of FILM_MOVES) {
    const m = game.move(san);
    assert.ok(m);
    if (m.captured) captures++;
  }
  assert.equal(captures, 5);
  assert.equal(game.get('d5').type, 'q');
  assert.equal(game.get('d5').color, 'w');
});
test('computer returns legal moves for both colors over a match', () => {
  const game = new Chess();
  for (let i = 0; i < 60 && !game.isGameOver(); i++) {
    const move = chooseMove(game.fen(), 2);
    assert.ok(move);
    assert.ok(game.move(move));
  }
  assert.ok(game.history().length > 10);
});
test('computer finds mate in one and reports the winner', () => {
  const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
  game.move(chooseMove(game.fen(), 2));
  assert.equal(game.isCheckmate(), true);
  assert.equal(statusText(game), 'Ivory wins · Checkmate');
});
test('en passant destroys the pawn beside the destination', () => {
  const game = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const move = game.move('exd6');
  assert.equal(captureSquare(move), 'd5');
  assert.equal(game.get('d5'), undefined);
  assert.equal(game.get('d6').type, 'p');
});
test('castling flags and all four promotion choices are available', () => {
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(castle.move('O-O').flags.includes('k'));
  assert.equal(castle.get('f1').type, 'r');
  for (const p of ['q', 'r', 'b', 'n']) {
    const game = new Chess('7k/P7/8/8/8/8/8/4K3 w - - 0 1');
    game.move({ from: 'a7', to: 'a8', promotion: p });
    assert.equal(game.get('a8').type, p);
  }
});
test('stalemate is a draw and engine has no move', () => {
  const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(statusText(game), 'Draw · Stalemate');
  assert.equal(chooseMove(game.fen()), null);
});
test('sapphire punishes an exposed king with the legal mating move', () => {
  const game = new Chess();
  for (const san of ['f3', 'e5', 'g4']) game.move(san);
  const move = game.move(chooseMove(game.fen(), 2));
  assert.equal(move.san, 'Qh4#');
  assert.equal(statusText(game), 'Sapphire wins · Checkmate');
});

test('variety selects different legal near-best openings without dropping forced mate', () => {
  const fen = new Chess().fen();
  const choices = [0, 0.3, 0.6, 0.99].map((random) =>
    chooseMove(fen, 2, { variety: 18, random: () => random }),
  );
  assert.ok(new Set(choices.map((m) => m.from + m.to)).size > 1);
  for (const move of choices) assert.ok(new Chess(fen).move(move));
  for (const random of [0, 0.99]) {
    const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    game.move(chooseMove(game.fen(), 2, { variety: 18, random: () => random }));
    assert.equal(game.isCheckmate(), true);
  }
});
test('search preserves actual repetition history instead of reconstructing only FEN', () => {
  const game = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  assert.equal(game.isThreefoldRepetition(), true);
  assert.equal(chooseMove(game.fen(), 2, { pgn: game.pgn(), variety: 18 }), null);
});
