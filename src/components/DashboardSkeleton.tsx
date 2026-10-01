import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-8 space-y-4 animate-pulse">
      
      {/* Streamlined Pool Banner Skeleton */}
      <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          
          {/* Left: Title & Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-6 w-36 sm:w-48 bg-[#E0DAD1] rounded-md" />
            <div className="h-5 w-16 bg-white/80 rounded-md" />
            <div className="h-5 w-20 bg-white/80 rounded-md" />
            <div className="h-5 w-24 bg-white/80 rounded-md" />
          </div>

          {/* Right: Balances Pill & Primary CTA */}
          <div className="flex items-center justify-between md:justify-end gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-7 w-24 bg-white/80 rounded-lg border border-[#E0DAD1]" />
              <div className="h-7 w-24 bg-white/80 rounded-lg border border-[#E0DAD1]" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-7 w-20 bg-[#E8694A]/40 rounded-full" />
              <div className="h-7 w-7 bg-white/60 rounded-lg" />
            </div>
          </div>

        </div>
      </div>

      {/* Tabs Placeholder (Desktop & Tablet) */}
      <div className="hidden md:flex items-center justify-between gap-2 bg-[#F0EBE3] rounded-xl p-1.5 shadow-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-7 w-20 bg-[#E8694A]/40 rounded-lg" />
          <div className="h-7 w-20 bg-white/60 rounded-lg" />
          <div className="h-7 w-20 bg-white/60 rounded-lg" />
          <div className="h-7 w-20 bg-white/60 rounded-lg" />
        </div>
        <div className="h-7 w-16 bg-white/80 border border-[#E0DAD1] rounded-lg" />
      </div>

      {/* Search & Filter Bar Placeholder */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl p-2 sm:p-2.5 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="h-7 w-12 bg-[#E8694A]/40 rounded-lg" />
          <div className="h-7 w-20 bg-white/80 rounded-lg" />
          <div className="h-7 w-16 bg-white/80 rounded-lg" />
          <div className="h-7 w-24 bg-white/80 rounded-lg hidden sm:block" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-full sm:w-44 md:w-52 bg-white/80 rounded-lg" />
          <div className="h-7 w-20 bg-white/80 rounded-lg" />
        </div>
      </div>

      {/* Item Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-3.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-white border border-[#E0DAD1] rounded-xl p-3 sm:p-3.5 flex flex-col justify-between space-y-2.5 shadow-xs">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5 flex-1">
                  <div className="h-8 w-8 rounded-lg bg-[#FDF0EC] shrink-0" />
                  <div className="space-y-1 flex-1">
                    <div className="h-3.5 w-3/4 bg-[#E8E2D9] rounded" />
                    <div className="h-2.5 w-1/2 bg-[#F0EBE3] rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-4 w-4 bg-[#F0EBE3] rounded" />
                  <div className="h-4 w-4 bg-[#F0EBE3] rounded" />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 my-2">
                <div className="h-3.5 w-16 bg-[#E8E2D9] rounded" />
                <div className="h-3.5 w-14 bg-[#EDF5EF] rounded" />
              </div>
            </div>

            <div className="pt-2 border-t border-[#EDE8E0]">
              <div className="h-7 w-full bg-[#E8694A]/30 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

    </main>
  );
};

