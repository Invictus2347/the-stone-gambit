export const FILM_DURATION = 40;
export const FILM_OUTRO = 36;
// Separate legal tactical studies, not a fabricated continuous match.
export const FILM_STUDIES = Object.freeze(
  [
    {
      piece: 'p',
      name: 'PAWN',
      fen: '6k1/p6p/8/3n4/4P3/8/P6P/6K1 w - - 0 24',
      san: 'exd5',
      tactic: 'A pawn takes an undefended knight.',
    },
    {
      piece: 'n',
      name: 'KNIGHT',
      fen: '6k1/p6p/2n5/4Q3/8/8/P6P/6K1 b - - 0 24',
      san: 'Nxe5',
      tactic: 'A knight wins the exposed queen.',
    },
    {
      piece: 'b',
      name: 'BISHOP',
      fen: '6k1/p6p/8/4r3/8/2B5/P6P/6K1 w - - 0 24',
      san: 'Bxe5',
      tactic: 'An open diagonal wins a rook.',
    },
    {
      piece: 'r',
      name: 'ROOK',
      fen: '6k1/p6p/8/3b4/4P3/8/P2R3P/6K1 w - - 0 24',
      san: 'Rxd5',
      tactic: 'The rook takes a bishop on a protected square.',
    },
    {
      piece: 'q',
      name: 'QUEEN',
      fen: '6k1/p6p/8/8/4r3/8/P1Q4P/6K1 w - - 0 24',
      san: 'Qxe4',
      tactic: 'The queen claims an undefended rook.',
    },
    {
      piece: 'k',
      name: 'KING',
      fen: '8/p5kp/8/8/3Pb3/3K4/P6P/8 w - - 0 24',
      san: 'Kxe4',
      tactic: 'The king captures the checking bishop safely.',
    },
  ].map(Object.freeze),
);
export const FILM_SHOTS = Object.freeze(
  FILM_STUDIES.map((study, i) => Object.freeze({ ...study, start: 4 + i * 5.3, duration: 5.2 })),
);
export function filmCopy(t) {
  if (t < 1.8) return ['I TESTED ASTRA.', 'One scene I wanted to step inside.'];
  if (t < 4) return ['THE PROMPT', '“Make Harry Potter’s chess scene playable.”'];
  if (t < 9.3) return ['Stone. Then life.', 'A playable board. A world that answers.'];
  if (t < 14.6)
    return ['Every piece. Its own attack.', 'Six characters. One enchanted battlefield.'];
  if (t < 19.9) return ['Read the board.', 'The opening is there. Take it.'];
  if (t < 25.2) return ['Every move has weight.', 'Tactics become choreography.'];
  if (t < 30.5) return ['Command the impossible.', 'Then watch it move.'];
  if (t < FILM_OUTRO) return ['Even the king fights.', 'The threat ends here.'];
  return ['THE STONE GAMBIT', 'From prompt to a world you can play.'];
}
export function filmSlate(film) {
  const shot = FILM_SHOTS[Math.max(0, film.next - 1)],
    move = film.chess.history({ verbose: true }).at(-1);
  return film.next && move
    ? `${String(film.next).padStart(2, '0')} / ${shot.name}   ·   ${move.san}   ${move.from.toUpperCase()} → ${move.to.toUpperCase()}   ·   CAPTURE STUDY`
    : 'THE ASTRA EXPERIMENT';
}
export function cameraBeat(t, index) {
  const profiles = [
    { side: 9.6, y: 4.2, back: -1.8 },
    { side: 10.4, y: 4.8, back: -2.2 },
    { side: 10, y: 5.1, back: 1.5 },
    { side: 10.2, y: 4, back: -1.1 },
    { side: 10, y: 4.4, back: 1.4 },
    { side: 9.6, y: 3.8, back: -1.7 },
  ];
  const p = profiles[(index - 1 + 6) % 6];
  if (t < 0.31) return { ...p, side: 12.8, fov: 46, arc: 0 };
  if (t < 0.56) return { ...p, fov: 42, arc: (t - 0.31) * 0.26 };
  if (t < 0.78) return { ...p, side: p.side + 1, y: p.y - 0.45, fov: 45, arc: 0.065 };
  return { ...p, side: p.side + 1.6, y: p.y + 0.8, fov: 46, arc: 0.065 + (t - 0.78) * 0.15 };
}
