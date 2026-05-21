import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './app/PopupApp';
import './app/styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
