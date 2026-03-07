import React from 'react';

export function OfficeLayout() {
    return (
        <div className="absolute inset-0 w-full h-full bg-[#f1f5f9] overflow-hidden flex items-center justify-center">
            {/* Minimal Dot Grid Background */}
            <div
                className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}
            />

            {/* Overall wrapper to keep things organized relative to the center */}
            <div className="relative w-full max-w-5xl h-[600px]">

                {/* 1. Boardroom (Top Left) */}
                <div className="absolute top-[5%] left-[5%] w-[38%] h-[40%] bg-white rounded-md shadow-md border-[2px] border-slate-200 overflow-hidden isolate">
                    {/* Pink accent side line */}
                    <div className="absolute top-0 left-0 w-8 h-full bg-pink-50" />

                    {/* Checkered pattern background */}
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0)`, backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' }}></div>

                    <div className="absolute top-4 left-4 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-sm uppercase tracking-wider z-10 shadow-sm">Boardroom</div>

                    {/* Giant Dark Gray Oval Table */}
                    <div className="absolute top-1/2 left-[55%] -translate-x-1/2 -translate-y-1/2 w-[65%] h-[50%] bg-[#2d3748] rounded-full shadow-md border-[3px] border-[#1a202c] overflow-hidden z-10">
                        {/* Inner detail */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[40%] bg-[#4a5568] rounded-full opacity-60"></div>
                    </div>

                    {/* Circular decorations / plants */}
                    <div className="absolute bottom-6 left-6 w-8 h-8 rounded-full border-[3px] border-emerald-300 flex items-center justify-center bg-transparent z-10">
                        <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                    </div>
                    {/* Top right target-like shape */}
                    <div className="absolute top-6 right-8 w-6 h-6 rounded-full border-[2px] border-emerald-300 z-10"></div>
                </div>

                {/* 2. Patio (Top Right) */}
                <div className="absolute top-[8%] right-[5%] w-[42%] h-[35%] bg-emerald-50/50 rounded-md shadow-sm border-[3px] border-emerald-200 p-4 isolate font-mono">
                    <div className="absolute top-4 right-4 bg-white text-emerald-600 text-[10px] font-bold px-3 py-1 rounded-sm uppercase tracking-wider z-10 shadow-sm">Patio</div>

                    {/* Large green bush/shape */}
                    <div className="absolute top-6 left-6 w-16 h-16 rounded-full bg-emerald-500 shadow-sm z-10 opacity-90"></div>
                    <div className="absolute top-16 left-12 w-10 h-10 rounded-full bg-emerald-400 shadow-sm z-10 opacity-90 border-2 border-emerald-50"></div>

                    {/* Blue striped area (Pool or Rug) */}
                    <div className="absolute bottom-4 right-4 w-[55%] h-[60%] border-[2px] border-cyan-300 bg-cyan-50 opacity-80"
                        style={{
                            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(165,243,252,0.5) 5px, rgba(165,243,252,0.5) 10px)`
                        }}>
                    </div>
                </div>

                {/* 3. Engineering Hub (Bottom Center-Left) */}
                <div className="absolute bottom-[10%] left-[8%] w-[55%] h-[40%] bg-[#fff8f1] rounded-md shadow-sm border-[3px] border-orange-100 p-4 isolate">
                    <div className="absolute top-4 left-4 text-orange-400 text-[10px] font-extrabold uppercase tracking-widest z-10">Engineering Hub</div>

                    {/* Concentric rings design element */}
                    <div className="absolute top-0 right-[20%] w-24 h-24 rounded-full border-[10px] border-slate-100/80 -translate-y-1/2 -mb-10 flex justify-center items-center">
                        <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    </div>

                    {/* Minimalist White Desk Blocks */}
                    <div className="absolute bottom-6 left-[10%] w-[35%] h-[20%] bg-white rounded-sm shadow-md border-b-[6px] border-slate-200 border-x border-t flex justify-center items-center">
                        <div className="w-[60%] h-1 bg-slate-200 rounded">
                            <div className="w-8 h-full bg-cyan-300 mx-auto rounded"></div>
                        </div>
                    </div>

                    <div className="absolute bottom-6 right-[10%] w-[35%] h-[20%] bg-white rounded-sm shadow-md border-b-[6px] border-slate-200 border-x border-t flex justify-center items-center">
                        <div className="w-[60%] h-1 bg-slate-200 rounded"></div>
                    </div>
                </div>

                {/* 4. Studio Hub Placeholder Area (Bottom Right) */}
                <div className="absolute bottom-[10%] right-[10%] w-[15%] h-[20%]">
                    {/* Optional extra elements for the Design/Studio area could go here, 
                        or it can just be open space with the dots */}
                </div>

            </div>
        </div>
    );
}
