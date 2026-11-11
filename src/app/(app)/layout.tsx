import { AppRoot } from "@/components/layout/app-root";

// Every page below runs entirely in the browser on local data.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppRoot>{children}</AppRoot>;
}
