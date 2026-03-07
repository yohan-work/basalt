import React from 'react';

// 에이전트들의 책상 하드코딩 위치 (AgentDiscussion.tsx의 idle zone과 정확히 일치시킴)
export function OfficeLayout() {
    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
            {/* 1. 벽돌 벽 -> 다이아몬드 그물망 패턴 (상단 고정 180px) */}
            <div
                className="absolute top-0 left-0 w-full h-[180px] bg-[#eef2f6] z-0 flex items-center justify-center gap-8"
                style={{
                    backgroundImage: `
                        linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0), 
                        linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0)
                    `,
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 10px 10px',
                    borderBottom: '2px solid #cbd5e1'
                }}
            >
                {/* 2D Flat Dashboard Screens */}
                <div className="w-[180px] h-[80px] bg-slate-800 rounded flex flex-col justify-center px-4 shadow-sm border-[3px] border-slate-600">
                    <div className="flex justify-between text-emerald-400 text-[10px] font-mono mb-1">
                        <span>Clients</span><span>Users</span><span>Spots</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 text-xl font-mono font-bold leading-none">
                        <span>49</span><span>44</span><span>29</span>
                    </div>
                </div>

                <div className="w-[240px] h-[80px] bg-white rounded shadow-sm border border-slate-200 flex items-center px-4 relative">
                    <div className="w-16 h-2 bg-slate-100 rounded-full absolute top-3 left-4" />
                    <div className="w-12 h-2 bg-slate-100 rounded-full absolute top-7 left-4" />
                    {/* 도넛 차트 모조 */}
                    <div className="absolute top-1/2 right-6 -translate-y-1/2 w-10 h-10 rounded-full border-[4px] border-slate-100 border-r-emerald-400 border-t-emerald-400" />
                </div>

                <div className="w-[180px] h-[80px] bg-white rounded shadow-sm border border-slate-200 flex items-end p-3 gap-2">
                    {[30, 60, 20, 80, 50, 20].map((h, i) => (
                        <div key={i} className="flex-1 bg-emerald-400 opacity-90 rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                </div>
            </div>

            {/* 2. 스트라이프 바닥 영역 (하단 나머지) */}
            <div
                className="absolute top-[180px] bottom-0 left-0 w-full z-0"
                style={{
                    backgroundColor: '#ded0ba', // Wood base color
                    backgroundImage: `linear-gradient(90deg, transparent 50%, rgba(255,255,255,0.2) 50%)`,
                    backgroundSize: '60px 100%',
                }}
            >
                {/* Top Shadow from wall */}
                <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/5 to-transparent pointer-events-none" />
            </div>
        </div>
    );
}
