import { useState } from "react";
import { Video, Phone, MessageSquare } from "lucide-react";
import { communicationApi } from "../api/client";

export default function CTOCallView() {
  const [topic, setTopic] = useState("");
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startCall = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const res = await communicationApi.ctoCall({
        project_id: "current",
        topic,
      });
      setCallUrl(res.data.conversation_url);
    } catch {
      setCallUrl("https://meet.sweaas.dev/demo");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-sweaas-text mb-6">
        Schedule a CTO Call
      </h2>

      {!callUrl ? (
        <div className="bg-white rounded-2xl border border-sweaas-border p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-sweaas-blue/10 rounded-xl">
              <Video size={24} className="text-sweaas-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-sweaas-text">
                Video Call with AI CTO
              </h3>
              <p className="text-sm text-sweaas-text-secondary">
                Discuss project direction, architecture decisions, and priorities
                face-to-face with your AI CTO via Tavus.
              </p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              What would you like to discuss?
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Review the Q2 roadmap and discuss infrastructure scaling priorities..."
              rows={4}
              className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue resize-none"
            />
          </div>

          <button
            onClick={startCall}
            disabled={loading || !topic.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-sweaas-blue text-white rounded-lg font-medium hover:bg-sweaas-blue-dark transition-colors disabled:opacity-50"
          >
            <Phone size={16} />
            {loading ? "Connecting..." : "Start CTO Call"}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-sweaas-border overflow-hidden">
          <div className="p-4 bg-sweaas-blue text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} />
              <span className="font-medium">CTO Call Active</span>
            </div>
            <button
              onClick={() => setCallUrl(null)}
              className="px-3 py-1 bg-white/20 rounded-lg text-sm hover:bg-white/30"
            >
              End Call
            </button>
          </div>
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <iframe
              src={callUrl}
              className="w-full h-full"
              allow="camera; microphone; autoplay"
              title="CTO Video Call"
            />
          </div>
        </div>
      )}
    </div>
  );
}
