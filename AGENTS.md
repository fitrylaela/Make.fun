# Notes for future sessions

## The judge, in short

`RULES.txt` in the kit carries the judge's sealed instructions word for word. Read
them before designing an image; they are not in the harness source. The criteria are
weighed in order, so an early one decides unless a later one differs by much more:

1. names the day and shows that day's events
2. selection and breadth across regions and fields
3. readable: each story clear from its picture and short labels, nothing false
4. faithful, no hype or speculation shown as fact
5. craft: one clear composition, legible at ~300 px, no garbled text

Breadth is weighed above legibility. A page of twelve panels from three regions loses
to one that spans more, however clean the type.

## What moved the score

Two submissions on the same day, same pipeline:

| entry | record | rate | rank |
| --- | --- | --- | --- |
| 12 panels, 3 regions (Asia, Europe, US) | 11-1-0 | 0.9650 | 5194 / 8900 |
| same, with the Middle East and Oceania added | 12-0-0 | 0.9790 | 947 / 8900 |

The only change was coverage. The dev heat plays 12 games against fixed house images,
so one loss costs about 1.4 points of rate; the spread between rank 1 and rank 50 is
about 0.4. Breadth is the lever, not typography.

## Verify every panel against a dated source

`stories.md` lists each story with the page it was read from. Do not carry a panel over
from a previous day without re-reading its page: the MLS Cup panel was nearly cut as an
18 November story before the playoffs page showed the wild-card round opening on the 19th,
and a "Berlin rallies for Ukraine" label was wrong — the Germany page records a meeting of
37 countries, not a rally. A wrong label breaks criterion 3.

African stories for 19 November 2026 were not on any country page checked (Nigeria, Kenya,
Egypt, South Africa, Uganda, Tanzania, Zimbabwe, Cameroon, Senegal, Tunisia, Algeria, Chad,
Mozambique, Zambia, and others). Leaving the region out is better than inventing a panel.

## Entry quota

An account's reputation sets its entry limit per competition, and it is low. Plan the
image before submitting: this account spent its quota on three entries (one refused for
README badges, which did not count; two graded). A refused README or About branding never
counts against the quota, so a branding refusal is safe to retry.

The README needs this competition's three live make.fun badges and a link to the bounty
page, or the submission is refused.

## Building and checking

```sh
python3 tools/make_image.py            # writes entry.png, deterministic
python3 main.py                        # copies entry.png to the harness output dir
node <kit>/cli/makefun.mjs check --kit <kit> --repo . --transcripts transcripts.tar.gz
```

`main.py` writes to `/output`, which only exists inside the grading sandbox, so it fails
with PermissionError locally. That is expected.

Rebuild `transcripts.tar.gz` after every commit, or `transcripts_run_record` and the
repository snapshot disagree with what is submitted.
