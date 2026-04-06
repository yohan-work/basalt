import Link from 'next/link';

const SECTION: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  padding: 24,
};

const CARD: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
  padding: 16,
};

export default function Page() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #f8fafc 0%, #eef2ff 40%, #ffffff 100%)',
        color: '#111827',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '56px 20px 80px',
          display: 'grid',
          gap: 20,
        }}
      >
        <section style={SECTION}>
          <span
            style={{
              display: 'inline-block',
              borderRadius: 999,
              background: '#e0e7ff',
              color: '#3730a3',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            BASALT PRESENTATION DEMO
          </span>
          <h1 style={{ fontSize: 42, margin: '14px 0 8px', lineHeight: 1.1 }}>
            Product Landing Ready
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: '#4b5563', maxWidth: 760 }}>
            This landing page is a deterministic snapshot applied by Basalt demo
            preset. The execution flow is live, and the final output is fixed.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <Link
              href="/board"
              style={{
                display: 'inline-block',
                borderRadius: 10,
                background: '#111827',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 700,
                padding: '12px 16px',
              }}
            >
              Open Board
            </Link>
            <span
              style={{
                display: 'inline-block',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#374151',
                fontWeight: 600,
                padding: '12px 16px',
              }}
            >
              Status: Demo Applied
            </span>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <article style={CARD}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Request</h2>
            <p style={{ margin: 0, color: '#4b5563' }}>
              Capture requirements with a stable presentation template.
            </p>
          </article>
          <article style={CARD}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Plan & Dev</h2>
            <p style={{ margin: 0, color: '#4b5563' }}>
              Keep live orchestration and logs visible during execution.
            </p>
          </article>
          <article style={CARD}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Test & Review</h2>
            <p style={{ margin: 0, color: '#4b5563' }}>
              Always land on a deterministic output for the final showcase.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
