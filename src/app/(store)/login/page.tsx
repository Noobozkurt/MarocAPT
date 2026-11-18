import { Suspense } from 'react';
import { enabledOAuthProviders } from '@/lib/auth';
import { LoginForm } from '@/components/auth-forms';
export const metadata = { title: 'Sign in', robots: { index: false } };
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-8 text-3xl font-extrabold">Sign in</h1>
      <Suspense><LoginForm oauth={enabledOAuthProviders()} /></Suspense>
    </div>
  );
}
