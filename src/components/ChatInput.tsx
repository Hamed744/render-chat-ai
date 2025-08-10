import { useState, KeyboardEvent, useRef } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSendMessage: (message: string, file?: File) => void;
  disabled?: boolean;
}

export const ChatInput = ({ onSendMessage, disabled = false }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() || selectedFile) {
      onSendMessage(message.trim(), selectedFile || undefined);
      setMessage("");
      setSelectedFile(null);
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  return (
    <div className="sticky bottom-0 bg-chat-background border-t border-chat-input-border">
      <div className="max-w-4xl mx-auto p-4">
        {/* نمایش فایل انتخاب شده */}
        {selectedFile && (
          <div className="mb-3 flex items-center justify-between bg-chat-bubble-bot rounded-lg p-3">
            <div className="flex items-center space-x-3">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-chat-bubble-bot-text">
                {selectedFile.name}
              </span>
              <span className="text-xs text-muted-foreground">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={removeFile}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="relative">
          <div className="flex items-end space-x-3 bg-chat-input-background border border-chat-input-border rounded-2xl p-3 shadow-input">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.txt,.doc,.docx"
            />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                adjustTextareaHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="پیام خود را بنویسید..."
              disabled={disabled}
              className="flex-1 resize-none bg-transparent border-0 focus:outline-none text-sm leading-relaxed min-h-[20px] max-h-32 overflow-y-auto"
              rows={1}
              dir="rtl"
            />

            <Button
              onClick={handleSubmit}
              disabled={disabled || (!message.trim() && !selectedFile)}
              size="sm"
              className="h-8 w-8 p-0 rounded-full bg-chat-bubble-user hover:bg-chat-bubble-user/90"
            >
              <Send className="h-3 w-3 text-chat-bubble-user-text" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};