import { describe, expect, it } from "vitest";
import { parseAiProfile } from "./ai-profile";

describe("AI assistant profile import", () => {
  it("reads the closing JSON block and keeps tags, examples and changes", () => {
    const reply = "## Profile\nSome narrative.\n```json\n{\"source\":\"chatgpt\",\"window_days\":30,\"conversations_seen\":42,\"findings\":[{\"area\":\"thinking\",\"claim\":\"Frames problems from first principles\",\"tag\":\"Observed\",\"examples\":[{\"date\":\"2026-10-02\",\"paraphrase\":\"Rebuilt a pricing model from unit costs\"}],\"counter_examples\":[]}],\"changes\":[{\"what\":\"More explicit assumptions\",\"from\":\"implicit\",\"to\":\"stated\",\"when\":\"mid-October\",\"evidence\":\"\"}],\"limits\":\"Only sees chats\",\"validation_questions\":[\"How do you decide?\"]}\n```";
    const profile = parseAiProfile(reply, "other")!;
    expect(profile).toMatchObject({ source: "chatgpt", windowDays: 30, conversationsSeen: 42 });
    expect(profile.findings[0]).toMatchObject({ tag: "Observed", examples: [{ date: "2026-10-02" }] });
    expect(profile.changes[0].what).toBe("More explicit assumptions");
  });
  it("rejects replies without the profile JSON", () => {
    expect(parseAiProfile("I can't see past conversations.", "chatgpt")).toBeNull();
  });
});
