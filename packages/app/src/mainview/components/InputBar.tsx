import { useState } from 'react';

interface InputBarProps {
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
}

export function InputBar({ disabled, onSend }: InputBarProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    const text = content.trim();

    if (!text || disabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSend(text);
      setContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className='input-bar'>
      <textarea
        value={content}
        placeholder='告诉 Agent 下一步做什么...'
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={disabled || isSubmitting}
      />
      <button type='button' onClick={() => void submit()} disabled={disabled || isSubmitting}>
        发送
      </button>
    </footer>
  );
}
