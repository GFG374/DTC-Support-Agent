import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const bucket = "avatars";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer", "").trim();
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return new Response("Server storage config missing", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRole);

  const userRes = await admin.auth.getUser(token);
  if (userRes.error || !userRes.data.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = userRes.data.user;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const fileName = (formData.get("filename") as string | null) || file?.name || "avatar.jpg";
  if (!file) {
    return new Response("file missing", { status: 400 });
  }

  // Ensure bucket exists and is public
  try {
    await admin.storage.createBucket(bucket, { public: true });
  } catch (err: any) {
    // ignore if bucket already exists
  }

  const ext = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const upload = await admin.storage.from(bucket).upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
  });

  if (upload.error) {
    return new Response(upload.error.message, { status: 400 });
  }

  const { data: publicData } = admin.storage.from(bucket).getPublicUrl(path);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    return new Response("Failed to get public url", { status: 500 });
  }

  const { error: updateError } = await admin
    .from("user_profiles")
    .update({ avatar_url: publicUrl })
    .eq("user_id", user.id);
  if (updateError) {
    return new Response(updateError.message, { status: 500 });
  }

  return Response.json({ avatarUrl: publicUrl });
}

