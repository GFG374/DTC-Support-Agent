"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";
import { approvalTasks } from "@/data/admin";

export default function ApprovalsTable() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="p-4 text-xs font-medium text-gray-500 uppercase">申请ID</th>
            <th className="p-4 text-xs font-medium text-gray-500 uppercase">用户 / 商品</th>
            <th className="p-4 text-xs font-medium text-gray-500 uppercase">金额</th>
            <th className="p-4 text-xs font-medium text-gray-500 uppercase">风险分(AI)</th>
            <th className="p-4 text-xs font-medium text-gray-500 uppercase text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {approvalTasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50 group">
              <td className="p-4 text-xs text-gray-500 font-mono">{task.id}</td>
              <td className="p-4">
                <div className="font-medium text-sm text-gray-900">{task.user}</div>
                <div className="text-xs text-gray-500">{task.item}</div>
              </td>
              <td className="p-4 font-bold text-sm">¥{task.amount}</td>
              <td className="p-4">
                <div
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${
                    task.riskScore > 80 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                  }`}
                >
                  {task.riskScore > 80 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                  {task.riskScore} / 100
                </div>
              </td>
              <td className="p-4 text-right">
                <button className="text-gray-400 hover:text-gray-600 mr-3 text-sm font-medium">查看详情</button>
                <button className="bg-black text-white text-xs px-3 py-1.5 rounded shadow hover:bg-gray-800 transition" type="button">
                  批准退款
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
