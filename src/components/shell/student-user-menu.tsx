"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/auth/client-fetch";

type MeResponse = {
  data: {
    id: number;
    fullName: string;
    identifier: string;
    role: string;
    activeSemester: "harmattan" | "rain" | null;
    profile:
      | {
          faculty: string | null;
          department: string | null;
          level: number | null;
          cgpa: number | null;
          cgpaWeekStart: string | null;
          quizzesTaken: number;
        }
      | {
          aspirationDepartment: string | null;
          postUtmeRaw: number | null;
          postUtmeConverted: number | null;
          postUtmeWeekStart: string | null;
          quizzesTaken: number;
        }
      | null;
  };
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0] ?? "";
    return w.slice(0, 2).toUpperCase() || "?";
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function formatProfileLine(
  role: string,
  profile: MeResponse["data"]["profile"]
): string | null {
  if (!profile) return null;
  if (role === "student" && "department" in profile) {
    const dept = profile.department;
    const faculty = profile.faculty;
    const lvl = profile.level;
    const parts: string[] = [];
    if (faculty) parts.push(faculty);
    if (dept) parts.push(dept);
    // Avoid duplicating if faculty == department
    const line = dept ? (faculty && faculty !== dept ? `${faculty} · ${dept}` : dept) : faculty ?? null;
    if (lvl) return line ? `${line} · Level ${lvl}` : `Level ${lvl}`;
    return line;
  }
  if (role === "aspirant" && "aspirationDepartment" in profile) {
    return profile.aspirationDepartment ?? null;
  }
  return null;
}

export function StudentUserMenu() {
  const router = useRouter();
  const { logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
    staleTime: 60_000,
    retry: false,
  });

  const fullName = data?.data.fullName ?? "";
  const identifier = data?.data.identifier ?? "";
  const role = data?.data.role ?? "";
  const profile = data?.data.profile ?? null;
  const initials = fullName ? getInitials(fullName) : "?";
  const profileLine = formatProfileLine(role, profile);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={fullName ? `User menu for ${fullName}` : "User menu"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Avatar className="size-9 border border-white/10 bg-gradient-to-br from-brand to-brand-press text-white shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-brand to-brand-press text-sm font-semibold tracking-wide text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="w-64 border-line bg-panel p-1.5 text-ink"
        >
          <div className="flex items-center gap-3 px-2 py-2.5">
            <Avatar className="size-9 shrink-0 border border-white/10 bg-gradient-to-br from-brand to-brand-press text-white">
              <AvatarFallback className="bg-gradient-to-br from-brand to-brand-press text-sm font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-ink">
                {fullName || "Loading..."}
              </p>
              <p className="truncate font-mono text-xs leading-tight text-sub">
                {identifier || "—"}
              </p>
              {profileLine ? (
                <p className="truncate text-xs leading-tight text-sub">{profileLine}</p>
              ) : null}
            </div>
          </div>
          <DropdownMenuLabel className="sr-only">Account</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-line" />
          <DropdownMenuItem
            variant="destructive"
            className="min-h-[44px] cursor-pointer gap-2 text-sm focus:bg-wash focus:text-ink data-[variant=destructive]:text-ruby data-[variant=destructive]:focus:bg-ruby/10 data-[variant=destructive]:focus:text-ruby"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="gap-0 border border-line bg-panel p-6 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-0">
          <AlertDialogHeader className="gap-2 text-left sm:place-items-start sm:text-left">
            <AlertDialogTitle
              className="text-[16px] font-medium leading-none text-ink"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              Log out of DOS Site?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm leading-relaxed text-sub">
              You&apos;ll need your identifier and password to sign back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 flex-row justify-end gap-3 border-t-0 bg-transparent p-0 pt-0">
            <AlertDialogCancel className="min-h-[44px] rounded-[11px] border border-edge bg-line px-5 text-sm font-medium text-ink hover:bg-edge hover:text-ink">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="min-h-[44px] rounded-[11px] bg-brand px-5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_var(--dos-aura)] hover:bg-brand-hover"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
