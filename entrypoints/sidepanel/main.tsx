import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorkspaceApp } from '../../src/features/workspace/WorkspaceApp';
import '../../src/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceApp />
  </React.StrictMode>,
);
