import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Bot, Check, History, MessageSquarePlus, Pencil, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { apiFetch, apiJson } from "./api";
import { useConfirm } from "./ConfirmDialog";
import "./AiAssistant.css";

const STORAGE_KEY = "thanhdam_ai_conversation";
const WELCOME = "Xin chào! Tôi có thể tra cứu công việc, nhân sự, thi đua, nghỉ phép và tài liệu trong Kho — trong phạm vi quyền của bạn trên hệ thống.";
const TASK_CODE = /(CV-\d{4}-\d{4})/g;

export default function AiAssistant() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("chat");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const chatRef = useRef(0);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (open && view === "chat") listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open, view]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!open || restoredRef.current) return;
    restoredRef.current = true;
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved) openConversation(saved, { quiet: true });
  }, [open]);
  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view, conversation?.id]);

  const remember = (item) => {
    setConversation(item);
    item ? localStorage.setItem(STORAGE_KEY, item.id) : localStorage.removeItem(STORAGE_KEY);
  };

  const startNew = () => {
    chatRef.current += 1;
    abortRef.current?.abort();
    remember(null);
    setMessages([]);
    setError("");
    setView("chat");
  };

  const openConversation = async (id, { quiet = false } = {}) => {
    chatRef.current += 1;
    abortRef.current?.abort();
    setError("");
    try {
      const payload = await apiJson(`/api/ai-assistant/conversations/${id}`);
      remember(payload.conversation);
      setMessages(payload.messages);
      setView("chat");
    } catch (e) {
      if (e.status === 404) localStorage.removeItem(STORAGE_KEY);
      if (!quiet) setError(e.message);
    }
  };

  const showHistory = async () => {
    setView("history");
    setError("");
    try {
      setConversations((await apiJson("/api/ai-assistant/conversations")).data);
    } catch (e) {
      setError(e.message);
    }
  };

  const ask = async (event) => {
    event?.preventDefault();
    const content = question.trim();
    if (!content || loading) return;
    const controller = new AbortController();
    const chat = chatRef.current;
    abortRef.current = controller;
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content }]);
    setQuestion("");
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch("/api/ai-assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: content, conversation_id: conversation?.id ?? null }),
        signal: controller.signal,
        silent: true,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Không thể hỏi trợ lý AI.");
      if (chat !== chatRef.current) return;
      remember(payload.conversation);
      setMessages((current) => [...current, { id: `local-${Date.now()}-a`, role: "assistant", content: payload.answer }]);
    } catch (e) {
      if (chat !== chatRef.current) return;
      setMessages((current) => [...current, { id: `local-${Date.now()}-e`, role: "assistant", content: e.name === "AbortError" ? "Đã dừng câu hỏi." : e.message, failed: true }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const rename = async (item, title) => {
    const next = title.trim();
    if (!next || next === item.title) return;
    try {
      const payload = await apiJson(`/api/ai-assistant/conversations/${item.id}`, { method: "PATCH", body: { title: next } });
      setConversations((current) => current.map((row) => (row.id === item.id ? payload.conversation : row)));
      if (conversation?.id === item.id) remember(payload.conversation);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (item) => {
    const ok = await confirm({ tone: "danger", title: "Xóa cuộc trò chuyện?", message: `“${item.title}” và toàn bộ tin nhắn sẽ bị xóa vĩnh viễn.`, confirmText: "Xóa" });
    if (!ok) return;
    try {
      await apiJson(`/api/ai-assistant/conversations/${item.id}`, { method: "DELETE" });
      setConversations((current) => current.filter((row) => row.id !== item.id));
      if (conversation?.id === item.id) {
        remember(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask();
    }
  };

  const openTask = (code) => navigate(`/tasks/${code}`);

  return (
    <div className="principal-ai">
      {open && (
        <aside className="chat-drawer" aria-label="Trợ lý AI">
          <header>
            {view === "history" ? (
              <button type="button" className="chat-icon" title="Quay lại" onClick={() => setView("chat")}><ArrowLeft size={18} /></button>
            ) : (
              <span className="chat-badge"><Bot size={20} /></span>
            )}
            <div>
              <b>{view === "history" ? "Lịch sử trò chuyện" : conversation?.title ?? "Trợ lý AI"}</b>
              <small>{view === "history" ? "Chỉ bạn xem được các cuộc trò chuyện này" : "Dữ liệu trực tiếp từ hệ thống"}</small>
            </div>
            {view === "chat" && <button type="button" className="chat-icon" title="Lịch sử" onClick={showHistory}><History size={18} /></button>}
            <button type="button" className="chat-icon" title="Cuộc trò chuyện mới" onClick={startNew}><MessageSquarePlus size={18} /></button>
            <button type="button" className="chat-icon" title="Đóng" onClick={() => setOpen(false)}><X size={19} /></button>
          </header>

          {error && <p className="chat-error" role="alert">{error}</p>}

          {view === "history" ? (
            <ConversationList items={conversations} activeId={conversation?.id} onOpen={openConversation} onRename={rename} onRemove={remove} onNew={startNew} />
          ) : (
            <>
              <div className="chat-messages" ref={listRef}>
                {!messages.length && <div className="assistant">{WELCOME}</div>}
                {messages.map((message) => (
                  <div key={message.id} className={`${message.role} ${message.failed ? "failed" : ""}`}>
                    {message.role === "assistant" && !message.failed ? <RichText text={message.content} onTask={openTask} /> : message.content}
                  </div>
                ))}
                {loading && <div className="assistant typing" role="status" aria-label="Trợ lý đang trả lời"><i /><i /><i /></div>}
              </div>
              <form onSubmit={ask}>
                <textarea ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={onKeyDown} rows="2" placeholder="Nhập câu hỏi… (Enter để gửi)" />
                {loading ? (
                  <button type="button" className="stop" title="Dừng" onClick={() => abortRef.current?.abort()}><Square size={15} fill="currentColor" /></button>
                ) : (
                  <button disabled={!question.trim()} title="Gửi"><Send size={17} /></button>
                )}
              </form>
            </>
          )}
        </aside>
      )}
      {!open && (
        <button className="principal-ai-toggle" onClick={() => setOpen(true)} aria-label="Mở trợ lý AI"><Sparkles size={22} /><span>Trợ lý AI</span></button>
      )}
    </div>
  );
}

function ConversationList({ items, activeId, onOpen, onRename, onRemove, onNew }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  if (!items) return <p className="chat-muted">Đang tải…</p>;
  if (!items.length) {
    return (
      <div className="chat-empty">
        <History size={28} />
        <b>Chưa có cuộc trò chuyện nào</b>
        <button type="button" className="secondary-btn" onClick={onNew}><MessageSquarePlus size={15} /> Bắt đầu trò chuyện</button>
      </div>
    );
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groupOf = (value) => {
    const time = new Date(value).getTime();
    return time >= today ? "Hôm nay" : time >= today - 6 * 86400000 ? "7 ngày qua" : "Cũ hơn";
  };
  const groups = items.reduce((result, item) => {
    const label = groupOf(item.last_message_at);
    (result[label] ??= []).push(item);
    return result;
  }, {});
  const finish = (item) => {
    onRename(item, draft);
    setEditing(null);
  };

  return (
    <div className="chat-history">
      {["Hôm nay", "7 ngày qua", "Cũ hơn"].filter((label) => groups[label]).map((label) => (
        <section key={label}>
          <h4>{label}</h4>
          {groups[label].map((item) => (
            <div key={item.id} className={`chat-history-row ${item.id === activeId ? "active" : ""}`}>
              {editing === item.id ? (
                <input
                  autoFocus
                  value={draft}
                  maxLength={120}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => finish(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") finish(item);
                    if (event.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button type="button" className="chat-history-open" onClick={() => onOpen(item.id)}>
                  <b>{item.title}</b>
                  <small>{stamp(item.last_message_at)}</small>
                </button>
              )}
              {editing === item.id ? (
                <button type="button" className="chat-icon" title="Lưu tên" onMouseDown={(event) => event.preventDefault()} onClick={() => finish(item)}><Check size={15} /></button>
              ) : (
                <button type="button" className="chat-icon" title="Đổi tên" onClick={() => { setEditing(item.id); setDraft(item.title); }}><Pencil size={15} /></button>
              )}
              <button type="button" className="chat-icon danger" title="Xóa" onClick={() => onRemove(item)}><Trash2 size={15} /></button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function stamp(value) {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Inline({ text, onTask }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const body = (bold ? part.slice(2, -2) : part).split(TASK_CODE).map((piece, i) =>
      i % 2 ? <button key={i} type="button" className="chat-task-link" onClick={() => onTask(piece)}>{piece}</button> : <Fragment key={i}>{piece}</Fragment>,
    );
    return bold ? <strong key={index}>{body}</strong> : <Fragment key={index}>{body}</Fragment>;
  });
}

function RichText({ text, onTask }) {
  const blocks = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^(\s*)[-•*]\s+(.*)$/);
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    const kind = bullet ? "ul" : numbered ? "ol" : line.trim() ? "p" : "gap";
    const item = { content: bullet ? bullet[2] : numbered ? numbered[3] : line.trim(), nested: (bullet?.[1] ?? numbered?.[1] ?? "").length >= 2 };
    const last = blocks.at(-1);
    if ((kind === "ul" || kind === "ol") && last?.kind === kind) last.items.push(item);
    else if (kind !== "gap" || last?.kind !== "gap") blocks.push({ kind, items: [item] });
  }
  return blocks.filter((block) => block.kind !== "gap").map((block, index) => {
    if (block.kind === "p") return <p key={index}><Inline text={block.items[0].content} onTask={onTask} /></p>;
    const List = block.kind;
    return (
      <List key={index}>
        {block.items.map((item, i) => <li key={i} className={item.nested ? "nested" : ""}><Inline text={item.content} onTask={onTask} /></li>)}
      </List>
    );
  });
}
