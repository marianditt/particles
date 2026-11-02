# particles

Personal, UI-only (no backend) TypeScript app hosted on GitHub Pages. It uses branch and bound to place N unit-radius 2D particles so that the minimum pairwise distance `min_{i<j} d_ij` is maximal, subject to: for every sampled direction, adjacent projected centres are at most 2 apart.

- Symmetry breaking: p0 = (0,0), p1 = (x,0) with x>0, p2 has y>=0 (mirror symmetry). Coordinates lie in [-2(N-1), 2(N-1)].
- Objective bound: max distance between boxes. Feasibility bound: projected boxes, sorted, with a gap > 2 prune the region.
- Optimality is only valid for the sampled directions. Search is DFS; "likelihood of a better solution" is a heuristic based on the open regions' bounds and volumes.

```
npm install
npm run dev     # development
npm test
npm run build   # output in dist/, deployed by .github/workflows/deploy.yml
```
