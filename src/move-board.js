const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const symbols = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

export function boardSquares(chess, selected) {
  const destinations = new Set(
    selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : [],
  );
  return chess.board().flatMap((row, index) =>
    row.map((piece, file) => {
      const square = String.fromCharCode(97 + file) + (8 - index),
        legal = destinations.has(square);
      return {
        square,
        legal,
        selected: square === selected,
        light: (file + 8 - index) % 2 === 0,
        symbol: piece ? symbols[piece.color][piece.type] : legal ? '•' : '',
        label: `${square}${piece ? ` ${piece.color === 'w' ? 'Ivory' : 'Sapphire'} ${names[piece.type]}` : ''}${legal ? ' legal destination' : ''}`,
      };
    }),
  );
}

export function renderMoveBoard(container, chess, selected, disabled) {
  for (const [index, state] of boardSquares(chess, selected).entries()) {
    const button = container.children[index];
    button.innerHTML = `<span aria-hidden="true">${state.symbol}</span><small>${state.square}</small>`;
    button.className = `square ${state.light ? 'light' : 'dark'}${state.legal ? ' legal' : ''}`;
    button.setAttribute('aria-label', state.label);
    button.setAttribute('aria-pressed', String(state.selected));
    button.disabled = disabled;
  }
}
