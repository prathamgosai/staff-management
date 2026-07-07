import type { Metadata } from "next";
import { MagicWeek } from "./magic-week";

// Read-only public roster — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Your roster · WorkforceIQ",
  robots: { index: false, follow: false },
};

export default function MagicWeekPage({ params }: { params: { token: string } }) {
  return <MagicWeek token={params.token} />;
}
