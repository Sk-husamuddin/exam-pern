import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FacultyDashboard from '../pages/FacultyDashboard.jsx';

// ---------------------------------------------------------------------------
// Mock supabase so apiGet/apiPost can resolve a session (no auth redirect)
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } } })),
      signOut: vi.fn(() => Promise.resolve()),
    },
  },
  API_BASE: '/api',
  AUTH_BASE: '/auth',
}));

const mockFetch = vi.fn();
beforeEach(() => {
  global.fetch = mockFetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

function respondWith(json, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => json });
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/faculty/dashboard']}>
      <FacultyDashboard />
    </MemoryRouter>
  );
}

async function settled() {
  await new Promise((r) => setTimeout(r, 200));
}

function bodyText() {
  return document.body.textContent || '';
}

describe('FacultyDashboard', () => {
  it('renders empty state for zero exams', async () => {
    mockFetch.mockResolvedValue(respondWith({ ok: true, exams: [] }));

    renderDashboard();
    await settled();

    expect(bodyText()).toContain('No exams yet. Create your first exam above.');
    expect(screen.getByText('Exam Portal', { exact: false })).toBeInTheDocument();
  });

  it('renders exams in draft/live/ended status', async () => {
    mockFetch.mockResolvedValue(
      respondWith({
        ok: true,
        exams: [
          { id: 1, code: 'A1B2C3', title: 'Draft Exam', status: 'draft', qc: 2, sc: 0, duration_min: 60, max_violations: 3 },
          { id: 2, code: 'D4E5F6', title: 'Live Exam', status: 'live', qc: 3, sc: 2, duration_min: 45, max_violations: 3 },
          { id: 3, code: 'G7H8I9', title: 'Ended Exam', status: 'ended', qc: 1, sc: 1, duration_min: 30, max_violations: 3 },
        ],
      })
    );

    renderDashboard();
    await settled();

    expect(screen.getByText('A1B2C3', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('D4E5F6', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('G7H8I9', { exact: false })).toBeInTheDocument();
  });

  it('shows an error card with Retry when the API fails', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    renderDashboard();
    await settled();

    expect(bodyText()).toContain('Failed to fetch');
    expect(screen.getByText('Retry', { exact: false })).toBeInTheDocument();
  });

  it('shows Loading initially then renders content', async () => {
    mockFetch.mockResolvedValue(respondWith({ ok: true, exams: [] }));

    renderDashboard();
    expect(screen.getByText('Loading…', { exact: false })).toBeInTheDocument();

    await settled();
    expect(screen.queryByText('Loading…', { exact: false })).not.toBeInTheDocument();
    expect(bodyText()).toContain('No exams yet. Create your first exam above.');
  });

  it('does not crash on an unexpected response shape', async () => {
    mockFetch.mockResolvedValue(respondWith({ not_exams: 'surprise' }));

    renderDashboard();
    await settled();

    expect(bodyText()).toContain('No exams yet. Create your first exam above.');
  });
});
