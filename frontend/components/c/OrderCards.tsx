"use client";

import { Package, Truck, CheckCircle, Clock, RefreshCw } from "lucide-react";

export type Order = {
  order_id: string;
  status?: string;
  status_cn?: string;
  shipping_status?: string;
  shipping_status_cn?: string;
  amount?: number;
  currency?: string;
  order_date?: string;
  products?: Array<{
    name?: string;
    quantity?: number;
    price?: number;
    sku?: string;
  }>;
  can_return?: boolean;
};

type Props = {
  orders: Order[];
};

const getStatusIcon = (status?: string) => {
  switch (status?.toLowerCase()) {
    case "delivered":
      return <CheckCircle size={14} className="text-green-500" />;
    case "shipping":
    case "in_transit":
      return <Truck size={14} className="text-blue-500" />;
    case "processing":
    case "pending":
      return <Clock size={14} className="text-orange-500" />;
    case "refunded":
    case "cancelled":
      return <RefreshCw size={14} className="text-gray-500" />;
    default:
      return <Package size={14} className="text-gray-500" />;
  }
};

const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case "delivered":
      return "bg-green-50 text-green-700 border-green-200";
    case "shipping":
    case "in_transit":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "processing":
    case "pending":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "refunded":
    case "cancelled":
      return "bg-gray-50 text-gray-700 border-gray-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const formatPrice = (amount?: number) => {
  if (amount === undefined || amount === null) return "-";
  return `¥${amount.toFixed(2)}`;
};

export default function OrderCards({ orders }: Props) {
  if (!orders || orders.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4 text-sm">
        暂无订单记录
      </div>
    );
  }

  return (
    <div className="my-2">
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        {orders.map((order) => (
          <div
            key={order.order_id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden shrink-0"
          >
            {/* 订单头部 */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">
                {order.order_id}
              </span>
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getStatusColor(
                order.status
              )}`}
            >
              {getStatusIcon(order.status)}
              <span>{order.status_cn || order.shipping_status_cn || order.status || "未知"}</span>
            </div>
          </div>

          {/* 商品列表 */}
          <div className="px-3 py-2">
            {order.products && order.products.length > 0 ? (
              <div className="space-y-2">
                {order.products.slice(0, 2).map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {product.name || "商品"}
                      </p>
                      <p className="text-xs text-gray-500">
                        x{product.quantity || 1}
                        {product.price !== undefined && (
                          <span className="ml-2">{formatPrice(product.price)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                {order.products.length > 2 && (
                  <p className="text-xs text-gray-400">
                    +{order.products.length - 2} 件商品
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">暂无商品信息</p>
            )}
          </div>

          {/* 订单底部 */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {formatDate(order.order_date)}
            </span>
            <div className="flex items-center gap-3">
              {order.can_return && (
                <span className="text-xs text-green-600">可退货</span>
              )}
              <span className="text-sm font-semibold text-gray-800">
                {formatPrice(order.amount)}
              </span>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
