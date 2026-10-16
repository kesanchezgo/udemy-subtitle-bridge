import React from 'react';
import ReactDOM from 'react-dom/client';
import { PermissionPage } from './app/components/PermissionPage';
import './app/styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('permission-root') as HTMLElement);
root.render(
  <React.StrictMode>
    <PermissionPage />
  </React.StrictMode>
);
