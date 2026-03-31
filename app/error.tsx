'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Page-level runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-50 border border-zinc-800 rounded-lg my-8">
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">앗, 페이지 로드 중 문제가 발생했습니다</h2>
          <p className="text-zinc-400">
            에이전트가 생성한 코드 또는 런타임에서 에러가 발생했습니다. 아래 정보를 확인해주세요.
          </p>
        </div>

        <div className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-md text-left font-mono text-sm overflow-auto max-h-64">
          <p className="text-red-400 font-bold mb-1">Error: {error.name}</p>
          <p className="text-zinc-300 whitespace-pre-wrap">{error.message}</p>
          {error.digest && (
            <p className="text-zinc-500 mt-2 text-xs">Digest: {error.digest}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-md bg-zinc-800 text-zinc-100 hover:bg-zinc-700 font-medium transition-all"
          >
            새로고침
          </button>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 font-medium transition-all"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}

