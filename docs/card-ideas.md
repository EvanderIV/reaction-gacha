# Card ideas — meme shortlist

Candidates for expanding `data/cards.php`. Every entry has a **search term** that
reliably lands the right clip on Tenor/Giphy, plus a card title, usage line, types
and stats in the existing house style — so a row is a paste away from being real.

Nothing here is in the game yet. Existing 18 cards are excluded, though a few
notes below suggest replacing current placeholder art with the real thing.

## What makes good art for *this* app

Before picking, the constraints the exporter actually imposes:

- **≤ 12 seconds** (`ART_SECONDS`). Longer clips are truncated, not sped up.
- **Loops cleanly.** The card repeats forever in chat. A clip that ends on a hard
  cut reads as a stutter; one that returns near its starting frame reads as motion.
- **Subject centred and roughly square.** Art is cover-cropped to fill its window,
  so a 16:9 clip loses its left and right thirds. Anything with `fullArt => true`
  gets cropped to a *tall portrait slice* — a wide clip shows only its middle band.
- **Busy or bright behind the text.** Full-art flavour text sits straight on the
  artwork. It carries a dark halo, but a blown-out white clip still fights it.
- **Reads at 230px.** Small facial detail disappears. Big gestures survive.

Reaction GIFs mostly satisfy these for free — they're short, loop-built, and
face-centred. Film and TV rips often don't, and are the ones worth a licensing
thought if this ever goes public rather than staying in your server.

---

## Disbelief & confusion

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `blinking white guy` | Blinking Guy | Process what was just said. Fail. Blink twice and continue anyway. | psychic / blue | 3 / 8 / 5 | ✓ |
| `confused math lady` | Confused Math Lady | Attempt to follow target's logic. Summon equations that explain nothing. | psychic / blue | 4 / 9 / 6 | ✓ |
| `jackie chan confused` | Hands Up, What? | Ask the question nobody can answer. All players lose their train of thought. | normal / colorless | 4 / 7 / 6 | ✗ |
| `travolta confused` | Lost in the Doorway | Enter the conversation. Cannot find it. Gesture vaguely and remain. | ghost / colorless | 2 / 6 / 7 | ✓ |
| `not sure if fry` | Not Sure If | Target's statement is now permanently ambiguous. Squint aggressively. | psychic / blue | 5 / 8 / 3 | ✗ |
| `pepe silvia charlie` | The Conspiracy Board | Connect nine unrelated facts with red string. Your theory is now unfalsifiable. | psychic / red | 6 / 10 / 9 | ✓ |
| `nick young question marks` | Question Marks | Your confusion becomes visible to all players. It does not help. | psychic / blue | 3 / 6 / 6 | ✗ |

## Judgement & superiority

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `kermit sipping tea` | But That's None of My Business | Say the devastating thing. Sip. Claim no involvement. | grass / green | 6 / 10 / 4 | ✓ |
| `the rock eyebrow raise` | The Eyebrow | Target must justify their last statement. They cannot. | fighting / white | 7 / 8 / 2 | ✗ |
| `roll safe tapping head` | Can't Lose If You Don't Play | Avoid all damage by never having tried. Gain 0 respect. | psychic / colorless | 4 / 9 / 5 | ✗ |
| `unimpressed stare` | Unimpressed | Negate target's reveal. It was not, in fact, that deep. | normal / black | 5 / 7 / 2 | ✗ |
| `slow clap` | Slow Clap | Applaud with maximum contempt. Deal 3 psychic damage per clap. | normal / white | 4 / 9 / 5 | ✓ |
| `arthur fist clenched` | Arthur Fist | Contain your rage. It has nowhere to go. Take 1 damage yourself. | fighting / red | 8 / 3 / 5 | ✗ |

## Chaos & destruction

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `table flip gif` | Table Flip | Destroy the board state. Nobody wins. That was the plan. | fighting / red | 9 / 2 / 10 | ✗ |
| `homer simpson backing into hedge` | Backing Into the Hedge | Remove yourself from the conversation retroactively. You were never here. | ghost / black | 2 / 8 / 7 | ✓ |
| `explosion walking away` | Don't Look Back | Walk away from the consequences in slow motion. Immune to blame this turn. | fire / red | 8 / 6 / 9 | ✓ |
| `that escalated quickly` | That Escalated Quickly | Double all damage dealt this turn, including to yourself. | fire / red | 7 / 5 / 10 | ✗ |
| `salt bae` | Season It | Add one (1) unnecessary flourish. Everyone saw. That was the point. | normal / white | 5 / 7 / 6 | ✗ |
| `wheres the kaboom marvin` | Where's the Kaboom? | Your devastating point lands on nobody. Expect an earth-shattering kaboom. | electric / red | 6 / 6 / 8 | ✗ |
| `spongebob burning krusty krab` | Everything Is On Fire | All players take 2 chaos damage. Continue the meeting as scheduled. | fire / red | 4 / 4 / 10 | ✓ |

