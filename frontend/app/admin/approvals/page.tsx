"use client";

import React from "react";

const SvgIcon = ({ children, size = 16, className = "" }: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const Icons = {
  CheckCircle: (
    <SvgIcon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </SvgIcon>
  ),
  AlertTriangle: (
    <SvgIcon>
      <path d="M10.29 3.86 1.82 18A2 2 0 0 0 3.53 21h16.94A2 2 0 0 0 22.18 18L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </SvgIcon>
  ),
};

const APPROVAL_TASKS = [
  {
    id: "T-1001",
    user: "Mike Ross",
    item: "限量版球鞋 (Size 42)",
    amount: 1299,
    riskScore: 85,
  },
  {
    id: "T-1002",
    user: "Sarah Jenkins",
    item: "高级羊绒大衣",
    amount: 899,
    riskScore: 12,
  },
] as const;

export default function AdminApprovalsPage() {
  const pendingCount = APPROVAL_TASKS.length;

  return (
    <div className="flex-1 bg-gray-50 p-8 h-full overflow-y-auto fade-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">大额退款审批</h1>
            <p className="text-sm text-gray-500 mt-1">规则: 金额 &gt; $50 (¥350) 或 风险分 &gt; 80</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white px-4 py-2 rounded-lg shadow-sm border text-sm">
              <span className="text-gray-500 mr-2">待处理</span>
              <span className="font-bold text-red-500">{pendingCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 text-xs font-medium text-gray-500 uppercase">申请ID</th>
                <th className="p-4 text-xs font-medium text-gray-500 uppercase">用户 / 商品</th>
                <th className="p-4 text-xs font-medium text-gray-500 uppercase">金额</th>
                <th className="p-4 text-xs font-medium text-gray-500 uppercase">风险分 (AI)</th>
                <th className="p-4 text-xs font-medium text-gray-500 uppercase text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {APPROVAL_TASKS.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50 group">
                  <td className="p-4 text-xs text-gray-500 font-mono">{task.id}</td>
                  <td className="p-4">
                    <div className="font-medium text-sm text-gray-900">{task.user}</div>
                    <div className="text-xs text-gray-500">{task.item}</div>
                  </td>
                  <td className="p-4 font-bold text-sm">¥{task.amount}</td>
                  <td className="p-4">
                    <div
                      className={[
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold",
                        task.riskScore > 80 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600",
                      ].join(" ")}
                    >
                      {task.riskScore > 80 ? Icons.AlertTriangle : Icons.CheckCircle}
                      {task.riskScore} / 100
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-gray-400 hover:text-gray-600 mr-3 text-sm font-medium">查看详情</button>
                    <button className="bg-black text-white text-xs px-3 py-1.5 rounded shadow hover:bg-gray-800 transition">
                      批准退款
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

