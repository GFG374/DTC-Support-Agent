"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type OrderItem = {
  id: string;
  name: string | null;
  category?: string | null;
  sku?: string | null;
  qty?: number | null;
  unit_price?: number | null;
};

type OrderRow = {
  order_id: string;
  created_at: string | null;
  paid_amount?: number | null;
  currency?: string | null;
  status?: string | null;
  shipping_status?: string | null;
  tracking_no?: string | null;
  order_items?: OrderItem[];
};

type ReturnRow = {
  id?: string;
  rma_id?: string;
  order_id: string;
  usr_id?: string | null;
  user_id?: string | null;
  requested_amount?: number | null;
  status?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  refund_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  delivered: { label: "已签收", badge: "bg-green-50 text-green-700" },
  in_transit: { label: "运输中", badge: "bg-blue-50 text-blue-600" },
  shipping: { label: "运输中", badge: "bg-blue-50 text-blue-600" },
  pending: { label: "待发货", badge: "bg-amber-50 text-amber-600" },
  processing: { label: "处理中", badge: "bg-amber-50 text-amber-600" },
  refunded: { label: "已退款", badge: "bg-gray-100 text-gray-500" },
  cancelled: { label: "已取消", badge: "bg-gray-100 text-gray-500" },
};

const formatCurrency = (amount?: number | null, currency = "¥") => {
  if (amount === null || amount === undefined) return "--";
  return `${currency}${(amount / 100).toFixed(2)}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
};

export default function OrdersPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returnsMap, setReturnsMap] = useState<Record<string, ReturnRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      const [ordersRes, returnsRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "order_id, created_at, paid_amount, currency, status, shipping_status, tracking_no, order_items (id, name, category, sku, qty, unit_price)"
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }),
        (async () => {
          const baseSelect = () =>
            supabase
              .from("returns")
              .select("*")
              .order("created_at", { ascending: false });
          let result = await baseSelect().eq("user_id", session.user.id);
          if (result.error && result.error.message?.includes("user_id")) {
            result = await baseSelect().eq("usr_id", session.user.id);
          }
          return result;
        })(),
      ]);
      if (cancelled) return;
      if (ordersRes.error) {
        setError(ordersRes.error.message);
        setOrders([]);
      } else {
        setOrders((ordersRes.data as OrderRow[]) || []);
      }
      if (!returnsRes.error) {
        const map: Record<string, ReturnRow> = {};
        (returnsRes.data as ReturnRow[] | null)?.forEach((item) => {
          if (!map[item.order_id]) {
            map[item.order_id] = item;
          }
        });
        setReturnsMap(map);
      }
      setLoading(false);
    };
    fetchOrders();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const statusLabel = (order: OrderRow) => {
    const key = (order.shipping_status || order.status || "pending").toLowerCase();
    return STATUS_META[key] || STATUS_META.pending;
  };

  const refundLabel = (order: OrderRow) => {
    const refund = returnsMap[order.order_id];
    if (!refund) return null;
    const refundStatus = (refund.refund_status || "").toLowerCase();
    if (refundStatus === "processing") return { label: "退款处理中", badge: "bg-amber-50 text-amber-700" };
    if (refundStatus === "success") return { label: "退款成功", badge: "bg-green-50 text-green-700" };
    if (refundStatus === "failed") return { label: "退款失败", badge: "bg-rose-50 text-rose-700" };
    const status = (refund.status || "").toLowerCase();
    if (status === "awaiting_approval") return { label: "等待审核", badge: "bg-blue-50 text-blue-700" };
    if (status) return { label: "售后处理中", badge: "bg-gray-100 text-gray-600" };
    return null;
  };

  const handleAfterSale = (orderId: string) => {
    router.push(`/c/assistant?order=${orderId}`);
  };

  const handleViewLogistics = (order: OrderRow) => {
    if (!order.tracking_no) {
      alert("该订单暂无物流单号，请稍后再试或联系人工客服。");
      return;
    }
    alert(`物流单号：${order.tracking_no}\n当前状态：${statusLabel(order).label}`);
  };

  const totalOrders = useMemo(() => orders.length, [orders]);

  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white px-6 pt-12 pb-4 border-b sticky top-0 z-10">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <div className="text-sm text-gray-500 mt-2">
          {session
            ? totalOrders
              ? `共 ${totalOrders} 单`
              : "暂无订单数据"
            : "请登录后查看订单"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="text-center text-gray-400 text-sm py-12">
            订单数据加载中...
          </div>
        )}

        {!loading && error && (
          <div className="text-center text-rose-500 text-sm py-12">{error}</div>
        )}

        {!loading && !error && session && orders.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">
            暂无订单记录，试着浏览商品或联系客服。
          </div>
        )}

        {!loading &&
          !error &&
          session &&
          orders.map((order) => {
            const meta = statusLabel(order);
            const refundMeta = refundLabel(order);
            return (
              <div
                key={order.order_id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-mono text-xs text-gray-400">
                      {order.order_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {refundMeta && (
                      <span className={`text-[11px] font-bold px-2 py-1 rounded ${refundMeta.badge}`}>
                        {refundMeta.label}
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-1 rounded ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                </div>

                {order.order_items?.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-lg">
                      🛍️
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-gray-900">
                        {item.name || "商品"}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.category || item.sku || "标准款"} · 数量 {item.qty ?? 1}
                      </div>
                      <div className="text-sm font-bold mt-2">
                        {formatCurrency(item.unit_price)}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between text-sm text-gray-700 pt-2 border-t border-gray-50">
                  <span>实付</span>
                  <span className="font-bold">{formatCurrency(order.paid_amount)}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => handleViewLogistics(order)}
                    className="px-3 py-1.5 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                    type="button"
                  >
                    查看物流
                  </button>
                  <button
                    onClick={() => handleAfterSale(order.order_id)}
                    className="px-3 py-1.5 bg-black text-white rounded-lg text-xs font-medium shadow-sm active:scale-95 transition-transform"
                    type="button"
                  >
                    申请售后
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
