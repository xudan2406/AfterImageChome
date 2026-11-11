import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from '../../src/features/popup/PopupApp';
import '../../src/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
