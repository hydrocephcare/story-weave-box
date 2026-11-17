# OmpathStudy Health Assist — implementation blueprint

## Product definition

OmpathStudy Lite is the low-bandwidth access channel. The main OmpathStudy platform remains the source of published medical knowledge, patient-facing articles, MCQs and learning resources. Health Assist is initially focused on women's and maternal health, with an architecture that can later support broader health concerns. The learning pathway remains available to anyone.

## User journeys

### Main USSD menu

1. Health support / report a concern
2. Pregnancy and maternal health
3. Women's reproductive health
4. Learn about health
5. Practise MCQs
6. My activity / saved links
7. Register / preferences

Registration must be lightweight and must not require a name unless it is genuinely needed. Use the caller's verified phone number as the channel identifier, subject to informed consent.

### Navigation contract

- 0: go back exactly one menu step.
- 00: return to the main menu.
- 9: next page where pagination is available.
- 8: previous page where pagination is available.
- Numeric options are the default; use letters only where they make a menu shorter or clearer.
- Every screen states the valid inputs.
- Invalid input redisplays the same screen with a concise correction.
- Back navigation preserves prior answers and selections.
- Do not silently discard a completed encounter when a USSD session expires.
- Keep menus short and within Africa's Talking/USSD display constraints.

### Health concern journey

1. Obtain consent and preferred language.
2. Accept the user's description in supported natural language, including misspellings, incomplete phrases, mixed English/Kiswahili/Sheng and poorly ordered words where text input is supported.
3. Detect language and normalise meaning without changing or inventing clinical facts.
4. Run deterministic emergency red-flag screening before routine AI clarification.
5. Search relevant OmpathStudy resources and approved clinical guidance.
6. Ask up to five adaptive, symptom-specific clarification questions. Ask fewer when sufficient information is available. Questions should use short numeric options by default; permit a short free-text response only when necessary.
7. Re-check red flags after every answer. An emergency response interrupts the ordinary flow and gives clear urgent-care instructions.
8. Generate a preliminary assessment: possible explanations, uncertainty, urgency/level of care, and safe next steps. Never present it as a confirmed diagnosis.
9. Generate or select a patient-friendly guide on the main OmpathStudy domain.
10. Send an SMS containing the secure OmpathStudy link, concise safety advice and a verified support contact where available.

### Learning journey

- Keep existing registration, year/subject/set selection, MCQs, answer feedback, explanations and attempt tracking.
- Health support must not displace or hide the learning/MCQ journey.
- The same published OmpathStudy MCQ sets remain the only source of questions and explanations.

## AI and clinical architecture

Separate the AI into explicit stages:
1. Language understanding and symptom extraction.
2. Structured encounter representation with provenance and uncertainty.
3. Deterministic safety rules for emergency signs.
4. Retrieval from approved OmpathStudy resources and reviewed clinical sources.
5. Adaptive question selection (maximum five routine clarification questions).
6. Preliminary assessment generation.
7. Patient-friendly article generation in the user's preferred language.

The AI must distinguish reported facts, inferred interpretations and unknown information. It must not infer pregnancy, gestational age, severity, duration or other clinical facts that the user has not supplied. If information is insufficient, it must say so and recommend appropriate assessment rather than force a diagnosis.

Medical-school notes are not automatically patient-ready. Use them as retrieval sources, then generate patient-facing explanations against reviewed content templates and clinical safety rules. High-risk pathways and patient-facing templates require qualified clinical review before production use.

## Article and SMS contract

- All guides live on the main OmpathStudy domain, never on the Lite subdomain.
- Public reviewed educational articles and private encounter-specific guides are separate content types.
- Private guides use random, unguessable, expiring access tokens; do not put phone numbers or symptoms in URLs.
- Opening an SMS link first verifies access, displays a brief “Thank you” page, then redirects to the guide. Provide a manual Open guide link if redirect is unavailable.
- SMS must use discreet wording and avoid revealing sensitive symptoms in notification previews.
- Include a support number only after OmpathStudy designates and verifies a staffed contact. Do not imply 24/7 clinical coverage unless it exists.
- SMS sending requires explicit consent; STOP/opt-out must be honoured.

## Language and accessibility

- First validate English and Kiswahili end-to-end.
- Add Sheng and additional Kenyan languages only after translation and clinical terminology review.
- Keep the original user message alongside the normalised interpretation for audit.
- Ask a clarification question when translation confidence is low or a phrase has materially different clinical meanings.
- Respond in the user's selected/preferred language.
- Use numeric options as the default for speed and compatibility with basic phones.

## Privacy, security and governance

- Obtain informed consent before collecting or processing health information and before sending personalised SMS links.
- Collect only information required for the current purpose.
- Keep health encounters separate from ordinary learning profiles where feasible.
- Enforce server-side access control, least privilege, RLS where applicable, and never expose Supabase service-role credentials to clients.
- Encrypt transport, restrict staff access, log access to private guides, set retention/deletion rules and provide a privacy contact.
- Do not use encounter content for marketing or unrelated profiling.
- Do not make emergency care conditional on completing questions or receiving an SMS.
- The service is informational and does not replace clinical examination, testing, diagnosis or treatment.

## Delivery sequence

1. Establish schema, consent, encounter persistence, navigation state and test fixtures.
2. Implement the USSD menu and shared navigation engine without regressing existing MCQs.
3. Implement the deterministic emergency screening layer and reviewed symptom pathways.
4. Connect language interpretation, OmpathStudy retrieval and adaptive questions.
5. Add preliminary assessment and patient-friendly guide generation on the main domain.
6. Add secure guide access, thank-you/redirect experience and SMS delivery.
7. Add admin review, audit, analytics, monitoring and clinical governance.
8. Validate with clinicians and users, test language variants and USSD session edge cases, then enable production traffic gradually.

## Acceptance criteria

- A user can reach either health support or MCQ learning from the main menu.
- 0 goes back one step and 00 returns to the main menu throughout all menus and question flows.
- Numeric selections are the default and invalid input does not lose progress.
- Up to five adaptive clarification questions are asked; fewer are used when appropriate.
- Emergency red flags interrupt routine questioning and trigger urgent-care advice.
- Mixed-language, misspelt and incomplete descriptions are interpreted conservatively, with uncertainty preserved.
- A preliminary assessment is never labelled a confirmed diagnosis.
- A guide is served from the main OmpathStudy domain using a protected link.
- The link shows a thank-you state and then opens the guide.
- SMS is sent only with consent and contains the guide link plus verified support contact details when available.
- Existing MCQ content and attempt tracking continue to work.
- No change is made to the main production deployment or unrelated DNS/Cloudflare resources as part of Lite development.
