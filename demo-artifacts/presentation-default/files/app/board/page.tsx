import Link from 'next/link';

type BoardItem = {
  id: string;
  title: string;
  owner: string;
  status: 'Todo' | 'Doing' | 'Done';
  due: string;
};

const ITEMS: BoardItem[] = [
  { id: 'BK-101', title: 'Landing Hero Copy Update', owner: 'Ari', status: 'Done', due: '2026-04-07' },
  { id: 'BK-102', title: 'Board Layout Alignment', owner: 'Noah', status: 'Doing', due: '2026-04-09' },
  { id: 'BK-103', title: 'QA Signoff Capture', owner: 'Mina', status: 'Todo', due: '2026-04-10' },
  { id: 'BK-104', title: 'Review Summary Draft', owner: 'Liam', status: 'Doing', due: '2026-04-11' },
];

const statusColor = (status: BoardItem['status']): string => {
  if (status === 'Done') return '#166534';
  if (status === 'Doing') return '#9a3412';
  return '#374151';
};

const statusBg = (status: BoardItem['status']): string => {
  if (status === 'Done') return '#dcfce7';
  if (status === 'Doing') return '#ffedd5';
  return '#f3f4f6';
};

export default function BoardPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#111827' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 20px 80px' }}>
        <header
          style={{
            border: '1px solid #e5e7eb',
            background: '#ffffff',
            borderRadius: 16,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <p style={{ margin: 0, color: '#4b5563', fontSize: 13, fontWeight: 700 }}>
            PRESENTATION BOARD SNAPSHOT
          </p>
          <h1 style={{ margin: '10px 0 8px', fontSize: 34 }}>Execution Board</h1>
          <p style={{ margin: 0, color: '#4b5563' }}>
            This board is prebuilt and applied by demo artifact for deterministic
            presentation output.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link
              href="/"
              style={{
                display: 'inline-block',
                textDecoration: 'none',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#111827',
                fontWeight: 600,
                padding: '10px 14px',
              }}
            >
              Back to Landing
            </Link>
          </div>
        </header>

        <section
          style={{
            border: '1px solid #e5e7eb',
            background: '#ffffff',
            borderRadius: 16,
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Task</th>
                <th style={thStyle}>Owner</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Due</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.id}</td>
                  <td style={tdStyle}>{item.title}</td>
                  <td style={tdStyle}>{item.owner}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontWeight: 700,
                        fontSize: 12,
                        background: statusBg(item.status),
                        color: statusColor(item.status),
                      }}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{item.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 13,
  color: '#4b5563',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
};
