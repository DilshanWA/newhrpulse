import { BarChart3, Bell, CalendarDays, Clock, DollarSign, GraduationCap, HandCoins, LayoutDashboard, Settings, ShieldCheck, Target, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Role } from "@/domain/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  badgeKey?: "leave";
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL: Role[] = ["superadmin", "admin", "employee"];
const STAFF: Role[] = ["superadmin", "admin"];

export const NAV: NavGroup[] = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL }] },
  {
    title: "People",
    items: [
      { href: "/employees", label: "Employees", icon: Users, roles: STAFF },
      { href: "/attendance", label: "Attendance", icon: Clock, roles: ALL },
      { href: "/leave", label: "Leave", icon: CalendarDays, roles: ALL, badgeKey: "leave" },
      { href: "/performance", label: "Performance", icon: Target, roles: ALL },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/my-payroll", label: "My Payroll", icon: Wallet, roles: ALL },
      { href: "/payroll", label: "Payroll", icon: DollarSign, roles: STAFF },
      { href: "/teachers", label: "Teacher Pay", icon: GraduationCap, roles: STAFF },
      { href: "/commissions", label: "SIG Commissions", icon: HandCoins, roles: STAFF },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, roles: STAFF },
      { href: "/notifications", label: "Notifications", icon: Bell, roles: ALL },
      { href: "/admin", label: "Admin Panel", icon: ShieldCheck, roles: STAFF },
      { href: "/settings", label: "Settings", icon: Settings, roles: ALL },
    ],
  },
];