## Defeat & despair

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `crying jordan` | Crying Jordan | Attach to target's greatest failure. It is now permanent. | water / blue | 3 / 6 / 8 | ✓ |
| `sad pablo escobar waiting` | Waiting Alone | Stand in an empty field until someone replies. May take several days. | ghost / black | 1 / 7 / 5 | ✓ |
| `charlie brown walking sad` | Good Grief | Lose the argument you already won. Walk it off. | normal / black | 2 / 5 / 4 | ✓ |
| `spongebob alone caveman` | Primitive Loneliness | Emerge from hiding. Discover the conversation moved on 3 hours ago. | ghost / colorless | 2 / 4 / 6 | ✗ |
| `crickets chirping` | Crickets | Target's joke deals 0 damage. Silence lasts until end of turn. | grass / green | 1 / 8 / 7 | ✗ |
| `pain harold` | Hide the Pain | Smile through it. Your stats are fine. Everything is fine. Do not ask. | normal / white | 4 / 8 / 6 | ✓ |

## Confidence & victory

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `leonardo dicaprio cheers` | Cheers | Raise a glass to your own point. Nobody else raises theirs. | water / white | 6 / 8 / 3 | ✓ |
| `deal with it sunglasses` | Deal With It | Your opinion is now final. Sunglasses descend. Cannot be countered. | electric / black | 8 / 6 / 6 | ✗ |
| `thanos fine ill do it myself` | Fine, I'll Do It Myself | Ignore all assistance. Solve it worse but alone. | fighting / black | 10 / 4 / 5 | ✓ |
| `mic drop` | Mic Drop | End the conversation. You may not respond again, and neither may they. | electric / red | 9 / 7 / 4 | ✗ |
| `dicaprio pointing at tv` | Pointing At The Screen | Recognise the reference before anyone else. Gain 2 smugness. | normal / colorless | 5 / 7 / 4 | ✓ |
| `chefs kiss` | Chef's Kiss | Declare something perfect. It is now perfect. No further discussion. | normal / white | 6 / 8 / 2 | ✗ |
| `dancing baby groot` | Unbothered Dancing | Ignore the entire board state and vibe. Immune to arguments this turn. | grass / green | 3 / 6 / 7 | ✓ |

## Exits & avoidance

| Search term | Card | Usage | Types | P/W/C | Full |
|---|---|---|---|---|---|
| `imma head out spongebob` | Ight, Imma Head Out | Leave immediately upon hearing the bad news. Cannot be stopped. | ghost / colorless | 3 / 8 / 6 | ✓ |
| `curb your enthusiasm ending` | Curb Your Enthusiasm | End the scene on your opponent's worst moment. Play the theme. | normal / colorless | 5 / 10 / 7 | ✓ |
| `skeleton waiting bench` | Still Waiting | Attach to any unanswered message. Age visibly. | ghost / black | 1 / 6 / 5 | ✓ |
| `3000 years later spongebob` | 3000 Years Later | Skip ahead. The argument is still going. Nothing has changed. | psychic / blue | 3 / 8 / 6 | ✗ |
| `nervous sweating button` | Sweating The Choice | Choose between two options. Both are wrong. Sweat visibly. | fire / red | 4 / 5 / 8 | ✓ |

---

## Ready to paste

Ten with the strongest loop + crop behaviour, in schema order. Drop art into
`assets/images/{id}.webp` (or `.gif`/`.mp4`) and they light up; without art they
fall back to the generated placeholder, so you can add them now and source
clips later.

