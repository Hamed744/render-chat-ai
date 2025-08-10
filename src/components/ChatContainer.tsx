import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { toast } from "sonner";

// آدرس API بک‌اند شما
// در حالت توسعه محلی، آدرس سرور پایتون است.
// در حالت نهایی، آدرس سرویس Render.com شما خواهد بود.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

// تابع برای تبدیل فایل به Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

export const ChatContainer = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (text: string, file?: File) => {
    if (!text.trim() && !file) return;

    // ۱. اضافه کردن پیام کاربر به لیست پیام‌ها
    const userMessageText = file ? `${text}\n[فایل ضمیمه: ${file.name}]` : text;
    const userMessage: Message = {
      id: Date.now().toString(),
      text: userMessageText,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // آماده‌سازی پیام مدل برای دریافت پاسخ
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      text: "",
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMessage]);

    try {
      // ۲. آماده‌سازی بدنه درخواست برای API
      let file_data = null;
      if (file) {
        const file_b64 = await fileToBase64(file);
        file_data = {
          mime_type: file.type,
          data: file_b64,
        };
        toast.info(`فایل ${file.name} در حال پردازش است...`);
      }

      const payload = {
        message: text,
        file_data: file_data
      };
      
      // ۳. ارسال درخواست به بک‌اند
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.body) {
        throw new Error("پاسخی از سرور دریافت نشد.");
      }
      
      // ۴. خواندن پاسخ استریم شده
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const data = JSON.parse(jsonStr);

              if (data.error) throw new Error(data.error);
              if (data.done) break;

              if (data.text) {
                fullResponse += data.text;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiMessageId ? { ...msg, text: fullResponse } : msg
                  )
                );
              }
            } catch (e) {
              console.error("خطا در پردازش قطعه JSON:", line, e);
            }
          }
        }
      }

    } catch (error) {
      console.error("خطا در ارتباط با API:", error);
      const errorMessage = `متاسفانه خطایی رخ داد: ${(error as Error).message}`;
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, text: errorMessage } : msg
        )
      );
      toast.error(errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-chat-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
               <div className="text-muted-foreground mb-4">
                <svg
                  className="mx-auto h-12 w-12 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">
                سلام! چطور می‌توانم کمکتان کنم؟
              </h2>
              <p className="text-muted-foreground">
                سوال یا موضوعی که می‌خواهید درباره‌اش صحبت کنیم را بپرسید.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message.text}
              isUser={message.isUser}
            />
          ))}

          {isTyping && messages[messages.length-1]?.isUser && (
            <ChatMessage
              message=""
              isUser={false}
              isTyping={true}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={isTyping}
      />
    </div>
  );
};
