import { cookies } from "next/headers";

export const TERMS = ["all", "Pre-Term", "Term 1", "Term 2"] as const;
export type TermChoice = (typeof TERMS)[number];
export const TERM_COOKIE = "mesa_term";

// The term the member is looking at, shared by every page through a cookie; "all" shows everything.
export async function selectedTerm(): Promise<TermChoice> {
  const value = (await cookies()).get(TERM_COOKIE)?.value ?? "all";
  return (TERMS as readonly string[]).includes(value) ? value as TermChoice : "all";
}

export const inTerm = (term: TermChoice, courseTerm: string | null | undefined) => term === "all" || (courseTerm ?? "") === term;
