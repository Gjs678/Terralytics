import React, { useState } from 'react';
import { Mic, CheckCircle } from 'lucide-react';

export const VoiceCommandButton: React.FC = () => {
  const [listening, setListening] = useState(false);
  const [transcribed, setTranscribed] = useState('');

  const handlePress = () => {
    setListening(true);
    setTranscribed('');
    setTimeout(() => {
      setTranscribed('"Accept route"');
      setTimeout(() => {
        setListening(false);
      }, 1500);
    }, 2000);
  };

  return (
    <div className="flex flex-col items-center">
      <button 
        onClick={handlePress}
        className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
          listening ? 'bg-amber-500 scale-110 animate-pulse' : 'bg-monsoon-800 hover:bg-monsoon-900'
        }`}
      >
        <Mic size={28} />
      </button>
      
      <div className="h-6 mt-2 text-sm font-medium text-monsoon-700 text-center">
        {listening && !transcribed && <span>Listening...</span>}
        {transcribed && <span className="flex items-center gap-1 text-moss-600"><CheckCircle size={14}/> {transcribed}</span>}
      </div>
    </div>
  );
};
