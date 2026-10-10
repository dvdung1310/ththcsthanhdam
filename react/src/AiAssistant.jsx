import { useState } from "react";
import { Bot, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { apiFetch } from "./api";
import "./AiAssistant.css";

const welcomeMessage = { role: "assistant", content: "Xin chào! Tôi có thể tra cứu công việc, nhân sự, thi đua, nghỉ phép và tài liệu trong Kho — trong phạm vi quyền của bạn trên hệ thống." };

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([welcomeMessage]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (event) => {
    event.preventDefault();
    const content = question.trim();
    if (!content || loading) return;
    const history = messages.slice(-10);
    setMessages((current) => [...current, { role: "user", content }]);
    setQuestion("");
    setLoading(true);
    try {
      const response = await apiFetch("/api/ai-assistant/ask", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ question: content, history }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Không thể hỏi trợ lý AI.");
      setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error.message }]);
    } finally {
      setLoading(false);
    }
  };

  return <div className="principal-ai">
    {open && <section className="principal-ai-panel">
      <header><span><Bot size={20} /></span><div><b>Trợ lý AI</b><small>Dữ liệu trực tiếp từ hệ thống</small></div><button title="Cuộc trò chuyện mới" onClick={() => setMessages([welcomeMessage])}><RotateCcw size={17} /></button><button title="Đóng" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className="principal-ai-messages">{messages.map((message, index) => <div className={message.role} key={index}>{message.content}</div>)}{loading && <div className="assistant typing">Đang phân tích dữ liệu…</div>}</div>
      <form onSubmit={ask}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows="2" placeholder="Hỏi về công việc, nhân sự, thi đua…" /><button disabled={loading || !question.trim()}><Send size={17} /></button></form>
    </section>}
    <button className="principal-ai-toggle" onClick={() => setOpen((value) => !value)} aria-label="Mở trợ lý AI"><Sparkles size={22} /><span>Trợ lý AI</span></button>
  </div>;
}
