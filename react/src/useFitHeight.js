import { useLayoutEffect, useRef, useState } from "react";

export default function useFitHeight(deps, { min = 360, gap = 28 } = {}) {
  const wrapRef = useRef(null);
  const footRef = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const below = (footRef.current?.offsetHeight ?? 0) + gap;
      setHeight(Math.max(min, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    if (wrapRef.current?.parentElement) observer.observe(wrapRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [wrapRef, footRef, height];
}