```php
['id' => 'table-flip', 'title' => 'Table Flip', 'usage' => 'Destroy the board state. Nobody wins. That was the plan.', 'emoji' => '🤬', 'ptype' => 'fighting', 'mtype' => 'red', 'pwr' => 9, 'wit' => 2, 'chs' => 10, 'fullArt' => false, 'animated' => true, 'hue' => 5, 'hue2' => 30],
['id' => 'sipping-tea', 'title' => "But That's None of My Business", 'usage' => 'Say the devastating thing. Sip. Claim no involvement.', 'emoji' => '🐸', 'ptype' => 'grass', 'mtype' => 'green', 'pwr' => 6, 'wit' => 10, 'chs' => 4, 'fullArt' => true, 'animated' => true, 'hue' => 120, 'hue2' => 90],
['id' => 'blinking-guy', 'title' => 'Blinking Guy', 'usage' => 'Process what was just said. Fail. Blink twice and continue anyway.', 'emoji' => '😳', 'ptype' => 'psychic', 'mtype' => 'blue', 'pwr' => 3, 'wit' => 8, 'chs' => 5, 'fullArt' => true, 'animated' => true, 'hue' => 210, 'hue2' => 265],
['id' => 'dont-look-back', 'title' => "Don't Look Back", 'usage' => 'Walk away from the consequences in slow motion. Immune to blame this turn.', 'emoji' => '💥', 'ptype' => 'fire', 'mtype' => 'red', 'pwr' => 8, 'wit' => 6, 'chs' => 9, 'fullArt' => true, 'animated' => true, 'hue' => 20, 'hue2' => 45],
['id' => 'imma-head-out', 'title' => 'Ight, Imma Head Out', 'usage' => 'Leave immediately upon hearing the bad news. Cannot be stopped.', 'emoji' => '🚪', 'ptype' => 'ghost', 'mtype' => 'colorless', 'pwr' => 3, 'wit' => 8, 'chs' => 6, 'fullArt' => true, 'animated' => true, 'hue' => 250, 'hue2' => 200],
['id' => 'crying-jordan', 'title' => 'Crying Jordan', 'usage' => "Attach to target's greatest failure. It is now permanent.", 'emoji' => '😢', 'ptype' => 'water', 'mtype' => 'blue', 'pwr' => 3, 'wit' => 6, 'chs' => 8, 'fullArt' => true, 'animated' => false, 'hue' => 200, 'hue2' => 230],
['id' => 'deal-with-it', 'title' => 'Deal With It', 'usage' => 'Your opinion is now final. Sunglasses descend. Cannot be countered.', 'emoji' => '😎', 'ptype' => 'electric', 'mtype' => 'black', 'pwr' => 8, 'wit' => 6, 'chs' => 6, 'fullArt' => false, 'animated' => true, 'hue' => 50, 'hue2' => 260],
['id' => 'confused-math-lady', 'title' => 'Confused Math Lady', 'usage' => "Attempt to follow target's logic. Summon equations that explain nothing.", 'emoji' => '🧮', 'ptype' => 'psychic', 'mtype' => 'blue', 'pwr' => 4, 'wit' => 9, 'chs' => 6, 'fullArt' => true, 'animated' => true, 'hue' => 275, 'hue2' => 215],
['id' => 'curb-your-enthusiasm', 'title' => 'Curb Your Enthusiasm', 'usage' => "End the scene on your opponent's worst moment. Play the theme.", 'emoji' => '🎺', 'ptype' => 'normal', 'mtype' => 'colorless', 'pwr' => 5, 'wit' => 10, 'chs' => 7, 'fullArt' => true, 'animated' => true, 'hue' => 40, 'hue2' => 15],
['id' => 'still-waiting', 'title' => 'Still Waiting', 'usage' => 'Attach to any unanswered message. Age visibly.', 'emoji' => '💀', 'ptype' => 'ghost', 'mtype' => 'black', 'pwr' => 1, 'wit' => 6, 'chs' => 5, 'fullArt' => true, 'animated' => false, 'hue' => 220, 'hue2' => 190],
```

## Balance notes

The current 18 skew toward mid stats. This shortlist deliberately spreads wider:

- **Chaos 10:** Table Flip, That Escalated Quickly, Everything Is On Fire —
  joining Deploy on Friday, which is currently the only 10.
- **Power 1–3:** Still Waiting, Waiting Alone, Crickets, Good Grief — the set is
  short on genuinely weak cards, and they make the strong ones feel strong.
- **Wit 10:** Sipping Tea, Pepe Silvia, Curb Your Enthusiasm — pairs with
  Galaxy Brain and Invalidate Argument.

Type coverage is thinnest on **Water** (only Crying in the Club) and **MTG
White**; Crying Jordan, Cheers and Slow Clap help both.

## Existing cards worth real art

Several current entries are still generated SVG placeholders where an obvious
canonical GIF exists — `side-eye` (search `side eye chloe`), `certified-bruh`
(`bruh moment`), `absolute-cinema` (`absolute cinema hands`), `popcorn-time`
(`michael jackson popcorn`) and `kinda-sus` (`among us sus`).
