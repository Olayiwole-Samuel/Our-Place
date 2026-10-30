import { createGameRegistry } from "./registry";

/**
 * The production game catalog — the single source of truth for which games
 * exist. The menu, the session API and the game shell all read from here.
 *
 * Every game in the product roster is registered so the menu is complete, but
 * a game is only `status: "available"` when its client and rules modules
 * really exist. Everything else is honestly `coming_soon` and can't be started
 * (the menu shows it as such; the server refuses to create a session for it).
 *
 * Adding a game: implement `games/<id>/rules.js` + `games/<id>/client.jsx`,
 * add the two loaders and flip its status to "available" (docs/game-architecture.md).
 */

const C = "competitive";
const COOP = "cooperative";
const TALK = "conversation";
const MAKE = "creative";
const TURN = "turn_based";
const LIVE = "realtime";

/** Card icons (glyphs keep the lobby bundle free of image assets). Missing → category emoji. */
const ICONS = {
  would_you_rather: "🤔", never_have_i_ever: "🙊", two_truths_and_a_lie: "🤥", daily_question: "📅", this_or_that: "↔️", story_builder: "📖",
  chess: "♟️", checkers: "⚫", connect_4: "🔴", tic_tac_toe: "❌", reversi: "⚪", battleship: "🚢", ludo: "🎲",
  go_fish: "🐟", crazy_eights: "8️⃣", uno: "🟥", war: "⚔️", memory_concentration: "🧠", old_maid: "👵", blackjack: "🂡", poker_heads_up: "♠️",
  rummy: "🃏", snap: "👏", slapjack: "✋", solitaire_race: "🏁", naija_whot: "🟢",
  how_well_do_you_know_me: "💞", general_trivia: "❓", couple_trivia: "💑", guess_my_answer: "🔮", category_blitz: "⏱️", finish_the_sentence: "💭",
  co_op_puzzle: "🧩", drawing_challenge: "✏️", word_association_coop: "🔗", memory_match: "🎴", simon_says: "🎵",
  rock_paper_scissors: "✊", coin_flip_dares: "🪙", dice_roll: "🎲", spin_the_wheel: "🎡", emoji_guess: "😜", shooting_range: "🎯", reaction_challenge: "⚡",
  jigsaw_puzzle: "🧩", duel_2048: "🔢", block_puzzle: "🟦", sudoku_duel: "9️⃣", match_3_duel: "💎", sliding_puzzle: "🔲", logic_puzzle: "💡", pattern_match: "🔷", puzzle_race: "🏎️",
  scrabble: "🔠", word_association: "🔗", word_chain: "⛓️", hangman: "🪢", word_scramble: "🔀", anagram_race: "🔤", word_search: "🔍", finish_the_word: "✍️",
  guess_the_word: "🗝️", twenty_questions: "2️⃣", categories: "🗂️", last_letter: "🔚", spell_battle: "🐝", forbidden_word: "🚫", word_bluff: "🃏", couple_word_guess: "💬",
  truth_or_dare: "🎭", would_you_rather_spicy: "🌶️", desire_cards: "💌", strip_game: "👕", question_roulette: "🎰",
  lobby_decor: "🪴", leave_a_note: "📝", music_room: "🎶", watch_together: "🍿",
};

/** Compact entry helper: streak eligibility defaults to "competitive and not 18+" (set explicitly by defineGame rules). */
function game(category, id, name, description, mode, multiplayer, extra = {}) {
  return {
    id,
    name,
    icon: ICONS[id],
    category,
    description,
    mode,
    multiplayer,
    authority: mode === MAKE ? "relay" : "server",
    winStreakEligible: mode === C && category !== "flirty_spicy",
    ...extra,
    capabilities: ["voice_enabled", ...(extra.capabilities ?? [])],
  };
}

