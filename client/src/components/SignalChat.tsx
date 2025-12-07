import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useSignalStore } from '@/store/signalStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Bot, User } from 'lucide-react';
import { Streamdown } from 'streamdown';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

/**
 * Natural Language Signal Analysis Interface
 * 
 * Features:
 * - Context-aware chat about current signal capture
 * - Explain modulation schemes and analysis results
 * - Generate reports from classification data
 * - Answer questions about signal characteristics
 * - Markdown rendering with Streamdown
 */
export function SignalChat() {
  const currentCapture = useSignalStore((state) => state.currentCapture);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat history
  const { data: history } = trpc.chat.getHistory.useQuery(
    { captureId: currentCapture?.id, limit: 50 },
    { enabled: !!currentCapture }
  );

  // Send message mutation
  const sendMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      // Add assistant response to messages
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: data.message,
          createdAt: new Date(),
        },
      ]);
    },
  });

  // Load history into messages
  useEffect(() => {
    if (history) {
      setMessages(history.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        createdAt: new Date(msg.createdAt),
      })));
    }
  }, [history]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Send to backend
    sendMutation.mutate({
      message: input,
      captureId: currentCapture?.id,
    });

    setInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="flex flex-col h-full data-panel">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h3 className="font-black flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Signal Analysis Assistant
        </h3>
        <p className="technical-label mt-1">
          Ask questions about signal characteristics, modulation, or analysis results
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="technical-label">No messages yet</p>
            <p className="text-sm mt-2">
              Try asking: "What modulation scheme is this?" or "Explain the SNR measurement"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'wireframe-cyan'
              }`}
            >
              {msg.role === 'assistant' ? (
                <Streamdown>{msg.content}</Streamdown>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
              <p className="text-xs opacity-70 mt-2">
                {msg.createdAt.toLocaleTimeString()}
              </p>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-secondary" />
              </div>
            )}
          </div>
        ))}

        {sendMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="wireframe-cyan rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Thinking...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about signal characteristics..."
            disabled={sendMutation.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
