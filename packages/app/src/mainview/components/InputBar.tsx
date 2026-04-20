import { useState } from 'react';

interface InputBarProps {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
}

export function InputBar({ disabled = false, onSend }: InputBarProps) {
  const [value, setValue] = useState('');

  const send = async () => {
    const content = value.trim();
    if (!content || disabled) {
      return;
    }

    await onSend(content);
    setValue('');
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <textarea
        value={value}
        rows={3}
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        placeholder="告诉 Agent 下一步做什么..."
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        disabled={disabled}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <p>Enter 发送，Shift + Enter 换行</p>
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void send()}
          disabled={disabled || value.trim().length === 0}
        >
          发送
        </button>
      </div>
    </div>
  );
}
