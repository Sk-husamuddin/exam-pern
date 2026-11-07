import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LiveMonitor from '../pages/LiveMonitor.jsx';

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

async function settled() {
  await new Promise((r) => setTimeout(r, 150));
}

describe('LiveMonitor Manual Question Assignment', () => {
  it('renders "Change" button for entered student and assigns selected question', async () => {
    mockFetch.mockImplementation((url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('/faculty/exams/1')) {
        return respondWith({
          ok: true,
          exam: {
            id: 1,
            title: 'Operating Systems Midterm',
            code: 'OS101',
            status: 'live',
            duration_min: 60,
            max_violations: 3,
            questions: [
              { id: 101, q_no: 1, body: 'Explain Peterson algorithm.' },
              { id: 102, q_no: 2, body: 'Explain Banker algorithm for deadlock avoidance.' },
            ],
          },
        });
      }
      if (urlStr.includes('/faculty/state')) {
        return respondWith({
          ok: true,
          exam: {
            status: 'live',
            total_q: 2,
            seconds_left: 3600,
            max: 3,
          },
          students: [
            {
              sid: 55,
              username: '24761A05AU',
              name: 'SHAIK HUSAMUDDIN',
              login_order: 1,
              login_time: '10:00:00 AM',
              violations: 0,
              locked: false,
              position: 1,
              position_str: 'Q1',
              question_text: 'Explain Peterson algorithm.',
              online: true,
              last_reason: '',
            },
          ],
        });
      }
      if (urlStr.includes('/faculty/action')) {
        const body = JSON.parse(options.body);
        expect(body.action).toBe('change_question');
        expect(body.sid).toBe(55);
        expect(body.question_id).toBe(102);
        return respondWith({ ok: true, message: 'Assigned question Q2 successfully' });
      }
      return respondWith({ ok: true });
    });

    render(
      <MemoryRouter initialEntries={['/faculty/monitor/1']}>
        <Routes>
          <Route path="/faculty/monitor/:examId" element={<LiveMonitor />} />
        </Routes>
      </MemoryRouter>
    );

    await settled();

    // Verify student row and "Change" button are rendered
    expect(screen.getByText('SHAIK HUSAMUDDIN')).toBeInTheDocument();
    expect(screen.getByText('Q1')).toBeInTheDocument();
    const changeBtn = screen.getByRole('button', { name: 'Change' });
    expect(changeBtn).toBeInTheDocument();

    // Click "Change" to open question selection modal
    fireEvent.click(changeBtn);
    await settled();

    // Verify Modal header and questions list
    expect(screen.getByText('Assign Question to Student')).toBeInTheDocument();
    expect(screen.getByText(/Banker algorithm for deadlock avoidance/)).toBeInTheDocument();

    // Click "Assign Question 2"
    const assignBtn = screen.getByRole('button', { name: 'Assign Question 2' });
    fireEvent.click(assignBtn);
    await settled();

    // Verify optimistic update / flash message
    expect(screen.getByText(/Assigned Question 2 to SHAIK HUSAMUDDIN/)).toBeInTheDocument();
  });
});
