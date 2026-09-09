import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FILM_DURATION,
  FILM_SHOTS,
  FILM_OUTRO,
  filmCopy,
  cameraBeat,
} from '../src/film-timeline.js';
import { Chess, validateFen } from 'chess.js';

test('cinematic schedule leaves opening and closing space without overlapping captures', () => {
  assert.equal(FILM_DURATION, 40);
  assert.equal(FILM_SHOTS.length, 6);
  assert.ok(FILM_SHOTS[0].start >= 2);
  for (let i = 1; i < FILM_SHOTS.length; i++)
    assert.ok(FILM_SHOTS[i].start > FILM_SHOTS[i - 1].start + FILM_SHOTS[i - 1].duration);
  assert.ok(FILM_SHOTS.at(-1).start + FILM_SHOTS.at(-1).duration < FILM_OUTRO);
  assert.match(filmCopy(0).join(' '), /ASTRA/);
  assert.match(filmCopy(2.5).join(' '), /Harry Potter/);
  assert.match(filmCopy(5).join(' '), /playable/);
  assert.match(filmCopy(38)[0], /STONE GAMBIT/);
  for (let i = 0; i < 6; i++)
    for (const t of [0, 0.35, 0.65, 0.9])
      for (const value of Object.values(cameraBeat(t, i))) assert.ok(Number.isFinite(value));
});

test('all six character studies are legal, safe captures without immediate recapture', () => {
  assert.deepEqual(
    FILM_SHOTS.map((s) => s.piece),
    ['p', 'n', 'b', 'r', 'q', 'k'],
  );
  for (const shot of FILM_SHOTS) {
    assert.equal(validateFen(shot.fen).ok, true);
    const chess = new Chess(shot.fen),
      move = chess.move(shot.san);
    assert.equal(move.piece, shot.piece);
    assert.ok(move.captured && move.captured !== 'k');
    assert.equal(
      chess.moves({ verbose: true }).some((m) => m.to === move.to && m.captured),
      false,
      shot.name + ' cannot be immediately recaptured',
    );
  }
});

test('runtime GLBs contain valid geometry and no external resources', () => {
  for (const kind of ['p', 'n', 'b', 'r', 'q', 'k']) {
    const path = new URL(
        `../public/models/${kind === 'r' ? 'rook-v5' : 'combat-v4'}/${kind}.glb`,
        import.meta.url,
      ),
      b = readFileSync(path);
    assert.equal(b.toString('ascii', 0, 4), 'glTF');
    const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
    assert.ok(j.meshes.length > 0, `${kind} includes sculpted geometry`);
    assert.ok(
      j.meshes.every((m) => m.primitives.every((p) => p.attributes.POSITION !== undefined)),
    );
    assert.ok(
      j.buffers.every((buffer) => buffer.uri === undefined),
      `${kind} is self-contained`,
    );
    assert.ok(
      (j.images ?? []).every((image) => image.uri === undefined),
      `${kind} does not fetch external images`,
    );
    assert.ok(
      j.nodes.some((n) => n.name === 'SwordArm'),
      `${kind} includes articulated arms`,
    );
  }
});
