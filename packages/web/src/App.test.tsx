import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe("App", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/projects")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                slug: "alpha",
                name: "Alpha",
                description: "First project",
                aiInferredSummary: null,
                scan: { frequency: "weekly", time: "09:00" },
                bootstrapLookbackYears: 2,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the sidebar Sidescan link and the Projects page heading", async () => {
    wrap(<App />);

    expect(
      screen.getByRole("link", { name: "Sidescan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeInTheDocument();

    // "Alpha" appears in the sidebar and in the grid card; both are expected.
    await waitFor(() => {
      expect(screen.getAllByText("Alpha").length).toBe(2);
    });

    // Description only appears on the grid card.
    expect(screen.getByText("First project")).toBeInTheDocument();
  });
});
