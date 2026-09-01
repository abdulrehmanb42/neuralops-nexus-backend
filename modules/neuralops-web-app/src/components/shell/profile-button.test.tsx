import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/stores/connection.store", () => ({ useConnectionStore: () => ({ email: "me@example.com", connection: { nucleusUserId: "u1" } }) }));
vi.mock("@/hooks/use-workspace", () => ({ useMembers: () => ({ data: [] }) }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ auth: { signOut: vi.fn().mockResolvedValue({}) } }) }));
vi.mock("@/lib/auth/session-cleanup", () => ({ clearAccountScopedState: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ absolutizeMedia: (x: string | null) => x }));
vi.mock("@/components/shell/profile-dialog", () => ({
  ProfileDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="profile-dialog" /> : null),
}));
vi.mock("@/components/ui/dialog", () => ({
  ConfirmDialog: ({ open, title }: { open: boolean; title: string }) => (open ? <div>{title}</div> : null),
}));

import { ProfileButton } from "./profile-button";

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

afterEach(cleanup);

describe("ProfileButton", () => {
  it("opens a menu with Profile and Sign out (not the dialog directly)", () => {
    render(<ProfileButton />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByTestId("profile-dialog")).toBeNull();
    openMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("Profile opens the profile dialog", () => {
    render(<ProfileButton />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /profile/i }));
    expect(screen.getByTestId("profile-dialog")).toBeInTheDocument();
  });

  it("Sign out opens the confirmation", () => {
    render(<ProfileButton />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(screen.getByText("Sign out?")).toBeInTheDocument();
  });
});
