# maristMap

A course planner for Marist students. Pick your major and you get every course it needs as a map: what each one requires, what it unlocks, and what you can take next semester.

Planning classes here usually means having the catalog, DegreeWorks and a stack of Core PDFs open at the same time and piecing it together yourself. I wanted one place where you could just see it.

## What it does

**The map.** Your major's requirement sections on one side, the Core/Liberal Studies categories on the other. Hover a course to see its prerequisite lines. Click it to see the full path to it, which requirement it counts toward and what it unlocks. A dashed line means a major course also counts toward a Core category; it goes solid once you've taken it and it's the course actually covering that category.

**Grid view.** The same courses as plain lists, if you'd rather read than explore. "Show my map" opens here.

**Plan view.** A proposed four-year plan built from the catalog's rules: prerequisites come first, fall-only courses land in a fall, semesters fill up to 16 credits. Sections where you get to choose ("choose two of the following", a Core category) show up as open "Choose" cards with the real options. It doesn't pick for you. Then you make it yours:

- drag a course to another semester, or use the ← → arrows
- click a Choose card to pick a course for it
- "+ Add course" in any semester to add electives
- click a course to keep its prerequisite chain highlighted while you scroll

Once you start editing, everything else stays where it is. If a move breaks a prerequisite, the line turns red and the card tells you why.

**Your progress.** Mark courses as taken (one by one, or paste your DegreeWorks audit), and every course updates: taken, can take, prerequisites missing, or "check requirement" when it depends on something the app can't know. The sidebar tracks major sections, Core categories, a cart for next semester and the courses you're cleared to take right now.

Also: a share link that carries your plan to another browser, red and white themes, and a narrow-screen layout.

## Where the data comes from

Everything is public and comes from Marist:

- courses, prerequisites and program requirements: the [2026–27 Undergraduate Catalog](https://catalog.marist.edu/content.php?catoid=12&navoid=524)
- Core structure: [Core/Liberal Studies Curriculum](https://catalog.marist.edu/content.php?catoid=12&navoid=527)
- approved Breadth course lists: the PDFs at [marist.edu/academics/core/breadth](https://www.marist.edu/academics/core/breadth)

That's 1,557 courses across 63 departments and 81 majors and concentrations. There's no sample or made-up data anywhere. When a prerequisite is written in a way that can't be read as a clear rule (102 of 902), the app shows the catalog's own wording instead of guessing.

Your courses, cart and plan are saved in your browser. Nothing is sent anywhere.

## What it doesn't do (yet)

- It doesn't know your grades, so minimum-grade rules are shown but not checked.
- Class standing ("Junior standing") and earned-credit minimums stay as "check requirement", since transfer and AP credit aren't in the app.
- Corequisites are listed, not checked.
- Cross-listed courses (ENG 214 / REST 214) are treated as separate courses. The catalog doesn't say which codes are twins, and guessing could mark the wrong one as done.
- The four-year plan is generated, not Marist's official sequence. Check it with your advisor.
- No section times yet, so no weekly schedule.

## Running it

```bash
npm install
npm run dev     # http://localhost:5173
npm test
```

To rebuild the data from a fresh catalog collection: `npx tsx scripts/build-data.ts`.

## How it's put together

React, TypeScript and Vite. The map is drawn with PixiJS and laid out with d3-force; the plan view is plain DOM and SVG.

```
data/raw/            catalog pages as collected
scripts/             turns them into src/data/*.json
src/lib/             parsing, prerequisite checks, progress, the planner
src/graph/           map layout and rendering
src/components/      sidebar, course panel, grid, plan view
tests/               Vitest, 174 tests
```

`docs/how-it-works.md` and `docs/architecture.drawio` have diagrams of how the pieces connect.

## On using AI

I used Claude Opus as a coding assistant on this project. The idea, what the app should do, and the calls about the data (only real catalog data, never guess a rule) were mine. I tested it as I went and pushed back when something wasn't right. Claude helped write and test the code faster than I could have alone in a hackathon. It was a tool I directed, not something I handed the project to.

## Next

- section times and a weekly schedule builder
- signing in with a Marist account to pull in your record
- Core Pathways
