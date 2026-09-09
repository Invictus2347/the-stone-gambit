import './style.css';
import { Chess } from 'chess.js';
import { ChessScene, squarePosition } from './scene.js';
import { statusText } from './chess-engine.js';
import { StoneAudio } from './audio.js';
import { FilmDirector, filmCopy } from './film.js';
import { FILM_DURATION, FILM_OUTRO, filmSlate } from './film-timeline.js';
import { leaveReview } from './playback-state.js';
import { boardSquares, renderMoveBoard } from './move-board.js';

document.querySelector('#app').innerHTML = `
  <main id="stage" aria-label="Interactive 3D chessboard"></main>
  <div id="loading"><div class="eyebrow">AN ENCHANTED CHESS EXPERIENCE</div><h1>The Stone Gambit</h1><p id="load-label">Carving the armies…</p><div class="load-track"><span id="load-progress"></span></div></div>
  <header><a class="brand" href="#" aria-label="The Stone Gambit"><span class="seal">♞</span><span>THE STONE<br>GAMBIT</span></a><div class="header-right"><span class="edition">A WIZARD’S CHESS EXPERIENCE</span><button id="sound" class="quiet" aria-pressed="false">Sound off</button><button id="settings-toggle" class="quiet" aria-expanded="false">Settings</button></div></header>
  <section class="intro"><div class="eyebrow">SAPPHIRE & IVORY</div><h1>Let the<br>stone awaken.</h1><p>A game of patience.<br>A battle of living stone.</p></section>
  <aside class="match-panel"><div class="eyebrow" id="mode-label">PLAY THE IVORY ARMY</div><div class="player"><span class="player-dot ivory"></span><span>Ivory</span><small id="white-kind">YOU</small></div><div class="player"><span class="player-dot sapphire"></span><span>Sapphire</span><small>COMPUTER</small></div><div class="divider"></div><p id="status" aria-live="polite">Ivory to move</p><div id="last-move">The first move is yours.</div><ol id="moves" aria-label="Recent moves"></ol><div id="legal-moves" aria-label="Legal destinations" hidden></div></aside>
  <footer><div class="hint" id="hint" aria-live="polite"><span class="tiny-cross">＋</span> <span id="hint-main">You are ivory. Click a pawn or knight to begin.</span><small id="hint-detail">Then click a highlighted square · Drag to orbit</small></div><div class="actions"><button id="play" class="primary">Play chess</button><button id="watch" class="quiet">Watch AI vs AI</button><button id="film" class="quiet"><span>▶</span> Watch the 40s film</button></div></footer>
  <section id="settings" hidden><h2>The chamber</h2><label><input type="checkbox" id="cinematic" checked> Cinematic captures</label><label><input type="checkbox" id="motion"> Reduce motion</label><label><input type="checkbox" id="quality"> Performance mode</label><button id="camera" class="quiet">Reset camera</button><button id="record" class="primary">Record 40s film</button><p>Records this 3D scene with original sound. Keep this tab visible.</p><button id="close-settings" class="quiet">Close</button></section>
  <div id="film-ui" hidden><div class="film-brand">THE STONE GAMBIT <span>LEGAL CHESS REPLAY</span></div><div class="film-copy"><span id="film-line-one"></span><br><span id="film-line-two"></span></div><button id="exit-film" class="quiet">Exit film · Esc</button><div id="film-progress"></div></div>
  <dialog id="promotion"><h2>A new form awaits.</h2><p>Choose your promoted piece.</p><div>${[
    ['q', 'Queen'],
    ['r', 'Rook'],
    ['b', 'Bishop'],
    ['n', 'Knight'],
  ]
    .map(([p, n]) => `<button data-promotion="${p}" class="quiet">${n}</button>`)
    .join('')}</div></dialog>
  <dialog id="game-over"><div class="eyebrow">THE FINAL MOVE</div><h2 id="result"></h2><button id="again" class="primary">Play again</button></dialog>
`;
const $ = (s) => document.querySelector(s),
  chess = new Chess(),
  audio = new StoneAudio();
