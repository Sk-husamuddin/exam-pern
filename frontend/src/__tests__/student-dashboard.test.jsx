import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from '../pages/StudentDashboard.jsx';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../lib/supabase.js', () => ({
  API_BASE: '/api',
  AUTH_BASE: '/auth',
}));

const mockFetch = vi.fn();
beforeEach(() => {
  global.fetch = mockFetch;
  sessionStorage.clear();
  sessionStorage.setItem('exam_student_token', 'test-session-token');
  sessionStorage.setItem('exam_student_code', 'AB12CD');
  sessionStorage.setItem('exam_student_title', 'Algorithms Midterm');
  sessionStorage.setItem('exam_student_user', JSON.stringify({ name: 'Rahul Sharma', username: '21CS099' }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

function respondWith(json, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => json });
}

describe('StudentDashboard', () => {
  it('renders student name, exam title, and exam code', async () => {
    mockFetch.mockResolvedValue(
      respondWith({
        status: 'draft',
        title: 'Algorithms Midterm',
        locked: false,
        violations: 0,
        max: 3,
        seconds_left: null,
      })
    );

    render(
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Rahul Sharma').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Algorithms Midterm')).toBeInTheDocument();
      expect(screen.getByText('AB12CD')).toBeInTheDocument();
      expect(screen.getByText('Waiting for faculty to start the exam…')).toBeInTheDocument();
    });
  });

  it('renders prominent red Start Exam button when status is live and enters fullscreen on click', async () => {
    mockFetch.mockResolvedValue(
      respondWith({
        status: 'live',
        title: 'Algorithms Midterm',
        locked: false,
        violations: 0,
        max: 3,
        seconds_left: 3600,
      })
    );

    // Mock requestFullscreen
    const requestFsMock = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFsMock;

    render(
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Exam/i })).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /Start Exam/i });
    expect(startBtn.style.background).toContain('rgb(220, 38, 38)');

    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(requestFsMock).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/student/exam');
    });
  });
});
