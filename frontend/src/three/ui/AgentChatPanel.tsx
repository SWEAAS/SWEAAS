import { useState } from "react";
import { Send, X } from "lucide-react";
import { agentApi } from "../../api/client";
import type { Agent } from "../../store/agentStore";

interface AgentChatPanelProps {
  agent: Agent;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

export default function AgentChatPanel({ agent, onClose }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content: `Hi! I'm ${agent.name}. I'm currently working as ${agent.role.replace(/_/g, " ")}. How can I help you?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setSending(true);

    try {
      const res = await agentApi.chat(agent.agent_id, userMsg);
      setMessages((m) => [
        ...m,
        { role: "agent", content: res.data.response },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "agent", content: "Sorry, I couldn't process that request." },
      ]);
    }
    setSending(false);
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-2xl shadow-2xl border border-sweaas-border flex flex-col overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-sweaas-blue text-white">
        <div>
          <p className="font-medium text-sm">{agent.name}</p>
          <p className="text-xs text-blue-200">
            {agent.role.replace(/_/g, " ")} · {agent.status}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                msg.role === "user"
                  ? "bg-sweaas-blue text-white rounded-br-none"
                  : "bg-gray-100 text-sweaas-text rounded-bl-none"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-sweaas-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 text-sm border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="p-2 bg-sweaas-blue text-white rounded-lg hover:bg-sweaas-blue-dark disabled:opacity-50 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
