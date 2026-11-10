import { useEffect } from 'react';

/** Keep browser chrome changes separate from layout-viewport media queries. */
export function useGameViewport(active: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const visible =
        viewport && Math.abs(viewport.scale - 1) < 0.01 && viewport.height > 0
          ? viewport.height
          : window.innerHeight;
      const height = Math.round(Math.min(window.innerHeight, visible));
      if (height <= 0) return;
      root.style.setProperty('--app-viewport-height', `${height}px`);
      root.dataset.viewportSize = height <= 600 ? 'short' : height <= 740 ? 'compact' : 'regular';
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    document.addEventListener('visibilitychange', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      document.removeEventListener('visibilitychange', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      root.style.removeProperty('--app-viewport-height');
      delete root.dataset.viewportSize;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('is-playing', active);
    if (active) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return () => root.classList.remove('is-playing');
  }, [active]);
}
