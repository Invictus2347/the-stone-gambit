import { chooseMove } from './chess-engine.js';
self.onmessage = ({ data }) =>
  self.postMessage({
    id: data.id,
    move: chooseMove(data.fen, data.depth, { variety: 18, pgn: data.pgn }),
  });
