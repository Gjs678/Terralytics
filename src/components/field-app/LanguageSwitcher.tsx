import React, { useState } from 'react';
import { Languages } from 'lucide-react';

export const LanguageSwitcher: React.FC = () => {
  const [lang, setLang] = useState('EN');
  const toggle = () => {
    if (lang === 'EN') setLang('HI');
    else if (lang === 'HI') setLang('AS'); // Assamese
    else setLang('EN');
  };

  return (
    <button 
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-monsoon-800 border border-monsoon-200 rounded-full shadow-sm text-xs font-bold hover:bg-monsoon-50 transition-colors"
    >
      <Languages size={14} />
      {lang}
    </button>
  );
};
