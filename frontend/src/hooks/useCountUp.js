import { useEffect, useRef, useState } from 'react';

export function useCountUp(value, duration = 800) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || current.current === value) {
      current.current = value;
      setShown(value);
      return undefined;
    }
    const from = current.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      current.current = Math.round(from + (value - from) * eased);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return shown;
}

/** A clock for on-screen elapsed time / "x min ago" labels. Never touches the network. */
export function useNow(active = true, interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}
