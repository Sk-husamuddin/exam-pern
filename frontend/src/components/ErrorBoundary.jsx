/**
 * Catches render/lifecycle errors anywhere below it so a crashing component
 * can never produce a blank page. Shows a friendly error screen with a Reload
 * button and a "Back to login" link. In development the real error message is
 * shown; in production a generic message is shown (no secrets leaked).
 */
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Never log secrets: only surface a safe message to the console.
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught:', error);
    }
  }

  handleReload = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.reload();
  };

  handleBackToLogin = () => {
    window.location.href = '/faculty/login';
  };

  render() {
    const { error, errorInfo } = this.state;
    const { children } = this.props;

    if (error) {
      const message =
        process.env.NODE_ENV === 'development'
          ? error.message || 'An unexpected error occurred'
          : 'Something went wrong while rendering this page.';

      return React.createElement(
        'div',
        {
          role: 'alert',
          'aria-live': 'polite',
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            maxWidth: 560,
            margin: '8vh auto',
            padding: 24,
            border: '1px solid #27272A',
            borderRadius: 0,
            background: '#121212',
            color: '#FFFFFF',
          },
        },
        React.createElement(
          'h2',
          { style: { marginTop: 0, fontSize: 20, color: '#FF1818', fontWeight: 800 } },
          'Something went wrong'
        ),
        React.createElement(
          'p',
          { style: { fontSize: 14, color: '#E4E4E7', marginBottom: 18 } },
          message
        ),
        process.env.NODE_ENV === 'development' && errorInfo
          ? React.createElement(
              'details',
              { style: { fontSize: 11, color: '#6b7280', marginBottom: 16 } },
              React.createElement('summary', null, 'Error details'),
              React.createElement(
                'pre',
                {
                  style: {
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 6,
                  },
                },
                errorInfo
              )
            )
          : null,
        React.createElement(
          'div',
          { style: { display: 'flex', gap: 10 } },
          React.createElement(
            'button',
            {
              onClick: this.handleReload,
              style: {
                background: '#FF1818',
                color: '#FFFFFF',
                border: '1px solid #FF1818',
                padding: '9px 16px',
                borderRadius: 0,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
              },
            },
            'Reload'
          ),
          React.createElement(
            'button',
            {
              onClick: this.handleBackToLogin,
              style: {
                background: '#FFFFFF',
                border: '1px solid #FFFFFF',
                color: '#000000',
                padding: '9px 16px',
                borderRadius: 0,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 700,
              },
            },
            'Back to login'
          )
        )
      );
    }

    return children;
  }
}
