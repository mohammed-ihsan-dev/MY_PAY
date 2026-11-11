import { HandCoins, History, House, Settings, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. Settings is reached from the header icon. */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: House, mobile: true },
  { href: "/salary", label: "Salary", short: "Salary", icon: Wallet, mobile: true },
  { href: "/debts", label: "Debt Manager", short: "Debt", icon: HandCoins, mobile: true },
  { href: "/history", label: "History", short: "History", icon: History, mobile: true },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, mobile: false },
];
