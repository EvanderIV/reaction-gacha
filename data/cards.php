<?php
/**
 * Reaction Gacha — card database.
 *
 * Each card:
 *  id       — unique slug; also the art filename in assets/images/ ({id}.gif|webp|png|jpg|svg,
 *             first found wins, so drop a real GIF in to replace placeholder art)
 *  title    — card name
 *  usage    — flavor / usage text
 *  emoji    — placeholder-art glyph (used by tools/generate-art.php)
 *  ptype    — Pokémon-flavor element (key into ptypes)
 *  mtype    — MTG-flavor element (key into mtypes)
 *  pwr/wit/chs — stats: Power, Wit, Chaos (1–10)
 *  fullArt  — whether the taller Full Art frame is supported
 *  fit      — how art fills its window: 'cover' (default, fills and crops) or
 *             'contain' (letterboxed, nothing cropped). Only set 'contain' when
 *             the edges of the image carry meaning — a baked-in caption, say.
 *  animated — placeholder art gets idle animation (stands in for a GIF)
 *  hue/hue2 — placeholder art gradient hues
 */
return [
    // `abbr` is what the card frame prints — three letters keeps the type
    // indicator small so long titles get the room instead.
    'ptypes' => [
        'electric' => ['name' => 'Electric', 'abbr' => 'ELC', 'sym' => '⚡', 'color' => '#f5c518'],
        'fire'     => ['name' => 'Fire',     'abbr' => 'FIR', 'sym' => '🔥', 'color' => '#ff6b3d'],
        'water'    => ['name' => 'Water',    'abbr' => 'WTR', 'sym' => '💧', 'color' => '#3fa9f5'],
        'grass'    => ['name' => 'Grass',    'abbr' => 'GRS', 'sym' => '🌿', 'color' => '#5fc95f'],
        'psychic'  => ['name' => 'Psychic',  'abbr' => 'PSY', 'sym' => '👁', 'color' => '#b76ef0'],
        'fighting' => ['name' => 'Fighting', 'abbr' => 'FGT', 'sym' => '👊', 'color' => '#d97941'],
        'ghost'    => ['name' => 'Ghost',    'abbr' => 'GHO', 'sym' => '👻', 'color' => '#8a7bd8'],
        'normal'   => ['name' => 'Normal',   'abbr' => 'NRM', 'sym' => '⭐', 'color' => '#a8a8b8'],
    ],
    'mtypes' => [
        'white'     => ['name' => 'White',     'abbr' => 'WHT', 'sym' => '☀', 'color' => '#e8dcae'],
        'blue'      => ['name' => 'Blue',      'abbr' => 'BLU', 'sym' => '💧', 'color' => '#4f8fd8'],
        'black'     => ['name' => 'Black',     'abbr' => 'BLK', 'sym' => '💀', 'color' => '#9b86a8'],
        'red'       => ['name' => 'Red',       'abbr' => 'RED', 'sym' => '🔥', 'color' => '#d3592f'],
        'green'     => ['name' => 'Green',     'abbr' => 'GRN', 'sym' => '🌳', 'color' => '#4f9d5a'],
        'colorless' => ['name' => 'Colorless', 'abbr' => 'CLR', 'sym' => '◈', 'color' => '#b9c1c9'],
    ],
    'cards' => [
        ['id' => 'invalidate-argument', 'title' => 'Invalidate Argument', 'usage' => "Counter your opponent's argument with a spoon. Draw 1 card.", 'emoji' => '🥄', 'ptype' => 'psychic', 'mtype' => 'blue', 'pwr' => 7, 'wit' => 9, 'chs' => 4, 'fullArt' => false, 'animated' => false, 'hue' => 285, 'hue2' => 220],
        ['id' => 'this-is-fine', 'title' => 'This Is Fine', 'usage' => 'Ignore all incoming damage for 3 turns. Your seat is on fire. Everything is fine.', 'emoji' => '🔥', 'ptype' => 'fire', 'mtype' => 'red', 'pwr' => 3, 'wit' => 5, 'chs' => 9, 'fullArt' => true, 'animated' => true, 'hue' => 15, 'hue2' => 40],
        ['id' => 'deploy-on-friday', 'title' => 'Deploy on Friday', 'usage' => 'Sacrifice your weekend. Deal 10 chaos damage to production environment. Cannot be countered.', 'emoji' => '🚀', 'ptype' => 'electric', 'mtype' => 'black', 'pwr' => 2, 'wit' => 4, 'chs' => 10, 'fullArt' => false, 'animated' => true, 'hue' => 48, 'hue2' => 10],
        ['id' => 'galaxy-brain', 'title' => 'Galaxy Brain', 'usage' => 'Draw the worst possible conclusion from the best possible evidence. Gain +10 confidence.', 'emoji' => '🧠', 'ptype' => 'psychic', 'mtype' => 'blue', 'pwr' => 10, 'wit' => 10, 'chs' => 2, 'fullArt' => true, 'animated' => true, 'hue' => 265, 'hue2' => 310],
        ['id' => 'touch-grass', 'title' => 'Touch Grass', 'usage' => 'Force target player to log off. They may return after one (1) sunlight.', 'emoji' => '🌱', 'ptype' => 'grass', 'mtype' => 'green', 'pwr' => 5, 'wit' => 6, 'chs' => 3, 'fullArt' => false, 'animated' => true, 'hue' => 110, 'hue2' => 150],
        ['id' => 'skill-issue', 'title' => 'Skill Issue', 'usage' => 'Negate any complaint. This card cannot be blocked, only reported.', 'emoji' => '🎮', 'ptype' => 'fighting', 'mtype' => 'red', 'pwr' => 8, 'wit' => 3, 'chs' => 6, 'fullArt' => false, 'animated' => false, 'hue' => 25, 'hue2' => 350],
        ['id' => 'works-on-my-machine', 'title' => 'It Works on My Machine', 'usage' => 'Redirect all blame to the environment. Shrug with lethal precision.', 'emoji' => '💻', 'ptype' => 'normal', 'mtype' => 'colorless', 'pwr' => 4, 'wit' => 8, 'chs' => 7, 'fullArt' => false, 'animated' => false, 'hue' => 210, 'hue2' => 240],
        ['id' => 'task-failed-successfully', 'title' => 'Task Failed Successfully', 'usage' => 'Whenever you would lose, win instead, but worse.', 'emoji' => '✅', 'ptype' => 'normal', 'mtype' => 'colorless', 'pwr' => 1, 'wit' => 7, 'chs' => 8, 'fullArt' => false, 'animated' => false, 'hue' => 160, 'hue2' => 120],
        ['id' => 'absolute-cinema', 'title' => 'Absolute Cinema', 'usage' => 'Raise both hands. Witness perfection. All players must stop arguing and appreciate.', 'emoji' => '🎬', 'ptype' => 'normal', 'mtype' => 'white', 'pwr' => 6, 'wit' => 8, 'chs' => 1, 'fullArt' => true, 'animated' => false, 'hue' => 340, 'hue2' => 280],
        ['id' => 'side-eye', 'title' => 'The Side Eye', 'usage' => "Silently reduce target's credibility to zero. No words required.", 'emoji' => '👀', 'ptype' => 'psychic', 'mtype' => 'black', 'pwr' => 5, 'wit' => 9, 'chs' => 4, 'fullArt' => true, 'animated' => false, 'hue' => 300, 'hue2' => 260],
        ['id' => 'blocked-and-reported', 'title' => 'Blocked & Reported', 'usage' => 'Banish target from the conversation. They were never here.', 'emoji' => '🚫', 'ptype' => 'fighting', 'mtype' => 'white', 'pwr' => 9, 'wit' => 2, 'chs' => 3, 'fullArt' => true, 'animated' => false, 'hue' => 355, 'hue2' => 320],
        ['id' => 'emotional-damage', 'title' => 'Emotional Damage', 'usage' => 'Target player becomes Asian and takes 2 emotional damage.', 'emoji' => '😭', 'ptype' => 'water', 'mtype' => 'blue', 'pwr' => 2, 'wit' => 6, 'chs' => 7, 'fullArt' => true, 'animated' => true, 'hue' => 205, 'hue2' => 250],
        ['id' => 'popcorn-time', 'title' => 'Popcorn Time', 'usage' => 'You are not involved. You are simply here for the drama. Draw 3 cards.', 'emoji' => '🍿', 'ptype' => 'grass', 'mtype' => 'white', 'pwr' => 3, 'wit' => 7, 'chs' => 5, 'fullArt' => false, 'animated' => true, 'hue' => 45, 'hue2' => 20],
        ['id' => 'vibe-check', 'title' => 'Vibe Check', 'usage' => 'Inspect target player’s vibes. If they fail, they discard their entire mood.', 'emoji' => '✨', 'ptype' => 'psychic', 'mtype' => 'green', 'pwr' => 6, 'wit' => 6, 'chs' => 6, 'fullArt' => true, 'animated' => true, 'hue' => 280, 'hue2' => 180],
        ['id' => 'delete-this', 'title' => 'Delete This', 'usage' => 'Target post takes 999 damage. Screenshots persist through death.', 'emoji' => '🗑️', 'ptype' => 'ghost', 'mtype' => 'black', 'pwr' => 8, 'wit' => 4, 'chs' => 8, 'fullArt' => false, 'animated' => false, 'hue' => 250, 'hue2' => 210],
        ['id' => 'l-plus-ratio', 'title' => 'L + Ratio', 'usage' => 'Your reply now outweighs the original post. Math is undefeated.', 'emoji' => '📉', 'ptype' => 'electric', 'mtype' => 'blue', 'pwr' => 7, 'wit' => 5, 'chs' => 6, 'fullArt' => false, 'animated' => false, 'hue' => 200, 'hue2' => 160],
        ['id' => 'kinda-sus', 'title' => 'Kinda Sus', 'usage' => 'Accuse target player. If wrong, eject yourself. If right, eject them anyway.', 'emoji' => '🔪', 'ptype' => 'ghost', 'mtype' => 'black', 'pwr' => 4, 'wit' => 7, 'chs' => 9, 'fullArt' => false, 'animated' => true, 'hue' => 0, 'hue2' => 260],
        /* Art is a FOLDER, not a file: assets/images/pukeko-bird/ holds 42
           captioned birds and index.php draws one per page load. {variant}
           below resolves to whichever one came up. Not fullArt, and 'contain'
           rather than the usual crop-to-fill: the caption is baked into the
           image, sits at an unpredictable edge, and the pool is every aspect
           ratio the internet has to offer, so any crop eventually eats a
           punchline. Letterboxing is the only fit that is safe for all 42. */
        ['id' => 'pukeko-bird', 'title' => 'Pukeko', 'usage' => 'Name any word ending in -ation. For this turn it is {variant}. No further explanation is offered.', 'emoji' => '🐦', 'ptype' => 'water', 'mtype' => 'blue', 'pwr' => 3, 'wit' => 10, 'chs' => 8, 'fullArt' => false, 'fit' => 'contain', 'animated' => false, 'hue' => 245, 'hue2' => 285],
        ['id' => 'bruh-moment', 'title' => 'Certified Bruh Moment', 'usage' => 'Stare into the middle distance. All stats become 5. Bruh.', 'emoji' => '😐', 'ptype' => 'normal', 'mtype' => 'colorless', 'pwr' => 5, 'wit' => 5, 'chs' => 5, 'fullArt' => true, 'animated' => false, 'hue' => 220, 'hue2' => 200],
    ],
];