const definitions = [
  // ── Talk & Party ───────────────────────────────────────────────────────────
  game("talk_party", "would_you_rather", "Would You Rather", "See how your partner thinks.", TALK, LIVE, {
    status: "available",
    sessionDefaults: { rounds: 10 },
    loadClient: () => import("@/games/would_you_rather/client"),
    loadRules: () => import("@/games/would_you_rather/rules"),
  }),
  game("talk_party", "never_have_i_ever", "Never Have I Ever", "Confessions, one finger at a time.", TALK, LIVE, {
    status: "available",
    sessionDefaults: { rounds: 15 },
    loadClient: () => import("@/games/never_have_i_ever/client"),
    loadRules: () => import("@/games/never_have_i_ever/rules"),
  }),
  game("talk_party", "two_truths_and_a_lie", "Two Truths and a Lie", "Spot the fib.", TALK, TURN, { capabilities: ["hidden_information"] }),
  game("talk_party", "daily_question", "Daily Question", "One question a day, answered together.", TALK, LIVE, { capabilities: ["ai_generated"] }),
  game("talk_party", "this_or_that", "This or That", "Quick picks, instant reveals.", TALK, LIVE),
  game("talk_party", "story_builder", "Story Builder", "Write a story one line each.", TALK, TURN),

  // ── Board & Strategy ───────────────────────────────────────────────────────
  game("board_strategy", "chess", "Chess", "The classic battle of minds.", C, TURN, {
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/chess/client"),
    loadRules: () => import("@/games/chess/rules"),
  }),
  game("board_strategy", "checkers", "Checkers", "Jump, capture, crown.", C, TURN, {
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/checkers/client"),
    loadRules: () => import("@/games/checkers/rules"),
  }),
  game("board_strategy", "connect_4", "Connect 4", "Four in a row wins.", C, TURN, {
    status: "available",
    loadClient: () => import("@/games/connect_4/client"),
    loadRules: () => import("@/games/connect_4/rules"),
  }),
  game("board_strategy", "tic_tac_toe", "Tic Tac Toe", "Three in a row. Quick and classic.", C, TURN, {
    status: "available",
    loadClient: () => import("@/games/tic_tac_toe/client"),
    loadRules: () => import("@/games/tic_tac_toe/rules"),
  }),
  game("board_strategy", "reversi", "Reversi / Othello", "Flip the board your way.", C, TURN, {
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/reversi/client"),
    loadRules: () => import("@/games/reversi/rules"),
  }),
  game("board_strategy", "battleship", "Battleship", "Hunt the hidden fleet.", C, TURN, {
    capabilities: ["hidden_information"],
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/battleship/client"),
    loadRules: () => import("@/games/battleship/rules"),
  }),
  game("board_strategy", "ludo", "Ludo", "Race all four pieces home.", C, TURN, {
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/ludo/client"),
    loadRules: () => import("@/games/ludo/rules"),
  }),

  // ── Card Games ─────────────────────────────────────────────────────────────
  game("card_games", "go_fish", "Go Fish", "Ask, fish, make pairs.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "crazy_eights", "Crazy Eights", "Match suits, play wild eights.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "uno", "Uno", "Colours, numbers and chaos.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "war", "War", "Flip and see who wins.", C, TURN),
  game("card_games", "memory_concentration", "Memory / Concentration", "Find the matching pairs.", C, TURN, {
    capabilities: ["hidden_information"],
    status: "available",
    loadClient: () => import("@/games/memory_concentration/client"),
    loadRules: () => import("@/games/memory_concentration/rules"),
  }),
  game("card_games", "old_maid", "Old Maid", "Don't get stuck with her.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "blackjack", "Blackjack (21)", "Get close to 21 without going over.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "poker_heads_up", "Poker (Heads-Up)", "Read your partner, play your hand.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "rummy", "Rummy", "Build sets and runs.", C, TURN, { capabilities: ["hidden_information"] }),
  game("card_games", "snap", "Snap", "Fastest hand wins.", C, LIVE, { capabilities: ["timed"] }),
  game("card_games", "slapjack", "Slapjack", "Slap the jack first.", C, LIVE, { capabilities: ["timed"] }),
  game("card_games", "solitaire_race", "Solitaire Race", "Same deal, who finishes first?", C, LIVE, { capabilities: ["timed"] }),
  game("card_games", "naija_whot", "Naija Whot", "The Naija classic. Hold on… Whot!", C, TURN, {
    capabilities: ["hidden_information"],
    status: "available",
    loadClient: () => import("@/games/naija_whot/client"),
    loadRules: () => import("@/games/naija_whot/rules"),
  }),

  // ── Trivia & Quiz ──────────────────────────────────────────────────────────
  game("trivia_quiz", "how_well_do_you_know_me", "How Well Do You Know Me?", "Prove it.", TALK, TURN, { capabilities: ["score_based", "hidden_information"] }),
  game("trivia_quiz", "general_trivia", "General Trivia", "Race to the right answer.", C, LIVE, { capabilities: ["timed", "score_based", "ai_generated"] }),
  game("trivia_quiz", "couple_trivia", "Couple Trivia", "Questions about your story.", TALK, TURN, { capabilities: ["score_based"] }),
  game("trivia_quiz", "guess_my_answer", "Guess My Answer", "Predict what they'll say.", TALK, TURN, { capabilities: ["hidden_information"] }),
  game("trivia_quiz", "category_blitz", "Category Blitz", "Name as many as you can, fast.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("trivia_quiz", "finish_the_sentence", "Finish the Sentence", "Complete each other's thoughts.", TALK, TURN),

  // ── Co-op ──────────────────────────────────────────────────────────────────
  game("co_op", "co_op_puzzle", "Co-op Puzzle", "Solve it together.", COOP, LIVE),
  game("co_op", "drawing_challenge", "Drawing Challenge", "Draw it, guess it, together.", COOP, LIVE),
  game("co_op", "word_association_coop", "Word Association", "Keep the chain going together.", COOP, TURN),
  game("co_op", "memory_match", "Memory Match", "Find every pair as a team.", COOP, TURN),
  game("co_op", "simon_says", "Simon Says", "Repeat the pattern, together.", COOP, LIVE, { capabilities: ["timed"] }),

  // ── Quick & Casual ─────────────────────────────────────────────────────────
  game("quick_casual", "rock_paper_scissors", "Rock Paper Scissors", "Best of three, no take-backs.", C, TURN, { capabilities: ["hidden_information"] }),
  game("quick_casual", "coin_flip_dares", "Coin Flip Dares", "Heads or tails decides the dare.", TALK, TURN),
  game("quick_casual", "dice_roll", "Dice Roll", "Highest roll wins.", C, TURN),
  game("quick_casual", "spin_the_wheel", "Spin the Wheel", "Let the wheel decide.", TALK, TURN),
  game("quick_casual", "emoji_guess", "Emoji Guess", "Decode the emoji.", C, TURN),
  game("quick_casual", "shooting_range", "Target Range", "How fast can you hit them?", C, LIVE, { capabilities: ["timed", "score_based"], space: "range_room", performanceProfile: "heavy" }),
  game("quick_casual", "reaction_challenge", "Reaction Challenge", "Who's quicker?", C, LIVE, { capabilities: ["timed", "score_based"] }),

  // ── Puzzle ─────────────────────────────────────────────────────────────────
  game("puzzle", "jigsaw_puzzle", "Jigsaw Puzzle", "One picture, two pairs of hands.", COOP, LIVE, {
    performanceProfile: "medium",
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/jigsaw_puzzle/client"),
    loadRules: () => import("@/games/jigsaw_puzzle/rules"),
  }),
  game("puzzle", "duel_2048", "2048 Duel", "Merge to 2048 first.", C, LIVE, { capabilities: ["score_based"] }),
  game("puzzle", "block_puzzle", "Block Puzzle", "Fit the blocks, clear the lines.", C, LIVE, { capabilities: ["score_based"] }),
  game("puzzle", "sudoku_duel", "Sudoku Duel", "Same grid, who solves it first?", C, LIVE, { capabilities: ["timed"] }),
  game("puzzle", "match_3_duel", "Match 3 Duel", "Match, combo, outscore.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("puzzle", "sliding_puzzle", "Sliding Puzzle", "Slide the tiles into place.", C, LIVE, { capabilities: ["timed"] }),
  game("puzzle", "logic_puzzle", "Logic Puzzle", "Reason it out together.", COOP, TURN),
  game("puzzle", "pattern_match", "Pattern Match", "Spot the pattern first.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("puzzle", "puzzle_race", "Puzzle Race", "Same puzzle, race to finish.", C, LIVE, { capabilities: ["timed"] }),

  // ── Word Games ─────────────────────────────────────────────────────────────
  game("word_games", "scrabble", "Scrabble", "Words on the board, points on the line.", C, TURN, {
    capabilities: ["score_based", "hidden_information"],
    status: "available",
    layout: "board",
    loadClient: () => import("@/games/scrabble/client"),
    loadRules: () => import("@/games/scrabble/rules"),
  }),
  game("word_games", "word_association", "Word Association", "Say the first word that comes to mind.", TALK, TURN),
  game("word_games", "word_chain", "Word Chain", "Each word starts where the last ended.", C, TURN),
  game("word_games", "hangman", "Hangman", "Set a secret word for each other.", C, TURN, {
    capabilities: ["hidden_information"],
    status: "available",
    sessionDefaults: { rounds: 4 },
    loadClient: () => import("@/games/hangman/client"),
    loadRules: () => import("@/games/hangman/rules"),
  }),
  game("word_games", "word_scramble", "Word Scramble", "Unscramble it fast.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("word_games", "anagram_race", "Anagram Race", "Find the anagrams first.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("word_games", "word_search", "Word Search", "Find the hidden words.", C, LIVE, { capabilities: ["score_based"] }),
  game("word_games", "finish_the_word", "Finish the Word", "Complete the word before they do.", C, TURN),
  game("word_games", "guess_the_word", "Guess the Word", "Clues in, guesses out.", C, TURN, { capabilities: ["hidden_information"] }),
  game("word_games", "twenty_questions", "20 Questions — Word Edition", "Twenty questions to find the word.", C, TURN, { capabilities: ["hidden_information"] }),
  game("word_games", "categories", "Categories", "One letter, many categories.", C, LIVE, { capabilities: ["timed", "score_based"] }),
  game("word_games", "last_letter", "Last Letter", "Start with their last letter.", C, TURN),
  game("word_games", "spell_battle", "Spell Battle", "Spell it right, spell it fast.", C, LIVE, { capabilities: ["timed"] }),
  game("word_games", "forbidden_word", "Forbidden Word", "Describe it without the obvious words.", C, TURN, { capabilities: ["hidden_information"] }),
  game("word_games", "word_bluff", "Word Bluff", "Real definition or a bluff?", C, TURN, { capabilities: ["hidden_information"] }),
  game("word_games", "couple_word_guess", "Couple Word Guess", "Get each other to the word.", COOP, TURN, { capabilities: ["hidden_information"] }),

  // ── Flirty / Spicy (18+, opt-in, off by default, never win-streak eligible) ─
  game("flirty_spicy", "truth_or_dare", "Truth or Dare", "Pick one. No backing out.", TALK, TURN, {
    status: "available",
    sessionDefaults: { rounds: 12 },
    loadClient: () => import("@/games/truth_or_dare/client"),
    loadRules: () => import("@/games/truth_or_dare/rules"),
  }),
  game("flirty_spicy", "would_you_rather_spicy", "Would You Rather — Spicy", "The after-dark edition.", TALK, LIVE, {
    status: "available",
    sessionDefaults: { rounds: 10 },
    loadClient: () => import("@/games/would_you_rather_spicy/client"),
    loadRules: () => import("@/games/would_you_rather_spicy/rules"),
  }),
  game("flirty_spicy", "desire_cards", "Desire Cards", "Draw a card, share a want.", TALK, TURN),
  game("flirty_spicy", "strip_game", "Strip Game", "Lose a round, lose a layer.", TALK, TURN),
  game("flirty_spicy", "question_roulette", "Question Roulette", "Spin for a daring question.", TALK, TURN, {
    status: "available",
    sessionDefaults: { rounds: 10 },
    loadClient: () => import("@/games/question_roulette/client"),
    loadRules: () => import("@/games/question_roulette/rules"),
  }),

  // ── Chill / Create (no winner, never win-streak eligible) ──────────────────
  game("chill_create", "lobby_decor", "Lobby Decor", "Make your place yours.", MAKE, LIVE),
  game("chill_create", "leave_a_note", "Leave a Note", "Something for them to find.", MAKE, LIVE),
  game("chill_create", "music_room", "Music Room", "Listen together.", MAKE, LIVE, { space: "music_room", performanceProfile: "medium" }),
  game("chill_create", "watch_together", "Watch Together", "Same screen, same couch.", MAKE, LIVE, { space: "watch_room", performanceProfile: "medium" }),
];

export const gameRegistry = createGameRegistry(definitions);
