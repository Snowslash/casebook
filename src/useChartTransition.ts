import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// Native view transitions are document-wide, even when chart bodies are scoped.
let cancelActiveTransition: (() => void) | null = null;

// Only the chart body is snapshotted; controls, counts and source rows stay live.
export function useChartTransition<T extends string>(value: T, name: string, revision: string) {
  const body = useRef<HTMLDivElement>(null);
  const running = useRef<(() => void) | null>(null);
  const incoming = useRef<Animation | null>(null);
  const generation = useRef(0);
  const [shown, setShown] = useState(value);
  const shownValue = useRef(value);
  useLayoutEffect(() => { running.current?.(); incoming.current?.cancel(); }, [revision]);
  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (preference.matches) { running.current?.(); incoming.current?.cancel(); } };
    preference.addEventListener('change', stop);
    return () => {
      // A deferred native callback must not restore state after Clear/replacement.
      generation.current++;
      running.current?.();
      incoming.current?.cancel();
      preference.removeEventListener('change', stop);
    };
  }, []);

  useLayoutEffect(() => {
    const token = ++generation.current;
    running.current?.();
    incoming.current?.cancel();
    if (value === shownValue.current) return;
    const update = () => { shownValue.current = value; setShown(value); };
    const element = body.current;
    if (!element || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
      return;
    }
    cancelActiveTransition?.();
    let cancelled = false;
    let animation: Animation | null = null;
    element.style.viewTransitionName = name;
    const transition = document.startViewTransition(() => {
      if (generation.current !== token) return;
      // Capture only the outgoing picture. Capturing the incoming body removes
      // its buttons from native hit testing, even with pointer-events: none.
      element.style.viewTransitionName = 'none';
      flushSync(update);
      if (!cancelled && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        incoming.current = animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      }
    });
    const cancel = () => {
      // skipTransition still runs the update callback: cancel motion, not the view.
      cancelled = true;
      transition.skipTransition();
      animation?.cancel();
    };
    running.current = cancel;
    cancelActiveTransition = cancel;
    // Skipping (rapid input, background tabs or cleared data) normally rejects ready.
    void transition.ready.catch(cancel);
    const finish = () => {
      if (cancelActiveTransition === cancel) cancelActiveTransition = null;
      if (running.current === cancel) {
        running.current = null;
        element.style.viewTransitionName = '';
      }
    };
    void transition.finished.then(finish, finish);
  }, [value, name]);
  return { body, view: shown };
}
