import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LULPUP — 생각을 차곡차곡 연결하다',
  description: 'Line Upon Line · Precept Upon Precept. 생각을 연결하고 쌓아가는 마인드맵 워크스페이스.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
