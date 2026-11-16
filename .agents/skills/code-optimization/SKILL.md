---
name: code-optimization
description: Production-grade code refactoring, simplification, dead-code elimination, and algorithmic optimization across TypeScript, Java, and React. Use to make code concise, readable, and highly performant.
---

# Code Optimization & Modernization Standard

## 1. Core Principles (KISS, YAGNI, Ponytail)
1. **The Best Code is Concise Code:** Never write 30 lines when 5 clean lines accomplish the exact same task.
2. **Early Returns (Guard Clauses):** Replace nested `if-else` blocks with immediate returns on boundary/error conditions.
3. **No Over-Abstraction:** Delete speculative wrappers, single-use utility classes, and redundant interfaces.

## 2. Language-Specific Modernization
### TypeScript / JavaScript
- Use Optional Chaining (`?.`) and Nullish Coalescing (`??`) instead of verbose ternary or truthiness chains.
- Replace manual object cloning or mutation loops with object spread, destructuring, and immutable transforms.
- Use `Map` / `Set` for $O(1)$ lookups instead of nested array `.find()` ($O(N^2)$).
- Eliminate unhandled promise rejections and clean up async waterfalls with `Promise.all()` where tasks are independent.

### Java 21 / Spring Boot
- Use Java `record` for immutable DTOs, value objects, and projection classes.
- Use Pattern Matching for `switch` and `instanceof`.
- Prefer `List.of()`, `Set.of()`, `Map.of()` over verbose collection initializations.
- Avoid boxing/unboxing overhead in tight loops; use primitive streams or direct comparisons.
- In financial math, use `BigDecimal.compareTo() == 0` and strip scientific notations.

### React 19 / Next.js
- Clean up `useEffect` dependencies: fix all missing dependency warnings without disabling linters.
- Remove redundant state variables when a value can be derived directly during render.
- Use Next.js `<Image />` component over raw `<img>` to eliminate layout shifts and reduce bandwidth.
- Avoid inline function declarations inside heavy re-rendered lists.

## 3. Verification Protocol
- All tests must pass with 0 errors and 0 regressions.
- All linter warnings must be resolved or minimized.