const credits = document.createElement('a');
credits.href = '/credits.txt';
credits.textContent = 'Asset credits';
credits.className = 'quiet';
credits.target = '_blank';
credits.rel = 'noopener';
document.querySelector('.header-right').append(credits);
let scene,
  mode = 'human',
  resumeMode = 'human',
  selected = null,
  pendingPromotion = null,
  requestId = 0,
  thinking = false,
  ready = false,
  nextAI = 0,
  lastTime = 0;
const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
const engine = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
const moveBoard = document.createElement('dialog');
moveBoard.id = 'move-board';
moveBoard.setAttribute('aria-labelledby', 'board-title');
moveBoard.innerHTML =
  '<h2 id="board-title">Make your move.</h2><p id="board-status" aria-live="polite">Select an ivory piece, then a highlighted square.</p><div id="square-buttons" aria-label="Chess square controls"></div><button id="close-board" class="quiet">Back to 3D board</button>';
$('#app').append(moveBoard);
for (const { square } of boardSquares(chess, null)) {
  const button = document.createElement('button');
  button.onclick = () => chooseSquare(square);
  $('#square-buttons').append(button);
}
const boardToggle = document.createElement('button');
boardToggle.id = 'board-toggle';
boardToggle.className = 'quiet';
boardToggle.textContent = 'Move board';
$('#play').after(boardToggle);
boardToggle.onclick = () => {
  refresh();
  moveBoard.showModal();
};
$('#close-board').onclick = () => moveBoard.close();

function refresh() {
  $('#status').textContent = thinking
    ? `${chess.turn() === 'w' ? 'Ivory' : 'Sapphire'} is thinking…`
    : statusText(chess);
  const history = chess.history();
  $('#last-move').textContent = history.length
    ? `Last move · ${history.at(-1)}`
    : 'The first move is yours.';
  $('#moves').innerHTML = history
    .slice(-8)
    .map(
      (m, i) =>
        `<li><span>${Math.floor((history.length - Math.min(8, history.length) + i) / 2) + 1}${(history.length - Math.min(8, history.length) + i) % 2 ? '…' : '.'}</span>${m}</li>`,
    )
    .join('');
  $('#white-kind').textContent = mode === 'auto' ? 'COMPUTER' : 'YOU';
  $('#mode-label').textContent = mode === 'auto' ? 'COMPUTER VS COMPUTER' : 'PLAY THE IVORY ARMY';
  $('#watch').textContent = mode === 'auto' ? 'Stop autoplay' : 'Watch AI vs AI';
  $('#play').textContent = history.length ? 'New game' : 'Play chess';
  const moves = selected ? chess.moves({ square: selected, verbose: true }) : [];
  $('#legal-moves').hidden = !selected;
  $('#legal-moves').replaceChildren();
  for (const to of new Set(moves.map((m) => m.to))) {
    const button = document.createElement('button');
    button.className = 'quiet';
    button.textContent = to.toUpperCase();
    button.setAttribute('aria-label', `Move ${selected} to ${to}`);
    button.onclick = () => chooseSquare(to);
    $('#legal-moves').append(button);
  }
  if (selected) {
    $('#hint-main').textContent =
      `${pieceNames[chess.get(selected).type]} on ${selected.toUpperCase()}${moves.length ? ' — choose a highlighted square.' : ' has no legal moves.'}`;
    $('#hint-detail').textContent = moves.length
      ? 'Click the board or a destination button on the right.'
      : 'Choose another ivory piece, such as a pawn or knight.';
  } else {
    $('#hint-main').textContent =
      mode === 'auto'
        ? 'Watching computer vs computer.'
        : chess.isGameOver()
          ? statusText(chess)
          : chess.turn() === 'b'
            ? 'Sapphire is taking its turn.'
            : 'You are ivory. Click a pawn or knight to begin.';
    if (history.length && mode === 'human' && chess.turn() === 'w' && !chess.isGameOver())
      $('#hint-main').textContent = 'Your turn. Select an ivory piece.';
    $('#hint-detail').textContent =
      mode === 'auto'
        ? 'Stop autoplay to take control of ivory.'
        : 'Then click a highlighted square · Drag to orbit';
  }
  $('#board-status').textContent = $('#hint-main').textContent;
  renderMoveBoard(
    $('#square-buttons'),
    chess,
    selected,
    !ready ||
      !!scene?.capture ||
      film.active ||
      thinking ||
      !!pendingPromotion ||
      mode === 'auto' ||
      chess.turn() !== 'w' ||
      chess.isGameOver(),
  );
}
function perform(move) {
  if (scene.capture || film.active || chess.isGameOver()) return false;
  let result;
  try {
    result = chess.move(move);
  } catch {
    return false;
  }
  if (!result) return false;
  selected = null;
  moveBoard.close();
  scene.startMove(result, scene.reduced ? 0.8 : result.captured ? undefined : 1.1);
  audio.slide();
  refresh();
  return true;
}
function reset(auto = false) {
  if (!ready || film.recording) return;
  leaveReview(window.stoneGambit, location, history, document.body);
  requestId++;
  thinking = false;
  nextAI = 0;
  selected = null;
  film.stop();
  mode = auto ? 'auto' : 'human';
  chess.reset();
  scene.sync(chess);
  scene.resetCamera();
  $('#game-over').close();
  $('#promotion').close();
  moveBoard.close();
  pendingPromotion = null;
  refresh();
}
function queueAI() {
  if (!ready || thinking || scene.capture || film.active || chess.isGameOver()) return;
  if (mode === 'film') return;
  if (mode === 'human' && chess.turn() === 'w') return;
  thinking = true;
  refresh();
  engine.postMessage({ id: ++requestId, fen: chess.fen(), pgn: chess.pgn(), depth: 2 });
}
engine.onmessage = ({ data }) => {
  if (data.id !== requestId) return;
  thinking = false;
  if (data.move) perform(data.move);
  else refresh();
};
engine.onerror = () => {
  thinking = false;
  $('#status').textContent = 'The opponent could not load. Try New game.';
};

