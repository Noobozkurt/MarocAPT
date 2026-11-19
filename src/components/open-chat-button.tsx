'use client';
import { Button } from './ui';
export function OpenChatButton({ topic, subject, label, productId }: { topic: string; subject: string; label: string; productId?: string }) {
  return <Button variant="secondary" onClick={() => window.dispatchEvent(new CustomEvent('s3d:open-chat', { detail: { topic, subject, productId } }))}>{label}</Button>;
}
