"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const OPTIONS = [{ value: "all", label: "All" }, { value: "Term 1", label: "Term 1" }, { value: "Term 2", label: "Term 2" }];

export function TermSwitch() {
  const router = useRouter();
  const [term, setTerm] = useState("all");
  useEffect(() => {
    const match = /(?:^|; )mesa_term=([^;]+)/.exec(document.cookie);
    if (match) setTerm(decodeURIComponent(match[1]));
  }, []);
  const choose = (value: string) => {
    setTerm(value);
    document.cookie = `mesa_term=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return <div className="term-switch" role="radiogroup" aria-label="Term">
    {OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={term === option.value} className={term === option.value ? "is-on" : ""} onClick={() => choose(option.value)}>{option.label}</button>)}
  </div>;
}
