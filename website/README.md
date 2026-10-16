# ComprePrep MIA

A study site for the CSE1907 Comprehensive Examination, built from the question-bank PDFs in `../materials/`.

## Open it

Double-click `index.html`. It runs entirely in the browser with no server or internet needed.
Progress (attempts, saved questions, mock results) is stored in that browser's local storage. Use **Settings → Export progress** to move it to another browser.

If your browser blocks local files, serve the folder instead:

```sh
cd ComprePrepMIA && python3 -m http.server 8000   # then open http://localhost:8000
```

## What's inside

| Page | What it does |
|---|---|
| Dashboard | Progress per subject, accuracy chart, weakest topics, recent mock results |
| Study guide | Notes for every syllabus area: concepts, formulas, worked examples, exam traps, last-minute revision. Each topic links to its questions |
| Practice | One question at a time with instant answer + explanation. Filter by subject, topic, not-tried, mistakes, saved |
| Q&A bank | Every question with answer and explanation; search, topic filter, hide-answers self-test mode |
| Mock test | Timed exam with a question palette, mark-for-review, optional negative marking and a full review afterwards |
| Review | Your mistakes, saved questions, answer keys flagged as wrong, and the sections with no official key |

Keyboard: `A`–`D` / `1`–`4` answer · `→` next · `←` previous · `S` save (practice) · `M` mark for review (mock).

## About the answers

- Each question's source line links to its PDF page in `../materials/`, so keep `ComprePrepMIA/` and `materials/` side by side.
- The 6 subject PDFs (CAO, CN & Cryptography, DSA, DBMS, Digital Logic, OS) give answer keys; Big Data and ML mark answers with yellow highlights. These are used as the official keys.
- `COMPREHENSIVE EXAMINATIONS.pdf` repeats those questions without answers. Duplicates were merged, and each question notes where else it appears. Its **Theory of Computation** section has no key, so those answers were worked out and are labelled "No official key". Its **Web Technology** section has its own key. 13 questions are worded differently there (sometimes with different options or a different answer). Those show a "Variant wording" box with that version's answer.
- Every answer was re-solved independently, then audited again by separate judge agents. They re-solved all 747 questions, re-checked every key against the PDFs, and re-checked the guides' worked examples. Their fixes have been applied. Where the official key is clearly wrong, the question is marked **Key flagged**, shows both the official key and the technically correct answer, and explains why. Settings let you score these by the official key, the corrected answer, or either.
- The syllabus area *Data Science & Business Analytics* has no bank questions, so it has a study guide plus a few clearly labelled extra-practice questions written for this site.

## Files

- `index.html`, `assets/style.css`, `assets/app.js`: the app
- `data/questions.js`: all questions, answers and explanations
- `data/guides.js`: the study guides
