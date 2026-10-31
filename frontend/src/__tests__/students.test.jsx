import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentsManager from '../pages/StudentsManager.jsx';

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

describe('StudentsManager', () => {
  it('renders student list and enrollment count', async () => {
    mockFetch.mockResolvedValueOnce(
      respondWith({
        ok: true,
        students: [
          { id: 1, username: '21CS001', name: 'Ravi Kumar' },
          { id: 2, username: '21CS002', name: 'Priya Sharma' },
        ],
      })
    );

    render(
      <MemoryRouter>
        <StudentsManager />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('21CS001')).toBeInTheDocument();
      expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
      expect(screen.getByText('2 Enrolled')).toBeInTheDocument();
    });
  });

  it('shows animated loading banner while importing Excel/CSV file', async () => {
    mockFetch.mockResolvedValueOnce(
      respondWith({
        ok: true,
        students: [],
      })
    );

    let resolveImport;
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve;
    });

    render(
      <MemoryRouter>
        <StudentsManager />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('2. Import from Excel / CSV')).toBeInTheDocument();
    });

    const file = new File(['username,name\n21CS001,Ravi'], 'students.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText(/Excel \/ CSV Spreadsheet/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Mock the import endpoint with delayed resolution
    mockFetch.mockImplementationOnce(() => importPromise);

    const form = fileInput.closest('form');
    fireEvent.submit(form);

    // Should display loading progress status
    await waitFor(() => {
      expect(screen.getByText('Uploading & Processing Roster…')).toBeInTheDocument();
      expect(screen.getByText(/Importing student roster…/i)).toBeInTheDocument();
    });

    // Resolve import request
    resolveImport(
      respondWith({
        ok: true,
        message: 'Imported 1 student(s).',
      })
    );

    // Follow-up fetch after import
    mockFetch.mockResolvedValueOnce(
      respondWith({
        ok: true,
        students: [{ id: 1, username: '21CS001', name: 'Ravi' }],
      })
    );

    await waitFor(() => {
      expect(screen.queryByText('Uploading & Processing Roster…')).not.toBeInTheDocument();
      expect(screen.getByText('Imported 1 student(s).')).toBeInTheDocument();
    });
  });
});
