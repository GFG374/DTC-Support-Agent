import { useState } from 'react';
import { UserList } from './components/UserList';
import { ChatArea } from './components/ChatArea';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { ForgotPassword } from './components/ForgotPassword';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  status: 'online' | 'offline';
}

// 模拟数据
const mockUsers: User[] = [
  {
    id: '1',
    name: '张伟',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=1',
    lastMessage: '请问这个产品什么时候能发货？',
    lastMessageTime: new Date(Date.now() - 5 * 60000),
    unreadCount: 2,
    status: 'online',
  },
  {
    id: '2',
    name: '李娜',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2',
    lastMessage: '好的，谢谢！',
    lastMessageTime: new Date(Date.now() - 30 * 60000),
    unreadCount: 0,
    status: 'online',
  },
  {
    id: '3',
    name: '王芳',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=3',
    lastMessage: '我要退款',
    lastMessageTime: new Date(Date.now() - 60 * 60000),
    unreadCount: 5,
    status: 'offline',
  },
  {
    id: '4',
    name: '刘强',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=4',
    lastMessage: '发货进度如何了？',
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60000),
    unreadCount: 1,
    status: 'online',
  },
];

const mockMessages: Record<string, Message[]> = {
  '1': [
    {
      id: 'm1',
      content: '你好，我想咨询一下产品信息',
      sender: 'user',
      timestamp: new Date(Date.now() - 15 * 60000),
    },
    {
      id: 'm2',
      content: '您好！很高兴为您服务，请问您想了解哪款产品呢？',
      sender: 'agent',
      timestamp: new Date(Date.now() - 14 * 60000),
    },
    {
      id: 'm3',
      content: '就是你们的新款笔记本电脑',
      sender: 'user',
      timestamp: new Date(Date.now() - 10 * 60000),
    },
    {
      id: 'm4',
      content: '好的，我们的新款笔记本有多个配置可选，您可以看一下详情页面，有什么问题随时问我。',
      sender: 'agent',
      timestamp: new Date(Date.now() - 8 * 60000),
    },
    {
      id: 'm5',
      content: '请问这个产品什么时候能发货？',
      sender: 'user',
      timestamp: new Date(Date.now() - 5 * 60000),
    },
  ],
  '2': [
    {
      id: 'm6',
      content: '订单已经确认了吗？',
      sender: 'user',
      timestamp: new Date(Date.now() - 40 * 60000),
    },
    {
      id: 'm7',
      content: '您的订单已经确认，预计明天发货。',
      sender: 'agent',
      timestamp: new Date(Date.now() - 35 * 60000),
    },
    {
      id: 'm8',
      content: '好的，谢谢！',
      sender: 'user',
      timestamp: new Date(Date.now() - 30 * 60000),
    },
  ],
  '3': [
    {
      id: 'm9',
      content: '我收到的产品有质量问题',
      sender: 'user',
      timestamp: new Date(Date.now() - 65 * 60000),
    },
    {
      id: 'm10',
      content: '非常抱歉给您带来不便，请问是什么问题呢？',
      sender: 'agent',
      timestamp: new Date(Date.now() - 63 * 60000),
    },
    {
      id: 'm11',
      content: '屏幕有划痕',
      sender: 'user',
      timestamp: new Date(Date.now() - 62 * 60000),
    },
    {
      id: 'm12',
      content: '我要退款',
      sender: 'user',
      timestamp: new Date(Date.now() - 60 * 60000),
    },
  ],
  '4': [
    {
      id: 'm13',
      content: '发货进度如何了？',
      sender: 'user',
      timestamp: new Date(Date.now() - 2 * 60 * 60000),
    },
  ],
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [selectedUserId, setSelectedUserId] = useState<string>('1');
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;

    const newMessage: Message = {
      id: `m${Date.now()}`,
      content,
      sender: 'agent',
      timestamp: new Date(),
    };

    setMessages((prev) => ({
      ...prev,
      [selectedUserId]: [...(prev[selectedUserId] || []), newMessage],
    }));

    // 更新用户列表中的最后消息
    setUsers((prev) =>
      prev.map((user) =>
        user.id === selectedUserId
          ? {
              ...user,
              lastMessage: content,
              lastMessageTime: new Date(),
            }
          : user
      )
    );
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    // 清除未读消息数
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, unreadCount: 0 } : user
      )
    );
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const currentMessages = messages[selectedUserId] || [];

  // 如果未登录，显示登录/注册/忘记密码页面
  if (!isLoggedIn) {
    if (currentPage === 'register') {
      return (
        <Register
          onRegister={() => {
            setIsLoggedIn(true);
            setCurrentPage('login');
          }}
          onNavigateToLogin={() => setCurrentPage('login')}
        />
      );
    }

    if (currentPage === 'forgot-password') {
      return (
        <ForgotPassword
          onNavigateToLogin={() => setCurrentPage('login')}
        />
      );
    }

    return (
      <Login
        onLogin={() => setIsLoggedIn(true)}
        onNavigateToRegister={() => setCurrentPage('register')}
        onNavigateToForgotPassword={() => setCurrentPage('forgot-password')}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧用户列表 */}
      <UserList
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={handleSelectUser}
      />

      {/* 右侧聊天区域 */}
      <ChatArea
        user={selectedUser}
        messages={currentMessages}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}