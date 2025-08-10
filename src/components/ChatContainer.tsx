import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { toast } from "sonner";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

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

  // شبیه‌سازی پاسخ هوش مصنوعی
  const simulateAIResponse = async (userMessage: string) => {
    setIsTyping(true);

    // تاخیر برای شبیه‌سازی پردازش
    await new Promise(resolve => setTimeout(resolve, 1000));

    const responses = [
      `سلام! من یک دستیار هوش مصنوعی هستم. شما گفتید: "${userMessage}". چطور می‌تونم کمکتون کنم؟`,
      `این یک پاسخ نمونه است. در نسخه نهایی، این پاسخ از API Gemini دریافت خواهد شد.

\`\`\`python
def hello_world():
    print("سلام دنیا!")
    return "موفقیت‌آمیز"
\`\`\`

آیا کد بالا مفید بود؟`,
      `برای پیاده‌سازی چت‌بات، مراحل زیر را دنبال کنید:

1. راه‌اندازی Flask backend
2. اتصال به Gemini API  
3. پیاده‌سازی streaming responses
4. استقرار روی Render.com

\`\`\`bash
pip install -r requirements.txt
gunicorn --workers 5 app:app
\`\`\``,
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    setIsTyping(false);
    
    const newMessage: Message = {
      id: Date.now().toString(),
      text: randomResponse,
      isUser: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async (text: string, file?: File) => {
    if (!text.trim() && !file) return;

    // اضافه کردن پیام کاربر
    const userMessage: Message = {
      id: Date.now().toString(),
      text: file ? `${text}\n[فایل ضمیمه: ${file.name}]` : text,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);

    if (file) {
      toast.success(`فایل ${file.name} با موفقیت آپلود شد`);
    }

    // شبیه‌سازی پاسخ AI
    await simulateAIResponse(text || `فایل ${file?.name} ارسال شد`);
  };

  return (
    <div className="flex flex-col h-screen bg-chat-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-chat-input-border bg-chat-background">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground text-center">
            چت‌بات هوش مصنوعی
          </h1>
        </div>
      </div>

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
                سلام! چطور می‌تونم کمکتون کنم؟
              </h2>
              <p className="text-muted-foreground">
                سوال یا موضوعی که می‌خواهید درباره‌اش صحبت کنیم را بپرسید
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

          {isTyping && (
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