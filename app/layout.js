import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { RotateDevicePrompt } from "@/components/ui/RotateDevicePrompt";
import { palette } from "@/lib/design/tokens";
import "./globals.css";

// Geist: one modern sans for every level of the hierarchy; Geist Mono for codes and HUD figures.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata = {
  title: { default: "Our Place", template: "%s · Our Place" },
  description: "A place for just you two.",
  applicationName: "Our Place",
  appleWebApp: { capable: true, title: "Our Place", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Page zoom stays enabled for accessibility; the 3D canvas opts out of browser
  // gestures itself (touch-action in globals.css) so touch controls don't fight zoom.
  viewportFit: "cover",
  themeColor: palette.black950,
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <div className="landscape-content">{children}</div>
        <RotateDevicePrompt />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
