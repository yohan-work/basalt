import { faker } from '@faker-js/faker';

export default function TempPage() {
  const rows = Array.from({ length: 8 }, () => ({
    id: faker.string.uuid(),
    displayName: `${faker.person.firstName()} ${faker.person.lastName()}`,
    email: faker.internet.email(),
  }));

  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-xl font-semibold mb-4">Temp (mock data)</h1>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-border pb-2">
            <span className="font-medium">{row.displayName}</span>
            <span className="text-muted-foreground ml-2">{row.email}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
