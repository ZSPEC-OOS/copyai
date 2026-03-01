import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CopyAI — Prompt Manager',
  description: 'Organize, save, and copy your AI prompts in one click.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
