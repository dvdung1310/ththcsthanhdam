import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import "./LibraryFolderTree.css";

function readExpanded(storageKey) {
  if (!storageKey) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function LibraryFolderTree({ folders, selectedId, onSelect, isDisabled, storageKey, revealId, rootLabel, rootSelected, onSelectRoot, rootDisabled, rootIcon: RootIcon }) {
  const [expanded, setExpanded] = useState(() => readExpanded(storageKey));
  const parentOf = useMemo(() => Object.fromEntries(folders.map((f) => [f.id, f.parent_id])), [folders]);
  const childrenOf = useMemo(() => {
    const map = {};
    folders.forEach((f) => {
      const key = f.parent_id ?? "root";
      (map[key] ||= []).push(f);
    });
    return map;
  }, [folders]);

  useEffect(() => {
    if (!revealId) return;
    const chain = childrenOf[revealId]?.length ? [revealId] : [];
    let id = parentOf[revealId];
    while (id) {
      chain.push(id);
      id = parentOf[id];
    }
    if (chain.length) setExpanded((current) => [...new Set([...current, ...chain])]);
  }, [revealId, parentOf, childrenOf]);

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(expanded));
  }, [expanded, storageKey]);

  const toggle = (id) => setExpanded((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const renderLevel = (parentKey, depth) =>
    (childrenOf[parentKey] || []).map((folder) => {
      const kids = childrenOf[folder.id] || [];
      const open = expanded.includes(folder.id);
      const disabled = isDisabled?.(folder);
      const Icon = open && kids.length ? FolderOpen : Folder;
      return (
        <div key={folder.id} className="lft-node" role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={selectedId === folder.id}>
          <div className={`lft-row ${selectedId === folder.id ? "selected" : ""} ${disabled ? "disabled" : ""}`} style={{ paddingLeft: 6 + depth * 16 }}>
            {kids.length ? (
              <button type="button" className={`lft-toggle ${open ? "open" : ""}`} onClick={() => toggle(folder.id)} aria-label={open ? "Thu gọn" : "Mở rộng"}>
                <ChevronRight size={14} />
              </button>
            ) : (
              <span className="lft-toggle-spacer" />
            )}
            <button type="button" className="lft-label" disabled={disabled} onClick={() => onSelect(folder)} onDoubleClick={() => kids.length && toggle(folder.id)} title={folder.path || folder.name}>
              <Icon size={15} className={folder.is_system ? "system" : ""} />
              <span>{folder.name}</span>
            </button>
          </div>
          {open && kids.length > 0 && <div className="lft-children">{renderLevel(folder.id, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <div className="library-folder-tree" role="tree">
      {rootLabel && (
        <div className={`lft-row root ${rootSelected ? "selected" : ""} ${rootDisabled ? "disabled" : ""}`}>
          <button type="button" className="lft-label" disabled={rootDisabled} onClick={onSelectRoot}>
            {RootIcon && <RootIcon size={16} />}
            <span>{rootLabel}</span>
          </button>
        </div>
      )}
      {renderLevel("root", rootLabel ? 0 : 0)}
    </div>
  );
}
