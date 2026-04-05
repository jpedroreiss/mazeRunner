import { Game } from './game.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('canvas');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  Game.init();

  // D-Pad para dispositivos touch
  const dpadMap = { bu: 'ArrowUp', bd: 'ArrowDown', bl: 'ArrowLeft', br: 'ArrowRight' };
  Object.entries(dpadMap).forEach(([id, code]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const dispatch = () => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    btn.addEventListener('touchstart', e => {
      e.preventDefault();
      dispatch();
    }, { passive: false });
    btn.addEventListener('mousedown', dispatch);
  });

  window.addEventListener('resize', () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  });
});
