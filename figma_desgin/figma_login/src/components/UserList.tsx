import { Search } from 'lucide-react';
import { User } from '../App';
import { UserListItem } from './UserListItem';
import { useState } from 'react';

interface UserListProps {
  users: User[];
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
}

export function UserList({ users, selectedUserId, onSelectUser }: UserListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="mb-4">客服工作台</h1>
        
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="搜索用户..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 用户列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            未找到用户
          </div>
        ) : (
          filteredUsers.map((user) => (
            <UserListItem
              key={user.id}
              user={user}
              isSelected={user.id === selectedUserId}
              onClick={() => onSelectUser(user.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
