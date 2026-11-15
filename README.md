# maristMap

Plan your Marist courses on a map. Pick your major and every course you need appears as a graph, with prerequisite lines between them. Mark what you've taken and each course shows whether you can take it next and which requirement it counts toward. Add courses to a cart.

## Features

- **Graph view** (and grid view) of a major's requirements plus the Core/Liberal Studies categories
- **Group by** requirements or by department
- **Taken / can take / prerequisites missing** for every course, from the catalog's prerequisite rules
- **Counts toward**: the major requirement and Core category a course satisfies, with a warning for cross-listed courses (they count toward only one Breadth category)
- **Core progress** for each Foundation and Breadth category
- **Cart** with credit total and missing-prerequisite warnings
- **Path to any course**: every course still standing between you and it, in order, lit up on the map
- **Can take now**: the courses in your major you're cleared to take today
- **Paste from DegreeWorks** to mark courses taken in one step
- **Searchable major picker** across all 82 majors and concentrations
- **White / red mode**

## Data

All data is public and comes from Marist:

- Courses, prerequisites and program requirements: [2026–27 Undergraduate Catalog](https://catalog.marist.edu/content.php?catoid=12&navoid=524)
- Core/Liberal Studies structure: [Core/Liberal Studies Curriculum](https://catalog.marist.edu/content.php?catoid=12&navoid=527)
- Approved Breadth course lists: [marist.edu/academics/core/breadth](https://www.marist.edu/academics/core/breadth)

Prerequisites that can't be read as a clear rule are shown in the catalog's own words instead of being guessed. Your courses and cart are saved in your browser.

## Run it

```bash
npm install
npm run dev
```

Rebuild the data from a fresh catalog collection with `npx tsx scripts/build-data.ts`.

## Roadmap

- Section times and a weekly schedule builder
- Sign in with a Marist account
- Core Pathways
