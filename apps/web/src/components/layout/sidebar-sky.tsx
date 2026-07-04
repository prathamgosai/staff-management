import { cn } from "@/lib/utils";

/**
 * Decorative evening night-sky for the sidebar: a glowing moon, twinkling stars
 * and an occasional shooting star. Purely ornamental (aria-hidden,
 * pointer-events-none) and sits BEHIND the nav content. All colours/animation
 * live in globals.css (.sidebar-sky / .sidebar-star / .sidebar-moon).
 *
 * Star positions are a fixed list (not Math.random) so server and client render
 * identically — no hydration mismatch.
 */

type Star = { top: string; left: string; size: number; delay: string; dur: string };

// Hand-scattered so it reads as a night sky rather than a grid.
const STARS: Star[] = [
  { top: "6%", left: "22%", size: 2, delay: "0s", dur: "3.2s" },
  { top: "9%", left: "62%", size: 1.5, delay: "1.1s", dur: "4.1s" },
  { top: "12%", left: "40%", size: 2.5, delay: "0.4s", dur: "3.8s" },
  { top: "15%", left: "80%", size: 1.5, delay: "2.2s", dur: "4.6s" },
  { top: "18%", left: "12%", size: 2, delay: "1.6s", dur: "3.4s" },
  { top: "21%", left: "52%", size: 1.5, delay: "0.9s", dur: "4.9s" },
  { top: "24%", left: "72%", size: 2, delay: "2.8s", dur: "3.1s" },
  { top: "27%", left: "30%", size: 1.5, delay: "0.2s", dur: "4.3s" },
  { top: "31%", left: "88%", size: 2, delay: "1.9s", dur: "3.7s" },
  { top: "34%", left: "18%", size: 1.5, delay: "3.1s", dur: "4.0s" },
  { top: "37%", left: "58%", size: 2.5, delay: "0.7s", dur: "3.3s" },
  { top: "40%", left: "42%", size: 1.5, delay: "2.4s", dur: "4.7s" },
  { top: "43%", left: "78%", size: 2, delay: "1.3s", dur: "3.6s" },
  { top: "47%", left: "10%", size: 1.5, delay: "0.5s", dur: "4.4s" },
  { top: "50%", left: "66%", size: 2, delay: "2.9s", dur: "3.2s" },
  { top: "53%", left: "34%", size: 1.5, delay: "1.7s", dur: "4.8s" },
  { top: "56%", left: "84%", size: 2, delay: "0.3s", dur: "3.9s" },
  { top: "60%", left: "24%", size: 1.5, delay: "2.1s", dur: "4.2s" },
  { top: "63%", left: "54%", size: 2.5, delay: "1.0s", dur: "3.5s" },
  { top: "66%", left: "74%", size: 1.5, delay: "3.3s", dur: "4.5s" },
  { top: "70%", left: "16%", size: 2, delay: "0.6s", dur: "3.1s" },
  { top: "73%", left: "46%", size: 1.5, delay: "2.6s", dur: "4.9s" },
  { top: "76%", left: "82%", size: 2, delay: "1.4s", dur: "3.8s" },
  { top: "80%", left: "28%", size: 1.5, delay: "0.8s", dur: "4.1s" },
  { top: "83%", left: "64%", size: 2, delay: "3.0s", dur: "3.4s" },
  { top: "87%", left: "38%", size: 1.5, delay: "1.8s", dur: "4.6s" },
  { top: "90%", left: "76%", size: 2, delay: "0.1s", dur: "3.6s" },
  { top: "93%", left: "20%", size: 1.5, delay: "2.5s", dur: "4.3s" },
  { top: "96%", left: "56%", size: 2, delay: "1.2s", dur: "3.3s" },
];

export function SidebarSky({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="sidebar-sky" aria-hidden="true">
      {/* Moon — top corner. Hidden when the rail is collapsed (too narrow). */}
      {!collapsed && (
        <div
          className="sidebar-moon"
          style={{ top: "18px", right: "20px", width: "34px", height: "34px" }}
        />
      )}

      {STARS.map((s, i) => (
        <span
          key={i}
          className={cn("sidebar-star", collapsed && i % 2 === 1 && "hidden")}
          style={
            {
              top: s.top,
              left: s.left,
              width: `${s.size}px`,
              height: `${s.size}px`,
              "--twinkle-delay": s.delay,
              "--twinkle-dur": s.dur,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Occasional shooting star, upper area. */}
      {!collapsed && <span className="sidebar-shoot" style={{ top: "14%", left: "-10%" }} />}
    </div>
  );
}
