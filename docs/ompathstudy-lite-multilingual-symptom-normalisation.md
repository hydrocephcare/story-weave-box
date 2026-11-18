# OmpathStudy Lite multilingual symptom phrase normalisation

**Status: implementation under test; not a clinically validated language model.**

The Lite USSD intake now includes a curated phrase matcher for selected English, Kiswahili and common Sheng expressions. It preserves the caller's original free-text description and stores a separate, concise normalised symptom summary for review.

## Current behaviour

- Recognises selected phrases for lower abdominal/pelvic pain, vaginal discharge, menstrual problems, vaginal bleeding, pregnancy bleeding, possible fluid leakage, reduced fetal movement, fever, vomiting, urinary burning, severe pain and selected emergency symptoms.
- Adds common Kiswahili/Sheng expressions to the existing emergency phrase detector (for example, breathing difficulty, chest pain, fainting, convulsions and heavy bleeding).
- Stores the normalised symptom labels in `normalized_summary`; the original description remains in `original_message`.
- Does not silently replace the patient's chosen concern category.
- Does not infer a diagnosis, prescribe treatment, or use an unrecognised phrase as evidence that a symptom is absent.
- Unknown language, misspellings and ambiguous slang remain unclassified; the original text is retained for clinician review.

## Safety boundaries

This is deterministic phrase matching, not generative AI, speech recognition, machine translation, a validated Sheng corpus or a clinical decision-support device. It cannot reliably understand all dialects, spelling variants, sarcasm, negation, context or multiple simultaneous symptoms. A recognised phrase is not proof of a disease; a phrase that is not recognised is not proof that the symptom is absent.

The emergency screen remains in place. A negative screen does not rule out an emergency. Callers with severe or worsening symptoms must be directed to in-person emergency care rather than waiting for a text interpretation.

## Before wider release

1. Have Kenyan clinicians review the symptom vocabulary, red-flag coverage and urgency pathways.
2. Test with consented, de-identified examples from diverse Kenyan English, Kiswahili and Sheng speakers.
3. Have native Kiswahili speakers and local language reviewers validate each phrase and its clinical meaning.
4. Measure false-positive and false-negative red-flag detection separately; prioritise sensitivity for emergency warning signs.
5. Add a clear fallback when language confidence is low, and never let this matcher lower an urgency level raised by the existing red-flag screen.
6. Keep this feature disabled for autonomous diagnosis or treatment advice.

## Planned next stage

A separately configured language model may later help interpret free text, but it must operate behind the same deterministic emergency screen, return constrained structured fields, preserve source text, and fail safely to clinician assessment. No live LLM provider is connected by this change.
