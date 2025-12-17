export type OrderItem = { name: string; variant: string; price: number; img: string };

export type Order = {
  id: string;
  date: string;
  status: "delivered" | "shipping" | "refunded";
  statusText: string;
  items: OrderItem[];
};

export const mockOrders: Order[] = [
  {
    id: "ORD-7782",
    date: "2023-10-24",
    status: "delivered",
    statusText: "已签收",
    items: [{ name: "重磅纯棉T恤", variant: "白色 / L", price: 129, img: "👕" }],
  },
  {
    id: "ORD-7789",
    date: "2023-10-26",
    status: "shipping",
    statusText: "运输中",
    items: [{ name: "复古水洗牛仔裤", variant: "蓝色 / 32", price: 299, img: "👖" }],
  },
  {
    id: "ORD-7710",
    date: "2023-10-10",
    status: "refunded",
    statusText: "已退款",
    items: [{ name: "羊绒围巾", variant: "卡其色", price: 399, img: "🧣" }],
  },
];
