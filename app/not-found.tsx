import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
      <div className="flex flex-col items-center gap-2">
        <span className="text-6xl font-bold text-muted-foreground">404</span>
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </p>
      </div>
      <Link
        href="/"
        className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Go to Board
      </Link>
    </main>
  );
}
