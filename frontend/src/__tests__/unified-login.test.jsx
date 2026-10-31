import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UnifiedLogin } from '../pages/PlatformScreens.jsx';
import ExamScreen from '../pages/ExamScreen.jsx';

// Mock Supabase
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fac_token' } } }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] }, session: null } }),
      resend: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
  AUTH_BASE: 'http://localhost:5000/auth',
  API_BASE: 'http://localhost:5000/api',
}));

describe('UnifiedLogin Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('renders unified login form with identifier, password, and exam code fields', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <UnifiedLogin />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/Email or Roll number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-character exam code/i)).toBeInTheDocument();
    // When code is empty, submit button indicates faculty sign in
    expect(screen.getByRole('button', { name: /Sign in as Faculty/i })).toBeInTheDocument();
  });

  it('switches button label dynamically to student login when exam code is entered', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <UnifiedLogin />
      </MemoryRouter>
    );

    const codeInput = screen.getByLabelText(/6-character exam code/i);
    fireEvent.change(codeInput, { target: { value: 'A1B2C3' } });

    expect(screen.getByRole('button', { name: /Enter Exam as Student/i })).toBeInTheDocument();
    expect(screen.getByText(/Student Access/i)).toBeInTheDocument();
  });

  it('executes student login and enter flow when exam code is provided', async () => {
    const mockStudentUser = { id: 's1', username: '24761A05AU', name: 'Shaik Husamuddin', role: 'student' };

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/auth/student/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, studentJwt: 'stu_jwt_123', user: mockStudentUser }),
        });
      }
      if (url.includes('/api/student/enter')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'live', session_token: 'sess_tok_456', title: 'Data Structures' }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <UnifiedLogin />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Email or Roll number/i), { target: { value: '24761A05AU' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'Password123!' } });
    fireEvent.change(screen.getByLabelText(/6-character exam code/i), { target: { value: 'DS101X' } });

    fireEvent.click(screen.getByRole('button', { name: /Enter Exam as Student/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem('exam_student_jwt')).toBe('stu_jwt_123');
      expect(sessionStorage.getItem('exam_student_token')).toBe('sess_tok_456');
      expect(sessionStorage.getItem('exam_student_code')).toBe('DS101X');
      expect(JSON.parse(sessionStorage.getItem('exam_student_user'))).toEqual(mockStudentUser);
    });
  });
});

describe('ExamScreen Student Identity Display', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('exam_student_token', 'test_tok');
    sessionStorage.setItem(
      'exam_student_user',
      JSON.stringify({ username: '24761A05AU', name: 'Shaik Husamuddin' })
    );

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/student/state')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                status: 'live',
                title: 'Operating Systems',
                locked: false,
                violations: 0,
                max: 3,
                seconds_left: 3600,
                entered: true,
                questions: [
                  { id: 1, position: 1, body: 'Explain process scheduling algorithms.' }
                ],
              })
            ),
        });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('displays student name and roll number in the top persistent header bar', async () => {
    render(
      <MemoryRouter>
        <ExamScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('studentName')).toHaveTextContent('Shaik Husamuddin');
      expect(screen.getByTestId('studentRollNo')).toHaveTextContent('Roll No: 24761A05AU');
    });
  });
});

