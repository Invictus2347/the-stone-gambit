import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { boardSquares } from '../src/move-board.js';

test('move board exposes all 64 squares, pieces and only legal pawn destinations', () => {
  const chess = new Chess(),
    squares = boardSquares(chess, 'e2');
  assert.equal(squares.length, 64);
  assert.equal(new Set(squares.map((s) => s.square)).size, 64);
  assert.equal(squares[0].square, 'a8');
  assert.equal(squares.at(-1).square, 'h1');
  assert.deepEqual(
    squares
      .filter((s) => s.legal)
      .map((s) => s.square)
      .sort(),
    ['e3', 'e4'],
  );
  assert.equal(squares.find((s) => s.square === 'e2').selected, true);
  assert.match(squares.find((s) => s.square === 'e2').label, /Ivory pawn/);
  assert.equal(squares.find((s) => s.square === 'a1').light, false);
  chess.move('e4');
  chess.move('d5');
  assert.deepEqual(
    boardSquares(chess, 'e4')
      .filter((s) => s.legal)
      .map((s) => s.square)
      .sort(),
    ['d5', 'e5'],
  );
  chess.move('exd5');
  assert.match(boardSquares(chess, null).find((s) => s.square === 'd5').label, /Ivory pawn/);
});

test('square controls expose castling and promotion without inventing legal moves', () => {
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const legal = boardSquares(chess, 'e1')
    .filter((s) => s.legal)
    .map((s) => s.square);
  assert.ok(legal.includes('g1') && legal.includes('c1'));
  chess.load('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(boardSquares(chess, 'a7').filter((s) => s.legal).length, 1);
  assert.equal(boardSquares(chess, 'a7').find((s) => s.legal).square, 'a8');
});
