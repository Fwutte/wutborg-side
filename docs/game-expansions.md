# Gameplay expansion, September 2026

The three games retain their existing save keys and controls. This update is local source work; deployment is separate.

## Mario

All 32 stages are 26 tiles longer. Each contains an upper route with a spring, stepped ledges, a moving bridge and coins. Non-castle stages have a high secret exit, which awards 2,000 points and unlocks one additional stage. The first world's safe ground route remains intact. Later worlds add bridge crossings; stage-three platforms crumble after standing on them for 0.65 seconds, then return after 2.5 seconds.

The 24 existing bonus rooms now have moving platforms and springs. Bosses alternate low waves and projectile spreads, telegraph attacks with an exclamation mark, and attack faster with a wider spread below half health. Damage immunity prevents a single overlap from exhausting their health.

Backgrounds gain layered forests, snow, crystals, arches, torches and animated particles. Terrain uses the world's palette, with snowy edges, icicles and masonry details. Character and item sprites remain local.

## Borgstorm

Enemy gates enter a timed combat phase after the march. The army attacks automatically while the player moves sideways using arrows/A/D, dragging, or the dodge buttons. Red zones lock onto the army's position before an attack. Leaving a zone saves soldiers; unavoidable losses preserve the importance of route choices and upgrades.

Q or the shield button protects the army for 2.2 seconds (longer with shield troops), with a six-second cooldown. E or the volley button deals immediate damage, enhanced by archers, with a 4.5-second cooldown. Giants improve the army's attack rate. Abilities reset for each encounter.

Boss encounters progress through gate, towers and commander phases. The last phase uses wider zones and faster warning cycles. Walls fall into rubble, arrows cross the battlefield, shields glow and the commander has a larger model. Pausing stops combat and hides the combat controls.

## Testing

`npm run test:expansions` exercises the new physics and combat behavior, including every Borgstorm level through the actual timed update path. Existing Mario, Kart, Borgstorm and site regression checks remain in the validation script.

`scripts/game-expansion.browser-test.html` is a developer fixture with late-game scenes. It disables result persistence in its frame and slows the siege simulation for inspection. It is not linked from the game menus.
