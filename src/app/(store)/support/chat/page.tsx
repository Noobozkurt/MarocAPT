import { CustomerChat } from '@/components/chat/customer-chat';

export const metadata = { title: 'Support chat', robots: { index: false } };

export default async function SupportChatPage({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const { c, t } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-3xl font-extrabold">Support</h1>
      <div className="h-[70vh] overflow-hidden rounded-2xl border border-border bg-surface">
        <CustomerChat initialConversationId={c ?? null} initialGuestToken={t ?? null} />
      </div>
    </div>
  );
}
