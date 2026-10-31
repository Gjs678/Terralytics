import React from 'react';
import { Outlet } from 'react-router-dom';
import { useDocumentTitle } from '../../utils/useDocumentTitle';

export const FieldAppShell: React.FC = () => {
  useDocumentTitle('Driver App');

  return (
    <div className="h-dvh w-full bg-monsoon-100 overflow-hidden">
      <Outlet />
    </div>
  );
};
