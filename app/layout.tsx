import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quick Query — Data Vault Knowledge Base',
  description: 'AI-powered search over your Data Vault 2.0 documents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
