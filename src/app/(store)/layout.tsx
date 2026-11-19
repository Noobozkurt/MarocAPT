import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ChatWidget } from '@/components/chat/chat-widget';
import { getStoreContext } from '@/server/context';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStoreContext();
  return (
    <>
      <Header locale={ctx.locale} />
      <main id="main" tabIndex={-1} className="outline-none">{children}</main>
      <Footer locale={ctx.locale} />
      <ChatWidget />
    </>
  );
}
