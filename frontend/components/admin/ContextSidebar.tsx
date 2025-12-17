"use client";

import { User } from "lucide-react";

export default function ContextSidebar() {
  return (
    <div className="w-[280px] bg-white border-l border-gray-200 p-4 hidden xl:block">
      <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">用户画像</h4>
      <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <User size={16} />
          </div>
          <div>
            <div className="font-bold text-sm">Mike Ross</div>
            <div className="text-xs text-gray-500">上海, 中国</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-white p-2 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-400">LTV</div>
            <div className="font-bold text-sm">¥3,240</div>
          </div>
          <div className="bg-white p-2 rounded-lg border border-gray-100">
            <div className="text-xs text-gray-400">退款率</div>
            <div className="font-bold text-red-500 text-sm">15%</div>
          </div>
        </div>
      </div>

      <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">当前订单</h4>
      <div className="border border-gray-200 rounded-xl p-3">
        <div className="flex gap-3 mb-2">
          <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-xl">🧥</div>
          <div>
            <div className="font-bold text-sm">高级羊绒大衣</div>
            <div className="text-xs text-gray-500">¥899 · 黑色/L</div>
          </div>
        </div>
        <div className="bg-yellow-50 text-yellow-700 text-xs p-2 rounded border border-yellow-100 mb-2">
          ⚠️ 此商品属于高单价退款限制品类
        </div>
        <button className="w-full py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50">查看商城详情</button>
      </div>
    </div>
  );
}
