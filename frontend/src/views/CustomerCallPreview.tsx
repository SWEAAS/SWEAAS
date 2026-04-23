import { useState } from "react";
import { Headphones, Phone, MessageSquare, AlertCircle, Copy, Check } from "lucide-react";
import { communicationApi } from "../api/client";
import { useProjectStore } from "../store/projectStore";

export default function CustomerCallPreview() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const [topic, setTopic] = useState("");
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPreview = async () => {
    if (!topic.trim() || !currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await communicationApi.customerCall({
        project_id: currentProject.id,
        topic,
      });
      const url = res.data?.conversation_url;
      if (!url) {
        setError("The server didn't return a call URL. Try again in a moment.");
      } else {
        setCallUrl(url);
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not start the preview call. Check that your Tavus persona is configured.";
      setError(msg);
    }
    setLoading(false);
  };

  const copyToken = async () => {
    const token = currentProject?.public_token;
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-sweaas-text mb-6">
        Customer Support Video
      </h2>

      {!currentProject ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-yellow-800">No project selected</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Select a project from the header to preview the customer support persona.
            </p>
          </div>
        </div>
      ) : !callUrl ? (
        <>
          <div className="bg-white rounded-2xl border border-sweaas-border p-8 mb-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-green-50 rounded-xl">
                <Headphones size={24} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sweaas-text">
                  Preview Customer Support Call
                </h3>
                <p className="text-sm text-sweaas-text-secondary">
                  Test the AI customer support persona your end users will talk to.
                  This uses the same Tavus persona and replica configured for your
                  product's support channel.
                </p>
              </div>
            </div>

            <p className="text-sm text-sweaas-text-secondary mb-4">
              Project: <span className="font-medium text-sweaas-text">{currentProject.name}</span>
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Sample support topic
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., I can't find the settings page, or How do I export my data?"
                rows={3}
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue resize-none"
              />
            </div>

            <button
              onClick={startPreview}
              disabled={loading || !topic.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Phone size={16} />
              {loading ? "Connecting..." : "Start Preview Call"}
            </button>
            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            ) : null}
          </div>

          {/* Integration snippet */}
          <div className="bg-white rounded-2xl border border-sweaas-border p-8">
            <h3 className="font-semibold text-sweaas-text mb-2">
              Embed in your product
            </h3>
            <p className="text-sm text-sweaas-text-secondary mb-4">
              Use the public endpoint with your project token to let end users
              start support calls without a SWEAAS account.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded-lg font-mono overflow-x-auto">
                POST /api/v1/communication/customer-call/public
              </code>
              <button
                onClick={copyToken}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-sweaas-border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy token"}
              </button>
            </div>

            <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
{`curl -X POST /api/v1/communication/customer-call/public \\
  -H "Content-Type: application/json" \\
  -H "X-Project-Token: <your-project-token>" \\
  -d '{"topic": "I need help with..."}'`}
            </pre>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-sweaas-border overflow-hidden">
          <div className="p-4 bg-green-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} />
              <span className="font-medium">Customer Support Preview</span>
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
              title="Customer Support Preview Call"
            />
          </div>
        </div>
      )}
    </div>
  );
}
