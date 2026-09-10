import "./globals.css";
import NavigationLoader from "@/components/navigation-loader";
import ThemeInit from "@/components/theme-init";
import AnnouncementCenter from "@/components/announcement-center";
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ThemeInit/><NavigationLoader/><AnnouncementCenter/>{children}</body></html>}
