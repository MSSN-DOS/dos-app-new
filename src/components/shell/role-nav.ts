import { BookOpen, ClipboardList, FileQuestion, FolderOpen, History, LayoutDashboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AppNavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const TEACHER_NAV_ITEMS: AppNavItemConfig[] = [
  { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
  { label: "Topics", href: "/teacher/topics", icon: BookOpen },
  { label: "Questions", href: "/teacher/questions", icon: FileQuestion },
  { label: "Quizzes", href: "/teacher/quizzes", icon: ClipboardList },
  { label: "Results", href: "/teacher/results", icon: ClipboardList },
];

// Student and Aspirant share the same URLs and nav (screens-aspirant.md).
export const STUDENT_NAV_ITEMS: AppNavItemConfig[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "History", href: "/history", icon: History },
  { label: "Resources", href: "/resources", icon: FolderOpen },
];
