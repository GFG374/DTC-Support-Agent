export type Tab = "assistant" | "orders" | "profile";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type Profile = {
  display_name?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  deleted_at?: string | null;
  purge_after?: string | null;
};