try {
  scene = new ChessScene($('#stage'));
} catch (error) {
  $('#load-label').textContent =
    'WebGL could not start. Please use a browser with hardware acceleration.';
  throw error;
}
scene.hitCallback = () => audio.hit();
scene.swingCallback = () => audio.swing();
const film = new FilmDirector(scene, chess, audio, (active, t) => {
  document.body.classList.toggle('filming', active);
  $('#film-ui').hidden = !active;
  if (active) {
    const copy = filmCopy(t);
    $('#film-line-one').textContent = copy[0];
    $('#film-line-two').textContent = copy[1];
    $('#film-progress').style.width = `${(t / FILM_DURATION) * 100}%`;
    $('.film-brand').firstChild.textContent = 'ASTRA / PROMPT TO PLAYABLE ';
    $('.film-brand span').textContent = filmSlate(film);
    document.body.classList.toggle('film-intro', t < 4);
    document.body.classList.toggle('film-outro', t >= FILM_OUTRO);
  } else {
    leaveReview(window.stoneGambit, location, history, document.body);
    selected = null;
    if (mode === 'film') mode = resumeMode;
    refresh();
  }
});

let down;
function chooseSquare(square) {
  if (
    !ready ||
    scene.capture ||
    film.active ||
    thinking ||
    pendingPromotion ||
    mode === 'auto' ||
    chess.turn() !== 'w' ||
    chess.isGameOver() ||
    !square
  )
    return;
  if (selected) {
    const moves = chess.moves({ square: selected, verbose: true }).filter((m) => m.to === square);
    if (moves.length) {
      if (moves.some((m) => m.promotion)) {
        pendingPromotion = { from: selected, to: square };
        moveBoard.close();
        $('#promotion').showModal();
        return;
      }
      perform({ from: selected, to: square });
      return;
    }
  }
  const p = chess.get(square);
  if (p && p.color === chess.turn()) {
    selected = square;
    scene.highlight(square, chess.moves({ square, verbose: true }));
  } else {
    selected = null;
    scene.clearHighlights();
  }
  refresh();
}
scene.renderer.domElement.addEventListener('pointerdown', (e) => {
  down = e.button === 0 ? [e.clientX, e.clientY] : null;
});
scene.renderer.domElement.addEventListener('pointercancel', () => {
  down = null;
});
scene.renderer.domElement.addEventListener('pointerup', (e) => {
  const start = down;
  down = null;
  if (!start || e.button !== 0 || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6)
    return;
  chooseSquare(scene.pick(e.clientX, e.clientY));
});
document.querySelectorAll('[data-promotion]').forEach((b) =>
  b.addEventListener('click', () => {
    if (pendingPromotion) perform({ ...pendingPromotion, promotion: b.dataset.promotion });
    pendingPromotion = null;
    $('#promotion').close();
  }),
);
$('#play').onclick = () => reset();
$('#again').onclick = () => reset();
$('#watch').onclick = () => {
  if (mode === 'auto') {
    mode = 'human';
    requestId++;
    thinking = false;
    refresh();
  } else reset(true);
};
$('#film').onclick = async () => {
  if (!ready || film.active || film.recording || mode === 'film') return;
  requestId++;
  thinking = false;
  resumeMode = mode;
  mode = 'film';
  try {
    await audio.init();
    $('#sound').textContent = 'Sound on';
    $('#sound').setAttribute('aria-pressed', 'true');
    await scene.fracturesReady;
    if (mode !== 'film') return;
    film.start();
  } catch (error) {
    mode = resumeMode;
    refresh();
    $('#status').textContent = `Could not start the film: ${error.message}`;
  }
};
$('#exit-film').onclick = () => {
  if (!film.recording) film.stop();
};
$('#record').onclick = async () => {
  if (!ready || film.recording) return;
  requestId++;
  thinking = false;
  resumeMode = mode;
  mode = 'film';
  $('#settings').hidden = true;
  $('#record').disabled = true;
  try {
    await film.record();
  } catch (e) {
    $('#status').textContent = e.message;
  } finally {
    if (!film.active) mode = resumeMode;
    $('#record').disabled = false;
  }
};
$('#sound').onclick = async () => {
  if (audio.enabled) audio.mute();
  else await audio.init();
  $('#sound').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  $('#sound').setAttribute('aria-pressed', String(audio.enabled));
};
$('#settings-toggle').onclick = () => {
  $('#settings').hidden = !$('#settings').hidden;
  $('#settings-toggle').setAttribute('aria-expanded', String(!$('#settings').hidden));
};
$('#close-settings').onclick = () => {
  $('#settings').hidden = true;
  $('#settings-toggle').setAttribute('aria-expanded', 'false');
};
$('#cinematic').onchange = (e) => (scene.cinematic = e.target.checked);
$('#motion').onchange = (e) => {
  scene.reduced = e.target.checked;
};
$('#quality').checked = true;
$('#quality').onchange = (e) => scene.setQuality(e.target.checked);
$('#camera').onclick = () => scene.resetCamera();
$('#promotion').addEventListener('cancel', () => {
  pendingPromotion = null;
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !film.recording) {
    if (film.active) film.stop();
    selected = null;
    scene.clearHighlights();
    refresh();
  }
  if (e.key === 'Home') scene.resetCamera();
});
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  scene.reduced = true;
  $('#motion').checked = true;
}
document.addEventListener('visibilitychange', () => {
  lastTime = performance.now();
});

