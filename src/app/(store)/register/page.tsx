import { RegisterForm } from '@/components/auth-forms';
export const metadata = { title: 'Create account', robots: { index: false } };
export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-8 text-3xl font-extrabold">Create your account</h1>
      <RegisterForm />
    </div>
  );
}
