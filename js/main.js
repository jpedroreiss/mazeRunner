import { Game } from './game.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('canvas');
  const modePicker = document.getElementById('mode-picker');
  const normalModeBtn = document.getElementById('mode-normal');
  const hardModeBtn = document.getElementById('mode-hard');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  Game.init();

  function syncModeButtons() {
    const hardModeEnabled = Game.getHardMode();
    normalModeBtn?.classList.toggle('is-active', !hardModeEnabled);
    hardModeBtn?.classList.toggle('is-active', hardModeEnabled);
  }

  normalModeBtn?.addEventListener('click', () => {
    Game.setHardMode(false);
    syncModeButtons();
  });

  hardModeBtn?.addEventListener('click', () => {
    Game.setHardMode(true);
    syncModeButtons();
  });

  function syncModePickerVisibility() {
    const isMenu = Game.getState() === 'menu';
    modePicker?.classList.toggle('is-hidden', !isMenu);
    requestAnimationFrame(syncModePickerVisibility);
  }

  window.addEventListener('maze:hardmodechange', syncModeButtons);

  syncModeButtons();
  syncModePickerVisibility();

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
