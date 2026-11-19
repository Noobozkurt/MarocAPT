import { ForgotForm } from '@/components/auth-forms';
export const metadata = { title: 'Reset password', robots: { index: false } };
export default function ForgotPage() {
  return <div className="mx-auto max-w-sm px-4 py-16"><h1 className="mb-8 text-3xl font-extrabold">Reset your password</h1><ForgotForm /></div>;
}
