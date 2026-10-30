import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

const ThrowingComponent = () => {
  throw new Error('boom');
};

const Children = () => <div data-testid="normal-content">Normal content</div>;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('catches a thrown error and shows a friendly screen instead of blank', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Reload', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Back to login', { exact: false })).toBeInTheDocument();
    // Children must NOT be rendered when erroring
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <Children />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('normal-content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong', { exact: true })).not.toBeInTheDocument();
  });
});
