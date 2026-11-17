# OmpathStudy Lite — Health Support specification

## Product definition

OmpathStudy Lite is a focused, low-bandwidth Health Support channel. Its public home page and USSD main menu lead directly to symptom intake and preliminary triage. It is not a medical-learning portal.

The main OmpathStudy website remains the learning platform and the source of medical notes, MCQs, past papers, flashcards and full study resources. Lite links learners to https://www.ompathstudy.com rather than duplicating those features.

The first structured pathways focus on pregnancy and maternity concerns, menstrual problems, lower abdominal pain, vaginal discharge and bleeding. Other symptoms receive a conservative intake summary and clear referral advice; they are not forced into a false diagnosis.

## User journeys

### Lite home page

1. Health Support intake.
2. Emergency warning-sign screen.
3. Adaptive symptom questions based on the selected concern.
4. Preliminary clinical impression, differential diagnoses, urgency and recommended next steps.
5. Links to reviewed patient-facing OmpathStudy resources where relevant.
6. Link to the main OmpathStudy website for medical learning.

No MCQ bank, learner registration, learning progress or daily learning SMS is presented in Lite.

### Main USSD menu

1. Health support.
2. Help and information.

The health intake obtains consent, language preference and the minimum information needed for the current enquiry. It does not ask for a person's name. Health answers are retained for up to 30 days. The current web experience is English; the USSD flow supports English and Kiswahili.

### Navigation contract

- 0: go back exactly one menu step.
- 00: return to the main menu.
- Numeric options are the default.
- Every screen states the valid inputs.
- Invalid input redisplays the same screen with a concise correction.
- Back navigation preserves prior answers and selections.
- Do not silently discard a completed encounter when a USSD session expires.
- Keep menus short and within Africa's Talking/USSD display constraints.

## Health assessment workflow

1. Obtain explicit consent before storing health information.
2. Capture the main concern and a short symptom description. Do not request names or unnecessary identifiers.
3. Run deterministic emergency phrase screening before routine clarification.
4. Ask a short emergency warning-sign question. A positive or uncertain answer interrupts routine questioning and provides urgent-care advice.
5. Ask no more than four additional adaptive questions (five total including the emergency screen). Questions must use answer formats that match the options displayed.
6. Re-evaluate urgency using the original symptom description and structured answers.
7. Generate a preliminary clinical impression, relevant differentials, rationale, urgency, recommended next steps and likely clinician evaluation.
8. Retrieve only published, reviewed patient-facing OmpathStudy resources. Medical-school notes, MCQs and past papers are not patient-care references.
9. Clearly state what is unknown and that no examination, vital signs or investigations have been performed.

## Clinical safety and interpretation

The current assessment engine is deterministic and rule-based. It does not make a confirmed diagnosis and does not use a generative AI model to diagnose a patient. Its output is an intake-level clinical impression and triage aid.

The engine must:
- Distinguish reported facts from unknown information.
- Never infer pregnancy, gestational age, severity, duration or other facts that the user has not supplied.
- Never downgrade an emergency flag because of a later reassuring answer.
- Escalate uncertainty when it affects safety.
- Avoid listing a differential as though it were confirmed.
- Recommend examination and investigations only as clinician-directed possibilities, not as tests already performed.
- Never prescribe treatment or tell a user to delay emergency care to finish the intake.

The initial structured pathways are not a substitute for clinician validation. They require review by qualified clinicians before broad production use, and should be expanded only with test cases and clinical sign-off.

## Patient resources and SMS

- Reviewed patient-facing guides are retrieved from the main OmpathStudy content source.
- Private guide links use random, unguessable, expiring access tokens; do not put phone numbers or symptoms in URLs.
- SMS delivery is not offered in the current web intake or USSD flow. Do not promise an SMS unless the user explicitly opts in and the live provider credentials and scheduled delivery path have been verified.
- If patient-guide SMS is enabled later, use discreet wording, honour STOP/opt-out, and revoke active guide tokens on opt-out.
- Include a support number only after OmpathStudy designates and verifies a staffed contact. Do not imply 24/7 clinical coverage unless it exists.

## Privacy, security and governance

- Obtain informed consent before collecting or processing health information.
- Collect only information required for the current purpose.
- Health encounter tables remain server-only with RLS enabled and no anon/authenticated table access.
- Keep Supabase service-role credentials server-side.
- Use least-privilege admin access. Admin activity views should avoid displaying phone numbers and symptom narratives unless a separately approved clinical-review workflow requires them.
- Retain health encounters for no more than 30 days unless a documented legal/clinical requirement requires otherwise.
- Do not use encounter content for marketing or unrelated profiling.
- Do not make emergency care conditional on completing questions or receiving an SMS.
- The service is informational and does not replace clinical examination, testing, diagnosis or treatment.

## Delivery sequence

1. Preserve the main OmpathStudy deployment on Vercel and the existing Supabase project.
2. Make Health Support the Lite home page and USSD main menu.
3. Remove the Lite learning/MCQ experience and redirect learners to the main website.
4. Integrate encounter persistence, consent, red-flag screening and the structured assessment engine.
5. Test every concern pathway, adaptive branch, emergency response, invalid answer and USSD back-navigation case.
6. Add admin monitoring with de-identified encounter metadata.
7. Verify resource retrieval, retention cleanup and any explicitly enabled patient-guide SMS queue.
8. Obtain clinical review before expanding diagnostic scope or enabling broad production use.

## Acceptance criteria

- Lite opens directly to Health Support.
- No MCQ, study-year, learning-progress or daily learning SMS experience is available in Lite.
- The main OmpathStudy website remains the learning destination.
- USSD has only Health Support and Help/Information at the main menu.
- Consent is obtained before health information is stored.
- Emergency warning signs interrupt routine questioning.
- Question answer formats match the options presented, and adaptive pregnancy questions remain correctly aligned with their answers.
- Up to five questions are asked, including the emergency screen.
- Completed assessments include an impression, differential diagnoses, urgency, rationale, recommended next steps and clinician evaluation suggestions.
- The assessment is never labelled a confirmed diagnosis.
- Reviewed patient-facing resources are linked when relevant.
- Health encounters are protected by server-side access and expire after 30 days.
- No change is made to the main production deployment, main domain or unrelated Cloudflare resources as part of Lite development.
