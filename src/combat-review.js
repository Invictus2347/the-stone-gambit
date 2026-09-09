import * as THREE from 'three';
import { FILM_STUDIES } from './film-timeline.js';
import { squarePosition } from './scene.js';

// Development-only visual QA. Every pose goes through the real capture path;
// there is no alternate animation or hand-positioning code in this inspector.
export function installCombatReview(app) {
  const { scene, chess } = app;
  app.manual = true;
  document.body.classList.add('sculpture-review');
  let index = 0,
    time = 0,
    playing = false,
    angle = 1,
    last = performance.now();
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Animation review');
  panel.style.cssText =
    'position:fixed;z-index:10;bottom:16px;left:24px;right:24px;padding:14px;background:#0a1424ed;border:1px solid #63718a;color:#dfe8ee;font:12px Manrope;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
  const label = document.createElement('span');
  label.style.minWidth = '170px';
  panel.append(label);
  function button(text, action) {
    const b = document.createElement('button');
    b.className = 'quiet';
    b.textContent = text;
    b.onclick = action;
    panel.append(b);
    return b;
  }
  function camera() {
    const move = chess.history({ verbose: true }).at(-1),
      to = squarePosition(move.to),
      from = squarePosition(move.from),
      dir = to.clone().sub(from).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x),
      mid = to.clone().addScaledVector(dir, -1.1).setY(2.4);
    scene.camera.position
      .copy(mid)
      .addScaledVector(side, angle * 8.7)
      .addScaledVector(dir, -2.8)
      .add(new THREE.Vector3(0, 2.1, 0));
    scene.camera.fov = 42;
    scene.camera.updateProjectionMatrix();
    scene.controls.target.copy(mid);
    scene.render();
  }
  function seek(t) {
    playing = false;
    time = t;
    chess.load(FILM_STUDIES[index].fen);
    scene.sync(chess);
    scene.film = true;
    scene.startMove(chess.move(FILM_STUDIES[index].san), 5.8);
    for (let elapsed = 0; elapsed < t * 5.8; elapsed += 1 / 60)
      scene.update(Math.min(1 / 60, t * 5.8 - elapsed));
    camera();
    label.textContent = `${FILM_STUDIES[index].name} · ${Math.round(t * 100)}%`;
    play.textContent = 'Play attack';
  }
  for (const [i, study] of FILM_STUDIES.entries())
    button(study.name, () => {
      index = i;
      seek(0);
    });
  for (const [name, t] of [
    ['Rest', 0],
    ['Draw', 0.35],
    ['Wind-up', 0.52],
    ['Contact', 0.675],
    ['Follow-through', 0.73],
    ['Settle', 0.9],
  ])
    button(name, () => seek(t));
  const play = button('Play attack', () => {
    if (playing) {
      playing = false;
      play.textContent = 'Play attack';
    } else {
      seek(0);
      playing = true;
      last = performance.now();
      play.textContent = 'Pause attack';
    }
  });
  button('Reverse angle', () => {
    angle *= -1;
    camera();
  });
  button('Return to game', () => location.assign('/'));
  document.body.append(panel);
  seek(0);
  function tick(now) {
    requestAnimationFrame(tick);
    if (playing && !document.hidden) {
      const dt = Math.min((now - last) / 1000, 0.05);
      time = Math.min(1, time + dt / 5.8);
      scene.update(dt);
      scene.render();
      label.textContent = `${FILM_STUDIES[index].name} · ${Math.round(time * 100)}%`;
      if (time >= 1) {
        playing = false;
        play.textContent = 'Play attack';
      }
    }
    last = now;
  }
  requestAnimationFrame(tick);
}
