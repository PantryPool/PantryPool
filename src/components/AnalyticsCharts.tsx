import React, { useState } from 'react';
import { Pool, Transaction, Item } from '../types';
import { 
  BarChart3, 
  Award, 
  TrendingUp, 
  Download, 
  Printer, 
  Calendar,
  DollarSign,
  ShoppingCart,
  Users
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface AnalyticsChartsProps {
  pool: Pool;
  transactions: Transaction[];
  items: Item[];
}

const COLORS = ['#E8694A', '#8FB8DE', '#5A9A6B', '#D4870E', '#6B6B6B', '#2D2D2D'];

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  pool,
  transactions = [],
  items = []
}) => {
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const poolId = pool?.id || '';

  // Filter transactions by pool and time window
  const now = Date.now();
  const poolTxs = (Array.isArray(transactions) ? transactions : [])
    .filter((t) => !poolId || t.poolId === poolId || !t.poolId)
    .filter((t) => {
      if (timeFilter === 'all') return true;
      const txTime = t.timestamp ? new Date(t.timestamp).getTime() : 0;
      if (!txTime) return true;
      const diffDays = (now - txTime) / (1000 * 60 * 60 * 24);
      if (timeFilter === '7d') return diffDays <= 7;
      if (timeFilter === '30d') return diffDays <= 30;
      if (timeFilter === '90d') return diffDays <= 90;
      return true;
    });

  // Calculate Metrics
  let totalDeposited = 0;
  let totalConsumed = 0;
  const uniqueConsumers = new Set<string>();

  poolTxs.forEach((tx) => {
    const rawType = String(tx.type || '');
    const txType = rawType === 'deposit' ? 'contribution' : rawType === 'consume' ? 'consumption' : rawType;
    const amount = Number(tx.amount || 0);
    if (txType === 'contribution' || rawType === 'deposit') {
      totalDeposited += Math.abs(amount);
    } else if (txType === 'consumption' || rawType === 'consume') {
      totalConsumed += Math.abs(amount);
      if (tx.userId || tx.createdByName) uniqueConsumers.add(tx.userId || tx.createdByName || '');
    } else if (txType === 'refund') {
      const isDepositRefund = (tx.note || (tx as any).description || '').toLowerCase().includes('deposit');
      if (isDepositRefund) {
        totalDeposited = Math.max(0, totalDeposited - Math.abs(amount));
      } else {
        totalConsumed = Math.max(0, totalConsumed - Math.abs(amount));
      }
    }
  });

  // 1. Calculate top consumed items
  const itemCounts: { [name: string]: number } = {};
  poolTxs.forEach((tx) => {
    const rawType = String(tx.type || '');
    const txType = rawType === 'consume' ? 'consumption' : rawType;
    if (txType === 'consumption' && tx.itemName) {
      itemCounts[tx.itemName] = (itemCounts[tx.itemName] || 0) + (Number(tx.quantity) || 1);
    }
  });

  const topConsumedData = Object.keys(itemCounts)
    .map((name) => ({ name, count: itemCounts[name] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 2. Member Contribution Leaderboard
  const memberContributions: { [name: string]: number } = {};
  (pool?.members || []).forEach((m) => {
    if (m?.name) memberContributions[m.name] = 0;
  });

  poolTxs.forEach((tx) => {
    const rawType = String(tx.type || '');
    const txType = rawType === 'deposit' ? 'contribution' : rawType;
    const memberMatch = pool?.members?.find(
      (m) => m.id === tx.userId || (m as any).userId === tx.userId || (m as any).user_id === tx.userId
    );
    const creatorName =
      (tx.createdByName && tx.createdByName !== 'Pool Member')
        ? tx.createdByName
        : ((tx as any).userName && (tx as any).userName !== 'Pool Member')
        ? (tx as any).userName
        : (memberMatch?.name || tx.createdByName || 'Pool Member');

    if (txType === 'contribution') {
      memberContributions[creatorName] =
        (memberContributions[creatorName] || 0) + Number(tx.amount || 0);
    } else if (txType === 'refund') {
      const isDepositRefund = (tx.note || (tx as any).description || '').toLowerCase().includes('deposit');
      if (isDepositRefund && memberContributions[creatorName] !== undefined) {
        memberContributions[creatorName] = Math.max(0, memberContributions[creatorName] - Math.abs(Number(tx.amount || 0)));
      }
    }
  });

  const leaderboardData = Object.keys(memberContributions)
    .map((name) => ({ name, totalContributed: Math.round(memberContributions[name] * 100) / 100 }))
    .sort((a, b) => b.totalContributed - a.totalContributed);

  // CSV Expense Report Export
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'PantryPool Expense & Consumption Audit Report\n';
    csvContent += `Pool Name,${pool.name}\n`;
    csvContent += `Category,${pool.category}\n`;
    csvContent += `Currency,${pool.currency}\n`;
    csvContent += `Report Period,${timeFilter.toUpperCase()}\n`;
    csvContent += `Generated Date,${new Date().toISOString()}\n\n`;

    csvContent += 'Transaction ID,Date,Member,Type,Item Name,Quantity,Amount,Note\n';
    poolTxs.forEach((tx) => {
      const date = tx.timestamp ? new Date(tx.timestamp).toISOString() : '';
      const memberMatch = pool?.members?.find(
        (m) => m.id === tx.userId || (m as any).userId === tx.userId || (m as any).user_id === tx.userId
      );
      const memberName =
        (tx.createdByName && tx.createdByName !== 'Pool Member')
          ? tx.createdByName
          : ((tx as any).userName && (tx as any).userName !== 'Pool Member')
          ? (tx as any).userName
          : (memberMatch?.name || tx.createdByName || 'Member');
      const member = memberName.replace(/,/g, ' ');
      const type = tx.type || 'transaction';
      const itemName = (tx.itemName || '').replace(/,/g, ' ');
      const quantity = tx.quantity || 1;
      const amount = Number(tx.amount || 0).toFixed(2);
      const note = (tx.note || (tx as any).description || '').replace(/,/g, ' ');
      csvContent += `"${tx.id}","${date}","${member}","${type}","${itemName}",${quantity},${amount},"${note}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pantrypool_expense_report_${pool.id}_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print / PDF View
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="bg-white border border-[#E0DAD1] rounded-lg p-5 sm:p-6 shadow-xs text-[#2D2D2D] space-y-6">
      
      {/* Header & Export Controls */}
      <div className="border-b border-[#EDE8E0] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#E8694A]" />
            <h2 className="text-lg font-semibold text-[#2D2D2D] tracking-tight">
              Pool Consumption & Financial Analytics
            </h2>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Real-time consumption velocity, financial accounting, and expense auditing for {pool.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Filter */}
          <div className="flex items-center bg-[#F0EBE3] p-0.5 rounded-lg border border-[#E0DAD1] text-xs">
            {(['7d', '30d', '90d', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  timeFilter === t
                    ? 'bg-white text-[#E8694A] shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
                }`}
              >
                {t === '7d' ? '7 Days' : t === '30d' ? '30 Days' : t === '90d' ? '90 Days' : 'All Time'}
              </button>
            ))}
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            title="Download Expense Audit CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium border border-[#E0DAD1] transition"
          >
            <Download className="w-3.5 h-3.5 text-[#E8694A]" />
            <span>Export CSV</span>
          </button>

          {/* Print Audit */}
          <button
            onClick={handlePrintReport}
            title="Print Audit Statement"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium border border-[#E0DAD1] transition"
          >
            <Printer className="w-3.5 h-3.5 text-[#6B6B6B]" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Financial Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#F0EBE3] p-3.5 rounded-lg border border-[#E0DAD1]">
          <div className="text-[11px] text-[#6B6B6B] mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-[#5A9A6B]" />
            <span>Funds Deposited</span>
          </div>
          <div className="text-xl font-semibold text-[#5A9A6B] font-mono-financial">
            {pool.currency}{totalDeposited.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#F0EBE3] p-3.5 rounded-lg border border-[#E0DAD1]">
          <div className="text-[11px] text-[#6B6B6B] mb-1 flex items-center gap-1">
            <ShoppingCart className="w-3.5 h-3.5 text-[#E8694A]" />
            <span>Total Consumed</span>
          </div>
          <div className="text-xl font-semibold text-[#E8694A] font-mono-financial">
            {pool.currency}{totalConsumed.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#F0EBE3] p-3.5 rounded-lg border border-[#E0DAD1]">
          <div className="text-[11px] text-[#6B6B6B] mb-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#D4870E]" />
            <span>Net Pool Reserve</span>
          </div>
          <div className="text-xl font-semibold text-[#2D2D2D] font-mono-financial">
            {pool.currency}{(totalDeposited - totalConsumed).toFixed(2)}
          </div>
        </div>

        <div className="bg-[#F0EBE3] p-3.5 rounded-lg border border-[#E0DAD1]">
          <div className="text-[11px] text-[#6B6B6B] mb-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-[#8FB8DE]" />
            <span>Active Consumers</span>
          </div>
          <div className="text-xl font-semibold text-[#2D2D2D] font-mono-financial">
            {uniqueConsumers.size} members
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Top Consumed Items */}
        <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#E8694A]" />
            <h3 className="text-xs font-semibold text-[#2D2D2D]">
              Most Popular Consumables (Units Consumed)
            </h3>
          </div>

          {topConsumedData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-[#6B6B6B]">
              No consumption data logged for this time window.
            </div>
          ) : (
            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topConsumedData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" stroke="#9A9A9A" fontSize={10} />
                  <YAxis type="category" dataKey="name" stroke="#6B6B6B" fontSize={11} width={110} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0DAD1', borderRadius: '8px', boxShadow: '0 2px 8px rgba(45,45,45,0.06)' }}
                    labelStyle={{ color: '#2D2D2D', fontWeight: '600' }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {topConsumedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Member Contribution Hall of Fame */}
        <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#D4870E]" />
            <h3 className="text-xs font-semibold text-[#2D2D2D]">
              Member Contribution Leaderboard
            </h3>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {leaderboardData.map((member, idx) => (
              <div
                key={member.name}
                className="p-3 rounded-md bg-white border border-[#E0DAD1] flex items-center justify-between text-xs shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-6 w-6 rounded-full flex items-center justify-center font-medium text-[11px] font-mono-financial ${
                    idx === 0
                      ? 'bg-[#FFF8EB] text-[#D4870E] border border-[#D4870E]/30 font-semibold'
                      : idx === 1
                        ? 'bg-[#F0EBE3] text-[#2D2D2D]'
                        : idx === 2
                          ? 'bg-[#F0EBE3] text-[#6B6B6B]'
                          : 'bg-white text-[#9A9A9A]'
                  }`}>
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-[#2D2D2D]">{member.name}</span>
                </div>

                <span className="font-mono-financial font-semibold text-[#5A9A6B] text-sm">
                  {pool.currency}{member.totalContributed.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
