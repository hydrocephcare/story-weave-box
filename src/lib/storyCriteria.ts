// What a story must meet to be published. One list, used by the Submit-a-story page and by Ompath AI, so they never disagree.
export const STORY_MIN_CHARACTERS = 200;

export const STORY_CRITERIA: { title: string; detail: string }[] = [
  { title: "Open to everyone", detail: "Writers from every country, profession and background are welcome." },
  { title: "Your own work", detail: "Write it yourself. Copied, plagiarised or reposted text is not accepted." },
  { title: `At least ${STORY_MIN_CHARACTERS} characters`, detail: "A few meaningful paragraphs are best. Very short notes cannot be published." },
  { title: "A story, not an advert", detail: "Share experiences, lessons, reflections, knowledge, opinions or creative writing. Do not use submissions for spam or undisclosed promotion." },
  { title: "Protect people’s privacy", detail: "Do not publish private contact details, confidential records, or details that could identify someone without permission." },
  { title: "Be kind and accurate", detail: "No hate, harassment or threats. Make factual claims responsibly, and do not present unsafe medical or professional advice as fact." },
];

export const STORY_PROCESS = "Log in, tap Share your story, write, and press Publish. It goes live in Stories straight away. A story that breaks these guidelines is taken down.";
