import { db } from '@/lib/db';
import { RegisterForm } from '@/components/auth-forms';
import { Alert } from '@/components/ui';
export const metadata = { title: 'Claim your purchase', robots: { index: false } };
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({ where: { claimToken: token } });
  const existing = order ? await db.user.findUnique({ where: { email: order.email } }) : null;
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-3xl font-extrabold">Keep your files forever</h1>
      <p className="mb-8 text-muted">Create a free account to store your licenses, get free updates and re-download any time.</p>
      {!order ? <Alert tone="danger">This claim link is invalid.</Alert> : existing ? <Alert>An account already exists for {order.email}. Sign in — your purchases are attached automatically once your email is verified.</Alert> : <RegisterForm claimToken={token} presetEmail={order.email} />}
    </div>
  );
}
