import React, { useState } from 'react';
import { Bot, Sparkles, Loader2, AlertCircle, X, RefreshCw } from 'lucide-react';

interface RouteExplanationAIProps {
  order: any;
}

export const RouteExplanationAI: React.FC<RouteExplanationAIProps> = ({ order }) => {
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState('qwen2.5vl:7b');

  const fetchExplanation = async () => {
    if (!order) return;

    setLoading(true);
    setError(null);
    setExplanation('');

    const prompt = `You are an AI assistant for a delivery routing app.
The driver is delivering ${order.items} to ${order.destination}.
We have automatically re-routed them because the fastest route contains a danger zone: ${order.dangerZone?.type || 'Hazard'}.
Please provide a very brief (2-3 sentences), reassuring explanation to the driver on why this route was chosen and why it's safer. Do not use formatting, just plain text.`;

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        let errMsg = `Local model '${modelName}' is unavailable in Ollama. Pull it via 'ollama run ${modelName}' or configure another model below.`;
        try {
          const errData = await response.json();
          if (errData.error) {
            if (errData.error.toLowerCase().includes('not found')) {
              errMsg = `Local model '${modelName}' is unavailable in Ollama. Pull it via 'ollama run ${modelName}' or enter an installed model.`;
            } else {
              errMsg = `Ollama Error: ${errData.error}`;
            }
          }
        } catch {
          // keep descriptive error
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      setExplanation(data.response);
    } catch (err: any) {
      const rawMessage = err?.message || '';
      if (rawMessage.toLowerCase().includes('failed to fetch') || rawMessage.toLowerCase().includes('networkerror')) {
        setError(`Cannot reach local Ollama on localhost:11434. Ensure Ollama is running with CORS enabled (OLLAMA_ORIGINS="*").`);
      } else {
        setError(rawMessage || `Local model '${modelName}' is unavailable in Ollama.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 bg-moss-50/80 rounded-md p-3 border border-moss-100">
      {!explanation && !loading && !error && (
        <div className="flex flex-col gap-2">
          <button
            onClick={fetchExplanation}
            className="flex items-center justify-center gap-2 w-full bg-moss-600 hover:bg-moss-700 text-white py-2 rounded-lg font-medium text-sm transition-colors shadow-sm cursor-pointer"
          >
            <Sparkles size={16} /> Ask AI about this route
          </button>
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-monsoon-600 font-medium">Local Model:</span>
            <input
              type="text"
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              className="text-[10px] bg-white border border-monsoon-200 rounded px-1.5 py-0.5 outline-none focus:border-moss-500 w-28 text-right text-monsoon-700 font-mono"
              placeholder="qwen2.5vl:7b"
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 text-moss-700 text-sm font-medium p-3">
          <Loader2 size={16} className="animate-spin" />
          Analyzing route with {modelName}...
        </div>
      )}

      {/* Compact dismissible notification for AI connection/model errors */}
      {error && (
        <div className="relative bg-amber-50/90 border border-amber-200 rounded-lg p-2.5 text-xs animate-fade-in shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 text-amber-800">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900 text-[11px] uppercase tracking-wide">
                  Local AI Offline
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-amber-500 hover:text-amber-800 p-0.5 rounded transition-colors shrink-0"
              aria-label="Dismiss error"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-amber-200/60">
            <div className="flex items-center gap-1.5">
              <button
                onClick={fetchExplanation}
                className="flex items-center gap-1 text-[10px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-0.5 rounded transition-colors"
              >
                <RefreshCw size={10} /> Try Again
              </button>
              <button
                onClick={() => setError(null)}
                className="text-[10px] font-medium text-amber-700 hover:text-amber-900 px-1.5 py-0.5 transition-colors"
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-monsoon-600">
              <span>Model:</span>
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                className="text-[10px] bg-white border border-amber-200 rounded px-1 py-0.5 outline-none w-20 text-right text-monsoon-800 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {explanation && !loading && (
        <div className="animate-fade-in text-sm text-monsoon-900">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-moss-700 font-bold text-xs uppercase tracking-wider">
              <Bot size={14} /> AI Route Explanation
            </div>
            <span className="text-[10px] text-monsoon-500 font-mono">{modelName}</span>
          </div>
          <p className="leading-relaxed text-[13px] text-monsoon-800 bg-white/60 p-2 rounded border border-moss-100">
            {explanation}
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={fetchExplanation}
              className="text-xs text-moss-600 hover:text-moss-800 font-medium transition-colors"
            >
              Re-analyze
            </button>
            <button
              onClick={() => setExplanation('')}
              className="text-xs text-monsoon-500 hover:text-monsoon-800 font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