function loop(time) {
  requestAnimationFrame(loop);
  const frameMs = time - lastTime;
  const dt = Math.min((time - lastTime) / 1000, 0.06) || 0.016;
  lastTime = time;
  if (document.hidden || window.stoneGambit?.manual || film.offline) return;
  if (ready && !film.recording) scene.adaptQuality(frameMs);
  if (ready) {
    film.update(dt);
    const finished = scene.update(dt);
    if (finished && !film.active) {
      nextAI = time + 550;
      refresh();
      if (chess.isGameOver()) {
        $('#result').textContent = statusText(chess);
        $('#game-over').showModal();
      }
    }
    if (time > nextAI) queueAI();
  }
  scene.render();
  if (import.meta.env.DEV) {
    const stage = $('#stage');
    stage.dataset.frameMs = String(frameMs);
    stage.dataset.drawCalls = String(scene.renderer.info.render.calls);
    stage.dataset.triangles = String(scene.renderer.info.render.triangles);
    stage.dataset.pixelRatio = String(scene.renderer.getPixelRatio());
  }
}
requestAnimationFrame(loop);
scene
  .load((progress) => {
    $('#load-progress').style.width = `${progress * 100}%`;
  })
  .then(async () => {
    scene.sync(chess);
    scene.resetCamera();
    ready = true;
    $('#loading').classList.add('loaded');
    setTimeout(() => $('#loading').remove(), 700);
    refresh();
    // Inspection hooks are local development tools, not a production interface.
    if (import.meta.env.DEV) {
      window.stoneGambit = {
        scene,
        chess,
        film,
        ready: true,
        manual: false,
        move: perform,
        reset,
        record: () => film.record(),
        state: () => ({
          fen: chess.fen(),
          pieces: scene.pieces.size,
          animating: !!scene.capture,
          mode,
          thinking,
          film: film.active,
        }),
        squareScreen(square) {
          const p = squarePosition(square),
            piece = scene.pieces.get(square);
          p.y = 0.3;
          if (piece?.userData.parts.Body) {
            piece.userData.parts.Body.o.getWorldPosition(p);
            p.y += 0.6;
          }
          p.project(scene.camera);
          return { x: ((p.x + 1) * innerWidth) / 2, y: ((1 - p.y) * innerHeight) / 2 };
        },
        loadPosition(fen) {
          requestId++;
          thinking = false;
          mode = 'human';
          chess.load(fen);
          scene.sync(chess);
          refresh();
        },
        beginOfflineFilm() {
          requestId++;
          thinking = false;
          mode = 'film';
          this.manual = true;
          film.recording = true;
          film.start();
          scene.clock = 0;
        },
        stepFilm(dt = 1 / 30) {
          film.update(dt);
          scene.update(dt);
          scene.render();
          return film.time;
        },
      };
    }
    const review = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    if (import.meta.env.DEV && review.has('motion-review')) {
      const { installCombatReview } = await import('./combat-review.js');
      installCombatReview(window.stoneGambit);
      return;
    }
    if (['p', 'n', 'b', 'r', 'q', 'k'].includes(review.get('sculpture'))) {
      const type = review.get('sculpture');
      chess.load(`7k/8/8/8/4${type.toUpperCase()}3/8/8/${type === 'k' ? '8' : 'K7'} w - - 0 1`);
      scene.sync(chess);
      for (const [square, piece] of scene.pieces) if (square !== 'e4') piece.visible = false;
      const p = scene.pieces.get('e4');
      scene.controls.minDistance = 2;
      scene.controls.enableDamping = false;
      scene.camera.position.copy(p.position).add({ x: 4.6, y: type === 'p' ? 3.8 : 4.7, z: -6.8 });
      scene.controls.target.copy(p.position).add({ x: 0, y: type === 'p' ? 1.6 : 2.5, z: 0 });
      scene.controls.update();
      document.body.classList.add('sculpture-review');
    }
    if (review.has('frame')) {
      const t = Math.max(0, Math.min(FILM_DURATION - 0.1, Number(review.get('frame')) || 0));
      window.stoneGambit.manual = true;
      film.start();
      for (let elapsed = 0; elapsed < t; elapsed += 1 / 30) {
        const dt = Math.min(1 / 30, t - elapsed);
        film.update(dt);
        scene.update(dt);
      }
      scene.render();
    } else if (review.has('film')) {
      $('#film').click();
    }
  })
  .catch((error) => {
    $('#load-label').textContent =
      `Could not load the sculptures: ${error.message}. Check your connection and reload. For local setup, see the README.`;
  });
