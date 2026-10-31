import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { isSupabaseConfigured } from './lib/supabase.js';
import './styles.css';

function ConfigMissing() {
  const missing = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: 540,
      margin: '10vh auto',
      padding: 32,
      border: '1px solid #fee2e2',
      borderRadius: 12,
      background: '#fff',
      boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
      color: '#1f2937',
    }}>
      <h2 style={{ marginTop: 0, color: '#dc2626', fontSize: '1.4rem' }}>
        Configuration missing
      </h2>
      <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.6 }}>
        Required Supabase configuration was not provided at build time:
      </p>
      <ul style={{ background: '#fef2f2', padding: '12px 28px', borderRadius: 8, color: '#991b1b', fontFamily: 'monospace', fontSize: 14 }}>
        {missing.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
        Please set these environment variables in your deployment dashboard (e.g. Vercel Project Settings &gt; Environment Variables) and redeploy.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {!isSupabaseConfigured ? (
      <ConfigMissing />
    ) : (
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    )}
  </React.StrictMode>
);
