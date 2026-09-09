import * as THREE from 'three';
import { FILM_FEN } from './chess-engine.js';
import {
  FILM_SHOTS as shots,
  filmCopy,
  cameraBeat,
  FILM_DURATION,
  FILM_OUTRO,
} from './film-timeline.js';
export { filmCopy } from './film-timeline.js';

const ease = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export class FilmDirector {
  constructor(scene, chess, audio, onUI) {
    this.scene = scene;
    this.chess = chess;
    this.audio = audio;
    this.onUI = onUI;
    this.active = false;
    this.time = 0;
    this.next = 0;
  }
  start() {
    if (this.active) return;
    this.savedGame = { pgn: this.chess.pgn(), fen: this.chess.fen() };
    this.savedFov = this.scene.camera.fov;
    this.chess.load(FILM_FEN);
    this.scene.sync(this.chess);
    this.scene.film = true;
    this.scene.controls.enabled = false;
    this.active = true;
    this.time = 0;
    this.next = 0;
    this.audio.atmosphere(
      FILM_DURATION,
      shots.map((s) => s.start - 0.6),
    );
    this.onUI(true, 0);
  }
  stop() {
    this.audio.stopAtmosphere?.();
    this.active = false;
    this.scene.film = false;
    this.scene.controls.enabled = true;
    this.scene.camera.fov = this.savedFov ?? 43;
    this.scene.camera.updateProjectionMatrix();
    if (this.savedGame) {
      this.chess.loadPgn(this.savedGame.pgn);
      if (this.chess.fen() !== this.savedGame.fen) this.chess.load(this.savedGame.fen);
      this.savedGame = null;
      this.scene.sync(this.chess);
    }
    this.scene.resetCamera();
    this.onUI(false, this.time);
  }
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    if (this.next < shots.length && this.time >= shots[this.next].start && !this.scene.capture) {
      const shot = shots[this.next];
      this.chess.load(shot.fen);
      this.scene.sync(this.chess);
      const move = this.chess.move(shot.san);
      this.scene.startMove(move, shot.duration);
      this.audio.slide();
      this.next++;
    }
    const s = this.scene,
      a = s.capture;
    if (a) {
      const t = a.time / a.duration,
        mid = a.to.clone().addScaledVector(a.dir, -1.2);
      mid.y = 2.25;
      const side = new THREE.Vector3(-a.dir.z, 0, a.dir.x).multiplyScalar(
        [1, 2, 4].includes(this.next) ? -1 : 1,
      );
      // The camera holds the point of impact; slow lateral movement exposes sculpture detail.
      const beat = cameraBeat(t, this.next);
      if (!a.filmCamera) {
        let best = Infinity;
        for (const sign of [-1, 1])
          for (const back of [beat.back - 2, beat.back, beat.back + 2])
            for (const height of [beat.y, beat.y + 2, beat.y + 4]) {
              const candidate = mid
                .clone()
                .addScaledVector(side, 10 * sign)
                .addScaledVector(a.dir, back);
              candidate.y = height;
              let score = (height - beat.y) * 0.9 + Math.abs(back - beat.back) * 0.2;
              for (const actor of [a.to, a.to.clone().addScaledVector(a.dir, -2.6)])
                for (const y of [1.5, 3.2]) {
                  const target = actor.clone().setY(y),
                    direction = target.clone().sub(candidate).normalize(),
                    ray = new THREE.Ray(candidate, direction),
                    length = candidate.distanceTo(target);
                  for (const piece of s.pieces.values())
                    if (piece !== a.attacker && piece !== a.victim) {
                      const p = piece.position,
                        h = piece.userData.type === 'p' ? 3.2 : 5.3,
                        box = new THREE.Box3(
                          new THREE.Vector3(p.x - 0.85, 0, p.z - 0.85),
                          new THREE.Vector3(p.x + 0.85, h, p.z + 0.85),
                        );
                      const hit = ray.intersectBox(box, new THREE.Vector3());
                      if (hit && candidate.distanceTo(hit) < length - 0.4) score += 20;
                    }
                }
              if (score < best) {
                best = score;
                a.filmCamera = candidate;
                a.filmHeightOffset = height - beat.y;
              }
            }
      }
      const camera = a.filmCamera.clone();
      if (t < 0.31) {
        camera.lerp(
          mid
            .clone()
            .addScaledVector(side, 14)
            .addScaledVector(a.dir, -7)
            .add(new THREE.Vector3(0, 12, 0)),
          1 - ease(t / 0.31),
        );
      } else {
        camera
          .sub(mid)
          .multiplyScalar(beat.side / 10)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), beat.arc)
          .add(mid);
        camera.y = beat.y + a.filmHeightOffset;
      }
      s.camera.fov = beat.fov;
      s.camera.updateProjectionMatrix();
      s.camera.position.copy(camera);
      s.controls.target.copy(mid);
    } else if (this.time < 4) {
      s.camera.position.set(18 - this.time * 0.6, 25 - this.time * 0.5, 24);
      s.controls.target.set(0, 1, 0);
      s.camera.fov = 46;
      s.camera.updateProjectionMatrix();
    } else if (this.time > FILM_OUTRO) {
      const t = ease((this.time - FILM_OUTRO) / (FILM_DURATION - FILM_OUTRO));
      s.camera.position.set(3 + t * 2, 29 + t * 3, 8);
      s.controls.target.set(0, 0, 0);
      s.camera.fov = 46;
      s.camera.updateProjectionMatrix();
    }
    this.onUI(true, this.time);
    if (this.time >= FILM_DURATION) {
      this.time = FILM_DURATION;
      if (!this.recording) this.stop();
    }
  }
  async record() {
    const { renderOffline } = await import('./offline-film.js');
    return renderOffline(this);
  }
  // Compatibility entry point: both controls now use the frame-accurate export.
  async recordRealtime() {
    return this.record();
  }
}
