import { describe, expect, it } from "vitest";
import { parseConversationExport } from "./conversations";

describe("AI conversation imports", () => {
  it("keeps only the member's messages from a ChatGPT export", () => {
    const exported = JSON.stringify([{ title: "Market sizing help", mapping: {
      a: { message: { author: { role: "user" }, content: { parts: ["How do I size the Indian EV market?"] }, create_time: 1700000000 } },
      b: { message: { author: { role: "assistant" }, content: { parts: ["You are clearly brilliant at this."] } } },
      c: { message: { author: { role: "user" }, content: { parts: ["I assumed 2% penetration; is that defensible?"] } } },
    } }]);
    const result = parseConversationExport(exported);
    expect(result.conversations).toBe(1);
    expect(result.messages.map((message) => message.text)).toEqual(["How do I size the Indian EV market?", "I assumed 2% penetration; is that defensible?"]);
    expect(JSON.stringify(result)).not.toContain("brilliant");
  });

  it("reads Claude exports and pasted transcripts", () => {
    const claude = JSON.stringify([{ name: "Case prep", chat_messages: [{ sender: "human", text: "Here is my structure" }, { sender: "assistant", text: "Great structure" }] }]);
    expect(parseConversationExport(claude).messages.map((message) => message.text)).toEqual(["Here is my structure"]);
    const pasted = "User: first question\nstill my question\nAssistant: an answer\nYou: follow-up";
    expect(parseConversationExport(pasted).messages.map((message) => message.text)).toEqual(["first question\nstill my question", "follow-up"]);
  });
});
