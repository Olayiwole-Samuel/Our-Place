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
});

export function guideFor(gameId) {
  return GAME_GUIDES[gameId] ?? null;
}
