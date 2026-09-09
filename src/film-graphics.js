import { filmCopy, filmSlate, FILM_OUTRO, FILM_SHOTS } from './film-timeline.js';

export function composeFilm(film, ctx) {
  const source = film.scene.renderer.domElement,
    ratio = Math.max(1920 / source.width, 1080 / source.height),
    w = source.width * ratio,
    h = source.height * ratio;
  ctx.fillStyle = '#060c16';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.drawImage(source, (1920 - w) / 2, (1080 - h) / 2, w, h);
  ctx.fillStyle = '#050a11';
  ctx.fillRect(0, 0, 1920, 68);
  ctx.fillRect(0, 1012, 1920, 68);
  const gradient = ctx.createLinearGradient(0, 745, 0, 1012);
  gradient.addColorStop(0, 'rgba(4,9,17,0)');
  gradient.addColorStop(1, 'rgba(4,9,17,.90)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 745, 1920, 267);
  ctx.fillStyle = '#c8b98e';
  ctx.font = '600 18px Manrope';
  ctx.textAlign = 'left';
  ctx.fillText('ASTRA  /  PROMPT TO PLAYABLE', 64, 43);
  ctx.font = '400 16px Manrope';
  ctx.fillStyle = '#aab8c6';
  ctx.textAlign = 'right';
  ctx.fillText(filmSlate(film), 1856, 43);
  const [title, subtitle] = filmCopy(film.time),
    end = film.time >= FILM_OUTRO,
    intro = film.time < 4;
  const start = end
    ? FILM_OUTRO
    : intro
      ? film.time < 1.8
        ? 0
        : 1.8
      : FILM_SHOTS[Math.max(0, film.next - 1)].start;
  const alpha = Math.min(1, Math.max(0, (film.time - start) / 0.2));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = '#020710';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#eee9df';
  ctx.textAlign = intro || end ? 'center' : 'left';
  ctx.font = intro
    ? '600 65px Manrope'
    : end
      ? '500 100px "Cormorant Garamond"'
      : '500 72px "Cormorant Garamond"';
  const x = intro || end ? 960 : 84,
    y = intro ? 438 : end ? 480 : 879;
  ctx.fillText(title, x, y);
  ctx.font = '400 26px Manrope';
  ctx.fillStyle = '#c4ced7';
  ctx.fillText(subtitle, x, y + (end ? 59 : 52));
  if (!intro && !end) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c8b98e';
    ctx.fillRect(86, 806, 58, 2);
  }
  if (end) {
    ctx.font = '600 20px Manrope';
    ctx.fillStyle = '#d5c49a';
    ctx.fillText('YOUR MOVE.', 960, 649);
    ctx.font = '400 17px Manrope';
    ctx.fillStyle = '#acb8c4';
    ctx.fillText('An Astra build experiment · Playable in the browser', 960, 690);
  }
  ctx.restore();
  if (end) {
    ctx.font = '400 15px Manrope';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8997a6';
    ctx.fillText('Sculptures: PHusband / CC BY 4.0 · Adapted in Blender + Three.js', 960, 980);
  }
}
