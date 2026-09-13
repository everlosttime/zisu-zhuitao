import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "字速追逃｜双人中文打字对战",
  description: "创建房间，邀请朋友，在两分钟的警匪追逐中比拼中文打字速度。",
  icons: { icon: "/favicon-zisu.svg", shortcut: "/favicon-zisu.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
