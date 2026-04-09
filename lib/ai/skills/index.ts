import skill01 from "./01-fd-role";
import skill02 from "./02-fd-tools";
import skill03 from "./03-fd-patterns";
import skill04 from "./04-fd-format";

const SKILLS_PROMPT = [skill01, skill02, skill03, skill04].join("\n\n---\n\n");

export function getSkillsPrompt(): string {
  return SKILLS_PROMPT;
}
