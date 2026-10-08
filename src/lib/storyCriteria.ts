// What a story must meet to be published. One list, used by the Submit-a-story page and by Ompath AI, so they never disagree.
export const STORY_MIN_CHARACTERS = 200;
export const STORY_MAX_COVER_MB = 3;

export const STORY_CRITERIA: { title: string; detail: string }[] = [
  { title: "Open to every year", detail: "First year to final year, and recent graduates. You do not need to be senior to share your experience." },
  { title: "Your own work", detail: "Write it yourself. Copied or reposted text is not published." },
  { title: `At least ${STORY_MIN_CHARACTERS} characters`, detail: "A few real paragraphs is best. Short notes and one-liners are turned away." },
  { title: "A story, not an advert", detail: "Experiences, lessons, reflections, creative writing and student life. No selling, no links to promote something." },
  { title: "Protect people", detail: "Never name or describe a patient so they could be recognised, and do not attack a named person." },
  { title: "Be kind and accurate", detail: "No hate, no abuse. If you mention medicine, do not give advice that could hurt someone." },
  { title: "Optional cover image", detail: `Under ${STORY_MAX_COVER_MB} MB. You can also paste images into the story.` },
];

export const STORY_PROCESS = "After you submit, a quick automatic check runs, grammar and formatting are tidied, and the story waits for review. Once approved it appears in Stories. Nothing is published instantly.";
