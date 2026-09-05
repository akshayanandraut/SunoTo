// Classic 100-square board. Keys are the square landed on; values are where it sends the token.
// Numbers > their key are ladders (climb up); numbers < their key are snakes (slide down).
export const SNAKE_LADDER_TILES = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
};

export const SNAKE_LADDER_MIN_PLAYERS = 2;
export const SNAKE_LADDER_MAX_PLAYERS = 4;
export const SNAKE_LADDER_BOARD_SIZE = 100;
export const SNAKE_LADDER_RAKE_BP = 1000; // 10% house rake on staked pots, credited to platform_revenue_ledger
