# OmpathStudy Lite USSD session limits

## What the application can and cannot control

The application can keep each callback fast, keep a consented encounter saved, and return concise menus. It cannot extend the mobile-network USSD idle timer by returning `CON`; the timer is enforced by the mobile network and Africa's Talking gateway.

Africa's Talking's published Kenya guidance currently states:
- Safaricom: 180-second overall session; an idle response delay over 30 seconds can end the session.
- Airtel: 180-second overall session; the guidance lists a 15-second application response timeout, 10-second connection-to-application timeout, and 60-second customer-response timeout.
- Equitel: 180-second overall session; an idle response delay over 30 seconds can end the session.

These are provider-published values, not guarantees that every current SIM/network route behaves identically. Confirm the live limits with Africa's Talking before launch. Their help article lists `smsussd@africastalking.com` for further clarification.

## Lite implementation safeguards

- Keep numbered choices on separate lines to make them easier to scan.
- Warn users to respond promptly because the network can close an idle session.
- Persist the concern and each clarification answer as the user progresses, after explicit consent.
- Bound each USSD encounter read/write request to 3.5 seconds so sequential storage calls have a smaller chance of exceeding the gateway's application response window.
- Do not perform AI inference, article search, or SMS delivery synchronously inside a USSD callback. Those operations must be asynchronous and return a short `CON` or `END` response first.
- A 30-day encounter retention period is a data-retention policy; it does not keep the carrier's USSD connection open for 30 days.

## Provider action required to request a longer idle window

Ask Africa's Talking to confirm whether the service code and each Kenyan MNO can support a longer customer-response timeout, and whether any setting is available for the assigned shortcode. The application cannot make that network-side change itself. Configure the callback URL and, separately, an end-of-session events URL in the Africa's Talking USSD service-code settings if session analytics are required.


## Recovery after a carrier disconnect

An unfinished, consented encounter can be resumed from the same phone number after a new dial. The new USSD session is rebound to the saved encounter; the saved follow-up answers are snapshotted so cumulative Africa's Talking `text` values do not duplicate answers. Completed, urgent, emergency, expired, or unconsented encounters are not offered for resumption.

Africa's Talking documents that USSD callbacks are not authenticated by default. The recovery lookup and rebind are therefore enabled only when the callback includes the configured `USSD_CALLBACK_SECRET` query parameter. The existing unprotected callback can still serve the existing intake, but it does not offer resume. Configure the USSD service-code callback URL with the secret query parameter before testing recovery. Keep the URL confidential; rotate the secret if it is exposed.

The callback secret is stored as an encrypted Cloudflare Pages production secret and is not committed to source control. The USSD callback must be updated in the Africa's Talking dashboard by an authorised account operator.
