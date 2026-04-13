import React from 'react';

function Desk({ className }: { className: string }) {
    return (
        <div className={`absolute ${className}`}>
            <div className="absolute inset-0 rounded-[2px] border border-black/25 bg-[#a5793d]" />
            <div className="absolute left-[8%] top-[12%] h-[26%] w-[84%] rounded-[1px] bg-[#b98a4c]" />
            <div className="absolute left-[12%] top-[22%] h-[26%] w-[24%] border border-black/20 bg-[#5375b8]" />
            <div className="absolute right-[12%] top-[22%] h-[26%] w-[24%] border border-black/20 bg-[#5375b8]" />
            <div className="absolute left-[10%] bottom-[-18%] h-[22%] w-[10%] bg-[#684724]" />
            <div className="absolute right-[10%] bottom-[-18%] h-[22%] w-[10%] bg-[#684724]" />
            <div className="absolute left-[16%] bottom-[-38%] h-[16%] w-[20%] border border-black/20 bg-[#86612e]" />
            <div className="absolute right-[16%] bottom-[-38%] h-[16%] w-[20%] border border-black/20 bg-[#86612e]" />
        </div>
    );
}

function Couch({ className }: { className: string }) {
    return (
        <div className={`absolute ${className}`}>
            <div className="absolute inset-0 rounded-[4px] border border-black/20 bg-[#6f4f4e]" />
            <div className="absolute inset-x-[8%] top-[14%] h-[34%] rounded-[3px] bg-[#8d6865]" />
            <div className="absolute left-[10%] bottom-[-10%] h-[14%] w-[16%] bg-[#5c403e]" />
            <div className="absolute right-[10%] bottom-[-10%] h-[14%] w-[16%] bg-[#5c403e]" />
        </div>
    );
}

export function OfficeLayout() {
    return (
        <div className="absolute inset-0 overflow-hidden rounded-b-[18px] bg-[#111319]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_34%)]" />
            <div className="absolute inset-0 opacity-18 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />

            <div className="absolute left-[6%] top-[6%] h-[86%] w-[84%] rounded-[18px] border border-white/16 bg-[#e7e2d6] p-[9px] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_26px_80px_rgba(0,0,0,0.45)]">
                <div className="relative h-full w-full rounded-[10px] border border-black/18 bg-[#ddd5c6]">
                    <div className="absolute inset-y-0 left-[47.8%] w-[4.4%] border-x border-black/18 bg-[#c9b69d]" />
                    <div className="absolute left-0 top-0 h-full w-[47.8%] border-r border-black/18 bg-[#d8d6d0]" />
                    <div className="absolute right-0 top-0 h-full w-[47.8%] bg-[#78726d]" />

                    <div className="absolute left-[2%] top-[4%] h-[92%] w-[43.5%] opacity-42 [background-image:linear-gradient(rgba(110,116,120,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(110,116,120,0.18)_1px,transparent_1px)] [background-size:12px_12px]" />
                    <div className="absolute right-[2%] top-[4%] h-[92%] w-[43.5%] opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:12px_12px]" />

                    <div className="absolute left-[4%] top-[3%] rounded-full bg-black/55 px-3 py-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-white">Work Room</div>
                    <div className="absolute right-[4%] top-[3%] rounded-full bg-black/55 px-3 py-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-white">Break Room</div>

                    <Desk className="left-[7%] top-[12%] h-[10%] w-[12%]" />
                    <Desk className="left-[25%] top-[12%] h-[10%] w-[12%]" />
                    <Desk className="left-[7%] top-[29%] h-[10%] w-[12%]" />
                    <Desk className="left-[25%] top-[29%] h-[10%] w-[12%]" />
                    <Desk className="left-[7%] top-[46%] h-[10%] w-[12%]" />
                    <Desk className="left-[25%] top-[46%] h-[10%] w-[12%]" />
                    <Desk className="left-[7%] top-[63%] h-[10%] w-[12%]" />
                    <Desk className="left-[25%] top-[63%] h-[10%] w-[12%]" />
                    <Desk className="left-[7%] top-[80%] h-[10%] w-[12%]" />
                    <Desk className="left-[25%] top-[80%] h-[10%] w-[12%]" />

                    <div className="absolute left-[49%] top-[16%] h-[68%] w-[2%] bg-[#b0936d]" />
                    <div className="absolute left-[46%] top-[49%] h-[4%] w-[8%] bg-[#b0936d]" />

                    <Couch className="right-[11%] top-[12%] h-[10%] w-[18%]" />
                    <Couch className="right-[18%] top-[54%] h-[10%] w-[18%]" />
                    <div className="absolute right-[20%] top-[30%] rounded-[4px] border border-black/25 bg-[#2f334f] px-4 py-2 text-[18px] font-medium text-white shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
                        Idle ×
                    </div>

                    <div className="absolute right-[9%] bottom-[8%] flex gap-3">
                        <div className="h-[10px] w-[26px] bg-[#8a643c]" />
                        <div className="h-[10px] w-[26px] bg-[#8a643c]" />
                    </div>

                    <div className="absolute right-[14%] top-[40%] h-[6px] w-[6px] rounded-full bg-[#ffdf5d]" />
                    <div className="absolute right-[30%] top-[55%] h-[6px] w-[6px] rounded-full bg-[#ffdf5d]" />
                    <div className="absolute right-[23%] top-[72%] h-[6px] w-[6px] rounded-full bg-[#ffdf5d]" />
                </div>
            </div>
        </div>
    );
}
