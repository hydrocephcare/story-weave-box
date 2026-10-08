// What a story must meet to be published. One list, used by the Submit-a-story page and by Ompath AI, so they never disagree.
export const STORY_MIN_CHARACTERS = 200;

export const STORY_CRITERIA: { title: string; detail: string }[] = [
  { title: "Open to every year", detail: "First year to final year, and recent graduates. You do not need to be senior to share your experience." },
  { title: "Your own work", detail: "Write it yourself. Copied or reposted text is taken down." },
  { title: `At least ${STORY_MIN_CHARACTERS} characters`, detail: "A few real paragraphs is best. Very short notes cannot be published." },
  { title: "A story, not an advert", detail: "Experiences, lessons, reflections, creative writing and student life. No selling, no links to promote something." },
  { title: "Protect people", detail: "Never name or describe a patient so they could be recognised, and do not attack a named person." },
  { title: "Be kind and accurate", detail: "No hate, no abuse. If you mention medicine, do not give advice that could hurt someone." },
];

export const STORY_PROCESS = "Log in, tap Share your story, write, and press Publish. It goes live in Stories straight away. A story that breaks these guidelines is taken down.";
