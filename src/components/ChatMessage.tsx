import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  message: string;
  isUser: boolean;
  isTyping?: boolean;
}

export const ChatMessage = ({ message, isUser, isTyping = false }: ChatMessageProps) => {
  const [copiedBlocks, setCopiedBlocks] = useState<Set<number>>(new Set());

  const copyToClipboard = async (text: string, blockIndex: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedBlocks(prev => new Set(prev).add(blockIndex));
    setTimeout(() => {
      setCopiedBlocks(prev => {
        const newSet = new Set(prev);
        newSet.delete(blockIndex);
        return newSet;
      });
    }, 2000);
  };

  const formatMessage = (text: string) => {
    // تقسیم پیام به بخش‌های کد و متن عادی
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3);
        const lines = code.split('\n');
        const language = lines[0].trim();
        const codeContent = lines.slice(1).join('\n');
        
        return (
          <div key={index} className="relative my-3">
            <div className="bg-chat-code-background rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-chat-input-border">
                <span className="text-xs text-chat-code-text opacity-70">
                  {language || 'code'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(codeContent, index)}
                  className="h-6 w-6 p-0 hover:bg-white/10"
                >
                  {copiedBlocks.has(index) ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-chat-code-text" />
                  )}
                </Button>
              </div>
              <pre className="p-4 text-sm text-chat-code-text overflow-x-auto">
                <code>{codeContent}</code>
              </pre>
            </div>
          </div>
        );
      }
      
      // متن عادی
      return (
        <span key={index} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    });
  };

  return (
    <div className={`flex mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-bubble transition-all duration-200 ${
          isUser
            ? 'bg-chat-bubble-user text-chat-bubble-user-text ml-12'
            : 'bg-chat-bubble-bot text-chat-bubble-bot-text mr-12'
        }`}
      >
        <div className="text-sm leading-relaxed">
          {isTyping ? (
            <div className="flex items-center space-x-1">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
              </div>
            </div>
          ) : (
            formatMessage(message)
          )}
        </div>
      </div>
    </div>
  );
};