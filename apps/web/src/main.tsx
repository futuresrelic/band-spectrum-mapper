import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Capture the OAuth token from ?token= BEFORE React Router can replace the URL.
// Without this, the <Navigate to="/dashboard" replace /> index route strips the
// token from window.location.search before AuthContext's useEffect can read it.
{
  const _params = new URLSearchParams(window.location.search);
  const _token = _params.get('token');
  if (_token) {
    localStorage.setItem('bsm_token', _token);
    const _clean = new URL(window.location.href);
    _clean.searchParams.delete('token');
    window.history.replaceState({}, '', _clean.toString());
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
