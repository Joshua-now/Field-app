import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Plus, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  channel: string;
  status: string;
  updatedAt: string;
  messages?: Message[];
}

export default function Bob() {
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/bob/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/bob/conversations", { headers: { Authorization: `Bearer ${getToken()}` } });
      return res.json();
    },
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/bob/messages", activeConvId],
    enabled: !!activeConvId,
    queryFn: async () => {
      const res = await fetch(`/api/bob/conversations/${activeConvId}/messages`, { headers: { Authorization: `Bearer ${getToken()}` } });
      return res.json();
    },
  });

  const createConv = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bob/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      });
      return res.json() as Promise<Conversation>;
    },
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ["/api/bob/conversations"] });
      setActiveConvId(conv.id);
    },
  });

  const sendMsg = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/bob/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/bob/messages", activeConvId] });
      qc.invalidateQueries({ queryKey: ["/api/bob/conversations"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    let convId = activeConvId;
    if (!convId) {
      const conv = await createConv.mutateAsync();
      convId = conv.id;
    }
    setInput("");
    await sendMsg.mutateAsync(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar — conversation list */}
      <aside className="w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <Button
            className="w-full"
            onClick={() => createConv.mutate()}
            disabled={createConv.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Conversation
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No conversations yet. Start one above.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConvId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-b hover:bg-muted/60 transition-colors",
                activeConvId === c.id && "bg-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">Conv #{c.id}</span>
                <Badge variant="outline" className="ml-auto text-xs">{c.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(c.updatedAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </ScrollArea>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold">Bob</h1>
            <p className="text-xs text-muted-foreground">Your AI field operations assistant</p>
          </div>
          <Badge variant="secondary" className="ml-auto">Phase 2 — Agent coming in Phase 3</Badge>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          {!activeConvId && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-20">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Hey, I'm Bob</h2>
              <p className="text-muted-foreground max-w-sm text-sm">
                Your AI field operations assistant. I handle briefings, monitor your stack, manage jobs, and keep everything running. Start a conversation or I'll call you at 6 AM.
              </p>
              <Button onClick={() => createConv.mutate()}>
                <Plus className="w-4 h-4 mr-2" />
                Start Talking to Bob
              </Button>
            </div>
          )}

          {msgsLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <Card className={cn(
                  "px-4 py-3 max-w-[75%] text-sm",
                  msg.role === "user" ? "bg-primary text-primary-foreground border-0" : ""
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={cn(
                    "text-xs mt-1",
                    msg.role === "user" ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                  )}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </Card>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        {activeConvId && (
          <div className="px-6 py-4 border-t bg-background">
            <div className="flex gap-3 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Bob… (Enter to send, Shift+Enter for newline)"
                className="resize-none min-h-[60px] max-h-[160px]"
                rows={2}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sendMsg.isPending}
                size="icon"
                className="shrink-0 h-[60px] w-[60px]"
              >
                {sendMsg.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
