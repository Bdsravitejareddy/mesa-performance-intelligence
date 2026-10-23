"use client";

import { useEffect, useState } from "react";
import { jokeOfTheDay } from "@/lib/jokes";

// Sits in the middle of the top bar. Today's joke; a click shows another.
export function JokeOfTheDay() {
  const [offset, setOffset] = useState(0);
  const [joke, setJoke] = useState("");
  useEffect(() => { setJoke(jokeOfTheDay(new Date(), offset)); }, [offset]);
  if (!joke) return <div className="joke-slot" aria-hidden="true" />;
  return <button type="button" className="joke-slot" title={`${joke} — click for another`} onClick={() => setOffset((value) => value + 1)} aria-label={`Joke of the day: ${joke}. Show another.`}>
    <span className="joke-label">{offset ? "One more" : "Joke of the day"}</span><span key={joke} className="joke-text">{joke}</span>
  </button>;
}
