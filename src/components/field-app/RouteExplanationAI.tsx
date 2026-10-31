import React, { useState } from 'react';
import { Bot, Sparkles, Loader2, AlertCircle } from 'lucide-react';

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
        let errMsg = 'Failed to connect to Ollama. Make sure it is running and CORS is enabled (OLLAMA_ORIGINS="*").';
        try {
            const errData = await response.json();
            if (errData.error) {
                errMsg = `Ollama Error: ${errData.error}`;
            }
        } catch(e) {
            // keep default error
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      setExplanation(data.response);
    } catch (err: any) {
      setError(err.message || 'An error occurred connecting to Ollama.');
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
                className="flex items-center justify-center gap-2 w-full bg-moss-600 hover:bg-moss-700 text-white py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
            >
                <Sparkles size={16} /> Ask AI about this route
            </button>
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-monsoon-600 font-medium">Local Model:</span>
                <input 
                    type="text" 
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="text-[10px] bg-white border border-monsoon-200 rounded px-1.5 py-0.5 outline-none focus:border-moss-500 w-24 text-right text-monsoon-700"
                    placeholder="qwen2.5vl:7b"
                />
            </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 text-moss-700 text-sm font-medium p-3">
          <Loader2 size={16} className="animate-spin" />
          Analyzing route...
        </div>
      )}

      {error && (
        <div className="text-terracotta-600 text-xs flex flex-col gap-1.5 p-1">
          <div className="flex items-start gap-1 font-bold">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <p>Connection Error</p>
          </div>
          <p className="pl-4">{error}</p>
          <button 
             onClick={() => setError(null)}
             className="text-[10px] bg-terracotta-100 hover:bg-terracotta-200 text-terracotta-800 px-2 py-1 rounded ml-4 self-start mt-1 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {explanation && !loading && (
        <div className="animate-fade-in text-sm text-monsoon-900">
          <div className="flex items-center gap-1.5 mb-1.5 text-moss-700 font-bold text-xs uppercase tracking-wider">
             <Bot size={14} /> AI Analysis
          </div>
          <p className="leading-relaxed text-[13px]">{explanation}</p>
          <div className="flex justify-end mt-2">
              <button 
                 onClick={() => setExplanation('')}
                 className="text-xs text-monsoon-600 font-medium hover:text-monsoon-800 transition-colors"
              >
                Clear
              </button>
          </div>
        </div>
      )}
    </div>
  );
};
