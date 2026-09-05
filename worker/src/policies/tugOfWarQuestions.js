export const TUG_OF_WAR_QUESTIONS = [
  { q: "What is the capital of India?", options: ["New Delhi", "Mumbai", "Kolkata", "Chennai"], a: 0 },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], a: 1 },
  { q: "How many players are on a cricket team?", options: ["9", "10", "11", "12"], a: 2 },
  { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], a: 3 },
  { q: "Who wrote the Indian national anthem?", options: ["Rabindranath Tagore", "Bankim Chandra", "Sarojini Naidu", "Mahatma Gandhi"], a: 0 },
  { q: "What is H2O commonly known as?", options: ["Salt", "Water", "Oxygen", "Hydrogen"], a: 1 },
  { q: "Which festival is known as the festival of lights?", options: ["Holi", "Diwali", "Eid", "Onam"], a: 1 },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], a: 2 },
  { q: "What gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], a: 2 },
  { q: "Which is the longest river in India?", options: ["Yamuna", "Ganga", "Godavari", "Narmada"], a: 1 },
  { q: "What is the currency of Japan?", options: ["Won", "Yuan", "Yen", "Ringgit"], a: 2 },
  { q: "How many minutes are in a full day?", options: ["1200", "1440", "1600", "1000"], a: 1 },
  { q: "Which sport is associated with Wimbledon?", options: ["Football", "Cricket", "Tennis", "Golf"], a: 2 },
  { q: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], a: 2 },
  { q: "Who painted the Mona Lisa?", options: ["Picasso", "Van Gogh", "Da Vinci", "Rembrandt"], a: 2 },
  { q: "What is the tallest mountain in the world?", options: ["K2", "Kangchenjunga", "Everest", "Makalu"], a: 2 },
  { q: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], a: 1 },
  { q: "Which country invented paper?", options: ["India", "China", "Egypt", "Greece"], a: 1 },
  { q: "What is the smallest prime number?", options: ["0", "1", "2", "3"], a: 2 },
  { q: "Which animal is known as the Ship of the Desert?", options: ["Horse", "Camel", "Donkey", "Goat"], a: 1 },
  { q: "What is the freezing point of water in Celsius?", options: ["0", "32", "100", "-1"], a: 0 },
  { q: "Which planet has the most moons?", options: ["Earth", "Mars", "Saturn", "Mercury"], a: 2 },
  { q: "Who is known as the Father of the Nation in India?", options: ["Jawaharlal Nehru", "Sardar Patel", "Mahatma Gandhi", "Subhas Chandra Bose"], a: 2 },
  { q: "What does WWW stand for?", options: ["World Wide Web", "World Wide Wire", "Web Wide World", "Wide World Web"], a: 0 },
  { q: "Which is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], a: 1 },
];

export function randomTugOfWarQuestion(excludeIndexes = []) {
  const available = TUG_OF_WAR_QUESTIONS.map((_, i) => i).filter(i => !excludeIndexes.includes(i));
  const pool = available.length ? available : TUG_OF_WAR_QUESTIONS.map((_, i) => i);
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { index, question: TUG_OF_WAR_QUESTIONS[index] };
}
