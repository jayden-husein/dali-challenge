# DALI Challenge 26F

This a full-stack application meant for seekers to help find their loved ones and for volunteers to register people at the shelters during disaster relief.

**Live:** https://dali-challenge-ld9u.onrender.com/

## The problem

The challenge was to "build an app that helps separated family members find each other." There were a few constraints when I was designing and trying to come up with its idea.

The biggest issue was regarding privacy. Some people may not want to be found which was discussed in the prompt. There were also some other constraints such as high-traffic (added rate limiting) and the need for a simple/lightweight UI. Connection might be poor and also technological literacy varies a lot.

I also added fuzzy search as names are always a little finicky. People may misspell names, misspronounce them, etc.

## How it works

- Volunteer: enters a Shelter Code, then gets Register / Requests / Roster tabs
- Register: has a duplicate check (it looks across shelters, but only at Findable, non-Departed people)
- Seeker: fuzzy search filtered by age, rate-limited, shows Findable people only
- Contact Request: a Volunteer reads it to the Registrant in person, and only a "yes" sends the Seeker anything
- Check request status: every outcome other than yes shows the same "passed on"
- Roster, Departed (can be undone), pending-request count on the Requests tab

## Key decision: consent first

- See docs/adr/0001-seekers-learn-nothing-without-consent.md
- Options you rejected: three Visibility levels, telling the Seeker "not the person", a "not registered" message on empty search
  - Tradeoff here is that seekers may get less closure since they won't know if they were logged or might have died. However, I thought it was worth it as if the seeker is an abuser, then they would know the registrant is alive and might keep searching for them.

## Tech stack

- React 19 + Vite 8 frontend (src/), Express 5 + pg backend (server/)
- Postgres with pg_trgm for fuzzy search; schema in server/schema.sql
- Playwright e2e tests (e2e/), GitHub Actions CI
- Render Blueprint (render.yaml): one web service + one Postgres, deploys only once CI passes

## How I built it / AI use

- I used Claude Code with Matt Pocock’s skills: setup, ask-matt, grill-with-docs, to-spec, to-tickets, implement, tdd, code-review, retro and prototype. I also used /frontend-design by Anthropic for design guidelines and /teach, to build my understand as I worked through it.
- All decisions were made by me. I came up with the initial draft, features, techstack, etc. Claude then asked me questions and refined them, which I accepted, changed, or rejected.

## Potential future features

- OCR for paper records (scan paper records, parse them, and add them to the database)
- Syncing between shelters
- Scaling for 400,000+ users
- Spanish translation

## How to test

1. Test shelter codes: `HERON-4821`, `MAPLE-3907`, `CEDAR-5164`
2. Register: one Findable person and one Not findable; the duplicate check catches near-identical names.
3. Search: fuzzy matching finds a misspelled name with no location shown, and a Not findable person gets the same empty message as a made-up name.
4. Request loop: send a request, get a Request Code, answer it as a Volunteer, then check the code. A yes shows the reply; every other answer shows “passed on”.
5. Roster: toggle Visibility, mark Departed, then undo it; switching shelters hides the other shelter’s data.

Note: the site takes about a minute to wake up and any testing stays in the live database.
