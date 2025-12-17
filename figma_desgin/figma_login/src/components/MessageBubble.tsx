import { Message } from '../App';

interface MessageBubbleProps {
  message: Message;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAgent = message.sender === 'agent';

  return (
    <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-xl ${isAgent ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isAgent
              ? 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
          }`}
        >
          <p className="break-words">{message.content}</p>
        </div>
        <span className="text-xs text-gray-400 mt-1 px-2">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
