import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/theme/theme-provider";
import LandingPage from "./page";

describe("Landing page", () => {
  it("presents the product and routes to the app", () => {
    render(
      <ThemeProvider>
        <LandingPage />
      </ThemeProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/digital workforce/i);
    const ctas = screen.getAllByRole("link", { name: /open the app|get started/i });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((a) => expect(a).toHaveAttribute("href", "/login"));
    expect(screen.getAllByText(/NeuralOps Nexus/).length).toBeGreaterThan(0);
  });

  it("explains the core features in product vocabulary", () => {
    render(
      <ThemeProvider>
        <LandingPage />
      </ThemeProvider>,
    );
    for (const label of [/Human \+ AI team collaboration/i, /Multi-agent orchestration/i, /Dynamic workspace/i, /Structured Knowledge Management/i, /How NeuralOps Nexus/i, /Product status/i]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
  });

  it("omits the pitch-deck content (no fake pricing / GTM / market-size)", () => {
    render(
      <ThemeProvider>
        <LandingPage />
      </ThemeProvider>,
    );
    // Trimmed to real product — these referenced offerings that don't exist.
    for (const gone of [/Cloud Edition/i, /Enterprise Edition/i, /Go-to-market/i, /TAM/, /SAM/, /Revenue Layer/i, /Talk to us/i, /Get started free/i]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });
});
