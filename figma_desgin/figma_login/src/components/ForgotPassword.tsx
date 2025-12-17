import { useState } from 'react';
import { Mail, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';

interface ForgotPasswordProps {
  onNavigateToLogin: () => void;
}

export function ForgotPassword({ onNavigateToLogin }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // 模拟发送邮件延迟
    setTimeout(() => {
      setIsLoading(false);
      setIsEmailSent(true);
    }, 1500);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* 装饰性背景元素 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* 主容器 */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* 玻璃拟态卡片 */}
          <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-2xl border border-white/50 p-8 md:p-10">
            {!isEmailSent ? (
              <>
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
                    <div className="w-8 h-8 border-4 border-white rounded-lg"></div>
                  </div>
                  <h1 className="text-gray-900 mb-2">忘记密码</h1>
                  <p className="text-gray-500">请输入您的邮箱地址，我们将发送重置密码链接</p>
                </div>

                {/* 忘记密码表单 */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* 邮箱输入 */}
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm text-gray-700">
                      邮箱地址
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className="w-full pl-12 pr-4 py-3.5 bg-white/50 backdrop-blur-sm border border-gray-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all placeholder:text-gray-400"
                      />
                    </div>
                  </div>

                  {/* 发送按钮 */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 group"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>发送中...</span>
                      </>
                    ) : (
                      <>
                        <span>发送重置链接</span>
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                {/* 返回登录链接 */}
                <button
                  onClick={onNavigateToLogin}
                  className="mt-8 w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span>返回登录</span>
                </button>
              </>
            ) : (
              <>
                {/* 成功状态 */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h1 className="text-gray-900 mb-2">邮件已发送</h1>
                  <p className="text-gray-500 mb-8">
                    我们已向 <span className="text-gray-700">{email}</span> 发送了重置密码链接，请查收邮件并按照说明操作。
                  </p>

                  <div className="space-y-3">
                    {/* 返回登录按钮 */}
                    <button
                      onClick={onNavigateToLogin}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
                    >
                      <span>返回登录</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    {/* 重新发送 */}
                    <button
                      onClick={() => setIsEmailSent(false)}
                      className="w-full py-3.5 bg-white/50 backdrop-blur-sm border border-gray-200/50 rounded-xl hover:bg-white/80 transition-all text-gray-700"
                    >
                      没有收到邮件？重新发送
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 底部提示 */}
          {!isEmailSent && (
            <p className="mt-6 text-center text-xs text-gray-500">
              如果您在使用过程中遇到问题，请联系
              <a href="#" className="text-blue-600 hover:underline ml-1">
                客服支持
              </a>
            </p>
          )}
        </div>
      </div>

      {/* CSS动画 */}
      <style>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
