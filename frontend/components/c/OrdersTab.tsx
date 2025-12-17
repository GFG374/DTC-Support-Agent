"use client";

import { mockOrders } from "@/data/cOrders";

export default function OrdersTab({ onApplyAfterSale }: { onApplyAfterSale: (orderId: string) => void }) {
  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white px-6 pt-12 pb-4 border-b sticky top-0 z-10">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <div className="flex gap-4 mt-4 text-sm font-medium text-gray-500">
          <span className="text-black border-b-2 border-black pb-1">全部</span>
          <span>待发货</span>
          <span>待收货</span>
          <span>售后</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mockOrders.map((order) => (
          <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-gray-400">{order.date}</span>
              <span
                className={`text-xs font-bold px-2 py-1 rounded ${
                  order.status === "delivered"
                    ? "bg-green-50 text-green-700"
                    : order.status === "refunded"
                    ? "bg-gray-100 text-gray-500"
                    : "bg-orange-50 text-orange-600"
                }`}
              >
                {order.statusText}
              </span>
            </div>

            {order.items.map((item, idx) => (
              <div key={idx} className="flex gap-3 mb-4">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                  {item.img}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.variant}</div>
                  <div className="text-sm font-bold mt-2">¥{item.price}</div>
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-50">
              <button className="px-3 py-1.5 border rounded-lg text-xs font-medium text-gray-600" type="button">
                查看物流
              </button>
              {order.status !== "refunded" && (
                <button
                  onClick={() => onApplyAfterSale(order.id)}
                  className="px-3 py-1.5 bg-black text-white rounded-lg text-xs font-medium shadow-sm active:scale-95 transition-transform"
                  type="button"
                >
                  申请售后
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
