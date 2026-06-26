# Watchlist punch list (from Ary's notes, June 25 2026)

Status: [x] done & deployed, [~] in progress, [ ] todo, [?] verify (may already be done)

## Batch 1 — visibility quick wins (DEPLOYED v26)
- [x] 4. Stars almost invisible; start at 0 but show clear outlines
- [x] 16. Discover match % too see-through; make readable over posters
- [x] 18. Zip/collection inputs zoom in and never zoom back; nothing should zoom ever

## Batch 2 — swipe + discover mechanics
- [x] 5. Swipe left in discover has a double glitch; make it clean
- [x] 14. Swipe right should SAVE (unwatched); currently glitches then shows eye
- [x] 7. Swipes left/right should affect taste data across the whole app
- [x] 22. Deck says "that's it for now" and ends; should never end; refresh deck does nothing
- [x] 17. Remove "tap for info" button; keep it by tapping the poster (poster tap already opens info — verify no stray hint)
- [x] 21. "For you" tab should show the same 3 icons on the right of each movie

## Batch 3 — layout / overflow
- [x] 3. Collection + discover content larger than allowed; 3 buttons cut off
- [x] 8. Out Now cards waste ~half their space (black space); make clean

## Batch 4 — out now / coming soon logic + badges
- [x] 13. Coming Soon items show the eye; should only show save (can't have watched it)
- [x] 12. Out Now / Coming Soon movies saved in watchlist need a badge to signify it
- [x] 23. Some movies in 2026 tab say "out now"; those should be in Out Now
- [?] 2. "All" filter should be first on the left (appears already first — verify)

## Batch 5 — copy / descriptions / feed diversity
- [ ] 9. "Your kind of adventure" repeated across most movies
- [ ] 10. Coming Soon shows "your kind of adventure" AND "right in your adventure lane"; keep concise
- [ ] 15. Repetitive descriptions; same 3-4 phrases shared everywhere; should vary as it learns
- [ ] 6. Lots of Indian movies; ensure notable films in other languages are represented too

## Batch 6 — wishlist + TV logging
- [ ] 20. Wishlist should mirror the Collected tab but with a "watched" button instead of rating stars
- [ ] 11. Creative way to log shows (Law & Order 1999, Simpsons) without an exact date

## Batch 7 — polish
- [ ] 19. Cooler animation on button taps and swipes
- [ ] 1. Ticket scanner pulls from phone files; bias toward photo album (note: web file picker has limits on iOS; accept=image/* already prioritizes photos)

## Recent changes that were never committed (rebuilding)
- [x] 10-star rating scale with half-star taps (0.5 steps), For You threshold 7+
- [ ] swipe poster back to proper 2/3 aspect + refresh deck placement
- [ ] AI-notes prompt rewrite
