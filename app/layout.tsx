import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GENEVIEVE | Business Pattern, Waste & Prevention Command',
  description: 'Human-governed operational matter, evidence, cost and prevention command system.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
