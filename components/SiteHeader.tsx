"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/functions", label: "2D Functions" },
  { href: "/multivariable", label: "Surfaces" },
  { href: "/2d-shapes", label: "2D Shapes" },
  { href: "/3d-shapes", label: "3D Shapes" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="group flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-950" fill="none" strokeWidth="2.5" stroke="currentColor">
              <path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            Ondas
            <span className="ml-2 hidden text-sm font-normal text-zinc-500 sm:inline">
              hear the shape of mathematics
            </span>
          </span>
        </Link>

        <nav aria-label="Main">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-zinc-900 text-cyan-300"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
