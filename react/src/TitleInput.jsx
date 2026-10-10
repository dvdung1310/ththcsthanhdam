import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./TitleInput.css";

export const TITLE_MAX = 2000;

export default function TitleInput({ className = "", value, defaultValue, onInput, onKeyDown, ...props }) {
  const ref = useRef(null);
  const [length, setLength] = useState(() => String(value ?? defaultValue ?? "").length);

  const resize = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize();
    setLength(ref.current?.value.length ?? 0);
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === width) return;
      width = element.offsetWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={`title-input ${className}`}>
      <textarea
        {...props}
        ref={ref}
        rows={1}
        maxLength={TITLE_MAX}
        value={value}
        defaultValue={defaultValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
          onKeyDown?.(event);
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (!/[\r\n]/.test(text)) return;
          event.preventDefault();
          document.execCommand("insertText", false, text.replace(/\s*[\r\n]+\s*/g, " "));
        }}
        onInput={(event) => {
          resize();
          setLength(event.currentTarget.value.length);
          onInput?.(event);
        }}
      />
      {length > TITLE_MAX - 200 && <small className={length >= TITLE_MAX ? "full" : ""}>{length}/{TITLE_MAX}</small>}
    </span>
  );
}
