export default function FacultyFooter({ style: customStyle = {} }) {
  return (
    <footer
      data-testid="faculty-footer"
      style={{
        marginTop: 'auto',
        padding: '32px 16px 24px',
        textAlign: 'center',
        fontSize: 12,
        color: '#71717A',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        letterSpacing: '0.01em',
        ...customStyle,
      }}
    >
      <span>Developed by </span>
      <strong style={{ color: '#000000', fontWeight: 600 }}>Y. Babu</strong>
      <span> and </span>
      <strong style={{ color: '#000000', fontWeight: 600 }}>Shaik Husamuddin</strong>
      <span>. Computer Science & Engineering . </span>
      <strong style={{ color: '#000000', fontWeight: 700 }}>LBRCE</strong>
    </footer>
  );
}
