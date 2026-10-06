import "./Avatar.css";

const TONES = ["#0b3d91", "#3d64a8", "#2f7a5b", "#946a2e", "#8a4b5c", "#44737e", "#6a4c93", "#356f8f"];

export const avatarInitial = (name) => (name ?? "").trim().split(/\s+/).at(-1)?.charAt(0)?.toUpperCase() || "?";

export function avatarTone(name) {
  const key = (name ?? "").trim().toLowerCase();
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export default function Avatar({ name, src, size, as: Tag = "i", className = "", alt = "", style }) {
  const box = size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : null;
  if (src) return <img className={className} src={src} alt={alt} style={{ ...box, ...style }} />;
  return (
    <Tag className={`avatar-fallback ${className}`.trim()} style={{ ...box, ...style, background: avatarTone(name), color: "#fff" }} aria-hidden="true">
      {avatarInitial(name)}
    </Tag>
  );
}
