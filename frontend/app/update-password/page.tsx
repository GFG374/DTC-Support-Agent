"use client";
import { useState, useEffect } from "react";
import supabase from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Verify session exists (handled by link)
        supabase.auth.getSession().then(({ data }) => {
            if (!data.session) {
                // If no session, they might need to login via magic link first or link expired
                // router.push('/login'); 
            }
        });
    }, [router]);

    const handleUpdate = async () => {
        if (!password) return;
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) {
            alert("密码修改成功！请重新登录。");
            await supabase.auth.signOut();
            router.push('/login');
        } else {
            alert("修改失败: " + error.message);
        }
        setLoading(false);
    };

    return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">重置密码</h1>
                    <p className="text-sm text-gray-500 mt-1">请输入您的新密码</p>
                </div>
                
                <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="新密码"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 outline-none focus:border-black transition"
                />
                
                <button 
                    onClick={handleUpdate} 
                    disabled={loading}
                    className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
                >
                    {loading ? "提交中..." : "确认修改"}
                </button>
            </div>
        </div>
    );
}
