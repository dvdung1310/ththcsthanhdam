import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import { apiFetch } from "./api";
import "./AiAssistant.css";

const welcomeMessage = { role: "assistant", content: "Xin chào! Tôi có thể tra cứu công việc, nhân sự, thi đua, nghỉ phép và tài liệu trong Kho — trong phạm vi quyền của bạn trên hệ thống." };

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([welcomeMessage]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const chatRef = useRef(0);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async (event) => {
    event?.preventDefault();
    const content = question.trim();
    if (!content || loading) return;
    const history = messages.slice(-10);
    const controller = new AbortController();
    const chat = chatRef.current;
    abortRef.current = controller;
    setMessages((current) => [...current, { role: "user", content }]);
    setQuestion("");
    setLoading(true);
    try {
      const response = await apiFetch("/api/ai-assistant/ask", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ question: content, history }), signal: controller.signal, silent: true });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Không thể hỏi trợ lý AI.");
      if (chat !== chatRef.current) return;
      setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
    } catch (error) {
      if (chat !== chatRef.current) return;
      setMessages((current) => [...current, { role: "assistant", content: error.name === "AbortError" ? "Đã dừng câu hỏi." : error.message }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const stop = () => abortRef.current?.abort();
  const reset = () => {
    chatRef.current += 1;
    stop();
    setMessages([welcomeMessage]);
  };
  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask();
    }
  };

  return <div className="principal-ai">
    {open && <section className="principal-ai-panel">
      <header><span><Bot size={20} /></span><div><b>Trợ lý AI</b><small>Dữ liệu trực tiếp từ hệ thống</small></div><button title="Cuộc trò chuyện mới" onClick={reset}><RotateCcw size={17} /></button><button title="Đóng" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className="principal-ai-messages" ref={listRef}>{messages.map((message, index) => <div className={message.role} key={index}>{message.content}</div>)}{loading && <div className="assistant typing" role="status" aria-label="Trợ lý đang trả lời"><i /><i /><i /></div>}</div>
      <form onSubmit={ask}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={onKeyDown} rows="2" placeholder="Nhập câu hỏi… (Enter để gửi)" />
        {loading
          ? <button type="button" className="stop" title="Dừng" onClick={stop}><Square size={15} fill="currentColor" /></button>
          : <button disabled={!question.trim()} title="Gửi"><Send size={17} /></button>}
      </form>
    </section>}
    <button className="principal-ai-toggle" onClick={() => setOpen((value) => !value)} aria-label="Mở trợ lý AI"><Sparkles size={22} /><span>Trợ lý AI</span></button>
  </div>;
}
