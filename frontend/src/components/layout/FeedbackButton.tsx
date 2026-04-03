import { useState } from "react";
import { MessageSquarePlus, Send, X } from "lucide-react";
import { feedbackApi } from "../../api/client";
import { useProjectStore } from "../../store/projectStore";

const CATEGORIES = ["bug", "feature", "improvement", "ux", "general"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export default function FeedbackButton() {
  const { currentProject } = useProjectStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [priority, setPriority] = useState<string>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setTitle("");
    setBody("");
    setCategory("general");
    setPriority("medium");
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await feedbackApi.submit({
        project_id: currentProject?.id,
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        source: "user_feedback",
      });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1800);
    } catch {
      /* silent — toast would be better */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[999] flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: "var(--brand)" }}
        title="Send feedback"
      >
        <MessageSquarePlus size={18} className="text-white" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[1000] bg-black/20 backdrop-blur-[2px]"
            onClick={() => { setOpen(false); reset(); }}
          />
          <div className="fixed bottom-20 right-5 z-[1001] w-[360px] overflow-hidden rounded-2xl border border-[#ece7f5] bg-white shadow-[0_20px_60px_-30px_rgba(31,22,56,0.35)]">
            <div className="flex items-center justify-between border-b border-[#ece7f5] px-5 py-3.5">
              <p className="text-[14px] font-semibold text-[#1f1638]">Send Feedback</p>
              <button
                type="button"
                onClick={() => { setOpen(false); reset(); }}
                className="rounded-full p-1 text-[#7a7390] hover:bg-[#f5f3fa]"
              >
                <X size={16} />
              </button>
            </div>

            {submitted ? (
              <div className="px-5 py-8 text-center">
                <p className="text-[14px] font-semibold text-emerald-600">Thanks for your feedback!</p>
                <p className="mt-1 text-[12px] text-[#7a7390]">Agents will pick this up on the next cycle.</p>
              </div>
            ) : (
              <div className="space-y-3 px-5 py-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  placeholder="Title (required)"
                  className="w-full rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-3 py-2 text-[13px] text-[#1f1638] outline-none focus:border-[var(--brand-border)]"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 10000))}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-3 py-2 text-[13px] text-[#1f1638] outline-none focus:border-[var(--brand-border)]"
                />
                <div className="flex gap-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-2.5 py-2 text-[12px] text-[#1f1638] outline-none capitalize"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="flex-1 rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-2.5 py-2 text-[12px] text-[#1f1638] outline-none capitalize"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!title.trim() || submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  <Send size={14} />
                  {submitting ? "Sending…" : "Submit"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
