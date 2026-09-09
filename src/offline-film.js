import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { StoneAudio } from './audio.js';
import { FILM_SHOTS, FILM_DURATION } from './film-timeline.js';
import { composeFilm as compose } from './film-graphics.js';

export async function renderOffline(film) {
  if (film.recording) throw new Error('A film is already rendering.');
  const config = {
    codec: 'avc1.42002a',
    width: 1920,
    height: 1080,
    bitrate: 14000000,
    framerate: 30,
  };
  if (
    !globalThis.VideoEncoder ||
    !globalThis.AudioEncoder ||
    !(await VideoEncoder.isConfigSupported(config)).supported
  )
    throw new Error('This browser needs WebCodecs H.264 support for frame-by-frame export.');
  const target = new ArrayBufferTarget(),
    muxer = new Muxer({
      target,
      video: { codec: 'avc', width: 1920, height: 1080, frameRate: 30 },
      audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
  let failure;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (error) {
        failure = error;
      }
    },
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure(config);
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addAudioChunk(chunk, meta);
      } catch (error) {
        failure = error;
      }
    },
    error: (error) => {
      failure = error;
    },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 192000,
  });
  const oldEnabled = film.audio.enabled,
    button = document.querySelector('#exit-film');
  film.audio.stopAtmosphere();
  film.audio.enabled = false;
  film.recording = true;
  film.offline = true;
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  try {
    await Promise.all([
      document.fonts.load('500 72px "Cormorant Garamond"'),
      document.fonts.load('400 26px Manrope'),
      document.fonts.load('600 65px Manrope'),
    ]);
    const frames = FILM_DURATION * 30;
    const sound = new StoneAudio(),
      offline = new OfflineAudioContext(2, FILM_DURATION * 48000, 48000);
    await sound.init(offline);
    sound.atmosphere(
      FILM_DURATION,
      FILM_SHOTS.map((s) => s.start - 0.6),
    );
    for (const shot of FILM_SHOTS) {
      sound.slide(shot.start);
      sound.swing(shot.start + 0.54 * shot.duration);
      sound.hit(shot.start + 0.675 * shot.duration);
    }
    sound.master.gain.setValueAtTime(0.6, FILM_DURATION - 1.2);
    sound.master.gain.linearRampToValueAtTime(0, FILM_DURATION);
    const pcm = await offline.startRendering();
    for (let offset = 0; offset < pcm.length; offset += 1024) {
      const count = Math.min(1024, pcm.length - offset),
        data = new Float32Array(count * 2);
      data.set(pcm.getChannelData(0).subarray(offset, offset + count));
      data.set(pcm.getChannelData(1).subarray(offset, offset + count), count);
      const frame = new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfChannels: 2,
        numberOfFrames: count,
        timestamp: Math.round((offset / 48000) * 1e6),
        data,
      });
      audioEncoder.encode(frame);
      frame.close();
    }
    await audioEncoder.flush();
    film.start();
    film.scene.clock = 0;
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      film.update(1 / 30);
      film.scene.update(1 / 30);
      film.scene.render();
      compose(film, ctx);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / 30) * 1e6),
        duration: Math.round(((i + 1) / 30) * 1e6) - Math.round((i / 30) * 1e6),
      });
      encoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();
      if (button) {
        button.disabled = true;
        button.textContent = `Rendering ${i + 1} / ${frames} frames`;
      }
      if (encoder.encodeQueueSize > 5) await encoder.flush();
      await new Promise(requestAnimationFrame);
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'the-stone-gambit-40s.mp4';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { bytes: blob.size, frames, duration: FILM_DURATION };
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
      if (audioEncoder.state !== 'closed') audioEncoder.close();
    } finally {
      film.recording = false;
      film.offline = false;
      film.stop();
      film.audio.enabled = oldEnabled;
      if (button) {
        button.disabled = false;
        button.textContent = 'Exit film · Esc';
      }
    }
  }
}
