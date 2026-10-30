/**
 * "How to play" for every playable game: the goal, the rules exactly as Our
 * Place plays them, how to use the screen, and tips. Shown from the game menu
 * (the ? on a game) and from inside a game (the ? in its header).
 *
 * Rules follow the standard published rules of each game (FIDE Laws of Chess,
 * the standard Scrabble rules, the Nigerian Whot rules described by Pagat and
 * the Whot! article on Wikipedia), with the house rules the two of you chose
 * marked as such.
 */
export const GAME_GUIDES = Object.freeze({
  chess: {
    goal: "Checkmate your partner's king: attack it so it has no safe move left.",
    sections: [
      {
        title: "The pieces",
        items: [
          "King ♚ — one square in any direction. Never moves into check.",
          "Queen ♛ — any number of squares in a straight line or diagonal.",
          "Rook ♜ — any number of squares straight (up, down, left, right).",
          "Bishop ♝ — any number of squares diagonally (stays on one colour).",
          "Knight ♞ — an L shape: two squares one way, one square to the side. The only piece that jumps over others.",
          "Pawn ♟ — one square forward (two on its first move); captures one square diagonally forward.",
        ],
      },
      {
        title: "Special moves",
        items: [
          "Castling — the king moves two squares toward a rook and the rook jumps over it. Only if neither has moved, the squares between are empty, and the king isn't in check, doesn't pass through check, and doesn't land in check.",
          "En passant — if a pawn moves two squares and lands beside your pawn, you may capture it as if it had moved one square, but only on your very next move.",
          "Promotion — a pawn that reaches the far side becomes a queen, rook, bishop or knight (you choose).",
        ],
      },
      {
        title: "Check, mate and draws",
        items: [
          "Check — your king is attacked. You must get out of it: move the king, block, or capture the attacker.",
          "Checkmate — in check with no way out. The game is over.",
          "Stalemate — not in check but no legal move: a draw.",
          "Also draws: the same position three times, 50 moves each without a capture or pawn move, not enough pieces left to checkmate, or both agreeing.",
        ],
      },
      {
        title: "Playing in Our Place",
        items: [
          "White moves first; the server picks who's White. Your side is always at the bottom.",
          "Tap a piece, then a highlighted square — or drag it. Dots show where it can go; rings show captures.",
          "Draw offers a draw; Resign ends the game. Every move is checked by the server.",
        ],
      },
    ],
    tips: ["Control the centre early (e4, d4).", "Bring knights and bishops out before moving the queen a lot.", "Castle early to keep your king safe.", "Before every move, ask: what does my partner threaten?"],
  },

  naija_whot: {
    goal: "Be the first to play all your cards — the last one is “check up!”.",
    sections: [
      {
        title: "The cards",
        items: [
          "54 cards in five shapes: circles and triangles (1–5, 7, 8, 10–14), crosses and squares (1, 2, 3, 5, 7, 10, 11, 13, 14), stars (1–5, 7, 8), and five Whot cards (20).",
          "Each player gets 6 cards. The top card of the market is turned over as the call card.",
        ],
      },
      {
        title: "Playing",
        items: [
          "On your turn, play a card that matches the call card's shape OR number.",
          "Whot (20) can be played on anything — then you name the shape your partner must play next.",
          "Can't play (or don't want to)? Go to market: pick one card and your turn ends.",
        ],
      },
      {
        title: "Special cards",
        items: [
          "1 Hold on — you play again.",
          "2 Pick two — your partner picks 2. They can block it only with another 2 — a block cancels it: nobody picks, and you carry on playing.",
          "5 Pick three — your partner picks 3; only a 5 blocks it, and a block cancels it too.",
          "8 Suspension — your partner misses a turn, so you play again.",
          "14 General market — your partner picks 1 and you play again.",
          "20 Whot — wild card; you ask for a shape.",
          "Picking a penalty uses up the picker's turn, so play comes back to whoever played the special.",
        ],
      },
      {
        title: "Your house rules (set before the deal)",
        items: [
          "Pick Two, Pick Three and Suspension can each be switched off — then that card is an ordinary card.",
          "Tender — when the market finishes: “Count cards” ends the game and the lower total wins (stars count double, Whot counts 20), or “Reshuffle” turns the played cards into a new market.",
          "Playing your last card is check up: you win at once, no counting.",
        ],
      },
    ],
    tips: ["Save a Whot for when you're stuck.", "Keep a 2 or 5 in hand to block your partner's picks.", "Hold on and Suspension let you play two cards in a row — great for getting rid of cards fast."],
  },

  scrabble: {
    goal: "Score more points than your partner by making words on the board.",
    sections: [
      {
        title: "Making words",
        items: [
          "You have 7 letter tiles. Place one or more in a single row or column to make a word reading left-to-right or top-to-bottom.",
          "The first word must cover the centre star (★) and have at least 2 letters.",
          "Every later word must join tiles already on the board. Every new word you form (including words made sideways) must be real.",
          "Words are checked against the ENABLE word list on our server. No names, abbreviations or words that need capitals or hyphens.",
        ],
      },
      {
        title: "Scoring",
        items: [
          "Each tile shows its points (Q and Z are 10, E is 1). Blanks are 0 but can be any letter.",
          "2L / 3L double or triple that letter; 2W / 3W double or triple the whole word (the centre star is a 2W).",
          "Premium squares count only on the turn a tile is first placed on them.",
          "Use all 7 tiles in one turn for a 50-point bingo.",
        ],
      },
      {
        title: "Other moves and the end",
        items: [
          "Swap — trade 1–7 tiles with the bag (only while it has 7 or more) instead of playing. Pass — skip. Both score nothing.",
          "The game ends when someone uses their last tile and the bag is empty (they gain their partner's leftover points, which their partner loses), or after six scoreless turns in a row (each loses their leftover points).",
          "Highest score wins.",
        ],
      },
      {
        title: "Playing in Our Place",
        items: [
          "Tap a tile in your rack, then a square. Tap a placed tile to take it back. Recall brings all of them back.",
          "The points shown before you press Play are a preview; the server checks the words and keeps the real score.",
          "On a small phone, use the zoom button to place tiles precisely.",
        ],
      },
    ],
    tips: ["Short words squeeze big letters in: AX, EX, OX, XI, XU, JO, KA, QAT and ZAX are all valid (QI and ZA aren't in this word list).", "Put high-value letters on 2L/3L squares and long words through 2W/3W.", "Keep a good mix of vowels and consonants; swap a bad rack early."],
  },

  jigsaw_puzzle: {
    goal: "Put the picture back together — you're on the same team.",
    sections: [
      {
        title: "Playing",
        items: [
          "Pick a picture (built-in, or your own “together” photos) and a size: 12, 24 or 48 pieces.",
          "Drag pieces into the frame. A piece close to its spot clicks into place and stays there.",
          "Two pieces that belong next to each other join when you put them close — then they move as one.",
          "You can both move pieces at the same time. A piece your partner is holding glows pink and can't be grabbed until they let go.",
          "Guide shows a faint copy of the picture in the frame. New puzzle starts over (it asks first, because it erases your progress).",
        ],
      },
    ],
    tips: ["Start with the edge pieces — they have a flat side.", "Sort by colour: sky, buildings, water.", "Split the work: one of you does edges, the other the middle."],
  },

  ludo: {
    goal: "Bring all four of your pieces home before your partner.",
    sections: [
      {
        title: "Naija Ludo rules",
        items: [
          "Two dice every roll. Use them separately on two pieces, or add them up for one piece.",
          "A piece needs a 6 to leave the yard.",
          "Landing exactly on your partner's piece kills it: it goes back to the yard, and YOUR piece goes straight home.",
          "Double six gives you another roll. No safe squares, no houses.",
          "Home is by exact count.",
        ],
      },
      { title: "Playing in Our Place", items: ["Tap your dice to roll, then tap a glowing piece. If a piece can move more than one way, pick from the small choice that appears."] },
    ],
    tips: ["Kills send YOU home — hunt your partner's pieces.", "Don't leave a piece sitting just in front of their pieces."],
  },

  would_you_rather: {
    goal: "Learn how your partner thinks — there's no winner.",
    sections: [{ title: "Playing", items: ["Each round shows two options. You both choose in secret.", "When you've both answered, the choices are revealed together.", "Talk about it, then tap Next. Ten rounds a game."] }],
    tips: ["The fun is in the “why” — explain your pick out loud on voice or in chat."],
  },

  tic_tac_toe: {
    goal: "Get three of your marks in a row — across, down or diagonally.",
    sections: [{ title: "Playing", items: ["Take turns placing your X or O on the 3×3 grid.", "Three in a row wins; a full grid with no line is a draw."] }],
    tips: ["Take the centre if you can.", "Block your partner as soon as they have two in a line."],
  },

  connect_4: {
    goal: "Get four of your discs in a row — across, up and down, or diagonally.",
    sections: [
      {
        title: "Playing",
        items: [
          "Take turns dropping one disc into any of the 7 columns. It falls to the lowest empty space.",
          "Red goes first (picked at random). A full column can't take more discs.",
          "Four in a row wins at once. If the board fills up with no four, it's a draw.",
        ],
      },
      { title: "Playing in Our Place", items: ["Tap any space in a column to drop your disc there. On a keyboard: ← → to choose a column, Enter to drop."] },
    ],
    tips: ["The middle column is the strongest — start there.", "Watch for diagonals; they're the easiest to miss.", "Set up two threats at once so your partner can only block one."],
  },

  checkers: {
    goal: "Take all of your partner's pieces, or leave them with no move.",
    sections: [
      {
        title: "Moving",
        items: [
          "Pieces stay on the dark squares. Dark moves first (picked at random).",
          "A piece moves one square diagonally forward.",
          "Reach the far side and it's crowned a king 👑 — kings move diagonally forward AND backward.",
        ],
      },
      {
        title: "Jumping",
        items: [
          "Jump over a piece of your partner's that's diagonally next to you, onto the empty square behind it, to capture it.",
          "Jumping is compulsory: if you can jump, you must (the pieces that can jump pulse).",
          "After a jump, if the same piece can jump again, it must keep going — a multi-jump, all in one turn.",
          "A piece that's just been crowned stops there; it jumps as a king from the next turn.",
        ],
      },
      {
        title: "The end",
        items: ["You win when your partner has no pieces or no legal move left.", "40 moves each with no capture and no crowning is a draw. You can also resign."],
      },
      { title: "Playing in Our Place", items: ["Tap one of your pieces, then a highlighted square. Your pieces are always at the bottom."] },
    ],
    tips: ["Keep your back row filled as long as you can — it stops your partner crowning kings.", "Trade pieces when you're ahead.", "Use forced jumps to lure your partner into a double jump for you."],
  },

  two_truths_and_a_lie: {
    goal: "Fool your partner with your lie — and spot theirs. Just for fun, no winner.",
    sections: [
      {
        title: "Playing",
        items: [
          "Rounds alternate. The teller writes three things about themselves — two true, one a lie — and marks the lie.",
          "They're shuffled and shown to the guesser, who picks the one they think is the lie.",
          "Then the lie is revealed. Four rounds — two each.",
        ],
      },
    ],
    tips: ["The best lies are boring. The best truths sound made up.", "Tell the story behind each truth afterwards."],
  },

  daily_question: {
    goal: "Answer one question together every day — there's no winner.",
    sections: [
      {
        title: "Playing",
        items: [
          "Every day there's a new question — the same one for both of you all day.",
          "Write your answer in your own words. Your partner's answer only shows once you've both answered.",
          "Want more? Tap Another one for up to two bonus questions.",
        ],
      },
    ],
    tips: ["Make it a habit — answer it at the same time every day, like a little date."],
  },

  this_or_that: {
    goal: "Quick picks — see how alike you are. No winner.",
    sections: [
      {
        title: "Playing",
        items: [
          "Two options appear. You both tap one, fast — in secret.",
          "As soon as you've both picked, the next pair slides in and you see whether you matched 💞.",
          "Twelve pairs; at the end you'll see how much of a match you are.",
        ],
      },
    ],
    tips: ["Don't overthink it — first instinct!"],
  },

  story_builder: {
    goal: "Write a story together, one line each — no winner, just a story to keep.",
    sections: [
      {
        title: "Playing",
        items: [
          "The game gives you an opening line. Take turns adding the next line (up to 160 characters).",
          "After six lines, either of you can write “The end” — or it ends by itself at sixteen lines.",
          "Your lines are green, your partner's pink.",
        ],
      },
    ],
    tips: ["Leave your partner a cliffhanger.", "Plot twists are encouraged 😄"],
  },

  reversi: {
    goal: "Have more discs of your colour on the board when neither of you can move.",
    sections: [
      {
        title: "Playing",
        items: [
          "Four discs start in the middle. Black moves first (picked at random).",
          "Place a disc so that a straight line of your partner's discs — across, up/down or diagonal — is trapped between it and another of yours.",
          "Every trapped disc flips to your colour. A move must flip at least one disc; your possible moves show as faint dots.",
          "No move? Your turn passes and your partner goes again.",
          "When neither of you can move, the one with more discs wins (equal is a draw).",
        ],
      },
    ],
    tips: ["Corners can never be flipped — grab them.", "Avoid the squares right next to an empty corner.", "Fewer discs early can mean more choices later."],
  },

  battleship: {
    goal: "Sink all five of your partner's ships before they sink yours.",
    sections: [
      {
        title: "Your fleet",
        items: [
          "Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2), hidden on a 10×10 sea. Ships never touch each other.",
          "The server lays your fleet out at random — tap Shuffle for a new layout, then Ready. Your partner never sees where your ships are.",
        ],
      },
      {
        title: "The battle",
        items: [
          "When you're both ready, the first shooter is picked at random. Take turns firing one shot at your partner's sea.",
          "✕ is a hit, • is a miss. Hit every square of a ship and it's sunk — you'll see its shape.",
          "Sink the whole fleet to win. You can also surrender.",
        ],
      },
    ],
    tips: ["After a hit, try the four squares around it.", "Ships never touch, so the squares around a sunk ship are always empty.", "Spread your first shots out like a chessboard pattern."],
  },

  hangman: {
    goal: "Score more than your partner by guessing their secret words — and stumping them with yours.",
    sections: [
      {
        title: "Playing",
        items: [
          "Rounds alternate: one of you types a secret word or short phrase (letters only, 3–20 long) and an optional hint; the other guesses.",
          "Guess one letter at a time, or type the whole thing to solve. Six misses and you're hanged (a wrong solve is a miss too).",
          "Solve it: you score 7 minus your misses. Hanged: the setter scores 3.",
          "Four rounds — two each. Most points wins.",
        ],
      },
    ],
    tips: ["Start with vowels: E, A, O, I.", "Inside jokes make great words — only your partner can get them!"],
  },

  never_have_i_ever: {
    goal: "Confess, laugh, and find out new things about each other — there's no winner.",
    sections: [
      {
        title: "Playing",
        items: [
          "Each round shows “Never have I ever…”. You both answer in secret: 🙋 I have, or 🙅 Never.",
          "When you've both answered, the answers are revealed together.",
          "You each start with ten fingers up — every “I have” puts one down.",
          "Fifteen rounds, or until one of you runs out of fingers.",
        ],
      },
    ],
    tips: ["When one of you has done it, the other gets to ask for the story."],
  },

  memory_concentration: {
    goal: "Find more matching pairs than your partner.",
    sections: [
      {
        title: "Playing",
        items: [
          "24 cards lie face down: 12 pairs, shuffled by the server.",
          "On your turn, flip two cards. A match is yours — and you go again.",
          "No match: both cards are shown for a moment, turn back over, and it's your partner's turn.",
          "When every pair is found, whoever has more wins. Equal pairs is a draw.",
        ],
      },
    ],
    tips: ["Watch your partner's misses closely — they show you where cards are.", "Flip a card you already know second, not first."],
  },

  truth_or_dare: {
    goal: "Get to know each other's naughtiest side — there's no winner. 18+.",
    sections: [
      {
        title: "Playing",
        items: [
          "Take turns. On yours, pick Truth 🤫 or Dare 🔥 — the card appears for both of you.",
          "Answer the truth honestly, or do the dare — out loud on voice, in chat, or with a photo.",
          "Then tap Done. Or chicken out 🐔 (it's counted…).",
          "While it's your partner's turn, react with ❤️ 🔥 😳 😂 🥵 😈.",
          "Twelve turns in a game — six each.",
        ],
      },
      { title: "18+", items: ["Flirty / Spicy games open only when you've BOTH switched 18+ games on (top of Flirty / Spicy). Either of you can switch it off."] },
    ],
    tips: ["No pressure — chickening out is always OK.", "Turn voice on: it's much more fun out loud."],
  },

  would_you_rather_spicy: {
    goal: "The after-dark edition — find out what your partner really wants. No winner. 18+.",
    sections: [{ title: "Playing", items: ["Each round shows two spicy options. You both choose in secret.", "When you've both answered, the choices are revealed together.", "Talk about it, then tap Next. Ten rounds a game."] }],
    tips: ["Ask “why?” — and “when?” 😏"],
  },

  question_roulette: {
    goal: "Spin the wheel and answer whatever it lands on. No winner. 18+.",
    sections: [
      {
        title: "Playing",
        items: [
          "Take turns spinning. The wheel lands on 🌸 Flirty, 🌶️ Spicy, 🔥 Hot or 🎲 a Wild card.",
          "Answer the question out loud (or in chat), then tap Answered. Too much? Pass 🙈.",
          "Wild cards are little dares — just do it.",
          "Your partner reacts while you answer. Ten spins in a game.",
        ],
      },
    ],
    tips: ["Hot questions deserve detailed answers."],
  },
});

export function guideFor(gameId) {
  return GAME_GUIDES[gameId] ?? null;
}
