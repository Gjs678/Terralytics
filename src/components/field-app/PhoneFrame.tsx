import React from 'react';

export const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="relative w-full max-w-[375px] h-[812px] bg-white rounded-[3rem] shadow-2xl overflow-hidden border-[8px] border-monsoon-900 mx-auto flex flex-col">
      {/* Notch simulation */}
      <div className="absolute top-0 inset-x-0 h-6 bg-monsoon-900 rounded-b-3xl w-40 mx-auto z-50"></div>
      
      {/* Content area */}
      <div className="flex-1 bg-monsoon-50 overflow-y-auto overflow-x-hidden text-monsoon-900 flex flex-col relative pt-8">
        {children}
      </div>
    </div>
  );
};
