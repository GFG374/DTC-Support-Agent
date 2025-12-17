import { User } from '../App';

interface UserListItemProps {
  user: User;
  isSelected: boolean;
  onClick: () => void;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

export function UserListItem({ user, isSelected, onClick }: UserListItemProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <div className="relative flex-shrink-0">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-12 h-12 rounded-full"
          />
          {/* 在线状态 */}
          <div
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              user.status === 'online' ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
        </div>

        {/* 用户信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={isSelected ? 'text-blue-600' : 'text-gray-900'}>
              {user.name}
            </span>
            <span className="text-xs text-gray-400">
              {formatTime(user.lastMessageTime)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 truncate flex-1">
              {user.lastMessage}
            </p>
            {/* 未读消息数 */}
            {user.unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full flex-shrink-0">
                {user.unreadCount > 99 ? '99+' : user.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
