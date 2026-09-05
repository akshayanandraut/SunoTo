export const LUDO_MIN_PLAYERS = 2;
export const LUDO_MAX_PLAYERS = 4;
export const LUDO_COLORS = ["red", "green", "yellow", "blue"];
export const LUDO_ENTRY_SQUARE = [0, 13, 26, 39];
export const LUDO_SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const LUDO_TRACK_LENGTH = 52;
export const LUDO_HOME_STEPS = 58; // 1-51 shared track, 52-57 home stretch, 58 = finished
export const LUDO_RAKE_BP = 1000;
export const LUDO_MAX_CONSECUTIVE_SIXES = 3;

export function absoluteSquare(colorIndex, steps) {
  if (steps < 1 || steps > 51) return null;
  return (LUDO_ENTRY_SQUARE[colorIndex] + steps - 1) % LUDO_TRACK_LENGTH;
}

export function movableTokenIndexes(tokens, roll) {
  return tokens
    .map((steps, index) => index)
    .filter(index => {
      const steps = tokens[index];
      if (steps === 0) return roll === 6;
      if (steps >= LUDO_HOME_STEPS) return false;
      return steps + roll <= LUDO_HOME_STEPS;
    });
}

// Moves one token, resolves captures against opponents sharing the same non-safe square,
// and reports whether the mover earns an extra turn (rolled 6 or captured someone).
export function applyLudoMove(handsByParticipant, colorByParticipant, participantId, tokenIndex, roll) {
  const tokens = handsByParticipant[participantId];
  const colorIndex = colorByParticipant[participantId];
  const fromSteps = tokens[tokenIndex];
  const toSteps = fromSteps === 0 ? 1 : fromSteps + roll;
  tokens[tokenIndex] = toSteps;
  const captured = [];
  const landedSquare = absoluteSquare(colorIndex, toSteps);
  if (landedSquare !== null && !LUDO_SAFE_SQUARES.has(landedSquare)) {
    for (const [otherId, otherTokens] of Object.entries(handsByParticipant)) {
      if (otherId === participantId) continue;
      const otherColor = colorByParticipant[otherId];
      otherTokens.forEach((otherSteps, otherIndex) => {
        if (otherSteps < 1 || otherSteps > 51) return;
        if (absoluteSquare(otherColor, otherSteps) === landedSquare) {
          otherTokens[otherIndex] = 0;
          captured.push({ participantId: otherId, tokenIndex: otherIndex });
        }
      });
    }
  }
  const finishedAll = tokens.every(steps => steps >= LUDO_HOME_STEPS);
  const extraTurn = roll === 6 || captured.length > 0;
  return { captured, finishedAll, extraTurn };
}
