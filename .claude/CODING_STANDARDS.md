# Coding standards

Judgement calls for review. Mechanical versions of the privacy rules are enforced by the Playwright API tests; these catch what tests can miss.

## Privacy (ADR 0001)

- **Open routes expose only allowed fields.** Search and duplicate-check results carry only id, known-as name, age range, and description. Request status carries only `passed_on`, or the reply message and reply contact on a yes. Flag any open response, error message, or log line that could reveal a Registrant's shelter, location, Visibility, or existence.
- **Non-yes outcomes stay indistinguishable.** Declined, wrong person, couldn't find, Not findable, and Departed must produce the same Seeker-facing response, including status codes, timing-relevant early returns, and error text.
- **Empty searches stay indistinguishable**, whether nobody matched or only hidden Registrants did.

## Shelter scoping

- Every Volunteer route scopes its reads and writes to the Shelter Code's shelter. Another shelter's Registrant or request is treated as not found. The one exception is the duplicate check on Register, which also shows other shelters' Findable, non-Departed Registrants (ADR 0001).

## Language

- Code, UI text, and tests use the terms in `GLOSSARY.md` (Registrant, Seeker, Volunteer, Visibility, Contact Request, Request Code, Shelter Code, Departed), not the words listed under _Avoid_.
- UI text is plain and short, written for a tired, non-technical Volunteer.
